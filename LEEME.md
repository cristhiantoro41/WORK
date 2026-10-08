# Ajedrez con numeracion propia (1-64)

<p align="center"><img src="logo.svg" width="110" alt="Peon de ajedrez"></p>

Carpeta: `C:\Users\TORO\Desktop\mi_app`

## Como abrirlo

1. Ve al **escritorio** (doble clic en el icono de Escritorio, o `Win + D`).
2. Busca la carpeta **`mi_app`**.
3. Doble clic en **`JUGAR-AJEDREZ.bat`**.

Se abre el tablero grafico para jugar con el raton.

Tambien puedes escribir `mi_app` en la barra de busqueda de Windows
(inicio -> escribir `mi_app`) y pulsar Intro, o abrir el explorador de
archivos y pegar `C:\Users\TORO\Desktop\mi_app` en la barra de direccion.

## Los tres programas

| Archivo | Que hace |
|---|---|
| `JUGAR-AJEDREZ.bat` | Tablero grafico: juegas con el raton |
| `TABLERO-EN-CONSOLA.bat` | El mismo juego en la ventana de comandos |
| `PARTIDAS-DE-CAMPEONATO.bat` | Reproduce la partida 6 Fischer-Spassky 1972 |

## Como se juega en el tablero grafico

- Pulsa una pieza: se marca de verde y aparecen puntos con las jugadas legales.
- Pulsa la casilla destino y la pieza se mueve.
- Los peones se dibujan con el **numero de su casilla**.
- Las piezas negras van entre corchetes `[ ]`.
- Las blancas se pintan de blanco y las negras de negro dentro de un circulo.

## Simbolos de las piezas

| Pieza | Simbolo |
|---|---|
| Peon | el numero de su casilla |
| Caballo | `"` |
| Alfil | `¿` |
| Torre | `T` |
| Dama | `D` |
| Rey | `R` |

Al promocionar, el peon pasa a mostrarse con la letra de su nueva pieza.

## Numeracion propia

Cada casilla tiene un numero fijo del 1 al 64, el mismo en todas las
partidas (por ejemplo `e4 = 56`, `d5 = 54`, `h1 = 28`). Ese numero
tambien se muestra en la columna derecha del tablero de consola y en
la esquina de cada casilla vacia.

## Multiplicaciones en las capturas

- Multiplican **peon x peon** y **peon x pieza menor** (caballo o alfil).
  La dama y la torre **NO** multiplican al capturar.
- La cuenta es: `numero de la casilla origen x numero de la casilla destino`.
- Solo cabe en **4 cifras**: lo maximo posible es 64 x 64 = 4096.
- Las demas capturas solo anotan el numero de la casilla de destino.
- Si el mismo producto se repite **en la misma partida**, se anota una sola
  vez y aparece marcado como `(repetido)` sin volver a sumar, para que el
  resumen no cambie a medida que avanza la partida.

## Partidas reales

`PARTIDAS-DE-CAMPEONATO.bat` (y el boton **Cargar partida 6** del tablero
grafico) reproducen la partida 6 del match Fischer-Spassky, Reikjavik 1972,
desde el archivo `match1972.pgn`. En el tablero grafico usa
**Siguiente jugada** / **Jugada anterior** para recorrerla.

## Jugar contra la computadora

La computadora juega siempre con las negras y responde sola, como en
Lichess: tu juegas con las blancas y ella contesta automaticamente.
No hay interruptor: mueve y ella respondera.

## Requisitos

No hay que instalar nada mas: solo Python 3 con tkinter (incluido en la
instalacion normal de Python). `requirements.txt` esta vacio a proposito.
