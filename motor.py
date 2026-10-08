"""Motor de ajedrez: representacion de la posicion, FEN y generacion de movimientos."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator, Optional

FEN_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

BLANCAS = True
NEGRAS = False

VACIA = "."

DIRECCIONES_PIEZAS: dict[str, tuple[tuple[int, int], ...]] = {
    "N": ((-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)),
    "B": ((-1, -1), (-1, 1), (1, -1), (1, 1)),
    "R": ((-1, 0), (1, 0), (0, -1), (0, 1)),
    "Q": ((-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0), (1, 0), (0, -1), (0, 1)),
    "K": ((-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0), (1, 0), (0, -1), (0, 1)),
}

DESLIZANTES = {"B", "R", "Q"}

Casilla = tuple[int, int]

ESQUINAS_ENROQUE: dict[Casilla, set[str]] = {
    (7, 0): {"Q"},
    (7, 7): {"K"},
    (0, 0): {"q"},
    (0, 7): {"k"},
}


def dentro(fila: int, col: int) -> bool:
    return 0 <= fila < 8 and 0 <= col < 8


def a_texto(casilla: Casilla) -> str:
    """(4, 4) -> 'e4'."""
    fila, col = casilla
    return f"{chr(ord('a') + col)}{8 - fila}"


def desde_texto(texto: str) -> Casilla:
    """'e4' -> (4, 4). Devuelve (-1, -1) si no es una casilla valida."""
    texto = texto.strip().lower()
    if len(texto) != 2 or texto[0] not in "abcdefgh" or texto[1] not in "12345678":
        return (-1, -1)
    return (8 - int(texto[1]), ord(texto[0]) - ord("a"))


def es_blanca(pieza: str) -> bool:
    return pieza.isupper()


@dataclass(frozen=True)
class Movimiento:
    origen: Casilla
    destino: Casilla
    promocion: Optional[str] = None
    en_pasante: bool = False
    enroque: bool = False

    @property
    def uci(self) -> str:
        texto = a_texto(self.origen) + a_texto(self.destino)
        if self.promocion:
            texto += self.promocion.lower()
        return texto

    def __str__(self) -> str:
        if self.enroque:
            return f"{self.uci} (enroque)"
        if self.en_pasante:
            return f"{self.uci} (en passant)"
        return self.uci


@dataclass
class _Instantanea:
    tablero: list[list[str]]
    turno: bool
    enroque: set[str]
    en_pasante: Optional[Casilla]
    medios: int
    jugada: int
    reyes: dict[bool, Optional[Casilla]] = field(default_factory=dict)


class Posicion:
    """Estado completo del tablero con las reglas de FIDE."""

    def __init__(self, fen: str = FEN_INICIAL) -> None:
        self.tablero: list[list[str]] = [[VACIA] * 8 for _ in range(8)]
        self.turno: bool = BLANCAS
        self.enroque: set[str] = set()
        self.en_pasante: Optional[Casilla] = None
        self.medios: int = 0
        self.jugada: int = 1
        self.reyes: dict[bool, Optional[Casilla]] = {}
        self._pila: list[_Instantanea] = []
        self.cargar_fen(fen)

    # --- FEN ---------------------------------------------------------------

    def cargar_fen(self, fen: str) -> None:
        partes = fen.split()
        if len(partes) < 4:
            raise ValueError("FEN incompleto")

        self.tablero = [[VACIA] * 8 for _ in range(8)]
        filas = partes[0].split("/")
        if len(filas) != 8:
            raise ValueError("El FEN debe tener 8 filas")

        for indice, linea in enumerate(filas):
            col = 0
            for caracter in linea:
                if caracter.isdigit():
                    col += int(caracter)
                elif caracter in "pnbrqkPNBRQK":
                    if not dentro(indice, col):
                        raise ValueError(f"Pieza fuera del tablero en el FEN: {fen}")
                    self.tablero[indice][col] = caracter
                    col += 1
                else:
                    raise ValueError(f"Caracter invalido en el FEN: {caracter!r}")
            if col != 8:
                raise ValueError(f"Fila incompleta en el FEN: {linea!r}")

        if partes[1] not in ("w", "b"):
            raise ValueError(f"Turno invalido en el FEN: {partes[1]!r}")

        self.turno = NEGRAS if partes[1] == "b" else BLANCAS
        self.enroque = {c for c in partes[2] if c in "KQkq"}
        self.en_pasante = None if partes[3] == "-" else desde_texto(partes[3])
        self.medios = int(partes[4]) if len(partes) > 4 else 0
        self.jugada = int(partes[5]) if len(partes) > 5 else 1
        self.reyes = {}
        self._pila.clear()

    def a_fen(self) -> str:
        filas: list[str] = []
        for fila in self.tablero:
            partes: list[str] = []
            vacias = 0
            for pieza in fila:
                if pieza == VACIA:
                    vacias += 1
                    continue
                if vacias:
                    partes.append(str(vacias))
                    vacias = 0
                partes.append(pieza)
            if vacias:
                partes.append(str(vacias))
            filas.append("".join(partes))

        turno = "w" if self.turno else "b"
        derechos = "".join(c for c in "KQkq" if c in self.enroque) or "-"
        en_pasante = a_texto(self.en_pasante) if self.en_pasante else "-"
        return f"{'/'.join(filas)} {turno} {derechos} {en_pasante} {self.medios} {self.jugada}"

    def copia(self) -> "Posicion":
        return Posicion(self.a_fen())

    # --- Consultas ---------------------------------------------------------

    def pieza_en(self, casilla: Casilla) -> str:
        fila, col = casilla
        return self.tablero[fila][col]

    def casilla_rey(self, color: bool) -> Optional[Casilla]:
        if color in self.reyes:
            return self.reyes[color]
        objetivo = "K" if color else "k"
        encontrada: Optional[Casilla] = None
        for fila in range(8):
            for col in range(8):
                if self.tablero[fila][col] == objetivo:
                    encontrada = (fila, col)
                    break
            if encontrada is not None:
                break
        self.reyes[color] = encontrada
        return encontrada

    def en_jaque(self, color: Optional[bool] = None) -> bool:
        color = self.turno if color is None else color
        rey = self.casilla_rey(color)
        return rey is not None and self.atacada(rey, not color)

    def atacada(self, casilla: Casilla, por_blancas: bool) -> bool:
        """True si alguna pieza del color indicado ataca la casilla."""
        fila, col = casilla

        for paso_fila, paso_col in DIRECCIONES_PIEZAS["N"]:
            fila_p, col_p = fila + paso_fila, col + paso_col
            if dentro(fila_p, col_p):
                objetivo = "N" if por_blancas else "n"
                if self.tablero[fila_p][col_p] == objetivo:
                    return True

        objetivo_rey = "K" if por_blancas else "k"
        for paso_fila, paso_col in DIRECCIONES_PIEZAS["K"]:
            fila_p, col_p = fila + paso_fila, col + paso_col
            if dentro(fila_p, col_p) and self.tablero[fila_p][col_p] == objetivo_rey:
                return True

        for tipo in ("B", "R", "Q"):
            objetivo = tipo if por_blancas else tipo.lower()
            for paso_fila, paso_col in DIRECCIONES_PIEZAS[tipo]:
                fila_p, col_p = fila + paso_fila, col + paso_col
                while dentro(fila_p, col_p):
                    pieza = self.tablero[fila_p][col_p]
                    if pieza != VACIA:
                        if pieza == objetivo:
                            return True
                        break
                    fila_p += paso_fila
                    col_p += paso_col

        fila_p = fila + 1 if por_blancas else fila - 1
        if dentro(fila_p, col):
            for paso_col in (-1, 1):
                col_p = col + paso_col
                if dentro(fila_p, col_p):
                    objetivo = "P" if por_blancas else "p"
                    if self.tablero[fila_p][col_p] == objetivo:
                        return True

        return False

    def casillas_de(self, color: bool) -> Iterator[Casilla]:
        for fila in range(8):
            for col in range(8):
                pieza = self.tablero[fila][col]
                if pieza != VACIA and pieza.isupper() == color:
                    yield (fila, col)

    def material_insuficiente(self) -> bool:
        """Rey solo o rey con una unica pieza menor contra rey."""
        por_color: dict[bool, list[tuple[str, int, int]]] = {BLANCAS: [], NEGRAS: []}
        for fila in range(8):
            for col in range(8):
                pieza = self.tablero[fila][col]
                if pieza != VACIA:
                    por_color[pieza.isupper()].append((pieza.upper(), fila, col))

        for lista in por_color.values():
            sin_rey = [p for p, _, _ in lista if p != "K"]
            if len(sin_rey) > 1:
                return False

        alfiles = [(f, c) for lista in por_color.values() for p, f, c in lista if p == "B"]
        if not alfiles:
            return True
        return len({(f + c) % 2 for f, c in alfiles}) == 1

    # --- Generacion de movimientos ----------------------------------------

    def movimientos_legales(self) -> list[Movimiento]:
        legales: list[Movimiento] = []
        for movimiento in self.movimientos_pseudo_legales():
            if self.es_legal(movimiento):
                legales.append(movimiento)
        return legales

    def movimientos_pseudo_legales(self) -> Iterator[Movimiento]:
        for casilla in self.casillas_de(self.turno):
            tipo = self.pieza_en(casilla).upper()
            if tipo == "P":
                yield from self._movimientos_peon(casilla)
            elif tipo in DIRECCIONES_PIEZAS:
                yield from self._movimientos_pieza(casilla)

    def _movimientos_pieza(self, casilla: Casilla) -> Iterator[Movimiento]:
        fila, col = casilla
        pieza = self.tablero[fila][col]
        tipo = pieza.upper()
        color = es_blanca(pieza)

        for paso_fila, paso_col in DIRECCIONES_PIEZAS[tipo]:
            fila_p, col_p = fila + paso_fila, col + paso_col
            while dentro(fila_p, col_p):
                contenido = self.tablero[fila_p][col_p]
                if contenido == VACIA:
                    yield Movimiento(casilla, (fila_p, col_p))
                else:
                    if contenido.isupper() != color:
                        yield Movimiento(casilla, (fila_p, col_p))
                    break
                if tipo not in DESLIZANTES:
                    break
                fila_p += paso_fila
                col_p += paso_col

        if tipo == "K":
            yield from self._movimientos_enroque(fila, col)

    def _movimientos_enroque(self, fila: int, col: int) -> Iterator[Movimiento]:
        if self.en_jaque(self.turno):
            return

        color = self.turno
        rival = not color
        torre = "R" if color else "r"
        corto = "K" if color else "k"
        largo = "Q" if color else "q"

        if corto in self.enroque and self.tablero[fila][7] == torre:
            if self.tablero[fila][5] == VACIA and self.tablero[fila][6] == VACIA:
                if not self.atacada((fila, 5), rival) and not self.atacada((fila, 6), rival):
                    yield Movimiento((fila, col), (fila, 6), enroque=True)

        if largo in self.enroque and self.tablero[fila][0] == torre:
            libre = all(self.tablero[fila][c] == VACIA for c in (1, 2, 3))
            if libre and not self.atacada((fila, 3), rival) and not self.atacada((fila, 2), rival):
                yield Movimiento((fila, col), (fila, 2), enroque=True)

    def _movimientos_peon(self, casilla: Casilla) -> Iterator[Movimiento]:
        fila, col = casilla
        color = es_blanca(self.tablero[fila][col])
        avance = -1 if color else 1
        fila_inicial = 6 if color else 1

        fila_siguiente = fila + avance
        if dentro(fila_siguiente, col) and self.tablero[fila_siguiente][col] == VACIA:
            yield from self._llegadas_peon(casilla, (fila_siguiente, col))
            fila_doble = fila + 2 * avance
            if fila == fila_inicial and self.tablero[fila_doble][col] == VACIA:
                yield Movimiento(casilla, (fila_doble, col))

        if not dentro(fila_siguiente, col):
            return

        for paso_col in (-1, 1):
            col_destino = col + paso_col
            if not dentro(fila_siguiente, col_destino):
                continue
            contenido = self.tablero[fila_siguiente][col_destino]
            if contenido != VACIA:
                if contenido.isupper() != color:
                    yield from self._llegadas_peon(casilla, (fila_siguiente, col_destino))
            elif self.en_pasante == (fila_siguiente, col_destino):
                yield Movimiento(casilla, (fila_siguiente, col_destino), en_pasante=True)

    def _llegadas_peon(self, origen: Casilla, destino: Casilla) -> Iterator[Movimiento]:
        if destino[0] in (0, 7):
            mayuscula = es_blanca(self.pieza_en(origen))
            for pieza in "QRBN":
                yield Movimiento(origen, destino, promocion=pieza if mayuscula else pieza.lower())
        else:
            yield Movimiento(origen, destino)

    def es_legal(self, movimiento: Movimiento) -> bool:
        self.aplicar(movimiento)
        segura = not self.en_jaque(not self.turno)
        self.deshacer(movimiento)
        return segura

    # --- Aplicar y deshacer ------------------------------------------------

    def aplicar(self, movimiento: Movimiento) -> None:
        self._pila.append(
            _Instantanea(
                tablero=[fila[:] for fila in self.tablero],
                turno=self.turno,
                enroque=set(self.enroque),
                en_pasante=self.en_pasante,
                medios=self.medios,
                jugada=self.jugada,
                reyes=dict(self.reyes),
            )
        )

        fila_o, col_o = movimiento.origen
        fila_d, col_d = movimiento.destino
        pieza = self.tablero[fila_o][col_o]
        color = es_blanca(pieza)
        objetivo = self.tablero[fila_d][col_d]

        captura_o_peon = movimiento.en_pasante or movimiento.promocion is not None
        if captura_o_peon or objetivo != VACIA or pieza.upper() == "P":
            self.medios = 0
        else:
            self.medios += 1

        if movimiento.en_pasante:
            self.tablero[fila_o][col_d] = VACIA

        if movimiento.enroque:
            if col_d > col_o:
                self.tablero[fila_o][5] = self.tablero[fila_o][7]
                self.tablero[fila_o][7] = VACIA
            else:
                self.tablero[fila_o][3] = self.tablero[fila_o][0]
                self.tablero[fila_o][0] = VACIA

        self.tablero[fila_d][col_d] = movimiento.promocion or pieza
        self.tablero[fila_o][col_o] = VACIA

        self.enroque.intersection_update(
            self._derechos_perdidos((fila_o, col_o), (fila_d, col_d), pieza)
        )

        self.en_pasante = None
        if pieza.upper() == "P" and abs(fila_d - fila_o) == 2:
            self.en_pasante = ((fila_o + fila_d) // 2, col_o)

        self.reyes = {}
        self.turno = not color
        if not color:
            self.jugada += 1

    def _derechos_perdidos(self, origen: Casilla, destino: Casilla, pieza: str) -> set[str]:
        """Derechos de enroque que sobreviven a la jugada."""
        sobreviven = set("KQkq")
        if pieza.upper() == "K":
            sobreviven -= {"K", "Q"} if es_blanca(pieza) else {"k", "q"}
        if origen in ESQUINAS_ENROQUE:
            sobreviven -= ESQUINAS_ENROQUE[origen]
        if destino in ESQUINAS_ENROQUE:
            sobreviven -= ESQUINAS_ENROQUE[destino]
        return sobreviven

    def deshacer(self, movimiento: Movimiento) -> None:
        if not self._pila:
            raise IndexError("No hay jugadas que deshacer")

        estado = self._pila.pop()
        self.tablero = estado.tablero
        self.turno = estado.turno
        self.enroque = estado.enroque
        self.en_pasante = estado.en_pasante
        self.medios = estado.medios
        self.jugada = estado.jugada
        self.reyes = estado.reyes

    def sin_jugadas(self) -> bool:
        return not self.movimientos_legales()

    def movimiento_desde_texto(self, texto: str) -> Optional[Movimiento]:
        """Interpreta 'e2e4' o 'e7e8q' y devuelve el movimiento legal equivalente."""
        limpio = texto.strip().lower().replace(" ", "").replace("-", "").replace("x", "")
        promocion: Optional[str] = None

        if len(limpio) == 5 and limpio[4] in "qrbn":
            promocion, limpio = limpio[4], limpio[:4]
        elif len(limpio) == 4 and limpio[3] in "qrbn" and limpio[0] in "abcdefgh" and limpio[1] in "12345678":
            promocion, limpio = limpio[3], limpio[:3]

        origen = desde_texto(limpio[:2])
        destino = desde_texto(limpio[2:4])
        if origen[0] < 0 or destino[0] < 0:
            return None

        candidatas = [
            movimiento
            for movimiento in self.movimientos_legales()
            if movimiento.origen == origen and movimiento.destino == destino
        ]
        if promocion:
            candidatas = [
                movimiento
                for movimiento in candidatas
                if movimiento.promocion and movimiento.promocion.lower() == promocion
            ]
        return candidatas[0] if candidatas else None


def perft(posicion: Posicion, profundidad: int) -> int:
    """Cuenta las hojas del arbol de movimientos; sirve para verificar la generacion."""
    if profundidad == 0:
        return 1
    total = 0
    for movimiento in posicion.movimientos_legales():
        posicion.aplicar(movimiento)
        total += perft(posicion, profundidad - 1)
        posicion.deshacer(movimiento)
    return total


# -----------------------------------------------------------------------------
# Motor de juego: evaluacion y busqueda alfa-beta para jugar contra la IA.

INF = 10**8

VALORES_PIEZAS = {"P": 100, "N": 320, "B": 330, "R": 500, "Q": 950, "K": 0}


# Material con el signo ya aplicado (la letra indica el color): dos accesos por
# casilla ocupada en vez de .upper()/es_blanca() en cada nodo.
_VALOR_PIEZA: dict[str, int] = {}
_BONO_CENTRO_PIEZA: dict[str, int] = {}
_BONO_TIPO = {"P": 1, "N": 3, "B": 3, "R": 0, "Q": 0, "K": 0}
for _tipo, _valor in VALORES_PIEZAS.items():
    _VALOR_PIEZA[_tipo] = _valor
    _VALOR_PIEZA[_tipo.lower()] = -_valor
    _BONO_CENTRO_PIEZA[_tipo] = _BONO_TIPO[_tipo]
    _BONO_CENTRO_PIEZA[_tipo.lower()] = -_BONO_TIPO[_tipo]

# Posicion ligera precalculada (enteros): cuanto mas centrada, mejor.
BONO_CENTRO: tuple[tuple[int, ...], ...] = (
    (0, 0, 1, 2, 2, 1, 0, 0),
    (0, 2, 3, 4, 4, 3, 2, 0),
    (1, 3, 4, 5, 5, 4, 3, 1),
    (2, 4, 5, 6, 6, 5, 4, 2),
    (2, 4, 5, 6, 6, 5, 4, 2),
    (1, 3, 4, 5, 5, 4, 3, 1),
    (0, 2, 3, 4, 4, 3, 2, 0),
    (0, 0, 1, 2, 2, 1, 0, 0),
)


def evaluar(posicion: Posicion) -> int:
    """Valor desde el punto de vista de las blancas (positivo = mejor para blancas).

    Solo material + centrado ligero, con tablas de consulta: sin aritmetica
    flotante ni calculos por casilla, para que cada nodo de la busqueda sea barato.
    """
    total = 0
    for fila in range(8):
        linea = posicion.tablero[fila]
        bono = BONO_CENTRO[fila]
        for col in range(8):
            pieza = linea[col]
            if pieza == VACIA:
                continue
            total += _VALOR_PIEZA[pieza] + _BONO_CENTRO_PIEZA[pieza] * bono[col]
    return total


def _ordenar(movimientos: list[Movimiento], posicion: Posicion) -> list[Movimiento]:
    """Ordena capturas de piezas valiosas primero para podar antes."""
    def clave(movimiento: Movimiento) -> int:
        victima = posicion.pieza_en(movimiento.destino)
        atacante = posicion.pieza_en(movimiento.origen)
        if victima != VACIA:
            return (
                VALORES_PIEZAS[victima.upper()] * 10
                - VALORES_PIEZAS[atacante.upper()]
            )
        return 1000 if movimiento.promocion else 0
    return sorted(movimientos, key=clave, reverse=True)


def _alfabeta(posicion: Posicion, profundidad: int, alfa: int, beta: int) -> int:
    movimientos = posicion.movimientos_legales()
    if not movimientos:
        if not posicion.en_jaque(posicion.turno):
            return 0
        return INF - posicion.jugada if not posicion.turno else -INF + posicion.jugada
    if profundidad == 0:
        return evaluar(posicion)

    movimientos = _ordenar(movimientos, posicion)
    if posicion.turno:
        mejor = -INF
        for movimiento in movimientos:
            posicion.aplicar(movimiento)
            valor = _alfabeta(posicion, profundidad - 1, alfa, beta)
            posicion.deshacer(movimiento)
            if valor > mejor:
                mejor = valor
            if mejor > alfa:
                alfa = mejor
            if beta <= alfa:
                break
        return mejor

    mejor = INF
    for movimiento in movimientos:
        posicion.aplicar(movimiento)
        valor = _alfabeta(posicion, profundidad - 1, alfa, beta)
        posicion.deshacer(movimiento)
        if valor < mejor:
            mejor = valor
        if mejor < beta:
            beta = mejor
        if beta <= alfa:
            break
    return mejor


def mejor_jugada(posicion: Posicion, profundidad: int = 3) -> Optional[Movimiento]:
    """Devuelve la mejor jugada legal segun la busqueda alfa-beta."""
    movimientos = _ordenar(posicion.movimientos_legales(), posicion)
    if not movimientos:
        return None

    alfa, beta = -INF, INF
    mejor: Optional[Movimiento] = None
    valor_mejor = -INF if posicion.turno else INF

    for movimiento in movimientos:
        posicion.aplicar(movimiento)
        valor = _alfabeta(posicion, profundidad - 1, alfa, beta)
        posicion.deshacer(movimiento)

        if posicion.turno:
            if valor > valor_mejor:
                valor_mejor = valor
                mejor = movimiento
            if valor_mejor > alfa:
                alfa = valor_mejor
        else:
            if valor < valor_mejor:
                valor_mejor = valor
                mejor = movimiento
            if valor_mejor < beta:
                beta = valor_mejor
        if beta <= alfa:
            break
    return mejor