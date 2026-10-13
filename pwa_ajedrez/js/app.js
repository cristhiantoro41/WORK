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
  reloj: true,
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
  iaTimeout: null,
  partidaId: 0,
  iaPausada: false,
  ocultarOrigen: null,
  relojes: { blancas: 600, negras: 600 },
  eval: 0,
  revision: null,
  vista: null,
  fens: [],
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
    if (typeof p.pausaIA === 'boolean') UI.iaPausada = p.pausaIA;
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
      minutos: UI.minutos,
      pausaIA: UI.iaPausada
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
  if (UI.revision !== null || UI.fin || UI.pensando) return false;
  if (UI.iaPausada) return true;
  return UI.motor.turno === UI.humanoEsBlancas;
}

function esTurnoIA() {
  if (UI.iaPausada) return false;
  return UI.revision === null && !UI.fin && !UI.pensando && UI.motor.turno !== UI.humanoEsBlancas;
}

function motorVista() {
  return (UI.revision !== null && UI.vista) ? UI.vista : UI.motor;
}

function ultimoVista() {
  if (UI.revision === null) return UI.ultimo;
  if (UI.revision <= 0) return null;
  var j = UI.jugadas[UI.revision - 1];
  return j ? j.mov : null;
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

/* --------------------------------------------------------- accesibilidad */

function esIdiomaIngles() {
  return !!(window.idiomaActual && window.idiomaActual() === 'en');
}

function nombrePiezaIdioma(p) {
  var en = esIdiomaIngles();
  var es = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };
  var ingl = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  return (en ? ingl : es)[(p || '').toLowerCase()] || (en ? 'piece' : 'pieza');
}

function anunciar(texto) {
  try {
    var r = id('anuncio-sr');
    if (r) { r.textContent = ''; r.textContent = texto; }
  } catch (e) {}
  if (window.decirMensaje) { try { window.decirMensaje(texto); } catch (e) {} }
}

function anuncioJugada(atacante, victima, captura, mov, estado) {
  var en = esIdiomaIngles();
  var color = esBlanca(atacante) ? (en ? 'white' : 'blancas') : (en ? 'black' : 'negras');
  var na = numero(aTexto(mov.origen)), nb = numero(aTexto(mov.destino));
  var s;
  if (mov.enroque) {
    s = en ? 'castles' : 'enroca';
  } else if (captura) {
    s = nombrePiezaIdioma(atacante) + (en ? ' takes ' : ' captura ') + nombrePiezaIdioma(victima) + ', ' +
        (captura.producto !== null ? na + 'x' + nb + '=' + captura.producto : na + 'x' + nb);
  } else {
    s = nombrePiezaIdioma(atacante) + (en ? ' from ' : ' de ') + na + (en ? ' to ' : ' a ') + nb;
  }
  var texto = color + ': ' + s + '.';
  if (estado && estado.indexOf('Jaque mate') === 0) {
    texto += en ? ' Checkmate.' : ' Jaque mate.';
  } else if (estado && estado.indexOf('Rey ahogado') === 0) {
    texto += en ? ' Stalemate.' : ' Rey ahogado.';
  } else if (estado && estado.indexOf('Tablas') === 0) {
    texto += en ? ' Draw.' : ' Tablas.';
  } else if (estado === 'Jaque') {
    texto += en ? ' Check.' : ' Jaque.';
  } else {
    var t = UI.motor.turno ? (en ? 'white' : 'blancas') : (en ? 'black' : 'negras');
    texto += en ? (' ' + t + ' to move.') : (' Le toca a las ' + t + '.');
  }
  return texto;
}

function anunciarCursor() {
  if (!UI.cursor) return;
  var en = esIdiomaIngles();
  var f = UI.cursor[0], c = UI.cursor[1];
  var nom = 'abcdefgh'[c] + (8 - f);
  var pieza = UI.motor.tablero[f][c];
  var texto = (en ? 'square ' : 'casilla ') + numero(nom);
  if (pieza && pieza !== '.') {
    texto += ', ' + nombrePiezaIdioma(pieza) + ' ' +
      (esBlanca(pieza) ? (en ? 'white' : 'blanca') : (en ? 'black' : 'negra'));
  }
  anunciar(texto);
}

