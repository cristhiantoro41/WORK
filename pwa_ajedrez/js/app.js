/* app.js - Interfaz completa de la PWA: tablero, IA, historial, capturas,
 * reloj, sonido, preferencias, instalacion y service worker.
 */
'use strict';

var UI = {
  motor: new Engine(),
  nivel: 6,
  humanoEsBlancas: true,
  sonido: true,
  tema: 'oscuro',
  numeros: false,
  reloj: false,
  minutos: 10,
  invertido: false,
  seleccion: null,
  destinos: [],
  ultimo: null,
  jugadas: [],
  capturas: [],
  estado: '',
  avisoTexto: '',
  fin: false,
  pensando: false,
  ocultarOrigen: null,
  relojes: { blancas: 600, negras: 600 },
  tick: null,
  relojArrancado: false
};

var arrastre = {
  activo: false,
  iniciado: false,
  origen: null,
  px: 0,
  py: 0,
  offX: 0,
  offY: 0,
  fantasma: null,
  marca: null,
  casilla: null
};

var pendientePromocion = null;
var avisoPrompt = null;
var audioCtx = null;

function $(sel) { return document.querySelector(sel); }
function id(n) { return document.getElementById(n); }

/* ------------------------------------------------------------------ audio */

function prepararAudio() {
  try {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* sin audio */ }
}

function sonar(tipo) {
  if (!UI.sonido) return;
  try {
    prepararAudio();
    if (!audioCtx) return;
    var mapa = {
      mover: [430, 0.09, 'square'],
      ia: [350, 0.09, 'triangle'],
      capturar: [690, 0.14, 'square'],
      jaque: [880, 0.18, 'sawtooth'],
      fin: [300, 0.5, 'triangle']
    };
    var cfg = mapa[tipo] || mapa.mover;
    var t0 = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gan = audioCtx.createGain();
    osc.type = cfg[2];
    osc.frequency.setValueAtTime(cfg[0], t0);
    if (tipo === 'fin') osc.frequency.linearRampToValueAtTime(160, t0 + cfg[1]);
    gan.gain.setValueAtTime(0.0001, t0);
    gan.gain.exponentialRampToValueAtTime(0.16, t0 + 0.012);
    gan.gain.exponentialRampToValueAtTime(0.0001, t0 + cfg[1]);
    osc.connect(gan);
    gan.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + cfg[1] + 0.02);
  } catch (e) { /* sin audio */ }
}

/* ------------------------------------------------------------ preferencias */

function cargarPrefs() {
  try {
    var bruto = localStorage.getItem('ajedrez164');
    if (!bruto) return;
    var p = JSON.parse(bruto);
    if (p.nivel) UI.nivel = p.nivel;
    if (typeof p.color === 'boolean') UI.humanoEsBlancas = p.color;
    if (typeof p.sonido === 'boolean') UI.sonido = p.sonido;
    if (p.tema) UI.tema = p.tema;
    if (typeof p.numeros === 'boolean') UI.numeros = p.numeros;
    if (typeof p.reloj === 'boolean') UI.reloj = p.reloj;
    if (p.minutos) UI.minutos = p.minutos;
  } catch (e) { /* sin preferencias */ }
}

function guardarPrefs() {
  try {
    localStorage.setItem('ajedrez164', JSON.stringify({
      nivel: UI.nivel,
      color: UI.humanoEsBlancas,
      sonido: UI.sonido,
      tema: UI.tema,
      numeros: UI.numeros,
      reloj: UI.reloj,
      minutos: UI.minutos
    }));
  } catch (e) { /* sin almacenamiento */ }
}

/* -------------------------------------------------------------- utilidades */

function esFin(estado) {
  if (!estado) return false;
  return estado.indexOf('Jaque mate') === 0 ||
         estado.indexOf('Rey ahogado') === 0 ||
         estado.indexOf('Tablas') === 0;
}

function esTurnoHumano() {
  return !UI.fin && !UI.pensando && UI.motor.turno === UI.humanoEsBlancas;
}

