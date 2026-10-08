/* engine.js - Port fiel a JavaScript de motor.py (ajedrez completo).
 *
 * Mismas piezas 'P/p N/n B/b R/r Q/q K/k', turno booleano (true = blancas),
 * tablero 8x8 donde la fila 0 es la fila 8 del tablero.
 */
'use strict';

var FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
var VACIA = '.';

var DIRECCIONES_PIEZAS = {
  N: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
  B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  R: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  Q: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
  K: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]
};

var DESLIZANTES = { B: true, R: true, Q: true };

/* clave "fila,col" -> letra de enroque que se pierde al tocar esa esquina */
var ESQUINAS_ENROQUE = { '7,0': 'Q', '7,7': 'K', '0,0': 'q', '0,7': 'k' };

function dentro(fila, col) {
  return fila >= 0 && fila < 8 && col >= 0 && col < 8;
}

function aTexto(casilla) {
  return String.fromCharCode(97 + casilla[1]) + String(8 - casilla[0]);
}

function desdeTexto(texto) {
  var t = String(texto).trim().toLowerCase();
  if (t.length !== 2 || 'abcdefgh'.indexOf(t[0]) < 0 || '12345678'.indexOf(t[1]) < 0) {
    return [-1, -1];
  }
  return [8 - parseInt(t[1], 10), t.charCodeAt(0) - 97];
}

function esBlanca(pieza) {
  return pieza >= 'A' && pieza <= 'Z';
}