/* ------------------------------------------------------------------ render */

function render() {
  renderTablero();
  renderHistorial();
  renderCapturas();
  renderAviso();
  renderBotones();
  renderJugadores();
  renderEval();
  renderRevision();
}

function renderTablero() {
  var t = id('tablero');
  var html = '';
  var vista = motorVista();
  var enJaque = vista.es_jaque();
  var reyJaque = enJaque ? vista.pos.casillaRey(vista.turno) : null;
  var ultimo = ultimoVista();
  var vivo = UI.revision === null;
  var letras = 'abcdefgh';

  for (var vr = 0; vr < 8; vr++) {
    for (var vc = 0; vc < 8; vc++) {
      var par = desvert(vr, vc);
      var fila = par[0];
      var col = par[1];
      var casilla = fila + ',' + col;
      var pieza = vista.tablero[fila][col];
      var claro = (fila + col) % 2 === 0;
      var clases = ['casilla', claro ? 'claro' : 'oscuro'];

      if (ultimo && (ultimo.origen[0] === fila && ultimo.origen[1] === col ||
                     ultimo.destino[0] === fila && ultimo.destino[1] === col)) {
        clases.push('ultimo');
      }
      if (vivo && UI.seleccion && UI.seleccion[0] === fila && UI.seleccion[1] === col) {
        clases.push('seleccion');
      }
      if (vivo && UI.cursor && UI.cursor[0] === fila && UI.cursor[1] === col) {
        clases.push('cursor');
      }
      if (reyJaque && reyJaque[0] === fila && reyJaque[1] === col) clases.push('jaque');

      html += '<div class="' + clases.join(' ') + '" data-fila="' + fila + '" data-col="' + col + '" role="gridcell">';

      if (vr === 7) html += '<span class="coord coord-file">' + letras[col] + '</span>';
      if (vc === 0) html += '<span class="coord coord-rank">' + (8 - fila) + '</span>';

      if (pieza === '.' || UI.numeros || (vivo && UI.ocultarOrigen && UI.ocultarOrigen[0] === fila && UI.ocultarOrigen[1] === col)) {
        html += '<span class="num-casilla">' + NUMEROS[letras[col] + (8 - fila)] + '</span>';
      }

      var oculta = vivo && UI.ocultarOrigen && UI.ocultarOrigen[0] === fila && UI.ocultarOrigen[1] === col;
      if (pieza !== '.' && !oculta) {
        var etiquetaTexto = etiqueta(pieza, letras[col] + (8 - fila));
        var blanca = esBlanca(pieza);
        var esRey = (pieza === 'K' || pieza === 'k');
        html += '<div class="pieza ' + (blanca ? 'blanca' : 'negra') +
          (esRey ? ' rey' : '') + (etiquetaTexto.length > 1 ? ' dos' : '') +
          '" data-pieza="' + pieza + '">' +
          (esRey ? '<img src="./imagenes/rey.webp" alt="Rey">' : etiquetaTexto) + '</div>';
      }

      if (vivo) {
        for (var d = 0; d < UI.destinos.length; d++) {
          var m = UI.destinos[d];
          if (m.destino[0] === fila && m.destino[1] === col) {
            var ocupada = vista.tablero[fila][col] !== '.' || m.enPasante;
            html += '<span class="marcador' + (ocupada ? ' anillo' : '') + '"></span>';
          }
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
      var viendo = UI.revision === i + 1 ? ' viendo' : '';
      html += '<li class="item-jugada' + viendo + '" data-ply="' + (i + 1) + '">' +
        '<span class="num">' + j.rotulo + '</span>' +
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
  id('fichas-blancas').innerHTML = blancas || '<span class="vacio">&mdash;</span>';
  id('fichas-negras').innerHTML = negras || '<span class="vacio">&mdash;</span>';
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
  id('btn-numeros').textContent = UI.numeros ? 'Ocultar n\u00fameros 1-64' : 'Mostrar n\u00fameros 1-64';
  id('btn-sonido2').textContent = 'Sonido: ' + (UI.sonido ? 's\u00ed' : 'no');
  id('btn-tema2').textContent = 'Tema: ' + UI.tema;
  id('btn-pausa-ia').textContent = UI.iaPausada ? 'IA: en pausa' : 'IA: activada';
  id('zona-tablero').classList.toggle('sin-relojes', !UI.reloj);
  pintarRelojes();
}

function colorArriba() {
  return UI.invertido ? 'blancas' : 'negras';
}

function renderJugadores() {
  var arriba = colorArriba();
  var abajo = arriba === 'blancas' ? 'negras' : 'blancas';
  var fichaTop = document.querySelector('#jugador-top .jugador-ficha');
  if (fichaTop) fichaTop.className = 'jugador-ficha ' + (arriba === 'blancas' ? 'blanca' : 'negra');
  var fichaBot = document.querySelector('#jugador-bottom .jugador-ficha');
  if (fichaBot) fichaBot.className = 'jugador-ficha ' + (abajo === 'blancas' ? 'blanca' : 'negra');
  var nomTop = id('nombre-top');
  if (nomTop) nomTop.textContent = 'Computadora \u00b7 ' + nombreNivel(UI.nivel);
  var nomBot = id('nombre-bottom');
  if (nomBot) nomBot.textContent = 'Vos';
}

function actualizarEval(motor) {
  var eng = motor || UI.motor;
  try {
    if (!eng || !eng.pos) { UI.eval = 0; return; }
    var pos = eng.pos;
    var movs = pos.movimientosLegales();
    if (!movs.length) {
      UI.eval = pos.enJaque(pos.turno) ? (pos.turno ? -1e8 : 1e8) : 0;
      return;
    }
    if (typeof analizar === 'function') {
      var r = analizar(pos, { ms: 90, profundidad: 6 });
      var v = r.puntaje || 0;
      UI.eval = pos.turno ? v : -v;
    } else {
      UI.eval = evaluar(pos);
    }
  } catch (e) {
    UI.eval = (eng && eng.pos) ? evaluar(eng.pos) : 0;
  }
}

function renderEval() {
  var fill = id('eval-fill');
  var num = id('eval-num');
  var barra = id('eval-barra');
  if (!fill || !num) return;
  var v = UI.eval || 0;
  var a = Math.abs(v);
  var mate = a > 9e7;
  var pct = mate ? (v > 0 ? 97 : 3) : Math.max(3, Math.min(97, 50 + v / 16));
  fill.style.width = pct + '%';
  if (mate) {
    var n = Math.max(1, Math.ceil((1e8 - a) / 2));
    num.textContent = v > 0 ? 'M' + n : '-M' + n;
  } else {
    num.textContent = (v >= 0 ? '+' : '') + (v / 100).toFixed(2);
  }
  if (barra) barra.classList.toggle('mate', mate);
}

function renderRevision() {
  var barra = id('revision-barra');
  if (!barra) return;
  if (UI.revision === null) { barra.hidden = true; return; }
  barra.hidden = false;
  var info = id('rev-info');
  if (info) {
    if (UI.revision === 0) info.textContent = 'Posicion inicial';
    else info.textContent = 'Jugada ' + UI.revision + ' de ' + UI.jugadas.length;
  }
}

function entrarRevision(k) {
  if (!UI.fens.length) return;
  var total = UI.jugadas.length;
  if (k < 0) k = 0;
  if (k > total) k = total;
  if (k === total) { salirRevision(); return; }
  UI.revision = k;
  UI.vista = new Engine(UI.fens[k]);
  UI.seleccion = null;
  UI.destinos = [];
  detenerReloj();
  actualizarEval(UI.vista);
  render();
}

function salirRevision() {
  if (UI.revision === null) return;
  UI.revision = null;
  UI.vista = null;
  actualizarEval();
  if (UI.reloj && !UI.fin) arrancarReloj();
  render();
}

function moverRevision(delta) {
  var base = UI.revision === null ? UI.jugadas.length : UI.revision;
  entrarRevision(base + delta);
}

function pintarRelojes() {
  if (!UI.reloj) return;
  var arriba = colorArriba();
  var abajo = arriba === 'blancas' ? 'negras' : 'blancas';
  var top = id('reloj-top');
  var bot = id('reloj-bottom');
  if (top) {
    top.querySelector('.reloj-tiempo').textContent = formatoTiempo(UI.relojes[arriba]);
    var activoTop = UI.motor.turno ? 'blancas' : 'negras';
    top.classList.toggle('activo', !UI.fin && activoTop === arriba);
    top.classList.toggle('critico', UI.relojes[arriba] < 20);
  }
  if (bot) {
    bot.querySelector('.reloj-tiempo').textContent = formatoTiempo(UI.relojes[abajo]);
    var activoBot = UI.motor.turno ? 'blancas' : 'negras';
    bot.classList.toggle('activo', !UI.fin && activoBot === abajo);
    bot.classList.toggle('critico', UI.relojes[abajo] < 20);
  }
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
  UI.ultimoTick = Date.now();
  UI.tick = setInterval(function () {
    if (UI.fin) { detenerReloj(); return; }
    var ahora = Date.now();
    var dt = (ahora - UI.ultimoTick) / 1000;
    UI.ultimoTick = ahora;
    var clave = UI.motor.turno ? 'blancas' : 'negras';
    UI.relojes[clave] = Math.max(0, UI.relojes[clave] - dt);
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
  UI.fens.push(t.a_fen());
  UI.ultimo = aplicado;
  UI.seleccion = null;
  UI.destinos = [];
  UI.ocultarOrigen = null;

  UI.estado = t.terminacion();
  anunciar(anuncioJugada(atacante, victima, captura, aplicado, UI.estado));
  actualizarEval();
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

function cancelarIA() {
  if (UI.iaTimeout) { clearTimeout(UI.iaTimeout); UI.iaTimeout = null; }
  UI.pensando = false;
}

function responderIA() {
  if (UI.iaPausada || UI.fin || UI.pensando || UI.motor.turno === UI.humanoEsBlancas) return;
  UI.pensando = true;
  render();
  var marca = UI.partidaId;
  UI.iaTimeout = setTimeout(function () {
    UI.iaTimeout = null;
    UI.pensando = false;
    if (marca !== UI.partidaId) { render(); return; }
    if (UI.iaPausada || UI.fin || UI.motor.turno === UI.humanoEsBlancas) { render(); return; }
    var uci = null;
    try {
      if (window.jugadaLibro && UI.motor.pos.jugada <= 12) {
        uci = jugadaLibro(UI.motor.pos);
      }
    } catch (e) { uci = null; }
    try {
      if (!uci) uci = mover(UI.motor, UI.nivel);
    } catch (e) {
      uci = null;
    }
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
  UI.fens.pop();
  if (j.captura) UI.capturas.pop();
  return true;
}

function deshacer() {
  if (UI.revision !== null) { salirRevision(); return; }
  cancelarIA();
  if (!UI.jugadas.length) return;
  quitarJugada();
  if (UI.motor.turno !== UI.humanoEsBlancas && UI.jugadas.length) quitarJugada();

  UI.fin = false;
  UI.estado = UI.motor.terminacion();
  UI.ultimo = UI.jugadas.length ? UI.jugadas[UI.jugadas.length - 1].mov : null;
  UI.avisoTexto = '';
  UI.seleccion = null;
  UI.destinos = [];
  id('modal-fin').hidden = true;
  actualizarEval();
  render();
}

/* ------------------------------------------------------------- partidas */

function nuevaPartida() {
  cancelarIA();
  UI.partidaId++;
  UI.motor = new Engine();
  UI.jugadas = [];
  UI.capturas = [];
  UI.fens = [UI.motor.a_fen()];
  UI.revision = null;
  UI.vista = null;
  UI.ultimo = null;
  UI.seleccion = null;
  UI.destinos = [];
  UI.ocultarOrigen = null;
  actualizarEval();
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
    'Capturas: <b>' + r.capturas + '</b> \u00b7 Multiplicaciones: <b>' + r.multiplicaciones +
    '</b><br>Repetidos: <b>' + r.repetidos + '</b> \u00b7 Suma de productos: <b>' + r.suma + '</b>';
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

function casillaDeElemento(el) {
  while (el && el.nodeType === 1) {
    if (typeof el.className === 'string' &&
        (' ' + el.className + ' ').indexOf(' casilla ') !== -1) {
      var f = parseInt(el.getAttribute('data-fila'), 10);
      var c = parseInt(el.getAttribute('data-col'), 10);
      return (isNaN(f) || isNaN(c)) ? null : [f, c];
    }
    el = el.parentNode;
  }
  return null;
}

function punteroACasilla(ev) {
  if (typeof document.elementFromPoint === 'function') {
    var bajo = document.elementFromPoint(ev.clientX, ev.clientY);
    var cas = casillaDeElemento(bajo);
    if (cas) return cas;
  }
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
      if (dx * dx + dy * dy < 144) return;
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

  /* Respaldo con clic: solo actua si el puntero NO proceso el toque
   * (algunes moviles no disparan pointerdown de forma fiable). */
  var manejoPuntero = false;
  t.addEventListener('pointerdown', function () { manejoPuntero = true; }, true);
  t.addEventListener('click', function (ev) {
    if (manejoPuntero) { manejoPuntero = false; return; }
    if (!esTurnoHumano()) return;
    var c = punteroACasilla(ev);
    if (!c) return;
    if (UI.seleccion) {
      var cand = candidatosDestino(c);
      if (cand.length) { ejecutarCandidatas(cand); return; }
    }
    var pieza = UI.motor.tablero[c[0]][c[1]];
    if (pieza !== '.' && esBlanca(pieza) === UI.motor.turno) {
      UI.seleccion = c;
      UI.destinos = UI.motor.jugadas_legales().filter(function (m) {
        return m.origen[0] === c[0] && m.origen[1] === c[1];
      });
    } else {
      UI.seleccion = null;
      UI.destinos = [];
    }
    render();
  });

  t.addEventListener('keydown', function (ev) {
    if (!esTurnoHumano()) return;
    var k = ev.key;
    var esFlecha = k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight';
    if (esFlecha || k === 'Enter' || k === ' ' || k === 'Escape') ev.preventDefault();
    else return;

    if (!UI.cursor) {
      UI.cursor = UI.seleccion ? [UI.seleccion[0], UI.seleccion[1]] : [UI.motor.turno ? 6 : 1, 4];
    }
    if (k === 'Escape') {
      UI.seleccion = null;
      UI.destinos = [];
      anunciarCursor();
      render();
      return;
    }
    if (k === 'Enter' || k === ' ') {
      var c = UI.cursor;
      if (UI.seleccion) {
        var cand = candidatosDestino(c);
        if (cand.length) { ejecutarCandidatas(cand); return; }
      }
      var pieza = UI.motor.tablero[c[0]][c[1]];
      if (pieza !== '.' && esBlanca(pieza) === UI.motor.turno) {
        UI.seleccion = [c[0], c[1]];
        UI.destinos = UI.motor.jugadas_legales().filter(function (m) {
          return m.origen[0] === c[0] && m.origen[1] === c[1];
        });
      } else {
        UI.seleccion = null;
        UI.destinos = [];
      }
      anunciarCursor();
      render();
      return;
    }
    var v = vert(UI.cursor[0], UI.cursor[1]);
    if (k === 'ArrowUp') v[0]--;
    if (k === 'ArrowDown') v[0]++;
    if (k === 'ArrowLeft') v[1]--;
    if (k === 'ArrowRight') v[1]++;
    if (v[0] < 0) v[0] = 0; if (v[0] > 7) v[0] = 7;
    if (v[1] < 0) v[1] = 0; if (v[1] > 7) v[1] = 7;
    var nc = desvert(v[0], v[1]);
    UI.cursor = [nc[0], nc[1]];
    anunciarCursor();
    render();
  });

  var hist = id('historial');
  if (hist) {
    hist.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== hist && (!el.classList || !el.classList.contains('item-jugada'))) {
        el = el.parentNode;
      }
      if (!el || el === hist) return;
      var k = parseInt(el.getAttribute('data-ply'), 10);
      if (!isNaN(k)) entrarRevision(k);
    });
  }

  var revInicio = id('rev-inicio');
  if (revInicio) revInicio.addEventListener('click', function () { entrarRevision(0); });
  var revAnt = id('rev-ant');
  if (revAnt) revAnt.addEventListener('click', function () { moverRevision(-1); });
  var revSig = id('rev-sig');
  if (revSig) revSig.addEventListener('click', function () { moverRevision(1); });
  var revVolver = id('rev-volver');
  if (revVolver) revVolver.addEventListener('click', salirRevision);
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

function alternarPausaIA() {
  UI.iaPausada = !UI.iaPausada;
  if (UI.iaPausada) cancelarIA();
  guardarPrefs();
  renderBotones();
  toast(UI.iaPausada ? 'IA en pausa: movés vos de los dos bandos.' : 'IA activada.');
  if (!UI.iaPausada && esTurnoIA()) responderIA();
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
  var paneles = document.querySelectorAll('.panel-pestana');
  for (var i = 0; i < paneles.length; i++) {
    paneles[i].classList.toggle('activo', paneles[i].id === 'panel-' + destino);
  }
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
    html += '<option value="' + n.nivel + '">Nivel ' + n.nivel + ' \u00b7 ' + n.nombre + '</option>';
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
    render();
  });
  id('btn-numeros').addEventListener('click', alternarNumeros);
  id('btn-numeros-top').addEventListener('click', alternarNumeros);
  id('btn-sonido').addEventListener('click', alternarSonido);
  id('btn-sonido2').addEventListener('click', alternarSonido);
  id('btn-tema').addEventListener('click', alternarTema);
  id('btn-tema2').addEventListener('click', alternarTema);
  id('btn-pausa-ia').addEventListener('click', alternarPausaIA);
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
      if (UI.revision !== null) salirRevision();
      return;
    }
    var tag = ev.target && ev.target.tagName;
    if (UI.revision !== null && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      if (ev.key === 'ArrowLeft') { moverRevision(-1); ev.preventDefault(); return; }
      if (ev.key === 'ArrowRight') { moverRevision(1); ev.preventDefault(); return; }
    }
  });

  UI.invertido = !UI.humanoEsBlancas;
  UI.fens = [UI.motor.a_fen()];
  actualizarEval();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
document.addEventListener('DOMContentLoaded', function(){
  var btnA = document.getElementById('btn-abandonar');
  if(btnA){
    btnA.onclick = function(){
      if(UI.fin) return;
      var quien = UI.humanoEsBlancas ? 'Blancas abandonan' : 'Negras abandonan';
      var gana = UI.humanoEsBlancas ? 'Ganan las Negras' : 'Ganan las Blancas';
      UI.motor.deshacer = function(){ return null; };
      UI.fin = true;
      UI.estado = gana + ' - ' + quien;
      var texto = gana + '. ' + quien + '.';
      id('fin-titulo').textContent = 'Partida abandonada';
      id('fin-texto').textContent = texto;
      id('fin-resumen').innerHTML = '';
      id('modal-fin').hidden = false;
      if(UI.tick){ clearInterval(UI.tick); UI.tick=null; UI.relojArrancado=false; }
      if(window.UI && UI.iaTimeout){ clearTimeout(UI.iaTimeout); UI.iaTimeout=null; }
    };
  }
});

