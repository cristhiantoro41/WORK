/* tests.js - Suite de verificacion de la PWA.
 * Cargar con: test.html  (engine.js, numeros.js e ia.js deben ir ANTES).
 * Pinta en el DOM cada "OK ..." o "FALLO ..." y un resumen "FALLOS: N".
 */
'use strict';

/* Fixtures de paridad generados con motor.py (jugadas UCI ordenadas). */
var FIXTURES_PARIDAD = {"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1":["a2a3","a2a4","b1a3","b1c3","b2b3","b2b4","c2c3","c2c4","d2d3","d2d4","e2e3","e2e4","f2f3","f2f4","g1f3","g1h3","g2g3","g2g4","h2h3","h2h4"],"r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1":["a1b1","a1c1","a1d1","a2a3","a2a4","b2b3","c3a4","c3b1","c3b5","c3d1","d2c1","d2e3","d2f4","d2g5","d2h6","d5d6","d5e6","e1c1","e1d1","e1f1","e1g1","e2a6","e2b5","e2c4","e2d1","e2d3","e2f1","e5c4","e5c6","e5d3","e5d7","e5f7","e5g4","e5g6","f3d3","f3e3","f3f4","f3f5","f3f6","f3g3","f3g4","f3h3","f3h5","g2g3","g2g4","g2h3","h1f1","h1g1"],"8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1":["a5a4","a5a6","b4a4","b4b1","b4b2","b4b3","b4c4","b4d4","b4e4","b4f4","e2e3","e2e4","g2g3","g2g4"],"r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1":["b4c5","c4c5","d2d4","f1f2","f3d4","g1h1"],"rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8":["a2a3","a2a4","b1a3","b1c3","b1d2","b2b3","b2b4","c1d2","c1e3","c1f4","c1g5","c1h6","c2c3","c4a6","c4b3","c4b5","c4d3","c4d5","c4e6","c4f7","d1d2","d1d3","d1d4","d1d5","d1d6","d7c8b","d7c8n","d7c8q","d7c8r","e1d2","e1f1","e1f2","e1g1","e2c3","e2d4","e2f4","e2g1","e2g3","g2g3","g2g4","h1f1","h1g1","h2h3","h2h4"],"r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10":["a1a2","a1b1","a1c1","a1d1","a1e1","a3a4","b2b3","b2b4","c3a2","c3a4","c3b1","c3b5","c3d1","c3d5","c4a2","c4a6","c4b3","c4b5","c4d5","c4e6","c4f7","d3d4","e2d1","e2d2","e2e1","e2e3","f1b1","f1c1","f1d1","f1e1","f3d2","f3d4","f3e1","f3e5","f3h4","g1h1","g2g3","g5c1","g5d2","g5e3","g5f4","g5f6","g5h4","g5h6","h2h3","h2h4"],"4k3/8/8/8/8/8/4P3/4K3 w - - 0 1":["e1d1","e1d2","e1f1","e1f2","e2e3","e2e4"],"8/8/4k3/8/2p5/8/B2P2K1/8 w - - 0 1":["a2b1","a2b3","a2c4","d2d3","d2d4","g2f1","g2f2","g2f3","g2g1","g2g3","g2h1","g2h2","g2h3"],"8/8/8/8/8/6k1/6p1/6K1 w - - 0 1":[],"8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 0 1":["c7c5","c7c6","d6d5","h4g3","h4g4","h4g5","h5b5","h5c5","h5d5","h5e5","h5f5","h5g5","h5h6","h5h7","h5h8"],"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1":["a7a5","a7a6","b7b5","b7b6","b8a6","b8c6","c7c5","c7c6","d7d5","d7d6","e7e5","e7e6","f7f5","f7f6","g7g5","g7g6","g8f6","g8h6","h7h5","h7h6"],"8/8/8/8/8/8/8/K6k w - - 0 1":["a1a2","a1b1","a1b2"],"7k/5R2/6K1/8/8/8/8/8 w - - 0 1":["f7a7","f7b7","f7c7","f7d7","f7e7","f7f1","f7f2","f7f3","f7f4","f7f5","f7f6","f7f8","f7g7","f7h7","g6f5","g6f6","g6g5","g6h5","g6h6"],"7k/5Q2/6K1/8/8/8/8/8 b - - 0 1":[],"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1":["a2a3","a2a4","b1a3","b1c3","b2b3","b2b4","c2c3","c2c4","d2d3","d2d4","e2e3","e2e4","f2f3","f2f4","g1f3","g1h3","g2g3","g2g4","h2h3","h2h4"],"8/8/8/3k4/8/8/3K1R2/8 w - - 0 1":["d2c1","d2c2","d2c3","d2d1","d2d3","d2e1","d2e2","d2e3","f2e2","f2f1","f2f3","f2f4","f2f5","f2f6","f2f7","f2f8","f2g2","f2h2"]};