function esTurnoIA() {
  return !UI.fin && !UI.pensando && UI.motor.turno !== UI.humanoEsBlancas;
}

function vert(fila, col) {
  return UI.invertido ? [7 - fila, 7 - col] : [fila, col];
}

function desvert(vr, vc) {
  return UI.invertido ? [7 - vr, 7 - vc] : [vr, vc];
}

function textoJugada(mov, atacante, victima, captura) {
  if (mov.enroque) return mov.destino[1] > mov.origen[1] ? 'O-O' : 'O-O-O';
  if (captura) {
    if (captura.producto !== null) {
      return captura.numOrigen + 'x' + captura.numDestino + '=' + captura.producto;
    }
    return captura.numOrigen + 'x' + captura.numDestino;
  }
  return mov.uci;
}

function avisoDeCaptura(captura) {
  var previos = [];
  for (var i = 0; i < UI.capturas.length - 1; i++) {
    if (UI.capturas[i].producto !== null) previos.push(UI.capturas[i].producto);
  }
  var texto = 'CAPTURA ' + nombrePieza(captura.atacante) + ' x ' +
    nombrePieza(captura.victima) + ' en casilla ' + captura.numDestino + '  ->  ';
  if (captura.producto === null) {
    texto += captura.numDestino + ' (sin multiplicar)';
  } else if (previos.indexOf(captura.producto) >= 0) {
    texto += captura.producto + ' (repetido)';
  } else {
    texto += captura.numOrigen + 'x' + captura.numDestino + '=' + captura.producto;
  }
  return texto;
}

/* ------------------------------------------------------------------ render */

function render() {
  renderTablero();
  renderHistorial();
  renderCapturas();
  renderAviso();
  renderBotones();
}

function renderTablero() {
  var t = id('tablero');
  var html = '';
  var enJaque = UI.motor.es_jaque();
  var reyJaque = enJaque ? UI.motor.pos.casillaRey(UI.motor.turno) : null;
  var letras = 'abcdefgh';

  for (var vr = 0; vr < 8; vr++) {
    for (var vc = 0; vc < 8; vc++) {
      var par = desvert(vr, vc);
      var fila = par[0];
      var col = par[1];
      var casilla = fila + ',' + col;
      var pieza = UI.motor.tablero[fila][col];
      var claro = (fila + col) % 2 === 0;
      var clases = ['casilla', claro ? 'claro' : 'oscuro'];

      if (UI.ultimo && (UI.ultimo.origen[0] === fila && UI.ultimo.origen[1] === col ||
                        UI.ultimo.destino[0] === fila && UI.ultimo.destino[1] === col)) {
        clases.push('ultimo');
      }
      if (UI.seleccion && UI.seleccion[0] === fila && UI.seleccion[1] === col) {
        clases.push('seleccion');
      }
      if (reyJaque && reyJaque[0] === fila && reyJaque[1] === col) clases.push('jaque');

      html += '<div class="' + clases.join(' ') + '" data-fila="' + fila + '" data-col="' + col + '" role="gridcell">';

      if (vr === 7) html += '<span class="coord coord-file">' + letras[col] + '</span>';
      if (vc === 0) html += '<span class="coord coord-rank">' + (8 - fila) + '</span>';

      if (pieza === '.' || UI.numeros || (UI.ocultarOrigen && UI.ocultarOrigen[0] === fila && UI.ocultarOrigen[1] === col)) {
        html += '<span class="num-casilla">' + NUMEROS[letras[col] + (8 - fila)] + '</span>';
      }

      var oculta = UI.ocultarOrigen && UI.ocultarOrigen[0] === fila && UI.ocultarOrigen[1] === col;
      if (pieza !== '.' && !oculta) {
        var etiquetaTexto = etiqueta(pieza, letras[col] + (8 - fila));
        var blanca = esBlanca(pieza);
        html += '<div class="pieza ' + (blanca ? 'blanca' : 'negra') +
          (etiquetaTexto.length > 1 ? ' dos' : '') + '" data-pieza="' + pieza + '">' +
          etiquetaTexto + '</div>';
      }

      for (var d = 0; d < UI.destinos.length; d++) {
        var m = UI.destinos[d];
        if (m.destino[0] === fila && m.destino[1] === col) {
          var ocupada = UI.motor.tablero[fila][col] !== '.' || m.enPasante;
          html += '<span class="marcador' + (ocupada ? ' anillo' : '') + '"></span>';
        }
      }

      html += '</div>';
    }
  }
  t.innerHTML = html;
}

