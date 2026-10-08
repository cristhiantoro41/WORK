"""Servidor web del ajedrez numerado 1-64 para jugar desde el celular.

Solo usa la biblioteca estandar de Python (http.server, json, threading):
no hay que instalar nada con pip.

Uso:
    python web_ajedrez.py
y abrir la URL que imprime en el navegador del celular (misma red WiFi).

TIP - abrir el puerto una sola vez en el firewall de Windows (PowerShell
elevado, ejecutar como administrador):
    Add-NetFirewallRule -DisplayName "Ajedrez web" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
El celular debe estar en la misma red WiFi que este equipo. Si la IP local
no llega desde el exterior, despues se puede usar tunneling (ngrok), pero
NO lo instales ahora: con el firewall abierto y el mismo WiFi basta.

API JSON:
    GET  /api/estado   -> estado completo de la partida
    POST /api/jugada   -> {origen, destino} jugada del humano + respuesta de la IA
    POST /api/nueva    -> reinicia la partida
    POST /api/deshacer -> retira el ultimo turno (y la IA contesta si le toca)
"""

from __future__ import annotations

import json
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from ajedrez import clave_repeticion, terminacion
from campeonatos import pieza_capturada
from motor import Movimiento, Posicion, a_texto, es_blanca, mejor_jugada
from numeracion import (
    NUMEROS,
    Captura,
    etiqueta,
    nombre_pieza,
    numero,
    resumen_partida,
    resultado_unico,
)

HOST = "0.0.0.0"
PUERTO = 8000

# Misma profundidad que grafico.PROFUNDIDAD_IA: responde al instante.
PROFUNDIDAD_IA = 1

# Una sola partida para todos los clientes, protegida con un bloqueo.
BLOQUEO = threading.Lock()
PARTIDA: "Partida"


def _detalle(capturas: list[Captura], indice: int) -> dict:
    """Fila de la tabla de capturas con el resultado sin repetir productos."""
    captura = capturas[indice]
    previos = {previo.producto for previo in capturas[:indice] if previo.producto is not None}
    return {
        "jugada": captura.jugada,
        "bando": captura.bando,
        "atacante": nombre_pieza(captura.atacante),
        "victima": nombre_pieza(captura.victima),
        "origen": captura.origen,
        "destino": captura.destino,
        "numero_origen": captura.numero_origen,
        "numero_destino": captura.numero_destino,
        "multiplica": captura.multiplica,
        "producto": captura.producto,
        "resultado": resultado_unico(captura, previos),
    }


