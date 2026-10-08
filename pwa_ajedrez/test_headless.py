"""test_headless.py - Ejecuta Edge headless sobre test.html y comprueba FALLOS.

Uso:
    python test_headless.py
Devuelve exit code 0 si la linea de resumen dice "FALLOS: 0".
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BASE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(BASE, "test.html").replace("\\", "/")
URL = "file:///" + HTML

PERFIL = os.path.join(tempfile.gettempdir(), "edge_headless_pwa")

COMANDO = [
    EDGE,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-extensions",
    "--allow-file-access-from-files",
    "--user-data-dir=" + PERFIL,
    "--virtual-time-budget=5000",
    "--dump-dom",
    URL,
]


def principal() -> int:
    if not os.path.exists(EDGE):
        print("No se encuentra Edge en:", EDGE)
        return 2

    try:
        proceso = subprocess.run(
            COMANDO,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=150,
        )
    except subprocess.TimeoutExpired:
        print("FALLO: Edge tardo demasiado (timeout)")
        return 2

    dom = proceso.stdout or ""
    coincidencia = re.search(r"FALLOS:\s*(\d+)", dom)
    if coincidencia is None:
        print(dom[-2500:])
        print("NO se encontro la linea de resumen 'FALLOS: N'")
        return 2

    for linea in dom.splitlines():
        if "FALLO" in linea:
            print(linea.strip())

    total = None
    m_total = re.search(r"Pruebas completadas:\s*(\d+)", dom)
    if m_total:
        total = m_total.group(1)

    n = int(coincidencia.group(1))
    print("Pruebas:", total if total else "?", "  FALLOS:", n)
    return 0 if n == 0 else 1


if __name__ == "__main__":
    sys.exit(principal())