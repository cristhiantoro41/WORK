/* libro.js - Libro de aperturas clasicas (Fischer, Kasparov, Carlsen, Karpov).
 * Si la posicion esta en el libro, se juega la variante clasica en vez de
 * calcular. Asi el motor abre con control del centro y no con peones laterales.
 * Clave = FEN (tablero + turno + enroque + al paso). Valores = jugadas UCI.
 */
'use strict';

var LIBRO = {
  /* ---------- posicion inicial ---------- */
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4', 'g1f3', 'c2c4'],

  /* ---------- respuestas a 1.e4 ---------- */
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': ['e7e5', 'c7c5', 'e7e6', 'c7c6', 'd7d5'],
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': ['e7e5', 'c7c5', 'e7e6', 'c7c6', 'd7d5'],

  /* ---------- 1.Cf3 (Reti / Inglesa) ---------- */
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -': ['d7d5', 'g8f6', 'c7c5', 'e7e6'],

  /* 1.e4 e5 - aperturas abiertas (Fischer, Carlsen) */
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['g1f3', 'f1c4', 'b1c3'],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['b8c6', 'g8f6', 'd7d6'],

  /* Ruy Lopez: 1.e4 e5 2.Nf3 Nc6 3.Bb5 */
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': ['f1b5', 'f1c4', 'd2d4'],
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['a7a6', 'g8f6', 'f8c5'],

  /* Italiana: 1.e4 e5 2.Nf3 Nc6 3.Bc4 */
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['g8f6', 'f8c5', 'd7d6'],

  /* 1.e4 e5 2.Nf3 - defensa Petrov/berlinesa */
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['b8c6', 'g8f6'],

  /* ---------- Siciliana (Kasparov, Fischer) ---------- */
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['g1f3', 'b1c3', 'c2c3'],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['d7d6', 'b8c6', 'e7e6'],
  'rnbqkb1r/pp1ppppp/5n2/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': ['d2d4', 'f1b5', 'b1c3'],

  /* ---------- Francesa / Caro-Kann ---------- */
  'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['d2d4', 'b1c3', 'g1f3'],
  'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['d2d4', 'g1f3', 'b1c3'],

  /* ---------- 1.d4 respuestas ---------- */
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -': ['d7d5', 'g8f6', 'e7e6', 'g7g6'],
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': ['c2c4', 'g1f3', 'b1c3'],
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': ['c2c4', 'g1f3', 'c1f4'],

  /* Gambito de Dama: 1.d4 d5 2.c4 */
  'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -': ['e7e6', 'c7c6', 'd5c4', 'g8f6'],
  'rnbqkbnr/pp2pppp/8/2pp4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -': ['g1f3', 'b1c3', 'c1f4'],

  /* India de Rey / Nimzo */
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': ['c2c4', 'g1f3', 'c1f4'],
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -': ['e7e6', 'g7g6', 'c7c5'],

  /* ---------- posiciones tras 2 jugadas ---------- */
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': ['f1b5', 'f1c4', 'd2d4'],
  'rnbqkb1r/pppppppp/5n2/8/3P4/2P5/PP2PPPP/RNBQKBNR b KQkq -': ['e7e6', 'd7d5', 'g7g6'],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['d7d6', 'b8c6', 'g8f6']
};

/* Convierte UCI a la etiqueta numerica 1-64 (ej. e2e4 -> 44-56). */
function uciANumeros(uci) {
  if (!uci || uci.length < 4) return uci || '';
  var a = uci.substr(0, 2), b = uci.substr(2, 2);
  try {
    if (typeof numero === 'function' && typeof casillaDe === 'function') {
      var na = numero(a), nb = numero(b);
      var at = null, vt = null;
      return na + '-' + nb;
    }
  } catch (e) {}
  return a + '-' + b;
}

/* Clave de libro para una posicion (tablero + turno + enroque + al paso). */
function claveLibro(pos) {
  var fen = (typeof pos.aFen === 'function') ? pos.aFen() : pos.fen();
  var partes = fen.split(' ');
  return partes[0] + ' ' + partes[1] + ' ' + partes[2] + ' ' + partes[3];
}

/* Devuelve la jugada UCI del libro o null si no esta. */
function jugadaLibro(pos) {
  try {
    var clave = claveLibro(pos);
    var lista = LIBRO[clave];
    if (!lista || !lista.length) return null;
    var legales = pos.movimientosLegales();
    var elegidas = [];
    for (var i = 0; i < lista.length; i++) {
      for (var j = 0; j < legales.length; j++) {
        if (legales[j].uci === lista[i]) { elegidas.push(lista[i]); break; }
      }
    }
    if (!elegidas.length) return null;
    return elegidas[Math.floor(Math.random() * elegidas.length)];
  } catch (e) { return null; }
}

if (typeof window !== 'undefined') {
  window.LIBRO = LIBRO;
  window.jugadaLibro = jugadaLibro;
  window.uciANumeros = uciANumeros;
}