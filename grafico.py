"""App de escritorio: ajedrez con numeracion propia 1-64, multiplicaciones y partidas reales."""

from __future__ import annotations

import os
import tkinter as tk
from tkinter import messagebox, ttk

from ajedrez import clave_repeticion, terminacion
from campeonatos import RUTA_DEFECTO, leer_pgn, mover_san, pieza_capturada
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
from dataclasses import dataclass

@dataclass
class MovimientoRegistro:
    jugada: str
    captura: Captura | None = None

CASILLA = 64
CLARO = "#f0d9b5"
OSCURO = "#b58863"
RESALTE = "#f7e35e"
SELECCION = "#7fc97f"
DESTINO = "#4fa35a"
FONDO = "#2f3b46"

LEYENDA = (
    'Peon = numero de su casilla   " = caballo   ¿ = alfil   '
    "T = torre   D = dama   R = rey   [ ] = pieza negra"
)

PROMOCIONES = [("Dama", "q"), ("Torre", "r"), ("Caballo", "n"), ("Alfil", "b")]

# Orden en que cicla el boton de promocion de la barra superior.
# 'ask' abre la ventana de siempre; el resto promueve automaticamente.
CICLO_PROMOCION = ["q", "r", "b", "n", "ask"]
NOMBRE_PROMOCION = {
    "q": "Dama",
    "r": "Torre",
    "b": "Alfil",
    "n": "Caballo",
    "ask": "Preguntar",
}

# Profundidad de la busqueda de la IA: 1 ply responde al instante y basta para
# capturar y no colgar piezas; subela a 2 si prefieres mas calidad a mas espera.
PROFUNDIDAD_IA = 1


