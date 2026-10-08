"""generar_ico.py - Convierte icono-512.png en icono.ico para Windows (solo stdlib).

Un archivo .ico puede contener una imagen PNG directamente (soportado desde
Windows Vista). Este script genera un .ico valido sin depender de PIL.

Uso: python generar_ico.py
"""

from __future__ import annotations

import os
import struct

BASE = os.path.dirname(os.path.abspath(__file__))
PNG = os.path.join(BASE, "iconos", "icono-512.png")
SALIDA = os.path.join(BASE, "iconos", "icono.ico")


def generar_ico(ruta_png: str, ruta_ico: str, ancho: int = 512) -> None:
    with open(ruta_png, "rb") as archivo:
        datos = archivo.read()
    # Ancho/alto de 256 o mas se representa con 0 en el directorio del icono.
    dimension = 0 if ancho >= 256 else ancho
    entrada = struct.pack(
        "<BBBBHHII",
        dimension,          # ancho
        dimension,          # alto
        0,                  # paleta
        0,                  # reservado
        1,                  # planos de color
        32,                 # bits por pixel
        len(datos),         # tamano de la imagen
        22,                 # desplazamiento (6 de cabecera + 16 de entrada)
    )
    cabecera = struct.pack("<HHH", 0, 1, 1)
    with open(ruta_ico, "wb") as salida:
        salida.write(cabecera + entrada + datos)
    print("icono.ico generado (%s -> %s)" % (ruta_png, ruta_ico))


def main() -> None:
    if not os.path.exists(PNG):
        print("ERROR: no existe %s (ejecuta primero generar_iconos.py)" % PNG)
        return
    generar_ico(PNG, SALIDA)


if __name__ == "__main__":
    main()