import io
import sys
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", newline="")

import numeracion as num
import motor
import ajedrez
import grafico

fallos = []


def revisar(condicion, mensaje):
    print(("OK   " if condicion else "FALLO") + " " + mensaje)
    if not condicion:
        fallos.append(mensaje)


# 1. tablas de capturas: repetidos y 4 cifras
capturas = [
    num.Captura("5.", True, "P", "P", "c4", "d5", 58, 54),
    num.Captura("10...", False, "P", "N", "e6", "d5", 38, 54),
    num.Captura("20.", True, "P", "P", "c4", "d5", 58, 54),
    num.Captura("30.", False, "P", "N", "f6", "e5", 25, 46),
]
lineas = num.tabla_capturas(capturas)
revisar(any("3132 (repetido)" in linea for linea in lineas), "producto repetido marcado en la tabla")
datos = num.resumen_partida(capturas)
revisar(datos["suma"] == 3132 + 2052 + 1150, "suma cuenta cada producto una sola vez: %s" % datos["suma"])
revisar(datos["repetidos"] == 1, "contador de repetidos = 1 (obtuvo %s)" % datos["repetidos"])
revisar(num.TOPE == 9999, "tope de 4 cifras = 9999")
revisar(64 * 64 <= num.TOPE, "el maximo posible 64x64=4096 cabe en 4 cifras")

# 2. simbolos de piezas
revisar(num.etiqueta("N", "c3") == '"', 'caballo = "')
revisar(num.es_multiplicacion("P", "P"), "peon x peon multiplica")
revisar(num.es_multiplicacion("P", "N"), "peon x caballo multiplica")
revisar(num.es_multiplicacion("P", "B"), "peon x alfil multiplica")
revisar(not num.es_multiplicacion("P", "R"), "peon x torre NO multiplica")
revisar(not num.es_multiplicacion("R", "P"), "torre x peon NO multiplica")
revisar(not num.es_multiplicacion("Q", "N"), "dama x caballo NO multiplica")
revisar(not num.es_multiplicacion("R", "R"), "torre x torre NO multiplica")
revisar(not num.es_multiplicacion("r", "p"), "torre negra x peon NO multiplica")
revisar(not num.es_multiplicacion("Q", "p"), "dama negra x peon NO multiplica")
revisar(not num.es_multiplicacion("B", "P"), "alfil x peon NO multiplica")
revisar(not num.es_multiplicacion("N", "P"), "caballo x peon NO multiplica")
revisar(not num.es_multiplicacion("K", "P"), "rey x peon NO multiplica")
revisar(num.etiqueta("B", "f1") == "¿", "alfil = ¿")
revisar(num.etiqueta("R", "f1") == "T", "torre = T")
revisar(num.etiqueta("Q", "d1") == "D", "dama = D")
revisar(num.etiqueta("K", "e1") == "R", "rey = R")
revisar(num.etiqueta("P", "e2") == str(num.numero("e2")), "peon = numero de su casilla")

# 3. tablero de consola con la nueva numeracion
posicion = motor.Posicion()
for texto in ("e2e4", "e7e5", "d2d4"):
    movimiento = posicion.movimiento_desde_texto(texto)
    revisar(movimiento is not None, "jugada legal %s" % texto)
    if movimiento is None:
        break
    posicion.aplicar(movimiento)
ajedrez.dibujar(posicion, [], "")
fen = posicion.a_fen().split()[0]
revisar(
    fen == "rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR",
    "tablero dibujado correctamente (FEN %s)" % fen,
)

# 3b. IA: devuelve jugadas legales y encuentra el mate en una jugada
inicio = time.perf_counter()
jugada_ia = motor.mejor_jugada(motor.Posicion(), 2)
tiempo_ia = time.perf_counter() - inicio
revisar(
    jugada_ia is not None and jugada_ia in motor.Posicion().movimientos_legales(),
    "IA propone una jugada legal en la posicion inicial (%.2f s)" % tiempo_ia,
)
mate = motor.Posicion("7k/5R2/6K1/8/8/8/8/8 w - - 0 1")
mejor_jaque = motor.mejor_jugada(mate, 1)
revisar(
    mejor_jaque is not None
    and mejor_jaque.origen == (1, 5)
    and mejor_jaque.destino == (0, 5),
    "IA da mate en 1 con torre f7 a f8 (obtuvo %s)" % (mejor_jaque.uci if mejor_jaque else "-"),
)

# 4. app grafica: arranca, juega y cierra
app = grafico.Aplicacion()
app.update()
mov = app.posicion.movimiento_desde_texto("e2e4")
app.aplicar(mov, "1.")
revisar(app.capturas() == [], "sin capturas tras e4")

# ambos bandos quedan numerados (1. y 1...), no solo el del humano
app.nueva_partida()
app.posicion = motor.Posicion("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2")
app.ia_negras = True
app.update()
captura_blanca = app.posicion.movimiento_desde_texto("e4d5")
app._ejecutar([captura_blanca])
app.update()
revisar(
    [registro.jugada for _, registro in app.pares] == ["1.", "1..."],
    "rotulos numerados para humano (1.) e IA (1...): %s"
    % [r.jugada for _, r in app.pares],
)
app.cargar_partida()
for _ in range(20):
    app.siguiente()
app.update()
revisar(len(app.capturas()) >= 1, "capturas en la partida real: %d" % len(app.capturas()))
revisar("PARTIDA 6" in app.etiqueta_progreso.cget("text").replace("Partida", "PARTIDA"), "progreso: %s" % app.etiqueta_progreso.cget("text"))
app.after(1500, app.destroy)
app.mainloop()
print("ventana abierta y cerrada sin errores")

print("")
print("FALLOS: %d" % len(fallos))
for mensaje in fallos:
    print(" - " + mensaje)
sys.exit(1 if fallos else 0)
