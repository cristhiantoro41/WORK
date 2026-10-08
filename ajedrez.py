"""Juego de ajedrez en la consola: numeracion propia de casillas y multiplicaciones."""

from __future__ import annotations

import re
import sys
from typing import Optional

from motor import BLANCAS, Movimiento, Posicion
from numeracion import (
    CIFRAS_MAXIMAS,
    NUMEROS,
    Captura,
    casilla_de,
    etiqueta,
    nombre_pieza,
    numero,
)

SALIDA = ("salir", "q", "exit", "fin")

AYUDA = """
  Comandos:
    44 56         mueve usando la numeracion propia (44 = e2, 56 = e4)
    e2e4          tambien se acepta notacion algebraica tradicional
    e7e8q         promocion (con numeracion: 23 36 q)
    numeros       tabla con la numeracion de las 64 casillas
    jugadas       lista las jugadas legales con su numeracion
    historial     muestra las jugadas realizadas
    capturas      tabla de capturas y multiplicaciones de la partida
    tablero       vuelve a dibujar el tablero
    deshacer      deshace la ultima jugada
    fen           imprime la posicion en FEN
    nuevo         reinicia la partida
    salir         termina el programa
"""


def nombre_color(blanca: bool) -> str:
    return "blancas" if blanca else "negras"


def NUMEROS_POR_CASILLA(fila: int, col: int) -> int:
    return NUMEROS[f"{chr(ord('a') + col)}{8 - fila}"]


def celda(posicion: Posicion, fila: int, col: int, marcada: bool) -> str:
    """Celda de 4 caracteres: pieza blanca ' R ', negra '[R]', peon = su numero."""
    pieza = posicion.tablero[fila][col]
    texto = etiqueta(pieza, f"{chr(ord('a') + col)}{8 - fila}")
    if marcada:
        return f"{f'<{texto}>':<4}"
    if pieza == ".":
        return " ·  "
    if pieza.isupper():
        return f"{f' {texto} ':<4}"
    return f"{f'[{texto}]':<4}"


def dibujar(posicion: Posicion, historial: list[Movimiento], aviso: str) -> None:
    destacadas = {historial[-1].origen, historial[-1].destino} if historial else set()

    print()
    print("      a   b   c   d   e   f   g   h      NUMEROS")
    for fila in range(8):
        linea = f" {8 - fila}  "
        for col in range(8):
            linea += celda(posicion, fila, col, (fila, col) in destacadas)
        linea += "   "
        for col in range(8):
            marca = "*" if (fila, col) in destacadas else " "
            linea += f"{marca}{NUMEROS_POR_CASILLA(fila, col):>3}"
        print(linea + f"  {8 - fila}")
    print("      a   b   c   d   e   f   g   h")

    turno = nombre_color(posicion.turno == BLANCAS)
    estado = f"  ({aviso})" if aviso else ""
    print(f"\n  Turno de las {turno}{estado}   jugadas registradas: {len(historial)}")


def tabla_numeros() -> list[str]:
    lineas = ["", "  NUMERACION PROPIA DE LAS CASILLAS (1 a 64)", ""]
    lineas.append("        a     b     c     d     e     f     g     h")
    for fila in range(8):
        celdas = "  ".join(f"{NUMEROS_POR_CASILLA(fila, col):>4}" for col in range(8))
        lineas.append(f"  {8 - fila}   {celdas}")
    lineas.append("        a     b     c     d     e     f     g     h")
    lineas.append("")
    lineas.append("  Escribe las jugadas como 'ORIGEN DESTINO', por ejemplo 44 56.")
    return lineas


def clave_repeticion(posicion: Posicion) -> str:
    partes = posicion.a_fen().split()
    partes[4] = "0"
    partes[5] = "0"
    return " ".join(partes)


def terminacion(posicion: Posicion, repeticiones: dict[str, int]) -> str:
    jugadas = posicion.movimientos_legales()
    if not jugadas:
        if posicion.en_jaque():
            ganador = nombre_color(posicion.turno != BLANCAS)
            perdedor = nombre_color(posicion.turno == BLANCAS)
            return f"Jaque mate. Ganaron las {ganador}; perdieron las {perdedor}."
        return "Rey ahogado: tablas."
    if posicion.material_insuficiente():
        return "Tablas por material insuficiente."
    if posicion.medios >= 100:
        return "Tablas por regla de los 50 movimientos."
    if repeticiones.get(clave_repeticion(posicion), 0) >= 2:
        return "Tablas por triple repeticion de la posicion."
    if posicion.en_jaque():
        return "Jaque"
    return ""


