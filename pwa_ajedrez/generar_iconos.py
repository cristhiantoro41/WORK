"""generar_iconos.py - Genera los iconos PNG de la PWA sin dependencias (solo stdlib).

Dibuja un peon negro sobre un tablero claro (8x8). El icono maskable deja
margen alrededor y usa fondo de un solo color para sobrevivir al recorte
circular de Android.

Uso:
    python generar_iconos.py
    python generar_iconos.py --ancho 192 --alto 192 --salida iconos/prueba.png
"""

from __future__ import annotations

import argparse
import math
import os
import struct
import zlib

BASE = os.path.dirname(os.path.abspath(__file__))
CARPETA_ICONOS = os.path.join(BASE, "iconos")

CLARO = (240, 217, 181)      # #f0d9b5
OSCURO = (181, 136, 99)      # #b58863
PEON = (20, 20, 20)
FONDO_MASKABLE = (240, 217, 181)

MUESTREO = 3                 # muestras por eje para suavizar bordes


# --------------------------------------------------------------------- PNG

def _chunk(tipo: bytes, datos: bytes) -> bytes:
    return (
        struct.pack(">I", len(datos))
        + tipo
        + datos
        + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    )


def escribir_png(ruta: str, ancho: int, alto: int, pixeles: bytearray) -> None:
    """Escribe un PNG RGBA8 (filtro None por fila)."""
    if len(pixeles) != ancho * alto * 4:
        raise AssertionError("Tamano de pixeles incoherente")

    paso = ancho * 4
    bruto = bytearray()
    for y in range(alto):
        bruto.append(0)
        bruto.extend(pixeles[y * paso:(y + 1) * paso])

    data = b"\x89PNG\r\n\x1a\n"
    data += _chunk(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 6, 0, 0, 0))
    data += _chunk(b"IDAT", zlib.compress(bytes(bruto), 9))
    data += _chunk(b"IEND", b"")

    with open(ruta, "wb") as fh:
        fh.write(data)


def leer_tamano_png(ruta: str) -> tuple[int, int]:
    with open(ruta, "rb") as fh:
        cabecera = fh.read(24)
    if cabecera[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(ruta + " no es un PNG")
    ancho, alto = struct.unpack(">II", cabecera[16:24])
    return ancho, alto


# -------------------------------------------------------------------- forma

def _media_anchura(y: float) -> float:
    """Semianchura del peon en la linea horizontal `y` (coords 0..1)."""
    if y < 0.165 or y > 0.79:
        return 0.0

    # cabeza: circulo de radio 0.105 centrado en (0.5, 0.27)
    if y < 0.375:
        dy = y - 0.27
        radio = 0.105
        if abs(dy) >= radio:
            return 0.0
        return math.sqrt(radio * radio - dy * dy)

    # collar
    if y < 0.41:
        return 0.10 + 0.05 * ((y - 0.375) / 0.035)

    # cuerpo (se estrecha hacia abajo)
    if y < 0.68:
        t = (0.68 - y) / 0.27
        return 0.072 + 0.078 * (t ** 1.55)

    # transicion a la base
    if y < 0.715:
        t = (y - 0.68) / 0.035
        return 0.072 + 0.123 * (t ** 0.6)

    # base con el borde inferior redondeado
    if y <= 0.765:
        return 0.195
    t = (y - 0.765) / 0.025
    if t >= 1.0:
        return 0.0
    return 0.195 * math.sqrt(1.0 - t * t)


def _es_peon(u: float, v: float) -> bool:
    """True si la coordenada normalizada cae dentro del silueta del peon."""
    if u < 0.0 or u > 1.0:
        return False
    ancho = _media_anchura(v)
    if ancho <= 0.0:
        return False
    return abs(u - 0.5) <= ancho


def _fondo(nx: float, ny: float, maskable: bool) -> tuple[int, int, int]:
    if maskable:
        return FONDO_MASKABLE
    fila = int(ny * 8)
    col = int(nx * 8)
    fila = 7 if fila > 7 else fila
    col = 7 if col > 7 else col
    return CLARO if (fila + col) % 2 == 0 else OSCURO


def _muestra(nx: float, ny: float, maskable: bool, escala: float) -> tuple[int, int, int]:
    """Color de una muestra concreta del icono."""
    if maskable:
        # se expande el espacio del dibujo: el peon ocupa la zona central
        u = 0.5 + (nx - 0.5) / escala
        v = 0.5 + (ny - 0.5) / escala
    else:
        u, v = nx, ny

    if _es_peon(u, v):
        return PEON
    return _fondo(nx, ny, maskable)


def generar_icono(ruta: str, ancho: int, alto: int, maskable: bool = False,
                  escala: float = 0.62) -> None:
    pixeles = bytearray(ancho * alto * 4)
    n = MUESTREO
    inv = 1.0 / (n * n)
    centro = (n - 1) / 2.0

    idx = 0
    for y in range(alto):
        for x in range(ancho):
            r = g = b = 0
            for sy in range(n):
                for sx in range(n):
                    nx = (x + (sx + 0.5) / n) / ancho
                    ny = (y + (sy + 0.5) / n) / alto
                    cr, cg, cb = _muestra(nx, ny, maskable, escala)
                    r += cr
                    g += cg
                    b += cb
            r = int(round(r * inv))
            g = int(round(g * inv))
            b = int(round(b * inv))
            pixeles[idx] = r
            pixeles[idx + 1] = g
            pixeles[idx + 2] = b
            pixeles[idx + 3] = 255
            idx += 4

    escribir_png(ruta, ancho, alto, pixeles)


# -------------------------------------------------------------------- main

def generar_defecto() -> int:
    os.makedirs(CARPETA_ICONOS, exist_ok=True)
    trabajos = [
        (os.path.join(CARPETA_ICONOS, "icono-192.png"), 192, 192, False),
        (os.path.join(CARPETA_ICONOS, "icono-512.png"), 512, 512, False),
        (os.path.join(CARPETA_ICONOS, "icono-maskable-512.png"), 512, 512, True),
    ]
    for ruta, ancho, alto, maskable in trabajos:
        generar_icono(ruta, ancho, alto, maskable)

    correcto = True
    for ruta, esperado_ancho, esperado_alto, _ in trabajos:
        w, h = leer_tamano_png(ruta)
        estado = "OK" if (w, h) == (esperado_ancho, esperado_alto) else "FALLO"
        if estado == "FALLO":
            correcto = False
        print("%s %-28s %dx%d" % (estado, os.path.basename(ruta), w, h))
    return 0 if correcto else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera los iconos PNG de la PWA.")
    parser.add_argument("--ancho", type=int, default=None)
    parser.add_argument("--alto", type=int, default=None)
    parser.add_argument("--salida", type=str, default=None)
    parser.add_argument("--maskable", action="store_true")
    args = parser.parse_args()

    if args.ancho is None and args.alto is None and args.salida is None:
        return generar_defecto()

    ancho = args.ancho or 512
    alto = args.alto or 512
    salida = args.salida or os.path.join(CARPETA_ICONOS, "icono-%d.png" % ancho)
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    generar_icono(salida, ancho, alto, args.maskable)
    w, h = leer_tamano_png(salida)
    print("OK %-28s %dx%d" % (os.path.basename(salida), w, h))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
