"""Reproduce una partida de campeonato mundial y calcula las capturas numeradas."""

from __future__ import annotations

import re
import sys

from motor import Movimiento, Posicion, desde_texto
from numeracion import Captura, casilla_de, numero, resumen_partida, tabla_capturas

RESULTADOS = {"1-0", "0-1", "1/2-1/2", "*", ""}
SEPARADOR = "  " + "-" * 78
RUTA_DEFECTO = "match1972.pgn"
RONDAS_DEFECTO = ["6"]


def limpiar_san(san: str) -> str:
    texto = san.strip()
    texto = re.sub(r"[!?]+$", "", texto)
    texto = re.sub(r"[+#]+$", "", texto)
    return texto


def mover_san(posicion: Posicion, san: str) -> Movimiento:
    """Convierte notacion algebraica (SAN) en un movimiento legal de la posicion."""
    texto = limpiar_san(san)
    legales = posicion.movimientos_legales()

    if texto in ("O-O", "0-0", "00"):
        candidatos = [m for m in legales if m.enroque and m.destino[1] == 6]
    elif texto in ("O-O-O", "0-0-0", "000"):
        candidatos = [m for m in legales if m.enroque and m.destino[1] == 2]
    else:
        candidatos = _candidatos_san(posicion, legales, texto)

    if len(candidatos) != 1:
        raise ValueError(f"No se pudo interpretar la jugada {san!r} ({len(candidatos)} candidatas)")
    return candidatos[0]


def _candidatos_san(posicion: Posicion, legales: list[Movimiento], texto: str) -> list[Movimiento]:
    promocion: str | None = None

    if "=" in texto:
        izquierda, derecha = texto.split("=", 1)
        promocion = derecha.strip()[:1].upper()
        texto = izquierda
    else:
        coincidencia = re.fullmatch(r"([a-h][1-8])([QRBN])", texto)
        if coincidencia:
            texto, promocion = coincidencia.group(1), coincidencia.group(2)

    if len(texto) < 2:
        raise ValueError(f"Jugada demasiado corta: {texto!r}")

    destino = desde_texto(texto[-2:])
    if destino[0] < 0:
        raise ValueError(f"Destino invalido en: {texto!r}")
    resto = texto[:-2]

    tipo = "P"
    if resto and resto[0] in "KQRBN":
        tipo, resto = resto[0], resto[1:]

    es_captura = "x" in resto
    resto = resto.replace("x", "")

    pista_archivo: str | None = None
    pista_rango: str | None = None
    if len(resto) == 1 and resto in "abcdefgh":
        pista_archivo = resto
    elif len(resto) == 1 and resto in "12345678":
        pista_rango = resto
    elif len(resto) == 2 and resto[0] in "abcdefgh" and resto[1] in "12345678":
        pista_archivo, pista_rango = resto[0], resto[1]
    elif resto:
        raise ValueError(f"Indice de origen no reconocido: {resto!r}")

    candidatos: list[Movimiento] = []
    for movimiento in legales:
        if movimiento.destino != destino:
            continue
        if posicion.pieza_en(movimiento.origen).upper() != tipo:
            continue
        if promocion is None:
            if movimiento.promocion:
                continue
        elif not movimiento.promocion or movimiento.promocion.upper() != promocion:
            continue
        if pista_archivo and chr(ord("a") + movimiento.origen[1]) != pista_archivo:
            continue
        if pista_rango and str(8 - movimiento.origen[0]) != pista_rango:
            continue
        hay_captura = posicion.pieza_en(movimiento.destino) != "." or movimiento.en_pasante
        if hay_captura != es_captura:
            continue
        candidatos.append(movimiento)

    return candidatos


def pieza_capturada(posicion: Posicion, movimiento: Movimiento) -> str:
    if movimiento.en_pasante:
        return posicion.tablero[movimiento.origen[0]][movimiento.destino[1]]
    return posicion.pieza_en(movimiento.destino)


def leer_pgn(ruta: str) -> list[dict[str, object]]:
    with open(ruta, encoding="utf-8", errors="replace") as archivo:
        texto = archivo.read()

    partidas: list[dict[str, object]] = []
    for bloque in re.split(r"(?=\[Event\s)", texto):
        cabeceras = dict(re.findall(r'\[(\w+)\s+"([^"]*)"\]', bloque))
        if not cabeceras:
            continue
        movetexto = re.sub(r"\[[^\]]*\]", " ", bloque)
        movetexto = re.sub(r"\d+\.(\.\.)?", " ", movetexto)
        movetexto = movetexto.replace("...", " ").replace("−", "-")
        movimientos = [t.strip() for t in movetexto.split() if t.strip() not in RESULTADOS]
        partidas.append({"cabeceras": cabeceras, "movimientos": movimientos})
    return partidas