function renderHistorial() {
  var ol = id('historial');
  if (!UI.jugadas.length) {
    ol.innerHTML = '<li class="vacio">La partida no ha empezado.</li>';
  } else {
    var html = '';
    for (var i = 0; i < UI.jugadas.length; i++) {
      var j = UI.jugadas[i];
      var clase = j.captura && j.captura.producto !== null && !j.captura.repetido ? ' class="mul"' : '';
      html += '<li><span class="num">' + j.rotulo + '</span>' +
        '<span class="txt"' + clase + '>' + j.texto + '</span></li>';
    }
    ol.innerHTML = html;
    ol.scrollTop = ol.scrollHeight;
  }

  var blancas = '';
  var negras = '';
  for (var k = 0; k < UI.capturas.length; k++) {
    var c = UI.capturas[k];
    var chip = '<span class="ficha ' + (esBlanca(c.victima) ? 'blanca' : 'negra') + '">' +
      nombrePieza(c.victima) + '</span>';
    if (c.color) blancas += chip;
    else negras += chip;
  }
  id('fichas-blancas').innerHTML = blancas || '<span class="vacio">—</span>';
  id('fichas-negras').innerHTML = negras || '<span class="vacio">—</span>';
}

function renderCapturas() {
  var cuerpo = id('cuerpo-capturas');
  if (!UI.capturas.length) {
    cuerpo.innerHTML = '<tr><td colspan="5" class="vacio">Sin capturas todavia.</td></tr>';
  } else {
    var html = '';
    for (var i = 0; i < UI.capturas.length; i++) {
      var c = UI.capturas[i];
      var res = c.resultado();
      html += '<tr>' +
        '<td>' + c.jugada + '</td>' +
        '<td>' + nombrePieza(c.atacante) + ' x ' + nombrePieza(c.victima) + '</td>' +
        '<td>' + c.origen + '=' + c.numOrigen + '</td>' +
        '<td>' + c.destino + '=' + c.numDestino + '</td>' +
        '<td class="res' + (c.repetido ? ' rep' : '') + '">' + res + '</td>' +
        '</tr>';
    }
    cuerpo.innerHTML = html;
  }

  var r = resumenCapturas(UI.capturas);
  id('res-capturas').textContent = r.capturas;
  id('res-mult').textContent = r.multiplicaciones;
  id('res-repetidos').textContent = r.repetidos;
  id('res-suma').textContent = r.suma;
  id('huella').textContent = 'Huella (productos distintos): ' + r.huella;
}

function renderAviso() {
  var a = id('aviso');
  a.className = 'aviso';
  if (UI.fin && UI.estado) {
    a.className = 'aviso fin';
    a.textContent = UI.estado;
    return;
  }
  if (UI.pensando) {
    a.textContent = 'La computadora esta pensando... (nivel ' + UI.nivel + ')';
    return;
  }
  if (UI.avisoTexto) {
    a.className = 'aviso captura';
    a.textContent = UI.avisoTexto;
    return;
  }
  var bando = UI.motor.turno ? 'blancas' : 'negras';
  a.textContent = (UI.ultimo ? 'Ultima jugada: ' + UI.ultimo.uci + '. ' : 'Sin capturas todavia. ') +
    'Toca mover las ' + bando + '.';
}

