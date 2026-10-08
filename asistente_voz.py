"""asistente_voz.py - Asistente de ajedrez por VOZ (gratis y offline).

Habla (pyttsx3) y escucha (SpeechRecognition + PyAudio). El analisis usa el
motor local motor.py, sin OpenAI ni internet de pago.

Uso:
    python asistente_voz.py

Ordenes que entiende:
    "mejor jugada"      -> sugiere jugada
    "juega"             -> la aplica en el tablero
    "analiza"           -> evalua la posicion
    "deshacer"          -> retrocede
    "nueva partida"     -> reinicia
    "que ves"           -> describe el material
    "abandonar"         -> rinde
    "e2 e4" / "e4"      -> mueve pieza
    "adios" / "salir"   -> termina
"""

from __future__ import annotations

import sys

import pyttsx3
import speech_recognition as sr

from motor import Posicion, Movimiento, FEN_INICIAL, a_texto, desde_texto, es_blanca
from motor import mejor_jugada, evaluar
from numeracion import numero, casilla_de, nombre_pieza, etiqueta


# --------------------------------------------------------------------- voz

_motor_voz = None


def _obtener_motor_voz():
    global _motor_voz
    if _motor_voz is None:
        _motor_voz = pyttsx3.init()
        voces = _motor_voz.getProperty("voices")
        for voz in voces:
            ident = (voz.id or "").lower()
            if "es-mx" in ident or "es-es" in ident or "spanish" in ident:
                _motor_voz.setProperty("voice", voz.id)
                break
        _motor_voz.setProperty("rate", 165)
        _motor_voz.setProperty("volume", 0.95)
    return _motor_voz


def hablar(texto: str) -> None:
    print(f"Bot: {texto}")
    try:
        motor = _obtener_motor_voz()
        motor.say(texto)
        motor.runAndWait()
    except Exception as error:
        print(f"  (sin voz: {error})")


def escuchar() -> str | None:
    reconocedor = sr.Recognizer()
    try:
        with sr.Microphone() as fuente:
            print("Escuchando...")
            reconocedor.adjust_for_ambient_noise(fuente, duration=0.4)
            reconocedor.pause_threshold = 0.9
            audio = reconocedor.listen(fuente, timeout=8, phrase_time_limit=8)
    except sr.WaitTimeoutError:
        return None
    except Exception as error:
        print(f"  (microfono: {error})")
        return None
    try:
        texto = reconocedor.recognize_google(audio, language="es-ES")
        print(f"Tu: {texto}")
        return texto.lower()
    except sr.UnknownValueError:
        print("  (no entendi)")
        return None
    except sr.RequestError:
        print("  (sin internet para reconocer la voz)")
        return None


# ---------------------------------------------------------------- utilidad

LETRAS_ES = {
    "a": "a", "b": "be", "c": "ce", "d": "de",
    "e": "e", "f": "efe", "g": "ge", "h": "ache",
}


def decir_casilla(casilla: str) -> str:
    """'e4' -> 'e cuatro'."""
    casilla = casilla.strip().lower()
    if len(casilla) != 2:
        return casilla
    letra = LETRAS_ES.get(casilla[0], casilla[0])
    return f"{letra} {casilla[1]}"


def decir_movimiento(mov: Movimiento) -> str:
    """Habla en la metodologia numerica 1-64: 'de la casilla 44 a la casilla 56'."""
    origen = a_texto(mov.origen)
    destino = a_texto(mov.destino)
    na = numero(origen)
    nb = numero(destino)
    return f"de la casilla {na} a la casilla {nb}"


def leer_jugadas(texto: str) -> list[str]:
    """Extrae casillas del habla aceptando NUMEROS (1-64) o letras (e2 e4)."""
    resultado = []
    for token in texto.replace(",", " ").split():
        token = token.strip(".!?,;:")
        if token.isdigit():
            n = int(token)
            if 1 <= n <= 64:
                c = casilla_de(n)
                if c:
                    resultado.append(c)
        elif len(token) == 2 and token[0] in "abcdefgh" and token[1] in "12345678":
            resultado.append(token)
    return resultado


# ----------------------------------------------------------------- ajedrez