function iguales(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/* ------------------------------------------------------------------ movimientos */

function Movimiento(origen, destino, promocion, enPasante, enroque) {
  this.origen = origen;
  this.destino = destino;
  this.promocion = promocion || null;
  this.enPasante = !!enPasante;
  this.enroque = !!enroque;
}

Object.defineProperty(Movimiento.prototype, 'uci', {
  get: function () {
    var texto = aTexto(this.origen) + aTexto(this.destino);
    if (this.promocion) texto += this.promocion.toLowerCase();
    return texto;
  }
});

Movimiento.prototype.toString = function () {
  if (this.enroque) return this.uci + ' (enroque)';
  if (this.enPasante) return this.uci + ' (en passant)';
  return this.uci;
};

/* ------------------------------------------------------------------ posicion */

function Posicion(fen) {
  this.tablero = [];
  this.turno = true;
  this.enroque = '';
  this.enPasante = null;
  this.medios = 0;
  this.jugada = 1;
  this.reyes = {};
  this._pila = [];
  this.cargarFen(fen || FEN_INICIAL);
}

Posicion.prototype.cargarFen = function (fen) {
  var partes = String(fen).trim().split(/\s+/);
  if (partes.length < 4) throw new Error('FEN incompleto');

  this.tablero = [[], [], [], [], [], [], [], []];
  var filas = partes[0].split('/');
  if (filas.length !== 8) throw new Error('El FEN debe tener 8 filas');

  for (var indice = 0; indice < 8; indice++) {
    var col = 0;
    var linea = filas[indice];
    this.tablero[indice] = [VACIA, VACIA, VACIA, VACIA, VACIA, VACIA, VACIA, VACIA];
    for (var i = 0; i < linea.length; i++) {
      var c = linea[i];
      if (c >= '1' && c <= '8') {
        col += parseInt(c, 10);
      } else if ('pnbrqkPNBRQK'.indexOf(c) >= 0) {
        if (!dentro(indice, col)) throw new Error('Pieza fuera del tablero en el FEN: ' + fen);
        this.tablero[indice][col] = c;
        col++;
      } else {
        throw new Error('Caracter invalido en el FEN: ' + c);
      }
    }
    if (col !== 8) throw new Error('Fila incompleta en el FEN: ' + linea);
  }

  if (partes[1] !== 'w' && partes[1] !== 'b') throw new Error('Turno invalido en el FEN');
  this.turno = partes[1] === 'b' ? false : true;
  this.enroque = '';
  for (var k = 0; k < partes[2].length; k++) {
    if ('KQkq'.indexOf(partes[2][k]) >= 0) this.enroque += partes[2][k];
  }
  this.enPasante = partes[3] === '-' ? null : desdeTexto(partes[3]);
  if (this.enPasante && this.enPasante[0] < 0) this.enPasante = null;
  this.medios = partes.length > 4 ? parseInt(partes[4], 10) || 0 : 0;
  this.jugada = partes.length > 5 ? parseInt(partes[5], 10) || 1 : 1;
  this.reyes = {};
  this._pila = [];
};

Posicion.prototype.aFen = function () {
  var filasTexto = [];
  for (var f = 0; f < 8; f++) {
    var partes = [];
    var vacias = 0;
    for (var c = 0; c < 8; c++) {
      var pieza = this.tablero[f][c];
      if (pieza === VACIA) {
        vacias++;
        continue;
      }
      if (vacias) {
        partes.push(String(vacias));
        vacias = 0;
      }
      partes.push(pieza);
    }
    if (vacias) partes.push(String(vacias));
    filasTexto.push(partes.join(''));
  }
  var turno = this.turno ? 'w' : 'b';
  var derechos = '';
  for (var i = 0; i < 'KQkq'.length; i++) {
    if (this.enroque.indexOf('KQkq'[i]) >= 0) derechos += 'KQkq'[i];
  }
  var ep = this.enPasante ? aTexto(this.enPasante) : '-';
  return filasTexto.join('/') + ' ' + turno + ' ' + (derechos || '-') + ' ' + ep +
    ' ' + this.medios + ' ' + this.jugada;
};

Posicion.prototype.copia = function () {
  return new Posicion(this.aFen());
};

Posicion.prototype.piezaEn = function (casilla) {
  return this.tablero[casilla[0]][casilla[1]];
};

Posicion.prototype.casillaRey = function (color) {
  var clave = color ? 'w' : 'b';
  if (Object.prototype.hasOwnProperty.call(this.reyes, clave)) return this.reyes[clave];
  var objetivo = color ? 'K' : 'k';
  var encontrada = null;
  for (var fila = 0; fila < 8 && !encontrada; fila++) {
    for (var col = 0; col < 8; col++) {
      if (this.tablero[fila][col] === objetivo) {
        encontrada = [fila, col];
        break;
      }
    }
  }
  this.reyes[clave] = encontrada;
  return encontrada;
};

Posicion.prototype.enJaque = function (color) {
  var c = typeof color === 'boolean' ? color : this.turno;
  var rey = this.casillaRey(c);
  return rey !== null && this.atacada(rey[0], rey[1], !c);
};

Posicion.prototype.atacada = function (fila, col, porBlancas) {
  var paso, filaP, colP, i, objetivo, pieza;
  var dirs = DIRECCIONES_PIEZAS.N;
  for (i = 0; i < 8; i++) {
    filaP = fila + dirs[i][0];
    colP = col + dirs[i][1];
    if (dentro(filaP, colP)) {
      objetivo = porBlancas ? 'N' : 'n';
      if (this.tablero[filaP][colP] === objetivo) return true;
    }
  }

  objetivo = porBlancas ? 'K' : 'k';
  dirs = DIRECCIONES_PIEZAS.K;
  for (i = 0; i < 8; i++) {
    filaP = fila + dirs[i][0];
    colP = col + dirs[i][1];
    if (dentro(filaP, colP) && this.tablero[filaP][colP] === objetivo) return true;
  }

  var tipos = ['B', 'R', 'Q'];
  for (var t = 0; t < 3; t++) {
    objetivo = porBlancas ? tipos[t] : tipos[t].toLowerCase();
    dirs = DIRECCIONES_PIEZAS[tipos[t]];
    for (i = 0; i < dirs.length; i++) {
      filaP = fila + dirs[i][0];
      colP = col + dirs[i][1];
      while (dentro(filaP, colP)) {
        pieza = this.tablero[filaP][colP];
        if (pieza !== VACIA) {
          if (pieza === objetivo) return true;
          break;
        }
        filaP += dirs[i][0];
        colP += dirs[i][1];
      }
    }
  }

  filaP = porBlancas ? fila + 1 : fila - 1;
  if (dentro(filaP, col)) {
    for (var dc = -1; dc <= 1; dc += 2) {
      colP = col + dc;
      if (dentro(filaP, colP)) {
        objetivo = porBlancas ? 'P' : 'p';
        if (this.tablero[filaP][colP] === objetivo) return true;
      }
    }
  }
  return false;
};

Posicion.prototype.casillasDe = function (color) {
  var lista = [];
  for (var fila = 0; fila < 8; fila++) {
    for (var col = 0; col < 8; col++) {
      var pieza = this.tablero[fila][col];
      if (pieza !== VACIA && esBlanca(pieza) === color) lista.push([fila, col]);
    }
  }
  return lista;
};

Posicion.prototype.materialInsuficiente = function () {
  var blancas = [];
  var negras = [];
  var alfiles = [];
  for (var fila = 0; fila < 8; fila++) {
    for (var col = 0; col < 8; col++) {
      var pieza = this.tablero[fila][col];
      if (pieza === VACIA) continue;
      (esBlanca(pieza) ? blancas : negras).push(pieza.toUpperCase());
      if (pieza.toUpperCase() === 'B') alfiles.push((fila + col) % 2);
    }
  }
  var listas = [blancas, negras];
  for (var i = 0; i < 2; i++) {
    var sinRey = listas[i].filter(function (p) { return p !== 'K'; });
    if (sinRey.length > 1) return false;
  }
  if (!alfiles.length) return true;
  return alfiles.every(function (v) { return v === alfiles[0]; });
};

/* ------------------------------------------------------- generacion de jugadas */

Posicion.prototype.movimientosLegales = function () {
  var legales = [];
  var pseudo = this.movimientosPseudoLegales();
  for (var i = 0; i < pseudo.length; i++) {
    if (this.esLegal(pseudo[i])) legales.push(pseudo[i]);
  }
  return legales;
};

Posicion.prototype.movimientosPseudoLegales = function () {
  var salida = [];
  var casillas = this.casillasDe(this.turno);
  for (var i = 0; i < casillas.length; i++) {
    var casilla = casillas[i];
    var tipo = this.tablero[casilla[0]][casilla[1]].toUpperCase();
    if (tipo === 'P') {
      this._movimientosPeon(casilla, salida);
    } else if (DIRECCIONES_PIEZAS[tipo]) {
      this._movimientosPieza(casilla, salida);
    }
  }
  return salida;
};

Posicion.prototype._movimientosPieza = function (casilla, salida) {
  var fila = casilla[0];
  var col = casilla[1];
  var pieza = this.tablero[fila][col];
  var tipo = pieza.toUpperCase();
  var color = esBlanca(pieza);
  var dirs = DIRECCIONES_PIEZAS[tipo];

  for (var i = 0; i < dirs.length; i++) {
    var filaP = fila + dirs[i][0];
    var colP = col + dirs[i][1];
    while (dentro(filaP, colP)) {
      var contenido = this.tablero[filaP][colP];
      if (contenido === VACIA) {
        salida.push(new Movimiento(casilla, [filaP, colP]));
      } else {
        if (esBlanca(contenido) !== color) salida.push(new Movimiento(casilla, [filaP, colP]));
        break;
      }
      if (!DESLIZANTES[tipo]) break;
      filaP += dirs[i][0];
      colP += dirs[i][1];
    }
  }

  if (tipo === 'K') this._movimientosEnroque(fila, col, salida);
};

Posicion.prototype._movimientosEnroque = function (fila, col, salida) {
  if (this.enJaque(this.turno)) return;

  var color = this.turno;
  var rival = !color;
  var torre = color ? 'R' : 'r';
  var corto = color ? 'K' : 'k';
  var largo = color ? 'Q' : 'q';

  if (this.enroque.indexOf(corto) >= 0 && this.tablero[fila][7] === torre) {
    if (this.tablero[fila][5] === VACIA && this.tablero[fila][6] === VACIA) {
      if (!this.atacada(fila, 5, rival) && !this.atacada(fila, 6, rival)) {
        salida.push(new Movimiento([fila, col], [fila, 6], null, false, true));
      }
    }
  }

  if (this.enroque.indexOf(largo) >= 0 && this.tablero[fila][0] === torre) {
    var libre = true;
    for (var c = 1; c <= 3; c++) {
      if (this.tablero[fila][c] !== VACIA) libre = false;
    }
    if (libre && !this.atacada(fila, 3, rival) && !this.atacada(fila, 2, rival)) {
      salida.push(new Movimiento([fila, col], [fila, 2], null, false, true));
    }
  }
};

Posicion.prototype._movimientosPeon = function (casilla, salida) {
  var fila = casilla[0];
  var col = casilla[1];
  var color = esBlanca(this.tablero[fila][col]);
  var avance = color ? -1 : 1;
  var filaInicial = color ? 6 : 1;

  var filaSiguiente = fila + avance;
  if (dentro(filaSiguiente, col) && this.tablero[filaSiguiente][col] === VACIA) {
    this._llegadasPeon(casilla, [filaSiguiente, col], salida);
    var filaDoble = fila + 2 * avance;
    if (fila === filaInicial && this.tablero[filaDoble][col] === VACIA) {
      salida.push(new Movimiento(casilla, [filaDoble, col]));
    }
  }

  if (!dentro(filaSiguiente, col)) return;

  for (var dc = -1; dc <= 1; dc += 2) {
    var colDestino = col + dc;
    if (!dentro(filaSiguiente, colDestino)) continue;
    var contenido = this.tablero[filaSiguiente][colDestino];
    if (contenido !== VACIA) {
      if (esBlanca(contenido) !== color) {
        this._llegadasPeon(casilla, [filaSiguiente, colDestino], salida);
      }
    } else if (this.enPasante && this.enPasante[0] === filaSiguiente &&
               this.enPasante[1] === colDestino) {
      salida.push(new Movimiento(casilla, [filaSiguiente, colDestino], null, true, false));
    }
  }
};

Posicion.prototype._llegadasPeon = function (origen, destino, salida) {
  if (destino[0] === 0 || destino[0] === 7) {
    var mayuscula = esBlanca(this.tablero[origen[0]][origen[1]]);
    var orden = ['Q', 'R', 'B', 'N'];
    for (var i = 0; i < orden.length; i++) {
      salida.push(new Movimiento(origen, destino,
        mayuscula ? orden[i] : orden[i].toLowerCase(), false, false));
    }
  } else {
    salida.push(new Movimiento(origen, destino));
  }
};

Posicion.prototype.esLegal = function (movimiento) {
  this.aplicar(movimiento);
  var segura = !this.enJaque(!this.turno);
  this.deshacer(movimiento);
  return segura;
};

/* --------------------------------------------------------- aplicar y deshacer */

Posicion.prototype.aplicar = function (movimiento) {
  this._pila.push({
    tablero: this.tablero.map(function (fila) { return fila.slice(); }),
    turno: this.turno,
    enroque: this.enroque,
    enPasante: this.enPasante,
    medios: this.medios,
    jugada: this.jugada,
    reyes: Object.assign({}, this.reyes)
  });

  var filaO = movimiento.origen[0];
  var colO = movimiento.origen[1];
  var filaD = movimiento.destino[0];
  var colD = movimiento.destino[1];
  var pieza = this.tablero[filaO][colO];
  var color = esBlanca(pieza);
  var objetivo = this.tablero[filaD][colD];

  var capturaOPeon = movimiento.enPasante || movimiento.promocion !== null;
  if (capturaOPeon || objetivo !== VACIA || pieza.toUpperCase() === 'P') {
    this.medios = 0;
  } else {
    this.medios += 1;
  }

  if (movimiento.enPasante) this.tablero[filaO][colD] = VACIA;

  if (movimiento.enroque) {
    if (colD > colO) {
      this.tablero[filaO][5] = this.tablero[filaO][7];
      this.tablero[filaO][7] = VACIA;
    } else {
      this.tablero[filaO][3] = this.tablero[filaO][0];
      this.tablero[filaO][0] = VACIA;
    }
  }

  this.tablero[filaD][colD] = movimiento.promocion || pieza;
  this.tablero[filaO][colO] = VACIA;

  this.enroque = this._derechosPerdidos(movimiento.origen, movimiento.destino, pieza);

  this.enPasante = null;
  if (pieza.toUpperCase() === 'P' && Math.abs(filaD - filaO) === 2) {
    this.enPasante = [(filaO + filaD) >> 1, colO];
  }

  this.reyes = {};
  this.turno = !color;
  if (!color) this.jugada += 1;
};

Posicion.prototype._derechosPerdidos = function (origen, destino, pieza) {
  var quitados = {};
  if (pieza.toUpperCase() === 'K') {
    if (esBlanca(pieza)) {
      quitados.K = true;
      quitados.Q = true;
    } else {
      quitados.k = true;
      quitados.q = true;
    }
  }
  var c1 = ESQUINAS_ENROQUE[origen[0] + ',' + origen[1]];
  if (c1) quitados[c1] = true;
  var c2 = ESQUINAS_ENROQUE[destino[0] + ',' + destino[1]];
  if (c2) quitados[c2] = true;

  var sobreviven = '';
  var base = 'KQkq';
  for (var i = 0; i < base.length; i++) {
    if (this.enroque.indexOf(base[i]) >= 0 && !quitados[base[i]]) sobreviven += base[i];
  }
  return sobreviven;
};

Posicion.prototype.deshacer = function () {
  if (!this._pila.length) throw new Error('No hay jugadas que deshacer');
  var estado = this._pila.pop();
  this.tablero = estado.tablero;
  this.turno = estado.turno;
  this.enroque = estado.enroque;
  this.enPasante = estado.enPasante;
  this.medios = estado.medios;
  this.jugada = estado.jugada;
  this.reyes = estado.reyes;
};

Posicion.prototype.sinJugadas = function () {
  return this.movimientosLegales().length === 0;
};

Posicion.prototype.movimientoDesdeTexto = function (texto) {
  var limpio = String(texto).trim().toLowerCase().replace(/\s/g, '').replace(/-/g, '').replace(/x/g, '');
  var promocion = null;

  if (limpio.length === 5 && 'qrbn'.indexOf(limpio[4]) >= 0) {
    promocion = limpio[4];
    limpio = limpio.slice(0, 4);
  } else if (limpio.length === 4 && 'qrbn'.indexOf(limpio[3]) >= 0 &&
             'abcdefgh'.indexOf(limpio[0]) >= 0 && '12345678'.indexOf(limpio[1]) >= 0) {
    promocion = limpio[3];
    limpio = limpio.slice(0, 3);
  }

  var origen = desdeTexto(limpio.slice(0, 2));
  var destino = desdeTexto(limpio.slice(2, 4));
  if (origen[0] < 0 || destino[0] < 0) return null;

  var legales = this.movimientosLegales();
  var candidatas = [];
  for (var i = 0; i < legales.length; i++) {
    var m = legales[i];
    if (iguales(m.origen, origen) && iguales(m.destino, destino)) candidatas.push(m);
  }
  if (promocion) {
    candidatas = candidatas.filter(function (m) {
      return m.promocion && m.promocion.toLowerCase() === promocion;
    });
  }
  if (!candidatas.length) return null;
  // Si hay dos (jugada normal y enroque) se prefiere la del enroque.
  for (var j = 0; j < candidatas.length; j++) {
    if (candidatas[j].enroque) return candidatas[j];
  }
  return candidatas[0];
};

function perft(posicion, profundidad) {
  if (profundidad === 0) return 1;
  var total = 0;
  var movimientos = posicion.movimientosLegales();
  for (var i = 0; i < movimientos.length; i++) {
    posicion.aplicar(movimientos[i]);
    total += perft(posicion, profundidad - 1);
    posicion.deshacer();
  }
  return total;
}

/* ------------------------------------------------- evaluacion y busqueda */

var INF = 100000000;

var VALORES_PIEZAS = { P: 100, N: 320, B: 330, R: 500, Q: 950, K: 0 };

var VALOR_PIEZA = {};
var BONO_CENTRO_PIEZA = {};
var BONO_TIPO = { P: 1, N: 3, B: 3, R: 0, Q: 0, K: 0 };
Object.keys(VALORES_PIEZAS).forEach(function (tipo) {
  var valor = VALORES_PIEZAS[tipo];
  VALOR_PIEZA[tipo] = valor;
  VALOR_PIEZA[tipo.toLowerCase()] = -valor;
  BONO_CENTRO_PIEZA[tipo] = BONO_TIPO[tipo];
  BONO_CENTRO_PIEZA[tipo.toLowerCase()] = -BONO_TIPO[tipo];
});

var BONO_CENTRO = [
  [0, 0, 1, 2, 2, 1, 0, 0],
  [0, 2, 3, 4, 4, 3, 2, 0],
  [1, 3, 4, 5, 5, 4, 3, 1],
  [2, 4, 5, 6, 6, 5, 4, 2],
  [2, 4, 5, 6, 6, 5, 4, 2],
  [1, 3, 4, 5, 5, 4, 3, 1],
  [0, 2, 3, 4, 4, 3, 2, 0],
  [0, 0, 1, 2, 2, 1, 0, 0]
];

function evaluar(posicion) {
  var total = 0;
  for (var fila = 0; fila < 8; fila++) {
    var linea = posicion.tablero[fila];
    var bono = BONO_CENTRO[fila];
    for (var col = 0; col < 8; col++) {
      var pieza = linea[col];
      if (pieza === VACIA) continue;
      total += VALOR_PIEZA[pieza] + BONO_CENTRO_PIEZA[pieza] * bono[col];
    }
  }
  return total;
}

function ordenar(movimientos, posicion) {
  return movimientos.slice().sort(function (a, b) {
    return clave(b, posicion) - clave(a, posicion);
  });

  function clave(movimiento, pos) {
    var victima = pos.tablero[movimiento.destino[0]][movimiento.destino[1]];
    var atacante = pos.tablero[movimiento.origen[0]][movimiento.origen[1]];
    if (victima !== VACIA) {
      return VALORES_PIEZAS[victima.toUpperCase()] * 10 - VALORES_PIEZAS[atacante.toUpperCase()];
    }
    return movimiento.promocion ? 1000 : 0;
  }
}

/* `estado` es opcional: {fecha, nodos, paso} para el limite de tiempo. */
function alfabeta(posicion, profundidad, alfa, beta, estado) {
  if (estado) {
    estado.nodos++;
    if (estado.nodos >= estado.paso) {
      estado.nodos = 0;
      if (estado.fecha && Date.now() > estado.fecha) {
        var err = new Error('tiempo agotado');
        err.tiempo = true;
        throw err;
      }
    }
  }

  var movimientos = posicion.movimientosLegales();
  if (!movimientos.length) {
    if (!posicion.enJaque(posicion.turno)) return 0;
    return posicion.turno ? -INF + posicion.jugada : INF - posicion.jugada;
  }
  if (profundidad === 0) return evaluar(posicion);

  movimientos = ordenar(movimientos, posicion);

  if (posicion.turno) {
    var mejor = -INF;
    for (var i = 0; i < movimientos.length; i++) {
      var m = movimientos[i];
      posicion.aplicar(m);
      var valor;
      try {
        valor = alfabeta(posicion, profundidad - 1, alfa, beta, estado);
      } finally {
        posicion.deshacer();
      }
      if (valor > mejor) mejor = valor;
      if (mejor > alfa) alfa = mejor;
      if (beta <= alfa) break;
    }
    return mejor;
  }

  var mejor2 = INF;
  for (var j = 0; j < movimientos.length; j++) {
    var m2 = movimientos[j];
    posicion.aplicar(m2);
    var valor2;
    try {
      valor2 = alfabeta(posicion, profundidad - 1, alfa, beta, estado);
    } finally {
      posicion.deshacer();
    }
    if (valor2 < mejor2) mejor2 = valor2;
    if (mejor2 < beta) beta = mejor2;
    if (beta <= alfa) break;
  }
  return mejor2;
}

/* Mejor jugada de una sola pasada a `profundidad`. Lanza error.tiempo si se agota. */
function buscarRaiz(posicion, profundidad, estado, fuerte) {
  var movimientos = posicion.movimientosLegales();
  if (!movimientos.length) return null;
  movimientos = ordenar(movimientos, posicion);

  var alfa = -INF;
  var beta = INF;
  var mejor = null;
  var valorMejor = posicion.turno ? -INF : INF;

  for (var i = 0; i < movimientos.length; i++) {
    var movimiento = movimientos[i];
    posicion.aplicar(movimiento);
    var valor;
    try {
      valor = alfabeta(posicion, profundidad - 1, alfa, beta, estado);
    } finally {
      posicion.deshacer();
    }
    if (posicion.turno) {
      if (valor > valorMejor) {
        valorMejor = valor;
        mejor = movimiento;
      }
      if (valorMejor > alfa) alfa = valorMejor;
    } else {
      if (valor < valorMejor) {
        valorMejor = valor;
        mejor = movimiento;
      }
      if (valorMejor < beta) beta = valorMejor;
    }
    if (beta <= alfa) break;
  }
  return { mov: mejor, valor: valorMejor };
}

/* Valores de TODAS las jugadas de la raiz (sin poda entre hermanos): sirve
 * para elegir con error ponderado en los niveles bajos. */
function valoresRaiz(posicion, profundidad, estado) {
  var movimientos = ordenar(posicion.movimientosLegales(), posicion);
  var salida = [];
  for (var i = 0; i < movimientos.length; i++) {
    var movimiento = movimientos[i];
    posicion.aplicar(movimiento);
    var valor;
    try {
      valor = alfabeta(posicion, profundidad - 1, -INF, INF, estado);
    } finally {
      posicion.deshacer();
    }
    salida.push({ mov: movimiento, valor: valor });
  }
  return salida;
}

function mejorJugada(posicion, profundidad, opciones) {
  var op = opciones || {};
  var estado = { fecha: op.fecha || 0, nodos: 0, paso: 2048 };
  var res = buscarRaiz(posicion, profundidad, estado, op.fuerte);
  return res ? res.mov : null;
}

/* ------------------------------------------------------------- terminacion */

function claveRepeticion(posicion) {
  var partes = posicion.aFen().split(' ');
  partes[4] = '0';
  partes[5] = '0';
  return partes.join(' ');
}

function terminacion(posicion, conteo) {
  var jugadas = posicion.movimientosLegales();
  if (!jugadas.length) {
    if (posicion.enJaque()) {
      var ganador = posicion.turno ? 'negras' : 'blancas';
      var perdedor = posicion.turno ? 'blancas' : 'negras';
      return 'Jaque mate. Ganaron las ' + ganador + '; perdieron las ' + perdedor + '.';
    }
    return 'Rey ahogado: tablas.';
  }
  if (posicion.materialInsuficiente()) return 'Tablas por material insuficiente.';
  if (posicion.medios >= 100) return 'Tablas por regla de los 50 movimientos.';
  var n = conteo ? conteo[claveRepeticion(posicion)] || 0 : 1;
  if (n >= 2) return 'Tablas por triple repeticion de la posicion.';
  if (posicion.enJaque()) return 'Jaque';
  return '';
}

/* ------------------------------------------------------------------ Engine */

/* Envoltorio publico: estado simple (tablero, turno, enroque...) y los
 * metodos que usa la interfaz. */
function Engine(fen) {
  this.pos = new Posicion(fen || FEN_INICIAL);
  this.historial = [];
  this.claves = [claveRepeticion(this.pos)];
}

Object.defineProperty(Engine.prototype, 'tablero', {
  get: function () { return this.pos.tablero; }
});
Object.defineProperty(Engine.prototype, 'turno', {
  get: function () { return this.pos.turno; }
});
Object.defineProperty(Engine.prototype, 'enroque', {
  get: function () { return this.pos.enroque; }
});
Object.defineProperty(Engine.prototype, 'enPasante', {
  get: function () { return this.pos.enPasante; }
});

Engine.prototype.jugadas_legales = function () {
  return this.pos.movimientosLegales();
};

Engine.prototype.es_jaque = function (color) {
  return this.pos.enJaque(typeof color === 'boolean' ? color : undefined);
};

Engine.prototype.a_fen = function () {
  return this.pos.aFen();
};

Engine.prototype.pieza_en = function (fila, col) {
  return this.pos.tablero[fila][col];
};

/* Aplica una jugada: texto UCI ('e2e4', 'e7e8q'), par (origen, destino) o
 * un Movimiento. Devuelve el Movimiento aplicado o null si es ilegal. */
Engine.prototype.aplicar = function (a, b) {
  var movimiento = null;

  if (a instanceof Movimiento) {
    var legales = this.pos.movimientosLegales();
    for (var i = 0; i < legales.length; i++) {
      var m = legales[i];
      if (iguales(m.origen, a.origen) && iguales(m.destino, a.destino) &&
          (m.promocion || null) === (a.promocion || null)) {
        movimiento = m;
        break;
      }
    }
    if (!movimiento) return null;
  } else if (typeof b === 'string') {
    movimiento = this.pos.movimientoDesdeTexto(String(a) + String(b));
  } else if (typeof a === 'string' && a.length >= 4) {
    movimiento = this.pos.movimientoDesdeTexto(a);
  } else {
    return null;
  }

  if (!movimiento) return null;
  this.pos.aplicar(movimiento);
  this.historial.push(movimiento);
  this.claves.push(claveRepeticion(this.pos));
  return movimiento;
};

/* Deshace la ultima jugada (o la indicada). Devuelve el Movimiento retirado. */
Engine.prototype.deshacer = function (movimiento) {
  if (movimiento) {
    var ultimo = this.historial[this.historial.length - 1];
    if (!ultimo || (ultimo !== movimiento && ultimo.uci !== movimiento.uci)) return null;
  }
  var mov = this.historial.pop();
  if (!mov) return null;
  this.pos.deshacer();
  this.claves.pop();
  return mov;
};

Engine.prototype.terminacion = function () {
  var conteo = {};
  for (var i = 0; i < this.claves.length; i++) {
    conteo[this.claves[i]] = (conteo[this.claves[i]] || 0) + 1;
  }
  return terminacion(this.pos, conteo);
};

Engine.prototype.mejor_jugada = function (profundidad) {
  return mejorJugada(this.pos, profundidad || 3, null);
};

Engine.prototype.sin_jugadas = function () {
  return this.pos.movimientosLegales().length === 0;
};

if (typeof window !== 'undefined') {
  window.FEN_INICIAL = FEN_INICIAL;
  window.Movimiento = Movimiento;
  window.Posicion = Posicion;
  window.Engine = Engine;
  window.evaluar = evaluar;
  window.ordenar = ordenar;
  window.alfabeta = alfabeta;
  window.buscarRaiz = buscarRaiz;
  window.valoresRaiz = valoresRaiz;
  window.mejorJugada = mejorJugada;
  window.terminacion = terminacion;
  window.claveRepeticion = claveRepeticion;
  window.perft = perft;
  window.aTexto = aTexto;
  window.desdeTexto = desdeTexto;
  window.esBlanca = esBlanca;
}