class Partida:
    """Partida web: posicion, historial numerado y capturas."""

    def __init__(self) -> None:
        self.posicion = Posicion()
        self.pares: list[tuple[Movimiento, dict]] = []
        self.repeticiones: dict[str, int] = {}
        self._recalcular_repeticiones()

    # ------------------------------------------------------------- utilidades
    def reiniciar(self) -> None:
        self.posicion = Posicion()
        self.pares = []
        self._recalcular_repeticiones()

    def _recalcular_repeticiones(self) -> None:
        posicion = Posicion()
        self.repeticiones = {clave_repeticion(posicion): 1}
        for movimiento, _ in self.pares:
            posicion.aplicar(movimiento)
            clave = clave_repeticion(posicion)
            self.repeticiones[clave] = self.repeticiones.get(clave, 0) + 1

    def rotulo(self) -> str:
        """Rotulo de la proxima jugada: 1., 1..., 2., 2..."""
        indice = len(self.pares)
        jugada = indice // 2 + 1
        return f"{jugada}." if indice % 2 == 0 else f"{jugada}..."

    def capturas(self) -> list[Captura]:
        return [registro["captura"] for _, registro in self.pares if registro["captura"] is not None]

    def texto_estado(self) -> str:
        return terminacion(self.posicion, self.repeticiones) or "En juego"

    def aviso(self) -> str:
        capturas = self.capturas()
        if not capturas:
            return ""
        ultimo = _detalle(capturas, len(capturas) - 1)
        return (
            f"CAPTURA {ultimo['atacante']} x {ultimo['victima']} en casilla "
            f"{ultimo['numero_destino']} ({ultimo['destino']})  ->  {ultimo['resultado']}"
        )

    def legales(self) -> dict[str, list[str]]:
        """Casilla de origen -> destinos legales. Solo cuando mueve el humano."""
        if not self.posicion.turno:
            return {}
        mapa: dict[str, list[str]] = {}
        for movimiento in self.posicion.movimientos_legales():
            origen = a_texto(movimiento.origen)
            destino = a_texto(movimiento.destino)
            destinos = mapa.setdefault(origen, [])
            if destino not in destinos:
                destinos.append(destino)
        return mapa

    # ------------------------------------------------------------- jugadas
    def aplicar(self, movimiento: Movimiento) -> Captura | None:
        """Aplica una jugada, anota su captura y su rotulo numerado."""
        atacante = self.posicion.pieza_en(movimiento.origen)
        victima = pieza_capturada(self.posicion, movimiento)
        captura: Captura | None = None
        if victima != ".":
            origen = a_texto(movimiento.origen)
            destino = a_texto(movimiento.destino)
            captura = Captura(
                jugada=self.rotulo(),
                color_blanca=es_blanca(atacante),
                atacante=atacante,
                victima=victima,
                origen=origen,
                destino=destino,
                numero_origen=numero(origen),
                numero_destino=numero(destino),
            )

        rotulo = self.rotulo()
        self.posicion.aplicar(movimiento)
        self.pares.append((movimiento, {"rotulo": rotulo, "captura": captura}))
        clave = clave_repeticion(self.posicion)
        self.repeticiones[clave] = self.repeticiones.get(clave, 0) + 1
        return captura

    def responder_ia(self) -> Movimiento | None:
        """Juega con las negras si es su turno. Devuelve la jugada, si la hubo."""
        if self.posicion.turno or not self.posicion.movimientos_legales():
            return None
        movimiento = mejor_jugada(self.posicion, PROFUNDIDAD_IA)
        if movimiento is None:
            return None
        self.aplicar(movimiento)
        return movimiento

    def jugar(self, origen: str, destino: str, promocion: str | None = None):
        """Jugada del humano (blancas) y respuesta automatica de la IA."""
        if not self.posicion.turno:
            return False, "Le toca a la computadora, espera su jugada.", None

        texto = f"{origen}{destino}" + (promocion or "")
        movimiento = self.posicion.movimiento_desde_texto(texto)
        if movimiento is None:
            if not self.posicion.movimientos_legales():
                return False, f"La partida ha terminado: {self.texto_estado()}", None
            return False, "Jugada ilegal: revisa la casilla de origen y destino.", None

        captura_humana = self.aplicar(movimiento)
        movimiento_ia = self.responder_ia()
        captura_ia = self.pares[-1][1]["captura"] if movimiento_ia is not None else None

        capturas = self.capturas()
        total = len(capturas)
        detalle_humana = None
        detalle_ia = None
        if captura_ia is not None:
            detalle_ia = _detalle(capturas, total - 1)
            if captura_humana is not None:
                detalle_humana = _detalle(capturas, total - 2)
        elif captura_humana is not None:
            detalle_humana = _detalle(capturas, total - 1)

        return True, "", {
            "humana": {"uci": movimiento.uci, "captura": detalle_humana},
            "ia": {
                "uci": movimiento_ia.uci if movimiento_ia is not None else "",
                "captura": detalle_ia,
            },
        }

    def deshacer(self) -> bool:
        """Retira la ultima jugada; si luego queda turno de negras, la IA responde."""
        if not self.pares:
            return False
        try:
            movimiento, _ = self.pares.pop()
            self.posicion.deshacer(movimiento)
            # si la jugada retirada fue de la computadora, se retira tambien
            # la del humano para que el turno completo vuelva a estar disponible
            if not self.posicion.turno and self.pares:
                movimiento, _ = self.pares.pop()
                self.posicion.deshacer(movimiento)
        except IndexError:
            return False
        self._recalcular_repeticiones()
        if not self.posicion.turno:
            self.responder_ia()
        return True

    # ------------------------------------------------------------- estado
    def estado(self) -> dict:
        capturas = self.capturas()
        tablero = []
        for indice in range(64):
            fila, col = divmod(indice, 8)
            nombre = a_texto((fila, col))
            pieza = self.posicion.tablero[fila][col]
            tablero.append(
                {
                    "casilla": nombre,
                    "pieza": pieza,
                    "numero": NUMEROS[nombre],
                    "etiqueta": etiqueta(pieza, nombre) if pieza != "." else "",
                }
            )

        if self.pares:
            ultimo = self.pares[-1][0]
            ultima = {"origen": a_texto(ultimo.origen), "destino": a_texto(ultimo.destino)}
        else:
            ultima = None

        return {
            "tablero": tablero,
            "turno": "blancas" if self.posicion.turno else "negras",
            "estado": self.texto_estado(),
            "aviso": self.aviso() or "Sin capturas todavia.",
            "legales": self.legales(),
            "ultima": ultima,
            "capturas": [_detalle(capturas, i) for i in range(len(capturas))],
            "resumen": resumen_partida(capturas),
            "historial": [
                f"{registro['rotulo']} {movimiento.uci}" for movimiento, registro in self.pares
            ],
        }