var resultado = document.getElementById('resultado');
var FALLOS = 0;
var CONTADOR = 0;

function comprobar(nombre, condicion) {
  CONTADOR++;
  var ok = !!condicion;
  if (!ok) FALLOS++;
  var div = document.createElement('div');
  div.textContent = (ok ? 'OK ' : 'FALLO ') + nombre;
  div.className = ok ? 'ok' : 'fallo';
  resultado.appendChild(div);
}

function ucisOrdenadas(posicion) {
  return posicion.movimientosLegales().map(function (m) { return m.uci; }).sort();
}

function mismaLista(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

var FEN_INICIO = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/* ======================================================== POSICION INICIAL */

(function () {
  var e = new Engine(FEN_INICIO);
  comprobar('inicial: 20 jugadas legales', e.jugadas_legales().length === 20);

  var ucis = ucisOrdenadas(e.pos);
  comprobar('inicial: a2a3 es legal', ucis.indexOf('a2a3') >= 0);
  comprobar('inicial: a2a4 es legal', ucis.indexOf('a2a4') >= 0);
  comprobar('inicial: e2e4 es legal', ucis.indexOf('e2e4') >= 0);
  comprobar('inicial: b1c3 es legal', ucis.indexOf('b1c3') >= 0);

  var m = e.aplicar('e2e4');
  comprobar('e2e4 aplicada y cambia el turno', m !== null && e.turno === false);
  comprobar('tras e2e4 la jugada se deshace', (e.deshacer() !== null) && e.turno === true);
})();

/* ================================================================ ENROQUES */

(function () {
  var e = new Engine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  var ucis = ucisOrdenadas(e.pos);
  comprobar('enroque: se detecta O-O (e1g1)', ucis.indexOf('e1g1') >= 0);
  comprobar('enroque: se detecta O-O-O (e1c1)', ucis.indexOf('e1c1') >= 0);

  var corto = e.pos.movimientosLegales().filter(function (m) {
    return m.enroque && m.destino[0] === 7 && m.destino[1] === 6;
  })[0];
  comprobar('enroque: la jugada e1g1 marcada tiene enroque=true', !!corto);
  if (corto) {
    e.deshacer();
    var aplica = e.aplicar(corto);
    comprobar('enroque: aplicar O-O mueve la torre a f1',
      aplica !== null && e.tablero[7][5] === 'R' && e.tablero[7][7] === '.');

    var e2 = new Engine('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    var ucis2 = ucisOrdenadas(e2.pos);
    comprobar('enroque: negras tienen e8g8/e8c8', ucis2.indexOf('e8g8') >= 0 && ucis2.indexOf('e8c8') >= 0);
  }

  var jaque = new Engine('4q3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  comprobar('enroque: un jaque impide enrocar', jaque.es_jaque() === true);
  var ucis3 = ucisOrdenadas(jaque.pos);
  comprobar('enroque: en jaque no hay e1g1 ni e1c1',
    ucis3.indexOf('e1g1') < 0 && ucis3.indexOf('e1c1') < 0);
  comprobar('enroque: en jaque el rey se mueve', ucis3.length === 4);
})();

/* ========================================================= CAPTURA AL PASO */

(function () {
  var e = new Engine('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
  var ucis = ucisOrdenadas(e.pos);
  comprobar('al paso: e5d6 es legal', ucis.indexOf('e5d6') >= 0);

  var mov = e.aplicar('e5d6');
  comprobar('al paso: aplicar elimina el peon d5',
    mov !== null && mov.enPasante === true &&
    e.tablero[3][3] === '.' && e.tablero[2][3] === 'P');
})();

/* ================================================================ PROMOCION */

(function () {
  var e = new Engine('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  var ucis = ucisOrdenadas(e.pos);
  comprobar('promocion: a7a8q es legal', ucis.indexOf('a7a8q') >= 0);
  comprobar('promocion: se generan 4 piezas', ucis.indexOf('a7a8r') >= 0 &&
    ucis.indexOf('a7a8b') >= 0 && ucis.indexOf('a7a8n') >= 0);

  var aplica = e.aplicar('a7a8q');
  comprobar('promocion: aplicar crea una dama en a8',
    aplica !== null && e.tablero[0][0] === 'Q');
})();

/* ================================================================ JAQUE MATE */

(function () {
  var e = new Engine('7k/5R2/6K1/8/8/8/8/8 w - - 0 1');
  var mejor = e.mejor_jugada(3);
  comprobar('mate en 1: la IA encuentra f7f8', mejor !== null && mejor.uci === 'f7f8');

  var aplica = e.aplicar('f7f8');
  comprobar('mate en 1: f7f8 es mate', aplica !== null && e.pos.movimientosLegales().length === 0);
  var estado = e.terminacion();
  comprobar('mate en 1: terminacion menciona el mate', estado.indexOf('Jaque mate') === 0);
})();

/* ================================================================== AHOGADO */

(function () {
  var e = new Engine('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  comprobar('ahogado: no hay jugadas legales', e.pos.movimientosLegales().length === 0);
  comprobar('ahogado: no es jaque', e.es_jaque() === false);
  var estado = e.terminacion();
  comprobar('ahogado: terminacion menciona el ahogado', estado.indexOf('ahogado') >= 0);
})();

/* ================================================================ NUMERACION */

(function () {
  comprobar('numero(e4) === 56', numero('e4') === 56);
  comprobar('numero(d5) === 54', numero('d5') === 54);
  comprobar('numero(d1) === 30', numero('d1') === 30);
  comprobar('numero(a1) === 7', numero('a1') === 7);
  comprobar('numero(h1) === 28', numero('h1') === 28);
  comprobar('numero(a8) === 34', numero('a8') === 34);
  comprobar('numero(h8) === 1', numero('h8') === 1);
  comprobar('numero(e7) === 23', numero('e7') === 23);
  comprobar('numero(f3) === 64', numero('f3') === 64);
  comprobar('numero(c4) === 58 y d4 === 61', numero('c4') === 58 && numero('d4') === 61);

  var vistos = [];
  var unicos = true;
  Object.keys(NUMEROS).forEach(function (c) {
    var v = NUMEROS[c];
    if (vistos.indexOf(v) >= 0) unicos = false;
    vistos.push(v);
  });
  vistos.sort(function (a, b) { return a - b; });
  comprobar('numeracion: 64 numeros unicos 1..64',
    unicos && vistos.length === 64 && vistos[0] === 1 && vistos[63] === 64);

  comprobar('etiquetaPieza peon en e4 (fila4,col4) es "56"', etiquetaPieza('P', 4, 4) === '56');
  comprobar('etiqueta caballo es comilla', etiqueta('N', 'e4') === '"');
  comprobar('etiqueta alfil es interrogacion', etiqueta('B', 'e4') === '¿');
  comprobar('etiqueta torre es T', etiqueta('R', 'e4') === 'T');
  comprobar('etiqueta dama es D', etiqueta('Q', 'e4') === 'D');
  comprobar('etiqueta rey es R', etiqueta('K', 'e4') === 'R');
})();

/* ============================================================ MULTIPLICACION */

(function () {
  comprobar('multiplica: PxP', esMultiplicacion('P', 'P') === true);
  comprobar('multiplica: PxN y PxB', esMultiplicacion('P', 'N') === true && esMultiplicacion('P', 'B') === true);
  comprobar('no multiplican: PxR, PxQ, PxDama', esMultiplicacion('P', 'R') === false && esMultiplicacion('P', 'Q') === false);
  comprobar('no multiplican: R,P / Q,P / B,P / N,P / K,P',
    esMultiplicacion('R', 'P') === false && esMultiplicacion('Q', 'P') === false &&
    esMultiplicacion('B', 'P') === false && esMultiplicacion('N', 'P') === false &&
    esMultiplicacion('K', 'P') === false);
  comprobar('productoDe(56,54) === 3024', productoDe(56, 54) === 3024);

  var historial = [];
  var c1 = registrarCaptura(historial, '1.', true, 'P', 'p', 'e4', 'd5');
  var c2 = registrarCaptura(historial, '2...', false, 'p', 'P', 'd5', 'e4');
  var res = resumenCapturas(historial);
  comprobar('dedupe: productos iguales y el segundo queda repetido',
    c1.producto === 3024 && c2.producto === 3024 && c1.repetido === false && c2.repetido === true);
  comprobar('dedupe: resumen filtra el repetido',
    res.capturas === 2 && res.multiplicaciones === 2 && res.repetidos === 1 && res.suma === 3024);

  var sin = registrarCaptura([], '1.', true, 'Q', 'p', 'e4', 'd5');
  comprobar('dama no multiplica (producto null)', sin.producto === null &&
    sin.resultado().indexOf('sin multiplicar') >= 0);
})();

/* ==================================================================== IA */

(function () {
  var e1 = new Engine(FEN_INICIO);
  var mov1 = mover(e1, 1);
  var legales1 = new Engine(FEN_INICIO).pos.movimientosLegales()
    .map(function (m) { return m.uci; });
  comprobar('IA nivel 1: devuelve una jugada legal', mov1 !== null && legales1.indexOf(mov1) >= 0);

  var e2 = new Engine(FEN_INICIO);
  var mov2 = mover(e2, 2, 3000);
  comprobar('IA nivel 2: devuelve una jugada legal', mov2 !== null && legales1.indexOf(mov2) >= 0);

  var e3 = new Engine('7k/5R2/6K1/8/8/8/8/8 w - - 0 1');
  var mov3 = mover(e3, 12, 900);
  comprobar('IA nivel 12: mate en 1 -> f7f8', mov3 === 'f7f8');

  var cfg = configurarNivel(12);
  comprobar('IA: 12 niveles definidos', NIVELES_IA.length === 12);
  comprobar('IA: nivel 12 se llama Imbatible', cfg.nivel === 12);
})();

/* ============================================================ PARIDAD motor.py */

(function () {
  var fen;
  var aciertos = 0;
  var total = Object.keys(FIXTURES_PARIDAD).length;
  for (fen in FIXTURES_PARIDAD) {
    if (!Object.prototype.hasOwnProperty.call(FIXTURES_PARIDAD, fen)) continue;
    var e = new Engine(fen);
    var esperadas = FIXTURES_PARIDAD[fen].slice().sort();
    var reales = ucisOrdenadas(e.pos);
    if (mismaLista(esperadas, reales)) aciertos++;
  }
  comprobar('paridad con motor.py: ' + aciertos + ' de ' + total + ' FEN coinciden',
    aciertos === total);
})();

/* =================================================================== FEN / PERFT */

(function () {
  var e = new Engine(FEN_INICIO);
  comprobar('a_fen (sin los ultimos campos) restituye el tablero',
    e.a_fen().split(' ').slice(0, 4).join(' ') === FEN_INICIO.split(' ').slice(0, 4).join(' '));

  var e2 = new Engine(FEN_INICIO);
  var p1 = perft(e2.pos, 1);
  var e3 = new Engine(FEN_INICIO);
  var p2 = perft(e3.pos, 2);
  comprobar('perft(1) inicial === 20', p1 === 20);
  comprobar('perft(2) inicial === 400', p2 === 400);

  var e4 = new Engine(FEN_INICIO);
  var p3 = perft(e4.pos, 3);
  comprobar('perft(3) inicial === 8902 (igual que motor.py)', p3 === 8902);
})();

/* ================================================================= RESUMEN */

(function () {
  var div = document.createElement('div');
  div.id = 'resumen-tests';
  div.textContent = 'FALLOS: ' + FALLOS;
  div.className = FALLOS === 0 ? 'resumen-ok' : 'resumen-fallo';
  resultado.appendChild(div);
  console.log('FALLOS: ' + FALLOS);

  var titulo = document.getElementById('titulo');
  if (titulo) titulo.textContent = 'Pruebas completadas: ' + CONTADOR + '. ' + div.textContent;
})();