class Partida:
    def __init__(self, profundidad: int = 3) -> None:
        self.pos = Posicion(FEN_INICIAL)
        self.profundidad = profundidad
        self.rendida = False
        self.jugadas: list[str] = []

    def turno_texto(self) -> str:
        return "blancas" if self.pos.turno else "negras"

    def fin(self) -> bool:
        if self.rendida:
            return True
        return self.pos.sin_jugadas()

    def terminacion(self) -> str:
        if self.rendida:
            return "Partida terminada por rendicion."
        if not self.pos.movimientos_legales():
            if self.pos.en_jaque():
                ganan = "negras" if self.pos.turno else "blancas"
                return f"Jaque mate. Ganan las {ganan}."
            return "Rey ahogado. Tablas."
        if self.pos.material_insuficiente():
            return "Tablas por material insuficiente."
        return ""

    def aplicar(self, mov: Movimiento) -> bool:
        if not self.pos.es_legal(mov):
            return False
        pieza = self.pos.pieza_en(mov.origen)
        victima = self.pos.pieza_en(mov.destino)
        self.pos.aplicar(mov)
        origen = a_texto(mov.origen)
        destino = a_texto(mov.destino)
        if victima != ".":
            num = numero(destino)
            self.jugadas.append(f"{origen}x{destino} (casilla {num})")
        else:
            self.jugadas.append(f"{origen}-{destino}")
        return True

    def deshacer(self) -> bool:
        if not self.jugadas:
            return False
        self.jugadas.pop()
        try:
            self.pos.deshacer(None)
        except Exception:
            pass
        return True

    def material(self) -> str:
        blancas: dict[str, int] = {}
        negras: dict[str, int] = {}
        for fila in range(8):
            for col in range(8):
                p = self.pos.tablero[fila][col]
                if p == ".":
                    continue
                destino = blancas if es_blanca(p) else negras
                clave = p.upper()
                destino[clave] = destino.get(clave, 0) + 1
        orden = "PNBRQ"

        def cuenta(tabla: dict[str, int]) -> str:
            partes = [f"{nombre_pieza(c)} {tabla[c]}" for c in orden if c in tabla]
            return ", ".join(partes) if partes else "nada"

        return f"blancas: {cuenta(blancas)}; negras: {cuenta(negras)}"

    def dibujo(self) -> str:
        filas = []
        for fila in range(8):
            linea = f"{8 - fila} "
            for col in range(8):
                p = self.pos.tablero[fila][col]
                linea += (p if p != "." else ".") + " "
            filas.append(linea)
        filas.append("  a b c d e f g h")
        return "\n".join(filas)


# --------------------------------------------------------------- respuestas

def responder_mejor_jugada(partida: Partida) -> None:
    habla_turno = partida.turno_texto()
    mov = mejor_jugada(partida.pos, partida.profundidad)
    if mov is None:
        hablar(f"No hay jugadas legales para las {habla_turno}.")
        return
    pieza = partida.pos.pieza_en(mov.origen)
    victima = partida.pos.pieza_en(mov.destino)
    na = numero(a_texto(mov.origen))
    nb = numero(a_texto(mov.destino))
    partes = [f"Para las {habla_turno}, la mejor jugada es"]
    partes.append(f"{nombre_pieza(pieza)} de la casilla {na} a la casilla {nb}")
    if victima != ".":
        partes.append(f"capturando {nombre_pieza(victima)}. Resultado {na}x{nb}={na * nb}")
    elif pieza in "Pp" and abs(mov.origen[0] - mov.destino[0]) == 2:
        partes.append("con doble avance de peon")
    partes.append(".")
    hablar(" ".join(partes))


def responder_juega(partida: Partida) -> None:
    if partida.fin():
        hablar("La partida ya termino. Di nueva partida para empezar otra.")
        return
    mov = mejor_jugada(partida.pos, partida.profundidad)
    if mov is None:
        hablar("No encuentro jugadas legales.")
        return
    pieza = partida.pos.pieza_en(mov.origen)
    victima = partida.pos.pieza_en(mov.destino)
    na = numero(a_texto(mov.origen))
    nb = numero(a_texto(mov.destino))
    if partida.aplicar(mov):
        texto = f"Juego {nombre_pieza(pieza)} de la casilla {na} a la casilla {nb}"
        if victima != ".":
            texto += f" y capturo {nombre_pieza(victima)}. Resultado {na}x{nb}={na * nb}"
        hablar(texto + ".")
        print(partida.dibujo())
        fin = partida.terminacion()
        if fin:
            hablar(fin)


def responder_analiza(partida: Partida) -> None:
    puntaje = evaluar(partida.pos)
    legales = partida.pos.movimientos_legales()
    habla_turno = partida.turno_texto()
    if puntaje > 40:
        bando = "las blancas"
    elif puntaje < -40:
        bando = "las negras"
    else:
        bando = None
    texto = f"Posicion para las {habla_turno}. Hay {len(legales)} jugadas legales. "
    if bando:
        texto += f"El material favorece a {bando}. "
    else:
        texto += "El material esta equilibrado. "
    if partida.pos.en_jaque():
        texto += " Las " + habla_turno + " estan en jaque."
    hablar(texto)


