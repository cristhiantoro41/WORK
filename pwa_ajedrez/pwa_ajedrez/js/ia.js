/* ia.js - ProductoIA: los 12 niveles de la computadora.
 *
 * Nivel 1 = jugada aleatoria. Niveles 2-7 = profundidad fija (1 o 2) con
 * probabilidad de error (seleccion por softmax sobre los scores). Niveles
 * 8-12 = busqueda iterativa con limite de tiempo: cuanto mas alto el nivel,
 * mas tiempo piensa y mas profundo analiza.
 */
'use strict';

var NIVELES_IA = [
  { nivel: 1, nombre: 'Principiante', modo: 'aleatoria', prof: 0, error: 1, ruido: 0 },
  { nivel: 2, nombre: 'Aprendiz', modo: 'profundidad', prof: 1, error: 0.55, ruido: 140 },
  { nivel: 3, nombre: 'Iniciado', modo: 'profundidad', prof: 1, error: 0.3, ruido: 90 },
  { nivel: 4, nombre: 'Amateur', modo: 'profundidad', prof: 1, error: 0.1, ruido: 60 },
  { nivel: 5, nombre: 'Facil', modo: 'profundidad', prof: 2, error: 0.15, ruido: 50 },
  { nivel: 6, nombre: 'Competente', modo: 'profundidad', prof: 2, error: 0.07, ruido: 32 },
  { nivel: 7, nombre: 'Habil', modo: 'profundidad', prof: 2, error: 0.02, ruido: 18 },
  { nivel: 8, nombre: 'Dificil', modo: 'iterativa', tiempo: 400, fuerte: false },
  { nivel: 9, nombre: 'Fuerte', modo: 'iterativa', tiempo: 800, fuerte: true },
  { nivel: 10, nombre: 'Muy fuerte', modo: 'iterativa', tiempo: 1200, fuerte: true },
  { nivel: 11, nombre: 'Maestro', modo: 'iterativa', tiempo: 1700, fuerte: true },
  { nivel: 12, nombre: 'Imbatible (IA de elite)', modo: 'iterativa', tiempo: 2500, fuerte: true }
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

/* Busqueda iterativa con limite de tiempo: empieza en profundidad 1 y sube
 * hasta que se acabe el tiempo; conserva la mejor jugada de la ultima
 * iteracion completa. `maxProfundidad` evita procesos infinitos. */
function moverIterativa(pos, cfg, tiempoMaximo) {
  var limite = Number(tiempoMaximo) > 0 ? Number(tiempoMaximo) : (cfg.tiempo || 2500);
  var tope = Date.now() + limite;
  var mejor = null;
  var res = null;

  for (var d = 1; d <= 10; d++) {
    var estado = {
      fecha: tope,
      nodos: 0,
      paso: 1024,
      mejor: mejor && mejor.mov ? mejor.mov : null
    };
    try {
      res = buscarRaiz(pos, d, estado, cfg.fuerte);
    } catch (e) {
      if (e.tiempo) break;
      throw e;
    }
    if (res && res.mov) mejor = res;
    if (Date.now() > tope) break;
  }
  return mejor ? mejor.mov.uci : null;
}

/* Devuelve la jugada UCI que juega la IA, o null si no hay jugadas.
 * `tiempoMaximo` (ms) limita la busqueda para que nunca se cuelgue el movil. */
function moverIA(motor, nivel, tiempoMaximo) {
  var pos = posicionDe(motor);
  var cfg = configurarNivel(nivel);
  var legales = pos.movimientosLegales();
  if (!legales.length) return null;

  if (cfg.modo === 'aleatoria') return elegirAleatoria(legales).uci;

  if (cfg.modo === 'iterativa') return moverIterativa(pos, cfg, tiempoMaximo);

  var fecha = Date.now() + (Number(tiempoMaximo) > 0 ? Number(tiempoMaximo) : 1200);
  var estado = { fecha: fecha, nodos: 0, paso: 2048 };
  var movimiento = null;

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