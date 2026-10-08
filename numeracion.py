"""Numeracion propia de las 64 casillas y reglas de multiplicacion en las capturas."""

from __future__ import annotations

from dataclasses import dataclass

CIFRAS_MAXIMAS = 4
TOPE = 10**CIFRAS_MAXIMAS - 1
VACIA = "."

NUMEROS: dict[str, int] = {
    "a1": 7, "b1": 18, "c1": 45, "d1": 30, "e1": 5, "f1": 16, "g1": 43, "h1": 28,
    "a2": 46, "b2": 31, "c2": 6, "d2": 17, "e2": 44, "f2": 29, "g2": 4, "h2": 15,
    "a3": 19, "b3": 8, "c3": 55, "d3": 52, "e3": 59, "f3": 64, "g3": 27, "h3": 42,
    "a4": 32, "b4": 47, "c4": 58, "d4": 61, "e4": 56, "f4": 53, "g4": 14, "h4": 3,
    "a5": 9, "b5": 20, "c5": 51, "d5": 54, "e5": 63, "f5": 60, "g5": 41, "h5": 26,
    "a6": 48, "b6": 33, "c6": 62, "d6": 57, "e6": 38, "f6": 25, "g6": 2, "h6": 13,
    "a7": 21, "b7": 10, "c7": 35, "d7": 50, "e7": 23, "f7": 12, "g7": 37, "h7": 40,
    "a8": 34, "b8": 49, "c8": 22, "d8": 11, "e8": 36, "f8": 39, "g8": 24, "h8": 1,
}

INVERSA: dict[int, str] = {}

PIEZAS_CORTAS = {
    "K": "R",
    "Q": "D",
    "R": "T",
    "B": "¿",
    "N": '"',
    "P": "P",
}


def _validar() -> None:
    valores = list(NUMEROS.values())
    if len(valores) != 64:
        raise AssertionError(f"La tabla debe tener 64 casillas, tiene {len(valores)}")
    if len(set(valores)) != 64:
        repetidos = sorted({v for v in valores if valores.count(v) > 1})
        raise AssertionError(f"Numeros repetidos: {repetidos}")
    if sorted(valores) != list(range(1, 65)):
        faltantes = sorted(set(range(1, 65)) - set(valores))
        raise AssertionError(f"Faltan numeros: {faltantes}")
    if TOPE != 9999:
        raise AssertionError("El tope debe ser 9999 (4 cifras)")


def construir_inversa() -> None:
    INVERSA.clear()
    for casilla, numero in NUMEROS.items():
        INVERSA[numero] = casilla


_validar()
construir_inversa()


def numero(casilla: str) -> int:
    """Numero fijo de una casilla en notacion algebraica, por ejemplo 'e4' -> 56."""
    clave = casilla.strip().lower()
    if clave not in NUMEROS:
        raise KeyError(f"La casilla {casilla!r} no existe")
    return NUMEROS[clave]


def casilla_de(valor: int) -> str | None:
    """Numero -> casilla. Devuelve None si el numero no pertenece al tablero."""
    return INVERSA.get(valor)


def nombre_pieza(pieza: str) -> str:
    return PIEZAS_CORTAS.get(pieza.upper(), pieza.upper())


def etiqueta(pieza: str, casilla: str) -> str:
    """Etiqueta de una casilla: el peon es su numero, el resto su letra o simbolo."""
    if pieza == VACIA:
        return "·"
    if pieza.upper() == "P":
        return str(numero(casilla))
    return PIEZAS_CORTAS[pieza.upper()]


def es_multiplicacion(atacante: str, victima: str) -> bool:
    """Multiplican peon x peon y peon x pieza menor.

    Las piezas mayores (dama y torre) NO multiplican al capturar.
    """
    ataca = atacante.upper()
    if ataca == "P":
        return victima.upper() in "PNB"
    return False


@dataclass(frozen=True)
class Captura:
    jugada: str
    color_blanca: bool
    atacante: str
    victima: str
    origen: str
    destino: str
    numero_origen: int
    numero_destino: int

    @property
    def multiplica(self) -> bool:
        return es_multiplicacion(self.atacante, self.victima)

    @property
    def producto(self) -> int | None:
        if not self.multiplica:
            return None
        valor = self.numero_origen * self.numero_destino
        return valor if valor <= TOPE else None

    @property
    def grupo(self) -> str:
        if not self.multiplica:
            return f"{self.numero_destino} (sin multiplicar)"
        valor = self.numero_origen * self.numero_destino
        if valor > TOPE:
            return f"{valor} (supera {CIFRAS_MAXIMAS} cifras)"
        return f"{self.numero_origen}x{self.numero_destino}={valor}"

    @property
    def bando(self) -> str:
        return "blancas" if self.color_blanca else "negras"


def resultado_unico(captura: Captura, vistas: set[int]) -> str:
    """Resultado de la captura sin repetir: un mismo producto se anota una sola vez."""
    producto = captura.producto
    if producto is None:
        return captura.grupo
    if producto in vistas:
        return f"{producto} (repetido)"
    vistas.add(producto)
    return captura.grupo


def tabla_capturas(capturas: list[Captura]) -> list[str]:
    """Tabla de capturas: jugada, pieza, numeros de casilla y resultado."""
    lineas = []
    lineas.append(
        "  JUGADA     BANDO    PIEZA     CASILLA  NUM  ->  CASILLA  NUM  RESULTADO"
    )
    lineas.append("  " + "-" * 76)
    vistas: set[int] = set()
    for captura in capturas:
        bando = captura.bando[:1].upper() + captura.bando[1:]
        pieza = f"{nombre_pieza(captura.atacante)} x {nombre_pieza(captura.victima)}"
        lineas.append(
            f"  {captura.jugada:<10} {bando:<8} {pieza:<9} "
            f"{captura.origen:>6} {captura.numero_origen:>4}  ->  "
            f"{captura.destino:>6} {captura.numero_destino:>4}  "
            f"{resultado_unico(captura, vistas)}"
        )
    return lineas


def resumen_partida(capturas: list[Captura]) -> dict[str, object]:
    """Agrupacion numerica que identifica la partida: cada producto cuenta una vez."""
    unicos: list[int] = []
    repetidos = 0
    for captura in capturas:
        producto = captura.producto
        if producto is None:
            continue
        if producto in unicos:
            repetidos += 1
        else:
            unicos.append(producto)

    return {
        "capturas": len(capturas),
        "multiplicaciones": sum(1 for c in capturas if c.multiplica),
        "productos": unicos,
        "repetidos": repetidos,
        "suma": sum(unicos),
        "huella": "-".join(str(p) for p in unicos) or "sin productos",
        "maximo": TOPE,
    }
