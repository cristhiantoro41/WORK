/* ia.js - ProductoIA: los 12 niveles de la computadora.
 *
 * Nivel 1 = jugada aleatoria. Niveles 2-4 = profundidad 1 con probabilidad de
 * error (seleccion por softmax sobre los scores con ruido). Niveles 5-7 =
 * profundidad 2 con error decreciente. 8-10 = profundidad 3. 11 = profundidad
 * 4. 12 = busqueda iterativa con limite de tiempo (0.5-1.5 s).
 */
'use strict';

var NIVELES_IA = [
  { nivel: 1, nombre: 'Principiante', modo: 'aleatoria', prof: 0, error: 1, ruido: 0 },
  { nivel: 2, nombre: 'Aprendiz', modo: 'profundidad', prof: 1, error: 0.6, ruido: 200 },
  { nivel: 3, nombre: 'Iniciado', modo: 'profundidad', prof: 1, error: 0.4, ruido: 130 },
  { nivel: 4, nombre: 'Amateur', modo: 'profundidad', prof: 1, error: 0.2, ruido: 80 },
  { nivel: 5, nombre: 'Fácil', modo: 'profundidad', prof: 2, error: 0.15, ruido: 55 },
  { nivel: 6, nombre: 'Competente', modo: 'profundidad', prof: 2, error: 0.1, ruido: 40 },
  { nivel: 7, nombre: 'Hábil', modo: 'profundidad', prof: 2, error: 0.05, ruido: 25 },
  { nivel: 8, nombre: 'Difícil', modo: 'busqueda', prof: 3, error: 0, ruido: 0, tiempo: 3000 },
  { nivel: 9, nombre: 'Fuerte', modo: 'busqueda', prof: 3, error: 0, ruido: 0, tiempo: 3500 },
  { nivel: 10, nombre: 'Muy fuerte', modo: 'busqueda', prof: 3, error: 0, ruido: 0, tiempo: 4000 },
  { nivel: 11, nombre: 'Maestro', modo: 'busqueda', prof: 4, error: 0, ruido: 0, fuerte: true, tiempo: 4000 },
  { nivel: 12, nombre: 'Imbatible (IA de élite)', modo: 'busqueda', prof: 10, error: 0, ruido: 0,
    fuerte: true, iterativa: true, tiempo: 1200 }
];

function configurarNivel(nivel) {
  var n = Math.max(1, Math.min(12, Math.round(Number(nivel) || 1)));
  return NIVELES_IA[n - 1];
}

function nombreNivel(nivel) {
  return configurarNivel(nivel).nombre;
}

function posicionDe(motor) {
  return motor && motor.pos ? motor.pos : motor;
}

function elegirAleatoria(legales) {
  return legales[Math.floor(Math.random() * legales.length)];
}

/* Seleccion ponderada (softmax) entre las jugadas que no son la peor. */
function elegirConError(valores, probabilidadError, ruido) {
  if (valores.length === 1) return valores[0].mov;
  var orden = valores.slice().sort(function (a, b) { return b.valor - a.valor; });
  if (Math.random() >= probabilidadError) return orden[0].mov;

  var peor = orden[orden.length - 1].valor;
  var candidatos = orden.filter(function (v) { return v.valor > peor; });
  if (!candidatos.length) candidatos = orden;

  var temperatura = ruido > 0 ? ruido : 1;
  var max = candidatos[0].valor;
  var pesos = [];
  var total = 0;
  for (var i = 0; i < candidatos.length; i++) {
    var w = Math.exp((candidatos[i].valor - max) / temperatura);
    pesos.push(w);
    total += w;
  }
  var azar = Math.random() * total;
  for (var j = 0; j < candidatos.length; j++) {
    azar -= pesos[j];
    if (azar <= 0) return candidatos[j].mov;
  }
  return candidatos[0].mov;
}

/* Devuelve la jugada UCI que juega la IA, o null si no hay jugadas.
 * `tiempoMaximo` (ms) limita la busqueda para que nunca se cuelgue el movil. */
function moverIA(motor, nivel, tiempoMaximo) {
  var pos = posicionDe(motor);
  var cfg = configurarNivel(nivel);
  var legales = pos.movimientosLegales();
  if (!legales.length) return null;

  if (cfg.modo === 'aleatoria') return elegirAleatoria(legales).uci;

  var fecha = Date.now() + (Number(tiempoMaximo) > 0 ? Number(tiempoMaximo) : (cfg.tiempo || 3000));
  var estado = { fecha: fecha, nodos: 0, paso: 2048 };
  var movimiento = null;

  if (cfg.error > 0) {
    var valores;
    try {
      valores = valoresRaiz(pos, cfg.prof, estado);
    } catch (e) {
      if (!e.tiempo) throw e;
      valores = valoresRaiz(pos, 1, { fecha: 0, nodos: 0, paso: 1000000000 });
    }
    if (!valores.length) return null;
    movimiento = elegirConError(valores, cfg.error, cfg.ruido);
    return movimiento.uci;
  }

  var mejor = null;
  for (var d = 1; d <= cfg.prof; d++) {
    var res;
    try {
      res = buscarRaiz(pos, d, estado, cfg.fuerte);
    } catch (e2) {
      if (e2.tiempo) break;
      throw e2;
    }
    if (res && res.mov) mejor = res;
    if (fecha && Date.now() >= fecha) break;
  }
  return mejor ? mejor.mov.uci : elegirAleatoria(legales).uci;
}

/* Alias pedido en la especificacion. */
function mover(motor, nivel, tiempoMaximo) {
  return moverIA(motor, nivel, tiempoMaximo);
}

if (typeof window !== 'undefined') {
  window.NIVELES_IA = NIVELES_IA;
  window.configurarNivel = configurarNivel;
  window.nombreNivel = nombreNivel;
  window.moverIA = moverIA;
  window.mover = mover;
}