def reproducir(movimientos: list[str]) -> tuple[list[Captura], list[str]]:
    posicion = Posicion()
    capturas: list[Captura] = []
    registro: list[str] = []

    for indice, san in enumerate(movimientos):
        es_blancas = indice % 2 == 0
        numero_jugada = indice // 2 + 1
        rotulo = f"{numero_jugada}." if es_blancas else f"{numero_jugada}..."

        movimiento = mover_san(posicion, san)
        atacante = posicion.pieza_en(movimiento.origen)
        victima = pieza_capturada(posicion, movimiento)

        if victima != ".":
            origen = f"{chr(ord('a') + movimiento.origen[1])}{8 - movimiento.origen[0]}"
            destino = f"{chr(ord('a') + movimiento.destino[1])}{8 - movimiento.destino[0]}"
            capturas.append(
                Captura(
                    jugada=f"{rotulo}{san}",
                    color_blanca=es_blancas,
                    atacante=atacante,
                    victima=victima,
                    origen=origen,
                    destino=destino,
                    numero_origen=numero(origen),
                    numero_destino=numero(destino),
                )
            )
            registro.append(f"{rotulo}{san}")

        posicion.aplicar(movimiento)

    return capturas, registro


def tabla_inversa(resumenes: list[tuple[str, list[Captura]]]) -> list[str]:
    """Agrupa los numeros capturados y dice en que partida aparecen."""
    por_numero: dict[int, set[str]] = {}
    for ronda, capturas in resumenes:
        for captura in capturas:
            if captura.producto is not None:
                por_numero.setdefault(captura.numero_destino, set()).add(ronda)

    lineas = [
        "TABLA DE AGRUPACION - QUE NUMERO APARECE EN QUE PARTIDA",
        "  CASILLA  NUMERO  PARTIDAS",
        SEPARADOR,
    ]
    for valor in sorted(por_numero):
        rondas = ", ".join(sorted(por_numero[valor], key=lambda x: int(x) if x.isdigit() else 0))
        lineas.append(f"  {casilla_de(valor):^7}  {valor:>6}  {rondas}")
    lineas.append(f"  Distintos numeros multiplicados: {len(por_numero)} de 64")
    return lineas


def construir_informe(ruta_pgn: str, rondas: list[str]) -> str:
    partidas = leer_pgn(ruta_pgn)
    lineas: list[str] = []
    resumenes: list[tuple[str, list[Captura]]] = []

    lineas.append("CAMPEONATO MUNDIAL - FISCHER vs SPASSKY, REYKJAVIK 1972")
    lineas.append("Numeracion propia 1-64. Multiplican: peon x peon, peon x pieza menor")
    lineas.append("Todo producto cabe en 4 cifras (el maximo posible es 64x64 = 4096).")
    lineas.append(SEPARADOR)

    todas = "todas" in rondas

    for indice, partida in enumerate(partidas, start=1):
        cab = partida["cabeceras"]
        ronda = str(cab.get("Round", indice))
        if not todas and ronda not in rondas:
            continue

        blancas = str(cab.get("White", "?"))
        negras = str(cab.get("Black", "?"))
        fecha = str(cab.get("Date", "?"))
        resultado = str(cab.get("Result", "*"))

        pareja = (
            f"Spassky (blancas) - Fischer (negras)"
            if blancas.startswith("Boris")
            else f"Fischer (blancas) - Spassky (negras)"
        )

        try:
            capturas, registro = reproducir(list(partida["movimientos"]))
        except ValueError as error:
            lineas.append(f"\nPARTIDA {ronda} - {pareja} - {fecha} - {resultado}")
            lineas.append(f"  No se pudo reproducir: {error}")
            continue

        lineas.append("")
        lineas.append(f"PARTIDA {ronda} - {pareja} - {fecha} - {resultado}")
        lineas.append(
            f"  {len(partida['movimientos'])} plys - ultima jugada: "
            + (registro[-1] if registro else "(sin capturas)")
        )

        if not capturas:
            lineas.append("  Sin capturas registradas.")
            lineas.append(SEPARADOR)
            continue

        lineas.extend(tabla_capturas(capturas))
        datos = resumen_partida(capturas)
        lineas.append(
            f"  RESUMEN: {datos['capturas']} capturas - "
            f"{datos['multiplicaciones']} multiplicaciones - "
            f"{datos['repetidos']} productos repetidos sin sumar - "
            f"suma de productos {datos['suma']}"
        )
        lineas.append(f"  HUELLA (productos distintos): {datos['huella']}")
        lineas.append(SEPARADOR)
        resumenes.append((ronda, capturas))

    if resumenes:
        lineas.append("")
        lineas.append("TABLA GENERAL POR PARTIDA")
        lineas.append("  RONDA  CAPTURAS  MULT.  SUMA  HUELLA NUMERICA")
        lineas.append(SEPARADOR)
        for ronda, capturas in resumenes:
            datos = resumen_partida(capturas)
            lineas.append(
                f"  {ronda:>5}  {datos['capturas']:>8}  {datos['multiplicaciones']:>5}  "
                f"{datos['suma']:>4}  {datos['huella']}"
            )
        lineas.append("")
        lineas.extend(tabla_inversa(resumenes))

    return "\n".join(lineas)


def main() -> int:
    argumentos = [a for a in sys.argv[1:] if not a.endswith(".pgn")]
    rutas = [a for a in sys.argv[1:] if a.endswith(".pgn")]
    ruta = rutas[0] if rutas else RUTA_DEFECTO
    rondas = argumentos or RONDAS_DEFECTO

    try:
        informe = construir_informe(ruta, rondas)
    except FileNotFoundError:
        print(f"No se encontro {ruta}")
        return 1

    print(informe)

    salida = "informe_campeonato.txt"
    with open(salida, "w", encoding="utf-8") as archivo:
        archivo.write(informe)
    print(f"\nInforme guardado en {salida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