def pedir_promocion() -> str:
    while True:
        respuesta = input("  Promocion a (q/r/b/n) [dama]: ").strip().lower()
        letra = respuesta[:1] if respuesta else "q"
        if letra in "qrbn":
            return letra


def a_algebraica(posicion: Posicion, texto: str) -> Optional[str]:
    """Convierte '44 56' o '44-56' en 'e2e4'. Devuelve None si no es numerico."""
    limpio = texto.strip().lower().replace(",", " ").replace("-", " ").replace("/", " ")
    partes = [p for p in limpio.split() if p]
    if len(partes) == 3 and all(p.isdigit() for p in partes[:2]):
        partes = partes[:2] + ["".join(partes[2:])]
    if len(partes) == 2 and partes[0].isdigit() and partes[1].isdigit():
        origen = casilla_de(int(partes[0]))
        destino = casilla_de(int(partes[1]))
        if origen is None or destino is None:
            return None
        return origen + destino
    if len(partes) == 3 and partes[0].isdigit() and partes[1].isdigit():
        origen = casilla_de(int(partes[0]))
        destino = casilla_de(int(partes[1]))
        if origen is None or destino is None:
            return None
        return origen + destino + partes[2][:1]
    return None


def buscar_jugada(posicion: Posicion, texto: str) -> Optional[Movimiento]:
    numerica = a_algebraica(texto)
    texto = texto.strip().lower().replace(" ", "")

    if numerica is None:
        if not re.fullmatch(r"[a-h][1-8][a-h][1-8][qrbn]?", texto):
            return None
        base = texto
    else:
        base = numerica

    promover = base[4] if len(base) == 5 else None
    if promover is None and len(base) == 4 and base[3] in "18":
        origen = (8 - int(base[1]), ord(base[0]) - 97)
        if posicion.pieza_en(origen).upper() == "P":
            hay_promocion = any(
                movimiento.origen == origen
                and movimiento.destino == (8 - int(base[3]), ord(base[2]) - 97)
                and movimiento.promocion
                for movimiento in posicion.movimientos_legales()
            )
            if hay_promocion:
                promover = pedir_promocion()

    return posicion.movimiento_desde_texto(base + (promover or ""))


def pieza_capturada(posicion: Posicion, movimiento: Movimiento) -> str:
    if movimiento.en_pasante:
        return posicion.tablero[movimiento.origen[0]][movimiento.destino[1]]
    return posicion.pieza_en(movimiento.destino)


def informar_captura(posicion: Posicion, movimiento: Movimiento) -> str:
    """Linea con el resultado de la captura antes de aplicar la jugada."""
    victima = pieza_capturada(posicion, movimiento)
    if victima == ".":
        return ""

    atacante = posicion.pieza_en(movimiento.origen)
    origen = f"{chr(ord('a') + movimiento.origen[1])}{8 - movimiento.origen[0]}"
    destino = f"{chr(ord('a') + movimiento.destino[1])}{8 - movimiento.destino[0]}"
    captura = Captura(
        jugada="",
        color_blanca=atacante.isupper(),
        atacante=atacante,
        victima=victima,
        origen=origen,
        destino=destino,
        numero_origen=numero(origen),
        numero_destino=numero(destino),
    )

    atacante_texto = nombre_pieza(captura.atacante)
    victima_texto = nombre_pieza(captura.victima)
    if captura.producto is not None:
        return (
            f"CAPTURA: {atacante_texto} x {victima_texto} en casilla "
            f"{captura.numero_destino}  ->  {captura.numero_origen} x "
            f"{captura.numero_destino} = {captura.producto}"
        )
    if captura.multiplica:
        return (
            f"CAPTURA: {atacante_texto} x {victima_texto} en casilla "
            f"{captura.numero_destino}  ->  {captura.numero_origen} x "
            f"{captura.numero_destino} supera {CIFRAS_MAXIMAS} cifras"
        )
    return (
        f"CAPTURA: {atacante_texto} x {victima_texto} en casilla "
        f"{captura.numero_destino}  ->  sin multiplicacion (casilla {captura.numero_destino})"
    )


def historial_a_texto(historial: list[Movimiento]) -> list[str]:
    return [
        (f"{numero_jugada:>3}." if numero_jugada % 2 else "   ...")
        + f" {movimiento.uci}"
        for numero_jugada, movimiento in enumerate(historial, start=1)
    ]