function renderBotones() {
  id('btn-deshacer').disabled = UI.jugadas.length === 0 || UI.pensando;
  id('btn-numeros').classList.toggle('activo', UI.numeros);
  id('btn-numeros-top').classList.toggle('activo', UI.numeros);
  id('btn-sonido').classList.toggle('activo', UI.sonido);
  id('btn-numeros').textContent = UI.numeros ? 'Ocultar números 1-64' : 'Mostrar números 1-64';
  id('btn-sonido2').textContent = 'Sonido: ' + (UI.sonido ? 'sí' : 'no');
  id('btn-tema2').textContent = 'Tema: ' + UI.tema;
  id('relojes').hidden = !UI.reloj;
  pintarRelojes();
}

function pintarRelojes() {
  var b = id('reloj-blancas');
  var n = id('reloj-negras');
  if (!UI.reloj) return;
  var activoBlancas = !UI.fin && UI.motor.turno;
  b.querySelector('.reloj-tiempo').textContent = formatoTiempo(UI.relojes.blancas);
  n.querySelector('.reloj-tiempo').textContent = formatoTiempo(UI.relojes.negras);
  b.classList.toggle('activo', activoBlancas);
  n.classList.toggle('activo', !activoBlancas && !UI.fin);
  b.classList.toggle('critico', UI.relojes.blancas < 20);
  n.classList.toggle('critico', UI.relojes.negras < 20);
}

