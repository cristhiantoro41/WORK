"""Pruebas HTTP reales del servidor web del ajedrez (urllib contra el puerto).

Arranca web_ajedrez en un hilo, hace peticiones de verdad y termina
cerrando el servidor limpio, sin hilos colgando.
"""

from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request

import web_ajedrez

fallos: list[str] = []


def revisar(condicion, mensaje: str) -> None:
    print(("OK   " if condicion else "ERROR") + " " + mensaje)
    if not condicion:
        fallos.append(mensaje)


def peticion(base: str, metodo: str, ruta: str, datos: dict | None = None):
    cuerpo = json.dumps(datos).encode("utf-8") if datos is not None else None
    requerimiento = urllib.request.Request(
        base + ruta,
        data=cuerpo,
        method=metodo,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(requerimiento, timeout=30) as respuesta:
            return respuesta.status, json.loads(respuesta.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def piezas(estado: dict, blancas: bool) -> int:
    total = 0
    for casilla in estado["tablero"]:
        pieza = casilla["pieza"]
        if pieza != "." and pieza.isupper() == blancas:
            total += 1
    return total


def jugadas_legales(estado: dict) -> int:
    """Cuenta las jugadas legales del mapa {origen: [destinos]}."""
    return sum(len(destinos) for destinos in estado["legales"].values())


def probar(base: str) -> None:
    # 1. estado inicial -------------------------------------------------
    codigo, estado = peticion(base, "GET", "/api/estado")
    revisar(codigo == 200, "GET /api/estado responde 200 (obtuvo %d)" % codigo)
    revisar(len(estado["tablero"]) == 64, "el tablero trae 64 casillas (obtuvo %d)" % len(estado["tablero"]))
    revisar(estado["turno"] == "blancas", "turno inicial blancas (obtuvo %s)" % estado["turno"])
    revisar(piezas(estado, True) == 16, "16 piezas blancas al empezar (obtuvo %d)" % piezas(estado, True))
    revisar(piezas(estado, False) == 16, "16 piezas negras al empezar (obtuvo %d)" % piezas(estado, False))
    revisar(len(estado["legales"]) == 10, "10 casillas de origen con jugadas legales (obtuvo %d)" % len(estado["legales"]))
    revisar(jugadas_legales(estado) == 20, "20 jugadas legales al empezar (obtuvo %d)" % jugadas_legales(estado))
    revisar(estado["historial"] == [], "historial vacio al empezar")
    revisar(estado["resumen"]["capturas"] == 0, "resumen sin capturas al empezar")
    revisar(estado["aviso"] == "Sin capturas todavia.", "aviso inicial correcto (obtuvo %s)" % estado["aviso"])
    revisar("e2" in estado["legales"] and "e4" in estado["legales"]["e2"], "e2 -> e4 figura en las jugadas legales")

    # 2. la pagina principal -------------------------------------------
    with urllib.request.urlopen(urllib.request.Request(base + "/"), timeout=30) as respuesta:
        html = respuesta.read().decode("utf-8")
        codigo_pagina = respuesta.status
    revisar(codigo_pagina == 200, "GET / responde 200 (obtuvo %d)" % codigo_pagina)
    revisar('id="tablero"' in html, "la pagina trae el tablero")
    revisar("/api/jugada" in html, "la pagina trae el llamado a la API")

    # 3. jugada e2e4 y respuesta automatica de la IA ---------------------
    codigo, jugada = peticion(base, "POST", "/api/jugada", {"origen": "e2", "destino": "e4"})
    revisar(codigo == 200 and jugada.get("ok") is True, "POST /api/jugada e2e4 aceptada (obtuvo %d)" % codigo)
    revisar(jugada["turno"] == "blancas", "tras e2e4 la IA ya contesto: turno blancas (obtuvo %s)" % jugada["turno"])
    revisar(len(jugada["historial"]) == 2, "historial con 2 jugadas: %s" % jugada["historial"])
    revisar(
        jugada["historial"][0] == "1. e2e4",
        "primera jugada numerada 1. e2e4 (obtuvo %s)" % jugada["historial"][0],
    )
    revisar(
        jugada["historial"][1].startswith("1..."),
        "respuesta de la IA numerada 1... (obtuvo %s)" % jugada["historial"][1],
    )
    revisar(jugada["humana"]["uci"] == "e2e4", "queda registrada la jugada del humano")
    revisar(jugada["ia"]["uci"] != "", "la computadora devolvio su jugada (%s)" % jugada["ia"]["uci"])
    revisar(jugada["capturas"] == [], "sin capturas tras e2e4")
    revisar(len(jugada["legales"]) > 0, "hay jugadas legales para el humano tras la IA")
    revisar(jugada["resumen"]["suma"] == 0, "suma de productos 0 tras e2e4")

    # 4. jugada ilegal ---------------------------------------------------
    codigo, error = peticion(base, "POST", "/api/jugada", {"origen": "e7", "destino": "e5"})
    revisar(codigo == 400 and error.get("ok") is False, "jugada ilegal rechazada con 400 (obtuvo %d)" % codigo)
    revisar(bool(error.get("error")), "la jugada ilegal trae mensaje de error")
    codigo, estado = peticion(base, "GET", "/api/estado")
    revisar(len(estado["historial"]) == 2, "la jugada ilegal no cambia la partida")

    # 5. deshacer --------------------------------------------------------
    codigo, deshecho = peticion(base, "POST", "/api/deshacer", {})
    revisar(codigo == 200 and deshecho.get("ok") is True, "POST /api/deshacer responde 200 (obtuvo %d)" % codigo)
    revisar(deshecho["historial"] == [], "deshacer retira el turno completo (obtuvo %s)" % deshecho["historial"])
    revisar(deshecho["turno"] == "blancas", "tras deshacer le toca a las blancas (obtuvo %s)" % deshecho["turno"])
    revisar(jugadas_legales(deshecho) == 20, "vuelven las 20 jugadas legales del inicio (obtuvo %d)" % jugadas_legales(deshecho))

    # 6. captura y multiplicacion (logica nueva del servidor) ------------
    partida = web_ajedrez.Partida()
    partida.posicion.cargar_fen("rnbqkbnr/pppppppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2")
    movimiento = partida.posicion.movimiento_desde_texto("e4d5")
    captura = partida.aplicar(movimiento) if movimiento else None
    revisar(captura is not None, "e4d5 produce captura")
    revisar(captura is not None and captura.multiplica, "peon x peon multiplica")
    revisar(captura is not None and captura.producto == 3024, "el producto es 56x54=3024 (obtuvo %s)" % (captura.producto if captura else None))
    datos = partida.estado()
    revisar(
        datos["capturas"] and datos["capturas"][0]["resultado"] == "56x54=3024",
        "la tabla explica 56x54=3024 (obtuvo %s)" % (datos["capturas"][0]["resultado"] if datos["capturas"] else "-"),
    )
    revisar(datos["resumen"]["suma"] == 3024, "el resumen suma 3024 (obtuvo %s)" % datos["resumen"]["suma"])
    revisar("56x54=3024" in datos["aviso"], "el aviso trae la multiplicacion (obtuvo %s)" % datos["aviso"])

    # 6b. la dama (mayor) captura pero NO multiplica ---------------------
    partida.posicion.cargar_fen("rnbqkbnr/pppp1ppp/8/3Qp3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2")
    movimiento_dama = partida.posicion.movimiento_desde_texto("d5e5")
    captura_dama = partida.aplicar(movimiento_dama) if movimiento_dama else None
    revisar(captura_dama is not None, "la dama captura el peon")
    revisar(
        captura_dama is not None and not captura_dama.multiplica,
        "la dama NO multiplica al capturar",
    )

    # 7. nueva partida ---------------------------------------------------
    codigo, nueva = peticion(base, "POST", "/api/nueva", {})
    revisar(codigo == 200 and nueva.get("ok") is True, "POST /api/nueva responde 200 (obtuvo %d)" % codigo)
    revisar(nueva["turno"] == "blancas", "nueva partida con turno blancas")
    revisar(nueva["historial"] == [], "nueva partida sin historial")
    revisar(
        piezas(nueva, True) == 16 and piezas(nueva, False) == 16,
        "nueva partida con 16 piezas por bando",
    )
    revisar(nueva["resumen"]["capturas"] == 0, "nueva partida sin capturas")
    revisar(nueva["legales"] != {}, "nueva partida con jugadas legales")

    # 8. ruta desconocida ------------------------------------------------
    codigo, nada = peticion(base, "GET", "/api/invento")
    revisar(codigo == 404, "ruta desconocida responde 404 (obtuvo %d)" % codigo)


def main() -> int:
    servidor = web_ajedrez.crear_servidor("127.0.0.1", 0)
    puerto = servidor.server_address[1]
    hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
    hilo.start()
    base = "http://127.0.0.1:%d" % puerto
    print("Servidor de prueba en %s" % base)
    print("")
    try:
        probar(base)
    finally:
        servidor.shutdown()
        servidor.server_close()
        hilo.join(timeout=5)
    print("")
    print("FALLOS: %d" % len(fallos))
    for mensaje in fallos:
        print(" - " + mensaje)
    print("Hilos vivos del servidor: %d" % (hilo.is_alive() and 1 or 0))
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