def responder_que_ves(partida: Partida) -> None:
    texto = f"Veo {partida.material()}. Juegan las {partida.turno_texto()}."
    if partida.jugadas:
        ultima = partida.jugadas[-1]
        texto += f" La ultima jugada fue {ultima}."
    hablar(texto)


def responder_nueva(partida: Partida) -> Partida:
    hablar("Nueva partida. Juegas con las blancas. Di una jugada como mueve 44 a 56.")
    return Partida(profundidad=partida.profundidad)


def intentar_mover_voz(partida: Partida, texto: str) -> bool:
    casillas = leer_jugadas(texto)
    if len(casillas) < 2:
        return False
    origen = desde_texto(casillas[0])
    destino = desde_texto(casillas[1])
    mov = Movimiento(origen=origen, destino=destino)
    if not partida.pos.es_legal(mov):
        na = numero(casillas[0])
        nb = numero(casillas[1])
        hablar(f"No hay jugada legal de la casilla {na} a la casilla {nb}.")
        return True

    na = numero(casillas[0])
    nb = numero(casillas[1])
    pieza = partida.pos.pieza_en(mov.origen)
    victima = partida.pos.pieza_en(mov.destino)
    if not partida.aplicar(mov):
        hablar("Esa jugada no es legal.")
        return True
    texto_j = f"Juegas {nombre_pieza(pieza)} de la casilla {na} a la casilla {nb}."
    if victima != ".":
        texto_j += f" Capturas {nombre_pieza(victima)}. Resultado {na}x{nb}={na * nb}."
    hablar(texto_j)
    print(partida.dibujo())
    fin = partida.terminacion()
    if fin:
        hablar(fin)
        return True
    if not partida.fin():
        respuesta = mejor_jugada(partida.pos, partida.profundidad)
        if respuesta:
            partida.aplicar(respuesta)
            na2 = numero(a_texto(respuesta.origen))
            nb2 = numero(a_texto(respuesta.destino))
            hablar(f"Respondo de la casilla {na2} a la casilla {nb2}.")
            print(partida.dibujo())
            fin = partida.terminacion()
            if fin:
                hablar(fin)
    return True


# ------------------------------------------------------------------- bucle

def procesar(partida: Partida, texto: str) -> Partida:
    if texto is None:
        return partida

    if any(p in texto for p in ("adios", "adiós", "salir", "chao", "hasta luego")):
        hablar("Hasta luego. Que tengas buen juego.")
        partida.rendida = True
        return partida

    if "nueva" in texto and ("partida" in texto or "juego" in texto):
        return responder_nueva(partida)

    if "rendirse" in texto or "rendir" in texto or "abandonar" in texto:
        partida.rendida = True
        hablar("Entendido, te rindes. Ganan las negras.")
        return partida

    if "deshacer" in texto or "atras" in texto or "atrás" in texto:
        if partida.deshacer():
            hablar("Listo, retrocedi.")
        else:
            hablar("No hay jugadas que deshacer.")
        return partida

    if "que ves" in texto or "que ves" in texto or "describe" in texto:
        responder_que_ves(partida)
        return partida

    if "mejor jugada" in texto or "sugiere" in texto or "sugerencia" in texto:
        responder_mejor_jugada(partida)
        return partida

    if "juega" in texto or "tu juega" in texto or "haz jugada" in texto:
        responder_juega(partida)
        return partida

    if "analiza" in texto or "analisis" in texto or "análisis" in texto or "como voy" in texto:
        responder_analiza(partida)
        return partida

    if "material" in texto:
        hablar(f"Material: {partida.material()}.")
        return partida

    if "tablero" in texto:
        print(partida.dibujo())
        hablar(f"Tablero impreso en pantalla. Juegan las {partida.turno_texto()}.")
        return partida

    if intentar_mover_voz(partida, texto):
        return partida

    hablar("No entendi. Puedes decir mejor jugada, juega, analiza, nueva partida, o mueve 44 a 56.")
    return partida


def main() -> None:
    print("=" * 56)
    print("  ASISTENTE DE AJEDREZ POR VOZ (gratis y offline)")
    print("  Ordenes: mejor jugada, juega, analiza, deshacer,")
    print("           nueva partida, que ves, abandonar, adios")
    print("  Jugadas: 'mueve 44 a 56' (numeros 1-64)")
    print("=" * 56)
    partida = Partida(profundidad=3)
    hablar("Hola, soy tu asistente de ajedrez. Di mejor jugada para empezar.")
    print(partida.dibujo())
    try:
        while not partida.fin():
            texto = escuchar()
            partida = procesar(partida, texto)
    except KeyboardInterrupt:
        print("\nTerminado por el usuario.")
    finally:
        try:
            _obtener_motor_voz().stop()
        except Exception:
            pass
        print("Fin.")


if __name__ == "__main__":
    sys.exit(main())