/* numeros.js - Numeracion propia 1-64 y reglas de multiplicacion (port de numeracion.py).
 *
 * REGLA VIGENTE: multiplican SOLO peon x peon y peon x pieza menor
 * (caballo/alfil). La dama y la torre NUNCA multiplican al capturar.
 * Caballo/alfil/rey como atacantes NUNCA multiplican.
 * Producto = numero_origen x numero_destino (maximo 4 cifras, tope 9999).
 * Si un producto se REPITE en la misma partida se anota solo la primera vez.
 */
'use strict';

var CIFRAS_MAXIMAS = 4;
var TOPE = 9999;
var VACIA_NUM = '.';

var NUMEROS = {
  a1: 7, b1: 18, c1: 45, d1: 30, e1: 5, f1: 16, g1: 43, h1: 28,
  a2: 46, b2: 31, c2: 6, d2: 17, e2: 44, f2: 29, g2: 4, h2: 15,
  a3: 19, b3: 8, c3: 55, d3: 52, e3: 59, f3: 64, g3: 27, h3: 42,
  a4: 32, b4: 47, c4: 58, d4: 61, e4: 56, f4: 53, g4: 14, h4: 3,
  a5: 9, b5: 20, c5: 51, d5: 54, e5: 63, f5: 60, g5: 41, h5: 26,
  a6: 48, b6: 33, c6: 62, d6: 57, e6: 38, f6: 25, g6: 2, h6: 13,
  a7: 21, b7: 10, c7: 35, d7: 50, e7: 23, f7: 12, g7: 37, h7: 40,
  a8: 34, b8: 49, c8: 22, d8: 11, e8: 36, f8: 39, g8: 24, h8: 1
};

var INVERSA = {};

var PIEZAS_CORTAS = {
  K: 'R',
  Q: 'D',
  R: 'T',
  B: '¿',
  N: '"',
  P: 'P'
};

(function construirInversa() {
  Object.keys(NUMEROS).forEach(function (casilla) {
    INVERSA[NUMEROS[casilla]] = casilla;
  });
})();

function numero(casilla) {
  var clave = String(casilla).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(NUMEROS, clave)) {
    throw new Error('La casilla ' + casilla + ' no existe');
  }
  return NUMEROS[clave];
}

function casillaDe(valor) {
  return Object.prototype.hasOwnProperty.call(INVERSA, valor) ? INVERSA[valor] : null;
}

function casillaDeFilaCol(fila, col) {
  return String.fromCharCode(97 + col) + String(8 - fila);
}

function nombrePieza(pieza) {
  var p = String(pieza).toUpperCase();
  return PIEZAS_CORTAS[p] || p;
}

function etiqueta(pieza, casilla) {
  if (pieza === VACIA_NUM || pieza === undefined || pieza === null) return '·';
  if (String(pieza).toUpperCase() === 'P') return String(numero(casilla));
  return PIEZAS_CORTAS[String(pieza).toUpperCase()];
}

/* Etiqueta de una casilla a partir de fila/col (fila 0 = fila 8 del tablero). */
function etiquetaPieza(pieza, fila, col) {
  return etiqueta(pieza, casillaDeFilaCol(fila, col));
}

/* Multiplican peon x peon y peon x pieza menor. */
function esMultiplicacion(atacante, victima) {
  var ataca = String(atacante).toUpperCase();
  if (ataca === 'P') {
    return 'PNB'.indexOf(String(victima).toUpperCase()) >= 0;
  }
  return false;
}

function productoDe(numOrigen, numDestino) {
  var valor = numOrigen * numDestino;
  return valor <= TOPE ? valor : null;
}

/* Una captura registrada de la partida. */
function CapturaRegistro(jugada, color, atacante, victima, origen, destino) {
  this.jugada = jugada || '';
  this.color = color;                 /* true = blancas */
  this.atacante = atacante;
  this.victima = victima;
  this.origen = origen;
  this.destino = destino;
  this.numOrigen = numero(origen);
  this.numDestino = numero(destino);
  this.multiplica = esMultiplicacion(atacante, victima);
  this.producto = this.multiplica ? productoDe(this.numOrigen, this.numDestino) : null;
  this.repetido = false;
}

CapturaRegistro.prototype.bando = function () {
  return this.color ? 'blancas' : 'negras';
};

/* Resultado legible: '56x54=3024', '3024 (repetido)' o '54 (sin multiplicar)'. */
CapturaRegistro.prototype.resultado = function () {
  if (this.producto === null) {
    if (this.multiplica) {
      return (this.numOrigen * this.numDestino) + ' (supera ' + CIFRAS_MAXIMAS + ' cifras)';
    }
    return this.numDestino + ' (sin multiplicar)';
  }
  if (this.repetido) return this.producto + ' (repetido)';
  return this.numOrigen + 'x' + this.numDestino + '=' + this.producto;
};

/* Registra una captura aplicando el dedupe: un producto repetido se anota
 * una sola vez y no vuelve a sumarse. Devuelve el registro. */
function registrarCaptura(historialCapturas, jugada, color, atacante, victima, origen, destino) {
  var registro = new CapturaRegistro(jugada, color, atacante, victima, origen, destino);
  if (registro.producto !== null) {
    for (var i = 0; i < historialCapturas.length; i++) {
      if (historialCapturas[i].producto === registro.producto) {
        registro.repetido = true;
        break;
      }
    }
  }
  historialCapturas.push(registro);
  return registro;
}

/* Resumen de la partida: capturas, multiplicaciones, repetidos y suma. */
function resumenCapturas(historialCapturas) {
  var unicos = [];
  var repetidos = 0;
  var multiplicaciones = 0;

  for (var i = 0; i < historialCapturas.length; i++) {
    var c = historialCapturas[i];
    if (c.multiplica) multiplicaciones++;
    if (c.producto === null) continue;
    if (unicos.indexOf(c.producto) >= 0) {
      repetidos++;
    } else {
      unicos.push(c.producto);
    }
  }

  var suma = 0;
  for (var j = 0; j < unicos.length; j++) suma += unicos[j];

  return {
    capturas: historialCapturas.length,
    multiplicaciones: multiplicaciones,
    productos: unicos,
    repetidos: repetidos,
    suma: suma,
    huella: unicos.length ? unicos.join('-') : 'sin productos',
    maximo: TOPE
  };
}

if (typeof window !== 'undefined') {
  window.NUMEROS = NUMEROS;
  window.PIEZAS_CORTAS = PIEZAS_CORTAS;
  window.CIFRAS_MAXIMAS = CIFRAS_MAXIMAS;
  window.TOPE = TOPE;
  window.numero = numero;
  window.casillaDe = casillaDe;
  window.casillaDeFilaCol = casillaDeFilaCol;
  window.nombrePieza = nombrePieza;
  window.etiqueta = etiqueta;
  window.etiquetaPieza = etiquetaPieza;
  window.esMultiplicacion = esMultiplicacion;
  window.productoDe = productoDe;
  window.CapturaRegistro = CapturaRegistro;
  window.registrarCaptura = registrarCaptura;
  window.resumenCapturas = resumenCapturas;
}
