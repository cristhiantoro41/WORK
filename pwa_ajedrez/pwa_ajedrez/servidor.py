"""servidor.py - Sirve la PWA de ajedrez en tu red local.

Uso:
    python servidor.py            # puerto 8000
    python servidor.py 8080       # otro puerto

El objetivo es poder instalar la PWA desde el movil: abre en el movil
http://<IP-de-este-ordenador>:8000  y usa Chrome -> "Instalar app".
NOTA: si el movil no carga, abre el puerto 8000 en el Firewall de Windows
(aunque en redes domesticas suele bastar con pinchar "Permitir acceso").
"""

import mimetypes
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CARPETA = os.path.dirname(os.path.abspath(__file__))

# Tipos MIME correctos para certificar el manifest y la instalacion como PWA.
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript; charset=utf-8", ".js")
mimetypes.add_type("text/css; charset=utf-8", ".css")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("text/html; charset=utf-8", ".html")


class PwaHandler(SimpleHTTPRequestHandler):
    """Sirve la carpeta pwa_ajedrez (donde vive este mismo archivo)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CARPETA, **kwargs)


def ip_local() -> str:
    """Devuelve la IP LAN del equipo para indicarsela al usuario."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sck:
        sck.connect(("8.8.8.8", 80))
        return sck.getsockname()[0]


def principal() -> int:
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    try:
        ip = ip_local()
    except OSError:
        ip = "127.0.0.1"

    servidor = ThreadingHTTPServer(("0.0.0.0", puerto), PwaHandler)
    print("Servidor de Ajedrez 1-64 en marcha:")
    print("  En este ordenador : http://localhost:%d" % puerto)
    print("  Desde el movil    : http://%s:%d  (misma red Wi-Fi)" % (ip, puerto))
    print("  Para instalar: abre esa URL en Chrome/Edge y toca 'Instalar app'.")
    print("  Detener: Ctrl+C")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    return 0


if __name__ == "__main__":
    sys.exit(principal())