def principal() -> int:
    posicion = Posicion()
    historial: list[Movimiento] = []
    capturas: list[Captura] = []
    vistos: dict[str, int] = {clave_repeticion(posicion): 1}

    print("  AJEDREZ CON NUMERACION PROPIA (casillas 1-64)")
    print(AYUDA)
    for linea in tabla_numeros():
        print(linea)
    dibujar(posicion, historial, "")

    while True:
        estado = terminacion(posicion, vistos)
        terminado = estado.startswith(("Jaque mate", "Rey ahogado", "Tablas"))
        if estado and estado != "Jaque":
            print(f"\n  {estado}")
        if terminado:
            dibujar(posicion, historial, "partida terminada")
            if capturas:
                print("\n  CAPTURAS DE LA PARTIDA")
                for linea in _tabla(capturas):
                    print(linea)
            print(AYUDA)
            return 0

        try:
            entrada = input("\n  > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Hasta luego.")
            return 0

        if not entrada:
            continue

        orden = entrada.lower()

        if orden in SALIDA:
            print("  Hasta luego.")
            return 0
        if orden in ("ayuda", "help", "?"):
            print(AYUDA)
            continue
        if orden in ("numeros", "numero", "n"):
            for linea in tabla_numeros():
                print(linea)
            continue
        if orden in ("tablero", "t", "b"):
            dibujar(posicion, historial, estado)
            continue
        if orden in ("nuevo", "new", "reset"):
            posicion = Posicion()
            historial = []
            capturas = []
            vistos = {clave_repeticion(posicion): 1}
            print("  Nueva partida.")
            dibujar(posicion, historial, "")
            continue
        if orden in ("fen", "f"):
            print(f"  {posicion.a_fen()}")
            continue
        if orden in ("capturas", "tablas"):
            if not capturas:
                print("  Todavia no hay capturas.")
            else:
                for linea in _tabla(capturas):
                    print(linea)
            continue
        if orden in ("jugadas", "legal", "l"):
            movimientos = posicion.movimientos_legales()
            print(f"  {len(movimientos)} jugadas legales:")
            filas = [
                f"{_num(m.origen)} {_num(m.destino)} ({m.uci})"
                for m in movimientos
            ]
            for indice in range(0, len(filas), 5):
                print("    " + "   ".join(filas[indice : indice + 5]))
            continue
        if orden in ("historial", "h"):
            if not historial:
                print("  Todavia no hay jugadas.")
                continue
            texto = historial_a_texto(historial)
            for inicio in range(0, len(texto), 2):
                derecha = texto[inicio + 1] if inicio + 1 < len(texto) else ""
                print(f"    {texto[inicio]:<14} {derecha}")
            continue
        if orden in ("deshacer", "undo", "u"):
            if not historial:
                print("  No hay jugadas que deshacer.")
                continue
            movimiento = historial.pop()
            if capturas:
                ultima = capturas[-1]
                if ultima.destino == f"{chr(ord('a') + movimiento.destino[1])}{8 - movimiento.destino[0]}":
                    capturas.pop()
            posicion.deshacer(movimiento)
            vistos = {clave_repeticion(posicion): 1}
            print(f"  Se deshizo {movimiento.uci}.")
            dibujar(posicion, historial, "")
            continue

        movimiento = buscar_jugada(posicion, entrada)
        if movimiento is None:
            print("  Jugada ilegal o mal escrita. Escribe 'jugadas' o 'numeros' para ver las opciones.")
            continue

        linea_captura = informar_captura(posicion, movimiento)
        if linea_captura:
            victima = pieza_capturada(posicion, movimiento)
            origen = f"{chr(ord('a') + movimiento.origen[1])}{8 - movimiento.origen[0]}"
            destino = f"{chr(ord('a') + movimiento.destino[1])}{8 - movimiento.destino[0]}"
            capturas.append(
                Captura(
                    jugada="",
                    color_blanca=posicion.tablero[movimiento.origen[0]][movimiento.origen[1]].isupper(),
                    atacante=posicion.pieza_en(movimiento.origen),
                    victima=victima,
                    origen=origen,
                    destino=destino,
                    numero_origen=numero(origen),
                    numero_destino=numero(destino),
                )
            )
            print(f"  {linea_captura}")

        posicion.aplicar(movimiento)
        historial.append(movimiento)
        clave = clave_repeticion(posicion)
        vistos[clave] = vistos.get(clave, 0) + 1
        dibujar(posicion, historial, estado)


def _num(casilla: tuple[int, int]) -> int:
    texto = f"{chr(ord('a') + casilla[1])}{8 - casilla[0]}"
    return numero(texto)


def _tabla(capturas: list[Captura]) -> list[str]:
    from numeracion import tabla_capturas

    return tabla_capturas(capturas)


if __name__ == "__main__":
    sys.exit(principal())