class Aplicacion(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Ajedrez numerado 1-64")
        icono = os.path.join(os.path.dirname(os.path.abspath(__file__)), "peon.png")
        if os.path.exists(icono):
            try:
                self.iconphoto(True, tk.PhotoImage(file=icono))
            except tk.TclError:
                pass
        self.geometry("1180x760")
        self.minsize(1020, 660)
        self.configure(bg=FONDO)

        self.posicion = Posicion()
        self.pares: list[tuple[Movimiento, MovimientoRegistro]] = []
        self.ultimo: Movimiento | None = None
        self.seleccion: tuple[int, int] | None = None
        self.destinos: list[Movimiento] = []
        # Arrastre con el raton (drag & drop): la pieza se dibuja en el puntero,
        # sin redibujar el tablero, moviendo solo la ficha flotante.
        self.dragging = False                            # arrastre preparado desde el clic
        self._drag_iniciado = False                      # pieza flotante creada ya
        self.drag_origen: tuple[int, int] | None = None  # casilla de la pieza pulsada
        self.drag_x = 0                                  # centro de la pieza flotante
        self.drag_y = 0
        self._off_x = 0                                  # desfase del clic dentro de la pieza
        self._off_y = 0
        self._drag_px = 0                                # punto de pulsacion (umbral)
        self._drag_py = 0
        self._drag_casilla: tuple[int, int] | None = None  # casilla bajo el puntero al arrastrar
        self.resaltados: set[tuple[int, int]] = set()
        self.repeticiones: dict[str, int] = {}
        self.mostrar_numeros = False
        self.modo = "libre"
        self.ia_negras = True
        self.ia_trabajando = False
        self._after_id = None
        # Promocion: 'q' 'r' 'b' 'n' automaticas, 'ask' = ventana de preguntar.
        self.promocion_auto = "q"
        self.boton_promocion: tk.Button | None = None
        self.partida_san: list[str] = []
        self.indice = 0
        self.cabeceras: dict[str, str] = {}
        self.aviso = ""

        self._recalcular_repeticiones()
        self._construir()
        self._refrescar_tabla()
        self.refrescar()

    # ------------------------------------------------------------------ widgets
    def _construir(self) -> None:
        barra = tk.Frame(self, bg=FONDO)
        barra.pack(side="top", fill="x", padx=8, pady=6)

        botones = [
            ("Nueva partida", self.nueva_partida),
            ("Deshacer", self.deshacer),
            ("Cargar partida 6", self.cargar_partida),
            ("Siguiente jugada", self.siguiente),
            ("Jugada anterior", self.anterior),
            ("Numeros", self.alternar_numeros),
            (f"Promoci�n: {NOMBRE_PROMOCION[self.promocion_auto]}", self.ciclar_promocion),
            ("Ayuda", self.mostrar_ayuda),
        ]
        for texto, accion in botones:
            boton = tk.Button(
                barra,
                text=texto,
                command=accion,
                bg="#e8e8e8",
                relief="flat",
                padx=10,
                pady=3,
            )
            boton.pack(side="left", padx=3)
            if texto.startswith("Promoci�n"):
                self.boton_promocion = boton

        self.etiqueta_progreso = tk.Label(
            barra, text="", bg=FONDO, fg="#f5d76e", font=("Segoe UI", 10, "bold")
        )
        self.etiqueta_progreso.pack(side="right", padx=8)

        cuerpo = tk.Frame(self, bg=FONDO)
        cuerpo.pack(fill="both", expand=True, padx=8, pady=(0, 4))

        marco = tk.Frame(cuerpo, bg="#111111", highlightthickness=0)
        marco.pack(side="left", padx=(0, 10), pady=4)

        self.canvas = tk.Canvas(
            marco,
            width=8 * CASILLA,
            height=8 * CASILLA,
            highlightthickness=3,
            highlightbackground="#111111",
        )
        self.canvas.pack()
        self.canvas.bind("<Button-1>", self.clic)
        self.canvas.bind("<Motion>", self.pasar_raton)
        self.canvas.bind("<B1-Motion>", self.arrastre)
        self.canvas.bind("<ButtonRelease-1>", self.soltar_arrastre)

        panel = tk.Frame(cuerpo, bg=FONDO)
        panel.pack(side="left", fill="both", expand=True)

        self.etiqueta_turno = tk.Label(
            panel, text="", bg=FONDO, fg="#ffffff",
            font=("Segoe UI", 16, "bold"), anchor="w",
        )
        self.etiqueta_turno.pack(fill="x")

        self.etiqueta_estado = tk.Label(
            panel, text="", bg=FONDO, fg="#9fd6a5",
            font=("Segoe UI", 11), anchor="w",
        )
        self.etiqueta_estado.pack(fill="x")

        self.etiqueta_aviso = tk.Label(
            panel, text="", bg="#1d262e", fg="#f5d76e",
            font=("Segoe UI", 11), anchor="w", justify="left",
            wraplength=520, padx=8, pady=6,
        )
        self.etiqueta_aviso.pack(fill="x", pady=(6, 8))

        tk.Label(
            panel, text="CAPTURAS DE LA PARTIDA", bg=FONDO, fg="#cfd8df",
            font=("Segoe UI", 10, "bold"), anchor="w",
        ).pack(fill="x")

        columnas = ("jugada", "pieza", "origen", "destino", "resultado")
        self.tabla = ttk.Treeview(panel, columns=columnas, show="headings", height=13)
        for col, titulo, ancho in (
            ("jugada", "JUGADA", 80),
            ("pieza", "PIEZA", 90),
            ("origen", "CASILLA NUM", 100),
            ("destino", "CASILLA NUM", 100),
            ("resultado", "RESULTADO", 170),
        ):
            self.tabla.heading(col, text=titulo)
            self.tabla.column(col, width=ancho, anchor="center", stretch=True)

        desplazamiento = tk.Scrollbar(panel, orient="vertical", command=self.tabla.yview)
        self.tabla.configure(yscrollcommand=desplazamiento.set)
        self.tabla.pack(side="left", fill="both", expand=True)
        desplazamiento.pack(side="right", fill="y")

        self.etiqueta_resumen = tk.Label(
            panel, text="", bg=FONDO, fg="#e8e8e8",
            font=("Segoe UI", 11), anchor="w", justify="left", wraplength=560,
        )
        self.etiqueta_resumen.pack(fill="x", pady=(8, 0))

        self.barra_estado = tk.Label(
            self, text=LEYENDA, bg="#1d262e", fg="#cfd8df",
            font=("Segoe UI", 9), anchor="w", padx=8, pady=4,
        )
        self.barra_estado.pack(side="bottom", fill="x")

    # ------------------------------------------------------------------ dibujo
    def dibujar_tablero(self) -> None:
        """Redibujo completo. Cada elemento lleva su tag (ademas de 'todo')."""
        lienzo = self.canvas
        lienzo.delete("todo")

        for fila in range(8):
            for col in range(8):
                casilla = (fila, col)
                nombre = a_texto(casilla)
                claro = (fila + col) % 2 == 0
                color = CLARO if claro else OSCURO
                if casilla in self.resaltados:
                    color = RESALTE
                if casilla == self.seleccion:
                    color = SELECCION

                x0, y0 = col * CASILLA, fila * CASILLA
                lienzo.create_rectangle(
                    x0, y0, x0 + CASILLA, y0 + CASILLA,
                    fill=color, outline="", tags=("tablero", "todo"),
                )

                pieza = self.posicion.tablero[fila][col]
                en_manos = self._drag_iniciado and casilla == self.drag_origen
                if (pieza == "." or self.mostrar_numeros) and not en_manos:
                    gris = "#4a3b2c" if claro or casilla in self.resaltados else "#f4e7d7"
                    fuente = ("Segoe UI", 9, "bold") if pieza == "." else ("Segoe UI", 7)
                    lienzo.create_text(
                        x0 + 4, y0 + 3, anchor="nw", text=str(NUMEROS[nombre]),
                        font=fuente, fill=gris, tags=("tablero", "todo"),
                    )

                if pieza != "." and not en_manos:
                    self._dibujar_pieza(
                        lienzo, x0 + CASILLA // 2, y0 + CASILLA // 2, pieza, nombre,
                        tags=("fichas", "todo", f"pieza_{fila}_{col}"),
                    )

        for movimiento in self.destinos:
            fila, col = movimiento.destino
            cx, cy = col * CASILLA + CASILLA // 2, fila * CASILLA + CASILLA // 2
            if self.posicion.tablero[fila][col] == ".":
                lienzo.create_oval(
                    cx - 8, cy - 8, cx + 8, cy + 8,
                    fill=DESTINO, width=0, tags=("marcas", "todo"),
                )
            else:
                lienzo.create_oval(
                    cx - 28, cy - 28, cx + 28, cy + 28,
                    outline=DESTINO, width=4, tags=("marcas", "todo"),
                )

        if self._drag_iniciado and self.drag_origen is not None:
            self._crear_pieza_arrastre()
            self._crear_marca_arrastre()
            self.canvas.tag_raise("drag_pieza")

    def _dibujar_pieza(
        self, lienzo, cx: int, cy: int, pieza: str, nombre: str,
        tags: tuple[str, ...] = ("fichas", "todo"),
    ) -> None:
        """Dibuja una pieza (disco + etiqueta) centrada en (cx, cy)."""
        blanca = es_blanca(pieza)
        lienzo.create_oval(
            cx - 25, cy - 25, cx + 25, cy + 25,
            fill="#ffffff" if blanca else "#151515",
            outline="#151515" if blanca else "#ffffff", width=2, tags=tags,
        )
        texto = etiqueta(pieza, nombre)
        lienzo.create_text(
            cx, cy, text=texto,
            font=("Segoe UI", 18, "bold") if len(texto) == 1 else ("Segoe UI", 13, "bold"),
            fill="#111111" if blanca else "#f5f5f5", tags=tags,
        )

    def _crear_pieza_arrastre(self) -> None:
        """Pieza 'en el aire' bajo el puntero (tag 'drag_pieza', se mueve con canvas.move)."""
        origen = self.drag_origen
        if origen is None:
            return
        pieza = self.posicion.tablero[origen[0]][origen[1]]
        if pieza == ".":
            return
        lienzo = self.canvas
        cx, cy = self.drag_x, self.drag_y
        lienzo.create_oval(
            cx - 22, cy - 20, cx + 28, cy + 30, fill="#0d0d0d", outline="",
            tags=("drag_pieza", "drag", "todo"),
        )
        self._dibujar_pieza(
            lienzo, cx, cy, pieza, a_texto(origen),
            tags=("drag_pieza", "drag", "todo"),
        )

    def _crear_marca_arrastre(self) -> None:
        """Rectangulo indicador de la casilla bajo el puntero (tag 'drag_marca')."""
        origen = self.drag_origen
        fila = int(self.drag_y // CASILLA)
        col = int(self.drag_x // CASILLA)
        self._drag_casilla = (fila, col)
        if origen is None:
            return
        if 0 <= fila < 8 and 0 <= col < 8 and (fila, col) != origen:
            x0, y0 = col * CASILLA, fila * CASILLA
            legal = any(m.destino == (fila, col) for m in self.destinos)
            self.canvas.create_rectangle(
                x0 + 3, y0 + 3, x0 + CASILLA - 3, y0 + CASILLA - 3,
                outline=DESTINO if legal else RESALTE, width=5,
                tags=("drag_marca", "drag", "todo"),
            )
            self.canvas.tag_raise("drag_pieza")

    def _iniciar_arrastre(self, cx: int, cy: int) -> None:
        """Arranca el arrastre visual: oculta SOLO la ficha de origen y crea
        la pieza flotante en el puntero, sin redibujar el tablero."""
        origen = self.drag_origen
        if origen is None:
            return
        self._drag_iniciado = True
        self.drag_x, self.drag_y = cx, cy
        self.canvas.delete("drag")                     # restos de arrastres previos
        self.canvas.delete(f"pieza_{origen[0]}_{origen[1]}")  # solo esa ficha
        self._crear_pieza_arrastre()
        self._crear_marca_arrastre()
        self.canvas.tag_raise("drag_pieza")

    def _limpiar_arrastre(self) -> None:
        """Borra todos los tags drag* y desactiva el estado de arrastre."""
        for tag in ("drag", "drag_pieza", "drag_marca"):
            self.canvas.delete(tag)
        self.dragging = False
        self._drag_iniciado = False
        self.drag_origen = None
        self._drag_casilla = None

    def refrescar(self) -> None:
        """Dibuja el tablero y actualiza las etiquetas de estado.

        La tabla de capturas y el resumen NO se tocan aqui: solo cambian cuando
        se anula/suma una captura, asi que se refrescan aparte con
        `_refrescar_tabla()`.
        """
        self.dibujar_tablero()

        bando = "blancas"
        if not self.posicion.turno:
            bando = "negras (computadora)" if self.modo == "libre" and self.ia_negras else "negras"
        self.etiqueta_turno.config(text=f"TURNO: {bando}")

        estado = terminacion(self.posicion, self.repeticiones)
        self.etiqueta_estado.config(text=estado or "En juego")

        self.etiqueta_aviso.config(text=self.aviso or "Sin capturas todavia.")

        if self.modo == "replay":
            self.etiqueta_progreso.config(
                text="Partida %s  jugada %d/%d"
                % (
                    self.cabecera("Round", "?"),
                    (self.indice + 1) // 2,
                    (len(self.partida_san) + 1) // 2,
                )
            )
        else:
            self.etiqueta_progreso.config(text="Partida libre")

    def _refrescar_tabla(self) -> None:
        self.tabla.delete(*self.tabla.get_children())
        capturas = self.capturas()
        vistas: set[int] = set()

        for captura in capturas:
            self.tabla.insert(
                "", "end",
                values=(
                    captura.jugada or "-",
                    f"{nombre_pieza(captura.atacante)} x {nombre_pieza(captura.victima)}",
                    f"{captura.origen} = {captura.numero_origen}",
                    f"{captura.destino} = {captura.numero_destino}",
                    resultado_unico(captura, vistas),
                ),
            )

        datos = resumen_partida(capturas)
        self.etiqueta_resumen.config(
            text=(
                f"Capturas: {datos['capturas']}   Multiplicaciones: {datos['multiplicaciones']}\n"
                f"Repetidos sin sumar: {datos['repetidos']}   "
                f"Suma de productos: {datos['suma']}\n"
                f"Huella (productos distintos): {datos['huella']}"
            )
        )

    # ------------------------------------------------------------------ estado
    def capturas(self) -> list[Captura]:
        return [registro.captura for _, registro in self.pares if registro.captura is not None]

    def cabecera(self, clave: str, defecto: str = "") -> str:
        return str(self.cabeceras.get(clave, defecto))

    def _recalcular_repeticiones(self) -> None:
        posicion = Posicion()
        self.repeticiones = {clave_repeticion(posicion): 1}
        for movimiento, _ in self.pares:
            posicion.aplicar(movimiento)
            clave = clave_repeticion(posicion)
            self.repeticiones[clave] = self.repeticiones.get(clave, 0) + 1

    def _aviso_de(self, captura: Captura) -> str:
        vistos = {
            previo.producto
            for previo in self.capturas()[:-1]
            if previo.producto is not None
        }
        return (
            f"CAPTURA {nombre_pieza(captura.atacante)} x "
            f"{nombre_pieza(captura.victima)} en {captura.destino} "
            f"({captura.numero_destino})  ->  {resultado_unico(captura, vistos)}"
        )

    # ------------------------------------------------------------------ jugadas
    def aplicar(self, movimiento: Movimiento, rotulo: str) -> None:
        atacante = self.posicion.pieza_en(movimiento.origen)
        victima = pieza_capturada(self.posicion, movimiento)

        captura: Captura | None = None
        if victima != ".":
            origen = a_texto(movimiento.origen)
            destino = a_texto(movimiento.destino)
            captura = Captura(
                jugada=rotulo,
                color_blanca=es_blanca(atacante),
                atacante=atacante,
                victima=victima,
                origen=origen,
                destino=destino,
                numero_origen=numero(origen),
                numero_destino=numero(destino),
            )

        self.posicion.aplicar(movimiento)
        self.pares.append((movimiento, MovimientoRegistro(jugada=rotulo, captura=captura)))
        self.ultimo = movimiento
        self.resaltados = {movimiento.origen, movimiento.destino}
        self.seleccion = None
        self.destinos = []
        self.dragging = False
        self._drag_iniciado = False
        self.drag_origen = None

        clave = clave_repeticion(self.posicion)
        self.repeticiones[clave] = self.repeticiones.get(clave, 0) + 1

        if captura is not None:
            self.aviso = self._aviso_de(captura)
        else:
            self.aviso = ""
        self.refrescar()
        if captura is not None:
            # solo una captura nueva cambia la tabla y el resumen
            self._refrescar_tabla()

    def clic(self, evento) -> None:
        if self.modo == "replay":
            self.barra_estado.config(
                text="Modo reproduccion: pulsa 'Nueva partida' para volver a jugar."
            )
            return

        if self.modo == "libre" and self.ia_negras and not self.posicion.turno:
            return

        fila, col = evento.y // CASILLA, evento.x // CASILLA
        if not (0 <= fila < 8 and 0 <= col < 8):
            return
        casilla = (fila, col)

        # toda pulsacion arranca con el arrastre inactivo (puede ser un clic simple)
        self.dragging = False
        self._drag_iniciado = False
        self.drag_origen = None
        self._drag_px, self._drag_py = evento.x, evento.y

        if self.seleccion is not None:
            candidatos = [m for m in self.destinos if m.destino == casilla]
            if candidatos:
                self._ejecutar(candidatos)
                return

        pieza = self.posicion.tablero[fila][col]
        if pieza != "." and es_blanca(pieza) == self.posicion.turno:
            self.seleccion = casilla
            self.destinos = [
                m for m in self.posicion.movimientos_legales() if m.origen == casilla
            ]
            self.drag_origen = casilla  # pieza preparada para arrastrar
            self.dragging = True
            # desfase del clic dentro de la pieza: evita que salte al centro
            self._off_x = evento.x - (col * CASILLA + CASILLA // 2)
            self._off_y = evento.y - (fila * CASILLA + CASILLA // 2)
        else:
            self.seleccion = None
            self.destinos = []
        self.refrescar()

    def _rotulo_libre(self) -> str:
        """Rotulo numerado de la proxima jugada libre: 1., 1..., 2., 2...

        Se deriva del historial (no de contadores), asi que vale igual para
        blancas, negras, IA y dos humanos, y se corrige solo al deshacer.
        """
        indice = len(self.pares)
        jugada = indice // 2 + 1
        return f"{jugada}." if indice % 2 == 0 else f"{jugada}..."

    def _ejecutar(self, candidatos: list[Movimiento]) -> bool:
        """Promocion + numeracion + aplicar + respuesta de la IA.
        Logica identica para el clic y para el arrastre."""
        movimiento = self.elegir_promocion(candidatos)
        if movimiento is None:
            return False
        rotulo = self._rotulo_libre() if self.modo == "libre" else "tu jugada"
        self.aplicar(movimiento, rotulo=rotulo)
        if self.modo == "libre" and self.ia_negras and not self.posicion.turno and not self.ia_trabajando:
            self.jugar_ia()
        return True

    def arrastre(self, evento) -> None:
        """<B1-Motion>: arrastra la pieza pulsada siguiendo al puntero.

        No se redibuja el tablero en cada evento: la pieza flotante se
        coloca con coordenadas absolutas (evento - desfase del clic) y solo
        se recrea el rectangulo indicador cuando cambia la casilla.
        """
        if self.modo == "replay" or self.drag_origen is None or not self.dragging:
            return
        if self.modo == "libre" and self.ia_negras and not self.posicion.turno:
            return
        if not (0 <= evento.x < 8 * CASILLA and 0 <= evento.y < 8 * CASILLA):
            return
        dx, dy = evento.x - self._drag_px, evento.y - self._drag_py
        if not self._drag_iniciado and (dx * dx + dy * dy) < 36:
            return  # umbral de 6 px: un clic normal no arranca el arrastre

        # posicion absoluta de la pieza: conserva el desfase del clic inicial
        cx = evento.x - self._off_x
        cy = evento.y - self._off_y

        if not self._drag_iniciado:
            self._iniciar_arrastre(cx, cy)
        elif cx != self.drag_x or cy != self.drag_y:
            self.canvas.move("drag_pieza", cx - self.drag_x, cy - self.drag_y)
            self.drag_x, self.drag_y = cx, cy

        fila, col = evento.y // CASILLA, evento.x // CASILLA
        casilla = (fila, col)
        if casilla != self._drag_casilla:
            self.canvas.delete("drag_marca")
            self._crear_marca_arrastre()
        self.canvas.tag_raise("drag_pieza")

        nombre = a_texto(casilla)
        legal = any(m.destino == casilla for m in self.destinos)
        self.barra_estado.config(
            text=(
                f"Arrastrando a {nombre} = {NUMEROS[nombre]}   "
                + ("DESTINO LEGAL" if legal else "casilla no valida")
                + f"          {LEYENDA}"
            )
        )

    def soltar_arrastre(self, evento) -> None:
        """<ButtonRelease-1>: limpia el arrastre y aplica la jugada si el destino es legal."""
        origen = self.drag_origen
        arrastrando = self._drag_iniciado
        self._limpiar_arrastre()
        if self.modo == "replay" or origen is None:
            return
        if not arrastrando:
            # clic sin movimiento: la seleccion ya la ha gestionado `clic`
            return

        fila, col = evento.y // CASILLA, evento.x // CASILLA
        if not (0 <= fila < 8 and 0 <= col < 8):
            self.refrescar()
            return
        casilla = (fila, col)
        if casilla == origen:
            self.refrescar()  # suelta sobre su casilla: sigue seleccionada
            return

        candidatos = [m for m in self.destinos if m.destino == casilla]
        if candidatos and self._ejecutar(candidatos):
            return
        # soltado en casilla ilegal: se mantiene la seleccion, igual que un clic
        self.refrescar()

    def _movimiento_promocion(self, letra: str, candidatos: list[Movimiento]) -> Movimiento:
        """Devuelve la jugada que promociona a `letra` (q, r, b o n)."""
        for movimiento in candidatos:
            if (movimiento.promocion or "").lower() == letra:
                return movimiento
        return candidatos[0]

    def elegir_promocion(self, candidatos: list[Movimiento]) -> Movimiento | None:
        """Promocion segun `self.promocion_auto` ('q', 'r', 'b', 'n' o 'ask').

        Con una pieza configurada no se abre ventana: se elige directa.
        Con 'ask' se muestra la ventana de preguntar de siempre.
        """
        if len(candidatos) == 1:
            return candidatos[0]
        if self.promocion_auto == "ask":
            return self.pedir_promocion(candidatos)
        return self._movimiento_promocion(self.promocion_auto, candidatos)

    def pedir_promocion(self, candidatos: list[Movimiento]) -> Movimiento | None:
        if len(candidatos) == 1:
            return candidatos[0]
        if self.promocion_auto != "ask":
            return self._movimiento_promocion(self.promocion_auto, candidatos)

        respuesta: dict[str, str] = {"valor": candidatos[0].promocion or "q"}
        ventana = tk.Toplevel(self)
        ventana.title("Promocion")
        ventana.resizable(False, False)
        ventana.configure(bg=FONDO)
        ventana.transient(self)

        tk.Label(
            ventana, text="Promociona el peon a:", bg=FONDO, fg="#ffffff",
            font=("Segoe UI", 11), padx=14, pady=10,
        ).pack()

        fila = tk.Frame(ventana, bg=FONDO)
        fila.pack(padx=14, pady=(0, 14))

        for texto, letra in PROMOCIONES:
            tk.Button(
                fila, text=texto, width=10, padx=6, pady=4,
                command=lambda l=letra: (respuesta.update({"valor": l}), ventana.destroy()),
            ).pack(side="left", padx=4)

        self.wait_window(ventana)
        buscado = respuesta["valor"].lower()
        for movimiento in candidatos:
            if (movimiento.promocion or "").lower() == buscado:
                return movimiento
        return candidatos[0]

    def deshacer(self) -> None:
        if not self.pares:
            self.barra_estado.config(text="No hay jugadas que deshacer.")
            return
        movimiento, _ = self.pares.pop()
        self.posicion.deshacer(movimiento)
        if self.modo == "replay" and self.indice > 0:
            self.indice -= 1
        self._recalcular_repeticiones()
        self.ultimo = self.pares[-1][0] if self.pares else None
        self.resaltados = (
            {self.ultimo.origen, self.ultimo.destino} if self.ultimo else set()
        )
        self.seleccion = None
        self.destinos = []
        self.dragging = False
        self._drag_iniciado = False
        self.drag_origen = None
        self.aviso = ""
        self.ia_trabajando = False
        if self._after_id is not None:
            self.after_cancel(self._after_id)
            self._after_id = None
        self.refrescar()
        if self.modo == "libre" and not self.posicion.turno and self.ia_negras:
            # al deshacer la jugada del humano puede tocarle mover a la computadora
            self.after(30, self.jugar_ia)
        self._refrescar_tabla()

    # ---------------------------------------------------------------- contra IA
    def jugar_ia(self) -> None:
        if self.modo != "libre" or not self.ia_negras or self.posicion.turno:
            self.ia_trabajando = False
            return
        if self.ia_trabajando:
            return
        self.ia_trabajando = True
        self.barra_estado.config(text="La computadora esta pensando...")
        # un unico repintado: basta para que se vea el aviso antes de pensar
        self.update_idletasks()
        try:
            movimiento = mejor_jugada(self.posicion, PROFUNDIDAD_IA)
        except Exception:
            movimiento = None
        if movimiento is None:
            self.barra_estado.config(text=LEYENDA)
            self.ia_trabajando = False
            return
        destino = a_texto(movimiento.destino)
        rotulo_ia = self._rotulo_libre() if self.modo == "libre" else "computadora"
        self.aplicar(movimiento, rotulo=rotulo_ia)
        self.barra_estado.config(text=f"La computadora jugo {destino}.     {LEYENDA}")
        self.ia_trabajando = False

    def nueva_partida(self) -> None:
        self.posicion = Posicion()
        self.pares = []
        self.ultimo = None
        self.seleccion = None
        self.destinos = []
        self.dragging = False
        self._drag_iniciado = False
        self.drag_origen = None
        self.resaltados = set()
        self.modo = "libre"
        self.partida_san = []
        self.indice = 0
        self.cabeceras = {}
        self.aviso = ""
        self.ia_trabajando = False
        if self._after_id is not None:
            self.after_cancel(self._after_id)
            self._after_id = None
        self._recalcular_repeticiones()
        self._refrescar_tabla()
        self.refrescar()

    # ------------------------------------------------------------- reproduccion
    def cargar_partida(self) -> None:
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), RUTA_DEFECTO)
        if not os.path.exists(ruta):
            messagebox.showerror("Falta el archivo", f"No se encontro {ruta}")
            return

        partidas = leer_pgn(ruta)
        if not partidas:
            messagebox.showerror("Archivo vacio", "No se encontraron partidas en el PGN.")
            return

        elegida = partidas[0]
        for partida in partidas:
            if str(partida["cabeceras"].get("Round", "")) == "6":
                elegida = partida
                break

        blancas = str(elegida["cabeceras"].get("White", "?"))
        negras = str(elegida["cabeceras"].get("Black", "?"))
        if blancas.startswith("Boris"):
            pareja = "Spassky (blancas) - Fischer (negras)"
        else:
            pareja = "Fischer (blancas) - Spassky (negras)"

        self.nueva_partida()
        self.modo = "replay"
        self.partida_san = list(elegida["movimientos"])
        self.indice = 0
        self.cabeceras = elegida["cabeceras"]
        self.barra_estado.config(
            text=f"Cargada {pareja}, Reikjavik 1972. Pulsa 'Siguiente jugada'."
        )
        self.refrescar()

    def siguiente(self) -> None:
        if self.modo != "replay":
            self.barra_estado.config(text="Primero pulsa 'Cargar partida 6'.")
            return
        if self.indice >= len(self.partida_san):
            self.barra_estado.config(text="La partida ha terminado.")
            return

        san = self.partida_san[self.indice]
        jugada = self.indice // 2 + 1
        rotulo = f"{jugada}." if self.indice % 2 == 0 else f"{jugada}..."
        try:
            movimiento = mover_san(self.posicion, san)
        except ValueError as error:
            messagebox.showerror("Jugada invalida", str(error))
            return

        self.aplicar(movimiento, rotulo=f"{rotulo}{san}")
        self.indice += 1
        if self.indice >= len(self.partida_san):
            self.barra_estado.config(text="Fin de la partida.")

    def anterior(self) -> None:
        if self.modo != "replay":
            self.barra_estado.config(text="Primero pulsa 'Cargar partida 6'.")
            return
        if not self.pares:
            self.barra_estado.config(text="No hay jugadas que retroceder.")
            return
        self.deshacer()

    # ------------------------------------------------------------------ extras
    def ciclar_promocion(self) -> None:
        """Cambia la promocion configurada: dama -> torre -> alfil -> caballo -> preguntar."""
        indice = (
            CICLO_PROMOCION.index(self.promocion_auto)
            if self.promocion_auto in CICLO_PROMOCION
            else -1  # valor desconocido: empieza el ciclo por 'q'
        )
        self.promocion_auto = CICLO_PROMOCION[(indice + 1) % len(CICLO_PROMOCION)]
        nombre = NOMBRE_PROMOCION[self.promocion_auto]
        if self.boton_promocion is not None:
            self.boton_promocion.config(text=f"Promoción: {nombre}")
        if self.promocion_auto == "ask":
            texto = "Promocion: preguntar en ventana al llegar al ultimo rango."
        else:
            texto = f"Promocion automatica a {nombre.lower()} al llegar al ultimo rango."
        self.barra_estado.config(text=f"{texto}          {LEYENDA}")

    def alternar_numeros(self) -> None:
        self.mostrar_numeros = not self.mostrar_numeros
        self.barra_estado.config(
            text="Numeros en todas las casillas." if self.mostrar_numeros else "Numeros solo en casillas vacias."
        )
        self.dibujar_tablero()

    def pasar_raton(self, evento) -> None:
        fila, col = evento.y // CASILLA, evento.x // CASILLA
        if not (0 <= fila < 8 and 0 <= col < 8):
            return
        nombre = a_texto((fila, col))
        pieza = self.posicion.tablero[fila][col]
        tipo = "vacia" if pieza == "." else etiqueta(pieza, nombre)
        if self._drag_iniciado and self.drag_origen is not None:
            legal = any(m.destino == (fila, col) for m in self.destinos)
            marca = "DESTINO LEGAL" if legal else "casilla no valida"
            self.barra_estado.config(
                text=f"{nombre} = {NUMEROS[nombre]}   casilla {tipo}   {marca}          {LEYENDA}"
            )
            return
        self.barra_estado.config(
            text=f"{nombre} = {NUMEROS[nombre]}   casilla {tipo}          {LEYENDA}"
        )

    def mostrar_ayuda(self) -> None:
        messagebox.showinfo(
            "Ayuda",
            "AJEDREZ CON NUMERACION PROPIA 1-64\n\n"
            "JUGAR:\n"
            "  - Pulsa una pieza y despues la casilla de destino.\n"
            "  - O arrastra la pieza con el raton hasta la casilla destino.\n"
            "  - Los puntos verdes marcan las jugadas legales.\n"
            "  - Los peones se muestran con el numero de su casilla.\n\n"
            "PROMOCION DE PEON:\n"
            "  - El boton 'Promoción: ...' de la barra superior configura la promocion:\n"
            "    Dama, Torre, Alfil, Caballo (automatica, sin ventana) o Preguntar.\n"
            "  - Se aplica tanto al clic como al arrastre.\n\n"
            "JUGAR CONTRA LA COMPUTADORA:\n"
            "  - Tu juegas con las blancas y la computadora responde\n"
            "  - con las negras automaticamente, como en Lichess.\n\n"
            'PIEZAS: " caballo, ¿ alfil, T torre, D dama, R rey.\n'
            "Las piezas negras van entre corchetes [ ].\n\n"
f"CAPTURAS: multiplican peon x peon y peon x pieza menor\n"
             f"(caballo o alfil). La dama y la torre NO multiplican.\n"
             f"El producto nunca pasa de 4 cifras (maximo 64x64 = 4096).\n"
            "Si un producto se repite en la misma partida, se anota una\n"
            "sola vez y no vuelve a sumarse (columna RESULTADO).\n\n"
            "PARTIDA REAL:\n"
            "  'Cargar partida 6' + 'Siguiente jugada' reproduce la\n"
            "  partida 6 del Fischer vs Spassky, Reikjavik 1972.",
        )


def main() -> int:
    aplicacion = Aplicacion()
    aplicacion.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