# ---------------------------------------------------------------------------
# Pagina HTML (mobile-first, sin dependencias externas).

PAGINA = r"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#141a21">
<title>Ajedrez web 1-64</title>
<style>
:root{
  --fondo:#141a21; --panel:#1d242e; --borde:#2b3441;
  --texto:#e6edf5; --suave:#93a3b5; --acento:#f5d76e;
  --claro:#f0d9b5; --oscuro:#b58863;
}
*{box-sizing:border-box; -webkit-tap-highlight-color:transparent}
html,body{margin:0; padding:0}
body{
  background:var(--fondo); color:var(--texto);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  padding-bottom:30px;
}
header{
  display:flex; justify-content:space-between; align-items:center; gap:10px;
  padding:10px 12px; background:var(--panel); border-bottom:1px solid var(--borde);
  position:sticky; top:0; z-index:10;
}
header h1{margin:0; font-size:16px; letter-spacing:.4px}
#turno{font-size:15px; font-weight:700; color:var(--acento); white-space:nowrap}
#estado{padding:8px 12px 0; font-size:13px; color:var(--suave); min-height:18px}
#aviso{
  margin:8px 10px; padding:9px 10px; min-height:38px;
  background:#2b2517; border:1px solid #544a22; border-radius:8px;
  color:var(--acento); font-size:13px; line-height:1.35;
}
#tablero{
  display:grid; grid-template-columns:repeat(8,1fr); width:100%;
  touch-action:manipulation; user-select:none; -webkit-user-select:none;
}
.casilla{
  position:relative; aspect-ratio:1/1; display:flex; align-items:center;
  justify-content:center; font-size:min(7.2vw,44px); cursor:pointer;
}
.casilla.claro{background:var(--claro)}
.casilla.oscuro{background:var(--oscuro)}
.casilla.ult{box-shadow:inset 0 0 0 100px rgba(247,220,70,.35)}
.casilla.sel{box-shadow:inset 0 0 0 100px rgba(64,160,90,.45)}
.n{
  position:absolute; top:1px; left:3px; font-size:min(2.6vw,13px);
  font-weight:700; opacity:.75; z-index:2; pointer-events:none;
}
.claro .n{color:#7a6144}
.oscuro .n{color:#f6ead9}
.ficha{
  position:relative; z-index:3; width:78%; height:78%; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-weight:700; line-height:1;
}
.ficha.blanca{background:#fcfcfc; color:#141414; border:2px solid #333}
.ficha.negra{background:#141414; color:#f4f4f4; border:2px solid #ececec}
.ficha.peon{font-size:.6em}
.punto{
  position:absolute; z-index:4; width:26%; height:26%; border-radius:50%;
  background:rgba(20,70,35,.5); display:none;
}
.casilla.dest .punto{display:block}
.casilla.capt .punto{
  display:block; width:86%; height:86%; background:transparent;
  border:4px solid rgba(20,85,40,.65);
}
.botones{display:flex; gap:8px; padding:10px}
.botones button{
  flex:1; padding:13px 6px; font-size:15px; font-weight:600;
  color:var(--texto); background:var(--panel); border:1px solid var(--borde);
  border-radius:10px; touch-action:manipulation;
}
.botones button:active{background:#29323e; transform:translateY(1px)}
.panel{
  margin:4px 10px 0; padding:10px; background:var(--panel);
  border:1px solid var(--borde); border-radius:10px;
}
.panel h2{
  margin:0 0 7px; font-size:12px; letter-spacing:.8px;
  text-transform:uppercase; color:var(--suave);
}
.resumen{display:grid; grid-template-columns:1fr 1fr; gap:5px; font-size:14px}
.resumen b{color:var(--acento)}
.resumen .ancho{grid-column:1/-1; color:var(--suave); font-size:13px; word-break:break-all}
.tabla{overflow-x:auto}
table{width:100%; border-collapse:collapse; font-size:12.5px}
th{
  color:var(--suave); font-size:11px; text-transform:uppercase;
  padding:4px 3px; border-bottom:1px solid var(--borde); text-align:left;
}
td{padding:5px 3px; border-bottom:1px solid #232b35}
td.res{color:var(--acento); font-weight:700; white-space:nowrap}
tr:last-child td{border-bottom:none}
.historial{font-size:13.5px; line-height:1.8; color:#cfd9e4; word-spacing:3px}
footer{margin:14px 10px 0; font-size:12px; color:var(--suave); line-height:1.7}
</style>
</head>
<body>
<header>
  <h1>Ajedrez 1-64</h1>
  <div id="turno">Turno: blancas</div>
</header>
<div id="estado">Cargando partida...</div>
<div id="aviso">Sin capturas todavia.</div>
<div id="tablero" aria-label="Tablero de ajedrez"></div>

<div class="botones">
  <button id="btnNueva" type="button">Nueva partida</button>
  <button id="btnDeshacer" type="button">Deshacer</button>
  <button id="btnNumeros" type="button">Numeros: no</button>
</div>

<section class="panel">
  <h2>Resumen</h2>
  <div id="resumen" class="resumen"></div>
</section>

<section class="panel">
  <h2>Capturas de la partida</h2>
  <div class="tabla">
    <table>
      <thead>
        <tr><th>Jug</th><th>Pieza</th><th>Origen</th><th>Destino</th><th>Resultado</th></tr>
      </thead>
      <tbody id="capturas"></tbody>
    </table>
  </div>
</section>

<section class="panel">
  <h2>Jugadas</h2>
  <div id="historial" class="historial"></div>
</section>

<footer>
  Peon = numero de su casilla &nbsp; &quot; = caballo &nbsp; &iexcl; = alfil &nbsp;
  T = torre &nbsp; D = dama &nbsp; R = rey &nbsp; Las negras van en circulo oscuro.
  <br>
  Multiplican peon x peon y peon x pieza menor (caballo o alfil):
  numero de origen x numero de destino (maximo 4 cifras). La dama y la
  torre NO multiplican. Un producto repetido se anota una sola vez.
</footer>

<script>
var estado = null;
var seleccion = null;
var pensando = false;
var numeros = false;
var mapa = {};

function escapar(texto){
  return String(texto).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function api(ruta, metodo, datos){
  var opciones = {method: metodo || 'GET', headers: {'Content-Type': 'application/json'}};
  if (datos !== undefined && datos !== null) opciones.body = JSON.stringify(datos);
  return fetch(ruta, opciones).then(function(respuesta){
    return respuesta.json().then(function(cuerpo){
      if (!respuesta.ok && cuerpo.ok === undefined) cuerpo.ok = false;
      return cuerpo;
    });
  });
}

function dibujar(){
  if (!estado) return;
  mapa = {};
  var i;
  for (i = 0; i < estado.tablero.length; i++){
    mapa[estado.tablero[i].casilla] = estado.tablero[i];
  }
  var legales = estado.legales || {};
  var destinos = (seleccion && legales[seleccion]) ? legales[seleccion] : [];
  var ultima = estado.ultima;
  var html = '';
  for (i = 0; i < estado.tablero.length; i++){
    var c = estado.tablero[i];
    var fila = Math.floor(i / 8);
    var columna = i % 8;
    var claro = (fila + columna) % 2 === 0;
    var clases = ['casilla', claro ? 'claro' : 'oscuro'];
    if (seleccion === c.casilla) clases.push('sel');
    if (ultima && (ultima.origen === c.casilla || ultima.destino === c.casilla)) clases.push('ult');
    if (destinos.indexOf(c.casilla) >= 0) clases.push(c.pieza === '.' ? 'dest' : 'capt');
    var dentro = '';
    if (numeros || c.pieza === '.'){
      dentro += '<span class="n">' + c.numero + '</span>';
    }
    if (c.pieza !== '.'){
      var blanca = c.pieza === c.pieza.toUpperCase();
      var peon = c.pieza.toUpperCase() === 'P';
      dentro += '<span class="ficha ' + (blanca ? 'blanca' : 'negra') + (peon ? ' peon' : '') + '">' +
                '<span>' + escapar(c.etiqueta) + '</span></span>';
    }
    dentro += '<span class="punto"></span>';
    html += '<div class="' + clases.join(' ') + '" data-c="' + c.casilla + '">' + dentro + '</div>';
  }
  document.getElementById('tablero').innerHTML = html;
}

function pintar(){
  document.getElementById('turno').textContent = 'Turno: ' + estado.turno;
  document.getElementById('estado').textContent = estado.estado;
  document.getElementById('aviso').textContent = estado.aviso || 'Sin capturas todavia.';

  var r = estado.resumen;
  document.getElementById('resumen').innerHTML =
    '<div>Capturas: <b>' + r.capturas + '</b></div>' +
    '<div>Multiplicaciones: <b>' + r.multiplicaciones + '</b></div>' +
    '<div>Repetidos sin sumar: <b>' + r.repetidos + '</b></div>' +
    '<div>Suma de productos: <b>' + r.suma + '</b></div>' +
    '<div class="ancho">Huella: ' +
      (r.productos.length ? r.productos.join(' - ') : 'sin productos') + '</div>';

  var filas = '';
  if (!estado.capturas.length){
    filas = '<tr><td colspan="5">Sin capturas todavia.</td></tr>';
  } else {
    for (var i = 0; i < estado.capturas.length; i++){
      var c = estado.capturas[i];
      filas += '<tr>' +
        '<td>' + escapar(c.jugada) + '</td>' +
        '<td>' + escapar(c.atacante) + ' x ' + escapar(c.victima) + '</td>' +
        '<td>' + c.origen + ' = ' + c.numero_origen + '</td>' +
        '<td>' + c.destino + ' = ' + c.numero_destino + '</td>' +
        '<td class="res">' + escapar(c.resultado) + '</td>' +
        '</tr>';
    }
  }
  document.getElementById('capturas').innerHTML = filas;
  document.getElementById('historial').textContent =
    estado.historial.length ? estado.historial.join('   ') : 'Sin jugadas todavia.';
}

function refrescar(){
  dibujar();
  pintar();
}

function tocar(casilla){
  if (!estado || pensando) return;
  if (estado.turno !== 'blancas') return;
  var legales = estado.legales || {};
  if (seleccion){
    var destinos = legales[seleccion] || [];
    if (destinos.indexOf(casilla) >= 0){
      jugar(seleccion, casilla);
      return;
    }
  }
  var c = mapa[casilla];
  if (c && c.pieza !== '.' && c.pieza === c.pieza.toUpperCase()){
    seleccion = (seleccion === casilla) ? null : casilla;
  } else {
    seleccion = null;
  }
  dibujar();
}

function jugar(origen, destino){
  pensando = true;
  seleccion = null;
  document.getElementById('aviso').textContent = 'La computadora esta pensando...';
  dibujar();
  api('/api/jugada', 'POST', {origen: origen, destino: destino}).then(function(datos){
    pensando = false;
    if (datos.ok === false){
      document.getElementById('aviso').textContent = datos.error || 'Jugada ilegal.';
      dibujar();
      return;
    }
    estado = datos;
    refrescar();
  }).catch(function(){
    pensando = false;
    document.getElementById('aviso').textContent = 'Sin conexion con el servidor.';
    dibujar();
  });
}

document.getElementById('tablero').addEventListener('click', function(evento){
  var celda = evento.target.closest ? evento.target.closest('[data-c]') : null;
  if (celda) tocar(celda.getAttribute('data-c'));
});

document.getElementById('btnNueva').addEventListener('click', function(){
  if (pensando) return;
  api('/api/nueva', 'POST', {}).then(function(datos){
    seleccion = null;
    if (datos.ok !== false) estado = datos;
    refrescar();
  }).catch(function(){
    document.getElementById('aviso').textContent = 'Sin conexion con el servidor.';
  });
});

document.getElementById('btnDeshacer').addEventListener('click', function(){
  if (pensando) return;
  api('/api/deshacer', 'POST', {}).then(function(datos){
    seleccion = null;
    if (datos.ok !== false) estado = datos;
    else document.getElementById('aviso').textContent = datos.error || 'No hay jugadas que deshacer.';
    refrescar();
  }).catch(function(){
    document.getElementById('aviso').textContent = 'Sin conexion con el servidor.';
  });
});

document.getElementById('btnNumeros').addEventListener('click', function(){
  numeros = !numeros;
  document.getElementById('btnNumeros').textContent = 'Numeros: ' + (numeros ? 'si' : 'no');
  dibujar();
});

api('/api/estado').then(function(datos){
  estado = datos;
  refrescar();
}).catch(function(){
  document.getElementById('aviso').textContent = 'Sin conexion con el servidor.';
});
</script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Servidor HTTP


class Manejador(BaseHTTPRequestHandler):
    """Sirve la pagina y la API JSON de la partida."""

    server_version = "AjedrezWeb/1.0"

    def log_message(self, formato, *argumentos):
        pass  # sin ruido en consola

    def _responder(self, codigo: int, cuerpo: bytes, tipo: str) -> None:
        try:
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(cuerpo)
        except OSError:
            pass  # el cliente cerro la conexion

    def _json(self, datos: dict, codigo: int = 200) -> None:
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self._responder(codigo, cuerpo, "application/json; charset=utf-8")

    def _leer(self) -> dict:
        tamano = int(self.headers.get("Content-Length") or 0)
        crudo = self.rfile.read(tamano) if tamano else b""
        if not crudo:
            return {}
        datos = json.loads(crudo.decode("utf-8"))
        return datos if isinstance(datos, dict) else {}

    def do_GET(self) -> None:
        ruta = self.path.split("?")[0]
        if ruta == "/":
            self._responder(200, PAGINA.encode("utf-8"), "text/html; charset=utf-8")
        elif ruta == "/api/estado":
            with BLOQUEO:
                self._json(PARTIDA.estado())
        else:
            self._json({"ok": False, "error": "Ruta no encontrada"}, 404)

    def do_POST(self) -> None:
        ruta = self.path.split("?")[0]
        try:
            datos = self._leer()
        except (ValueError, UnicodeDecodeError):
            self._json({"ok": False, "error": "JSON invalido"}, 400)
            return

        if ruta == "/api/jugada":
            with BLOQUEO:
                origen = str(datos.get("origen", "")).strip().lower()
                destino = str(datos.get("destino", "")).strip().lower()
                promocion = str(datos.get("promocion", "")).strip().lower()
                if promocion not in ("q", "r", "b", "n"):
                    promocion = None
                ok, error, extras = PARTIDA.jugar(origen, destino, promocion)
                cuerpo = PARTIDA.estado()
            if not ok:
                self._json({**cuerpo, "ok": False, "error": error}, 400)
                return
            self._json({**cuerpo, "ok": True, **extras})
            return

        if ruta == "/api/nueva":
            with BLOQUEO:
                PARTIDA.reiniciar()
                cuerpo = PARTIDA.estado()
            self._json({**cuerpo, "ok": True})
            return

        if ruta == "/api/deshacer":
            with BLOQUEO:
                hubo = PARTIDA.deshacer()
                cuerpo = PARTIDA.estado()
            if not hubo:
                self._json({**cuerpo, "ok": False, "error": "No hay jugadas que deshacer."}, 400)
                return
            self._json({**cuerpo, "ok": True})
            return

        self._json({"ok": False, "error": "Ruta no encontrada"}, 404)


def crear_servidor(host: str = HOST, puerto: int = PUERTO) -> ThreadingHTTPServer:
    """Crea el servidor (puerto 0 = el sistema elige uno libre)."""
    return ThreadingHTTPServer((host, puerto), Manejador)


def ip_lan() -> str:
    """IP de la red local; no manda paquetes reales, solo consulta la ruta."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass
    finally:
        sock.close()
    try:
        ip = socket.gethostbyname(socket.gethostname())
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass
    return "127.0.0.1"


def imprimir_banner(puerto: int) -> None:
    url = "http://%s:%d" % (ip_lan(), puerto)
    borde = "=" * 66
    print(borde)
    print("  AJEDREZ WEB 1-64  -  servidor listo (solo biblioteca estandar)")
    print(borde)
    print("  PC      : %s" % url)
    print("  Celular : abre esa misma URL en el navegador del telefono")
    print("            (misma red WiFi y puerto %d abierto en el firewall)" % puerto)
    print("  Salir   : Ctrl+C en esta ventana")
    print(borde)
    sys.stdout.flush()


def main() -> int:
    PARTIDA.reiniciar()
    servidor = crear_servidor()
    imprimir_banner(servidor.server_address[1])
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor. Hasta luego.")
    finally:
        servidor.server_close()
    return 0


PARTIDA = Partida()

if __name__ == "__main__":
    raise SystemExit(main())