function formatoTiempo(segundos) {
  var s = Math.max(0, Math.ceil(segundos));
  var m = Math.floor(s / 60);
  var r = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

/* ------------------------------------------------------------------ reloj */

function arrancarReloj() {
  if (!UI.reloj || UI.tick) return;
  UI.relojArrancado = true;
  UI.tick = setInterval(function () {
    if (UI.fin) { detenerReloj(); return; }
    var clave = UI.motor.turno ? 'blancas' : 'negras';
    UI.relojes[clave] = Math.max(0, UI.relojes[clave] - 0.1);
    if (UI.relojes[clave] <= 0) {
      detenerReloj();
      finPorTiempo(clave);
      return;
    }
    pintarRelojes();
  }, 100);
}

function detenerReloj() {
  if (UI.tick) { clearInterval(UI.tick); UI.tick = null; }
}

function finPorTiempo(clave) {
  UI.fin = true;
  UI.estado = 'Se acabo el tiempo de las ' + clave + '. Gana la otra parte.';
  UI.avisoTexto = '';
  sonar('fin');
  render();
  mostrarFin();
}

/* ---------------------------------------------------------------- jugadas */

function candidatosDestino(casilla) {
  return UI.destinos.filter(function (m) {
    return m.destino[0] === casilla[0] && m.destino[1] === casilla[1];
  });
}

function ejecutarCandidatas(cand) {
  if (!cand.length) return false;
  if (cand.length > 1) {
    var conEnroque = cand.filter(function (m) { return m.enroque; });
    if (conEnroque.length) return aplicarMov(conEnroque[0]);
    if (cand[0].promocion) {
      pendientePromocion = cand;
      id('modal-promocion').hidden = false;
      return true;
    }
  }
  return aplicarMov(cand[0]);
}

function aplicarMov(mov) {
  id('modal-promocion').hidden = true;
  pendientePromocion = null;

  var t = UI.motor;
  var atacante = t.tablero[mov.origen[0]][mov.origen[1]];
  var victima = mov.enPasante
    ? t.tablero[mov.origen[0]][mov.destino[1]]
    : t.tablero[mov.destino[0]][mov.destino[1]];

  var indice = UI.jugadas.length;
  var rotulo = Math.floor(indice / 2) + 1 + (indice % 2 === 0 ? '.' : '...');

  var captura = null;
  if (victima && victima !== '.') {
    captura = registrarCaptura(UI.capturas, rotulo, esBlanca(atacante), atacante, victima,
      aTexto(mov.origen), aTexto(mov.destino));
  }

  var aplicado = t.aplicar(mov);
  if (!aplicado) return false;

  UI.jugadas.push({
    rotulo: rotulo,
    mov: aplicado,
    captura: captura,
    texto: textoJugada(aplicado, atacante, victima, captura)
  });
  UI.ultimo = aplicado;
  UI.seleccion = null;
  UI.destinos = [];
  UI.ocultarOrigen = null;

  UI.estado = t.terminacion();
  if (captura) {
    UI.avisoTexto = avisoDeCaptura(captura);
    sonar('capturar');
  } else {
    UI.avisoTexto = '';
    sonar('mover');
  }

  if (esFin(UI.estado)) {
    UI.fin = true;
    sonar('fin');
    render();
    mostrarFin();
    return true;
  }
  if (UI.estado === 'Jaque') sonar('jaque');

  if (!UI.relojArrancado) arrancarReloj();

  render();
  if (esTurnoIA()) responderIA();
  return true;
}

function responderIA() {
  if (UI.fin || UI.pensando || UI.motor.turno === UI.humanoEsBlancas) return;
  UI.pensando = true;
  render();
  setTimeout(function () {
    var uci = null;
    try {
      uci = mover(UI.motor, UI.nivel);
    } catch (e) {
      uci = null;
    }
    UI.pensando = false;
    if (UI.fin) { render(); return; }
    if (!uci) {
      UI.estado = UI.motor.terminacion();
      UI.fin = true;
      render();
      mostrarFin();
      return;
    }
    var mov = UI.motor.pos.movimientoDesdeTexto(uci);
    if (!mov) {
      render();
      return;
    }
    aplicarMov(mov);
  }, 140);
}

function quitarJugada() {
  var j = UI.jugadas.pop();
  if (!j) return false;
  UI.motor.deshacer();
  if (j.captura) UI.capturas.pop();
  return true;
}

function deshacer() {
  if (UI.pensando || !UI.jugadas.length) return;
  quitarJugada();
  if (UI.motor.turno !== UI.humanoEsBlancas && UI.jugadas.length) quitarJugada();

  UI.fin = false;
  UI.estado = UI.motor.terminacion();
  UI.ultimo = UI.jugadas.length ? UI.jugadas[UI.jugadas.length - 1].mov : null;
  UI.avisoTexto = '';
  UI.seleccion = null;
  UI.destinos = [];
  id('modal-fin').hidden = true;
  render();
}

/* ------------------------------------------------------------- partidas */

function nuevaPartida() {
  UI.motor = new Engine();
  UI.jugadas = [];
  UI.capturas = [];
  UI.ultimo = null;
  UI.seleccion = null;
  UI.destinos = [];
  UI.ocultarOrigen = null;
  UI.estado = '';
  UI.fin = false;
  UI.pensando = false;
  UI.avisoTexto = '';
  UI.invertido = !UI.humanoEsBlancas;
  UI.relojes.blancas = UI.minutos * 60;
  UI.relojes.negras = UI.minutos * 60;
  UI.relojArrancado = false;
  detenerReloj();
  id('modal-fin').hidden = true;
  id('modal-promocion').hidden = true;
  limpiarArrastre();
  render();
  if (UI.reloj) arrancarReloj();
  if (esTurnoIA()) responderIA();
}

function mostrarFin() {
  id('fin-titulo').textContent = 'Fin de la partida';
  id('fin-texto').textContent = UI.estado || 'La partida ha terminado.';
  var r = resumenCapturas(UI.capturas);
  id('fin-resumen').innerHTML =
    'Capturas: <b>' + r.capturas + '</b> · Multiplicaciones: <b>' + r.multiplicaciones +
    '</b><br>Repetidos: <b>' + r.repetidos + '</b> · Suma de productos: <b>' + r.suma + '</b>';
  id('modal-fin').hidden = false;
}

function toast(texto) {
  var t = id('toast');
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(toast._id);
  toast._id = setTimeout(function () { t.hidden = true; }, 2600);
}

/* ------------------------------------------------------------- puntero */

function punteroACasilla(ev) {
  var t = id('tablero');
  var rect = t.getBoundingClientRect();
  var x = ev.clientX - rect.left;
  var y = ev.clientY - rect.top;
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
  var vc = Math.floor(x / (rect.width / 8));
  var vr = Math.floor(y / (rect.height / 8));
  if (vc < 0 || vc > 7 || vr < 0 || vr > 7) return null;
  return desvert(vr, vc);
}

function limpiarArrastre() {
  if (arrastre.fantasma && arrastre.fantasma.parentNode) {
    arrastre.fantasma.parentNode.removeChild(arrastre.fantasma);
  }
  if (arrastre.marca && arrastre.marca.parentNode) {
    arrastre.marca.parentNode.removeChild(arrastre.marca);
  }
  arrastre.fantasma = null;
  arrastre.marca = null;
  arrastre.activo = false;
  arrastre.iniciado = false;
  arrastre.origen = null;
  arrastre.casilla = null;
  UI.ocultarOrigen = null;
}

function iniciarFantasma(ev) {
  var t = id('tablero');
  var pieza = UI.motor.tablero[arrastre.origen[0]][arrastre.origen[1]];
  if (pieza === '.') return;
  arrastre.iniciado = true;
  UI.ocultarOrigen = arrastre.origen;

  var letras = 'abcdefgh';
  var nombre = letras[arrastre.origen[1]] + (8 - arrastre.origen[0]);
  var texto = etiqueta(pieza, nombre);

  render();

  var g = document.createElement('div');
  g.className = 'pieza ' + (esBlanca(pieza) ? 'blanca' : 'negra') + ' pieza-fantasma' +
    (texto.length > 1 ? ' dos' : '');
  g.textContent = texto;
  t.appendChild(g);
  arrastre.fantasma = g;

  var marca = document.createElement('div');
  marca.className = 'marca-hover';
  t.appendChild(marca);
  arrastre.marca = marca;

  moverFantasma(ev);
}

function moverFantasma(ev) {
  var t = id('tablero');
  var rect = t.getBoundingClientRect();
  if (arrastre.fantasma) {
    arrastre.fantasma.style.left = (ev.clientX - rect.left) + 'px';
    arrastre.fantasma.style.top = (ev.clientY - rect.top) + 'px';
  }
  var c = punteroACasilla(ev);
  if (!c) {
    if (arrastre.marca) arrastre.marca.style.display = 'none';
    return;
  }
  arrastre.casilla = c;
  if (arrastre.marca) {
    arrastre.marca.style.display = '';
    var v = vert(c[0], c[1]);
    arrastre.marca.style.left = (v[1] * 12.5) + '%';
    arrastre.marca.style.top = (v[0] * 12.5) + '%';
    var legal = UI.destinos.some(function (m) {
      return m.destino[0] === c[0] && m.destino[1] === c[1];
    });
    arrastre.marca.classList.toggle('mala', !legal);
  }
}

function enPuntero(ev) {
  var t = id('tablero');
  var rect = t.getBoundingClientRect();
  return ev.clientX >= rect.left && ev.clientX <= rect.right &&
         ev.clientY >= rect.top && ev.clientY <= rect.bottom;
}

function configurarEventos() {
  var t = id('tablero');

  t.addEventListener('pointerdown', function (ev) {
    prepararAudio();
    if (!esTurnoHumano()) return;
    var c = punteroACasilla(ev);
    if (!c) return;

    arrastre.activo = false;
    arrastre.iniciado = false;
    arrastre.origen = null;
    arrastre.px = ev.clientX;
    arrastre.py = ev.clientY;

    if (UI.seleccion) {
      var cand = candidatosDestino(c);
      if (cand.length) {
        ejecutarCandidatas(cand);
        return;
      }
    }

    var pieza = UI.motor.tablero[c[0]][c[1]];
    if (pieza !== '.' && esBlanca(pieza) === UI.motor.turno) {
      UI.seleccion = c;
      UI.destinos = UI.motor.jugadas_legales().filter(function (m) {
        return m.origen[0] === c[0] && m.origen[1] === c[1];
      });
      arrastre.activo = true;
      arrastre.origen = c;
      var rect = t.getBoundingClientRect();
      var tam = rect.width / 8;
      var v = vert(c[0], c[1]);
      arrastre.offX = ev.clientX - (rect.left + (v[1] + 0.5) * tam);
      arrastre.offY = ev.clientY - (rect.top + (v[0] + 0.5) * tam);
      try { t.setPointerCapture(ev.pointerId); } catch (e) { /* opcional */ }
    } else {
      UI.seleccion = null;
      UI.destinos = [];
    }
    render();
    ev.preventDefault();
  });

  t.addEventListener('pointermove', function (ev) {
    if (!arrastre.activo || !arrastre.origen) return;
    var dx = ev.clientX - arrastre.px;
    var dy = ev.clientY - arrastre.py;
    if (!arrastre.iniciado) {
      if (dx * dx + dy * dy < 36) return;
      iniciarFantasma(ev);
      if (!arrastre.iniciado) return;
    }
    moverFantasma(ev);
    ev.preventDefault();
  });

  function soltar(ev) {
    if (!arrastre.activo) return;
    var eraArrastre = arrastre.iniciado;
    var origen = arrastre.origen;
    limpiarArrastre();
    if (!eraArrastre) return;

    var c = enPuntero(ev) ? punteroACasilla(ev) : null;
    if (!c || (origen && c[0] === origen[0] && c[1] === origen[1])) {
      UI.destinos = UI.seleccion
        ? UI.motor.jugadas_legales().filter(function (m) {
            return m.origen[0] === UI.seleccion[0] && m.origen[1] === UI.seleccion[1];
          })
        : [];
      render();
      return;
    }

    UI.destinos = UI.motor.jugadas_legales().filter(function (m) {
      return m.origen[0] === origen[0] && m.origen[1] === origen[1];
    });
    var cand = candidatosDestino(c);
    if (cand.length) {
      ejecutarCandidatas(cand);
    } else {
      UI.seleccion = origen;
      render();
    }
  }

  t.addEventListener('pointerup', soltar);
  t.addEventListener('pointercancel', function () {
    limpiarArrastre();
    render();
  });
}

/* --------------------------------------------------------------- controles */

function aplicarTema() {
  document.documentElement.setAttribute('data-tema', UI.tema);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', UI.tema === 'oscuro' ? '#161512' : '#ece9e3');
}

function alternarTema() {
  UI.tema = UI.tema === 'oscuro' ? 'claro' : 'oscuro';
  aplicarTema();
  guardarPrefs();
  renderBotones();
}

function alternarSonido() {
  UI.sonido = !UI.sonido;
  guardarPrefs();
  renderBotones();
  if (UI.sonido) sonar('mover');
}

function alternarNumeros() {
  UI.numeros = !UI.numeros;
  guardarPrefs();
  render();
}

function cambiarNivel() {
  UI.nivel = parseInt(id('sel-nivel').value, 10) || 1;
  guardarPrefs();
  toast('Nivel ' + UI.nivel + ': ' + nombreNivel(UI.nivel));
}

function cambiarColor() {
  UI.humanoEsBlancas = id('sel-color').value === 'b';
  guardarPrefs();
  nuevaPartida();
  toast(UI.humanoEsBlancas ? 'Juegas con las blancas' : 'Juegas con las negras');
}

function cambiarReloj() {
  UI.reloj = id('chk-reloj').checked;
  var m = parseInt(id('inp-minutos').value, 10);
  UI.minutos = m >= 1 && m <= 99 ? m : 10;
  id('inp-minutos').value = UI.minutos;
  guardarPrefs();
  UI.relojes.blancas = UI.minutos * 60;
  UI.relojes.negras = UI.minutos * 60;
  if (UI.reloj) arrancarReloj();
  else detenerReloj();
  renderBotones();
}

function cambiarPestana(destino) {
  document.querySelectorAll('.pestana').forEach(function (p) {
    p.classList.toggle('activa', p.dataset.destino === destino);
  });
  id('panel-jugadas').classList.toggle('activo', destino === 'jugadas');
  id('panel-capturas').classList.toggle('activo', destino === 'capturas');
}

/* -------------------------------------------------------- instalacion/SW */

function configurarInstalacion() {
  var boton = id('btn-instalar');
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    avisoPrompt = ev;
    boton.hidden = false;
  });
  boton.addEventListener('click', function () {
    if (!avisoPrompt) return;
    avisoPrompt.prompt();
    avisoPrompt.userChoice.then(function () {
      avisoPrompt = null;
      boton.hidden = true;
    });
  });
  window.addEventListener('appinstalled', function () {
    avisoPrompt = null;
    boton.hidden = true;
    toast('App instalada correctamente.');
  });
}

function configurarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {
      /* sin service worker */
    });
  });
}

/* ------------------------------------------------------------------ inicio */

function cargarSelectorNiveles() {
  var sel = id('sel-nivel');
  var html = '';
  for (var i = 0; i < NIVELES_IA.length; i++) {
    var n = NIVELES_IA[i];
    html += '<option value="' + n.nivel + '">Nivel ' + n.nivel + ' · ' + n.nombre + '</option>';
  }
  sel.innerHTML = html;
  sel.value = String(UI.nivel);
}

function iniciar() {
  cargarPrefs();
  aplicarTema();
  cargarSelectorNiveles();

  id('sel-color').value = UI.humanoEsBlancas ? 'b' : 'n';
  id('chk-reloj').checked = UI.reloj;
  id('inp-minutos').value = UI.minutos;

  configurarEventos();
  configurarInstalacion();
  configurarServiceWorker();

  id('btn-nueva').addEventListener('click', function () { prepararAudio(); nuevaPartida(); });
  id('btn-deshacer').addEventListener('click', deshacer);
  id('btn-girar').addEventListener('click', function () {
    UI.invertido = !UI.invertido;
    renderTablero();
  });
  id('btn-numeros').addEventListener('click', alternarNumeros);
  id('btn-numeros-top').addEventListener('click', alternarNumeros);
  id('btn-sonido').addEventListener('click', alternarSonido);
  id('btn-sonido2').addEventListener('click', alternarSonido);
  id('btn-tema').addEventListener('click', alternarTema);
  id('btn-tema2').addEventListener('click', alternarTema);
  id('sel-nivel').addEventListener('change', cambiarNivel);
  id('sel-color').addEventListener('change', cambiarColor);
  id('chk-reloj').addEventListener('change', cambiarReloj);
  id('inp-minutos').addEventListener('change', cambiarReloj);

  document.querySelectorAll('.pestana').forEach(function (p) {
    p.addEventListener('click', function () { cambiarPestana(p.dataset.destino); });
  });

  document.querySelectorAll('.btn-promo').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!pendientePromocion) return;
      var letra = b.dataset.promo;
      var elegido = null;
      for (var i = 0; i < pendientePromocion.length; i++) {
        var m = pendientePromocion[i];
        if (m.promocion && m.promocion.toLowerCase() === letra) { elegido = m; break; }
      }
      var lista = pendientePromocion;
      pendientePromocion = null;
      id('modal-promocion').hidden = true;
      if (elegido) aplicarMov(elegido);
      else if (lista && lista.length) aplicarMov(lista[0]);
    });
  });

  id('promo-cancelar').addEventListener('click', function () {
    pendientePromocion = null;
    id('modal-promocion').hidden = true;
    UI.seleccion = null;
    UI.destinos = [];
    render();
  });

  id('fin-nueva').addEventListener('click', nuevaPartida);
  id('fin-cerrar').addEventListener('click', function () {
    id('modal-fin').hidden = true;
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      id('modal-promocion').hidden = true;
      id('modal-fin').hidden = true;
      pendientePromocion = null;
    }
  });

  UI.invertido = !UI.humanoEsBlancas;
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
