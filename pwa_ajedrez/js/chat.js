(function(){
  var mensajes = document.getElementById('chat-mensajes');
  var input = document.getElementById('chat-input');
  var btnEnviar = document.getElementById('btn-enviar-chat');
  var btnLimpiar = document.getElementById('btn-limpiar-chat');
  var btnVoz = document.getElementById('btn-voz');
  var sugerencias = document.getElementById('chat-sugerencias');

  /* ------------------------------------------------------------ habla */

  var vozActiva = true;
  try{ vozActiva = localStorage.getItem('ajedrez_voz') !== '0'; }catch(e){}

  if('speechSynthesis' in window){
    speechSynthesis.getVoices();
    if(typeof speechSynthesis.onvoiceschanged !== 'undefined'){
      speechSynthesis.onvoiceschanged = function(){ speechSynthesis.getVoices(); };
    }
  }

  function elegirVoz(){
    if(!('speechSynthesis' in window)) return null;
    var v = speechSynthesis.getVoices();
    for(var i=0;i<v.length;i++){
      var id = (v[i].lang||'').toLowerCase();
      if(id.indexOf('es-es')===0) return v[i];
    }
    for(var j=0;j<v.length;j++){
      if((v[j].lang||'').toLowerCase().indexOf('es')===0) return v[j];
    }
    return null;
  }

  function decir(texto){
    if(!vozActiva || !('speechSynthesis' in window)) return;
    try{
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(texto);
      var voz = elegirVoz();
      if(voz) u.voice = voz;
      u.lang = voz ? voz.lang : 'es-ES';
      u.rate = 1.05;
      speechSynthesis.speak(u);
    }catch(e){}
  }

  /* -------------------------------------------------- numeros 1-64 */

  function numDe(casilla){
    try{ if(window.numero) return numero(casilla); }catch(e){}
    return null;
  }

  function casillaDeNum(n){
    try{ if(window.casillaDe) return casillaDe(n); }catch(e){}
    return null;
  }

  function decirNumero(n){
    /* 3024 -> 'tres mil veinticuatro' simple y claro */
    return String(n);
  }

  /* 'e2e4' -> '44 ... 56' (solo numeros, como codigo) */
  function decirUci(uci){
    if(!uci || uci.length<4) return uci||'';
    var na = numDe(uci.substr(0,2)), nb = numDe(uci.substr(2,2));
    if(na && nb) return na+' ... '+nb;
    return uci;
  }

  /* 'e2e4' -> '44-56' para texto en pantalla */
  function txtUci(uci){
    if(!uci || uci.length<4) return uci||'';
    var na = numDe(uci.substr(0,2)), nb = numDe(uci.substr(2,2));
    return (na&&nb) ? na+'-'+nb : uci;
  }

  /* resultado de captura: '44x56=2464' */
  function txtCaptura(atacante, victima, origen, destino){
    var na = numDe(origen), nb = numDe(destino);
    if(!na||!nb) return origen+'x'+destino;
    var mul = (window.esMultiplicacion && esMultiplicacion(atacante, victima));
    if(!mul) return nb+' (sin multiplicar)';
    var prod = na*nb;
    if(prod > (window.TOPE||9999)) return prod+' (supera 4 cifras)';
    return na+'x'+nb+'='+prod;
  }

  /* formato de una jugada para opciones: '44x56=2464' o '18-55' */
  function formatoMov(mov){
    if(!mov) return '';
    var na = numDe(aTexto(mov.origen)), nb = numDe(aTexto(mov.destino));
    if(!na||!nb) return mov.uci||'';
    var at = UI.motor.pos.tablero[mov.origen[0]][mov.origen[1]];
    var vt = UI.motor.pos.tablero[mov.destino[0]][mov.destino[1]];
    if(vt && vt!=='.'){
      var mul = (window.esMultiplicacion && esMultiplicacion(at, vt));
      if(mul){
        var prod = na*nb;
        if(prod > (window.TOPE||9999)) return prod;
        return na+'x'+nb+'='+prod;
      }
      return String(nb);
    }
    return na+'-'+nb;
  }

  /* opciones: mejores jugadas legales con sus numeros multiplicados */
  function opcionesTexto(cuantas){
    if(!hayTablero()) return 'x';
    var leg = legales();
    if(!leg.length) return 'x';
    var vistos = {}, out = [];
    var orden = [];
    try{
      if(window.buscarRaiz){
        var r = buscarRaiz(UI.motor.pos, 3, {fecha:Date.now(),nodos:0,paso:4096,mejor:null}, false);
        if(r && r.mov) orden.push(r.mov);
      }
    }catch(e){}
    for(var i=0;i<leg.length && out.length<cuantas;i++){
      var cand = leg[i];
      var ya = false;
      for(var k=0;k<orden.length;k++){
        if(orden[k].uci === cand.uci){ ya = true; break; }
      }
      if(!ya) orden.push(cand);
    }
    for(var j=0;j<orden.length && out.length<cuantas;j++){
      var f = formatoMov(orden[j]);
      if(f && !vistos[f]){ vistos[f]=1; out.push(f); }
    }
    return out.join(', ');
  }

  /* ------------------------------------------------------------- chat */

  function addMsg(text,who){
    var div = document.createElement('div');
    div.className = 'msg msg-'+who;
    div.textContent = text;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  function addBot(text){
    addMsg(text,'bot');
    if(!vozActiva) return;
    var breve = text.replace(/FEN:[^\n]*/g,'').replace(/\s+/g,' ').trim();
    if(breve.length>340) breve = breve.substr(0,340)+'...';
    if(breve) decir(breve);
  }

  function limpiar(){
    mensajes.innerHTML='';
    try{localStorage.removeItem('ajedrez_chat');}catch(e){}
    try{speechSynthesis.cancel();}catch(e){}
  }

  function guardar(){
    var items = [];
    mensajes.querySelectorAll('.msg').forEach(function(m){
      var who = m.classList.contains('msg-user')?'user':'bot';
      items.push({who:who,text:m.textContent});
    });
    try{localStorage.setItem('ajedrez_chat', JSON.stringify(items.slice(-40)));}catch(e){}
  }

  function cargar(){
    try{
      var data = JSON.parse(localStorage.getItem('ajedrez_chat')||'[]');
      data.forEach(function(x){addMsg(x.text,x.who);});
    }catch(e){}
  }

  /* --------------------------------------------------------- estado */

  function hayTablero(){
    return !!(window.UI && UI.motor && UI.motor.pos);
  }

  function legales(){
    try{ return UI.motor.pos.movimientosLegales(); }catch(e){ return []; }
  }

  function mejorUci(){
    try{
      if(!hayTablero()) return null;
      if(window.jugadaLibro){
        var lib = jugadaLibro(UI.motor.pos);
        if(lib) return lib;
      }
      if(!window.buscarRaiz) return null;
      var r = buscarRaiz(UI.motor.pos, 4, {fecha:Date.now(),nodos:0,paso:4096,mejor:null}, false);
      return (r && r.mov) ? r.mov.uci : null;
    }catch(e){ return null; }
  }

  function evaluarPos(){
    try{ if(window.evaluar && hayTablero()) return evaluar(UI.motor.pos); }catch(e){}
    return 0;
  }

  function turnoTexto(){
    return hayTablero() ? (UI.motor.pos.turno ? 'blancas' : 'negras') : '';
  }

  function fen(){
    try{ return hayTablero() ? UI.motor.fen() : ''; }catch(e){ return ''; }
  }

  function piezaEn(casilla){
    if(!hayTablero() || !window.desdeTexto) return '.';
    var c = desdeTexto(casilla);
    if(!c || c[0]<0) return '.';
    return UI.motor.pos.tablero[c[0]][c[1]] || '.';
  }

  function nombrePiezaLargo(p){
    var n = {'p':'peón','n':'caballo','b':'alfil','r':'torre','q':'dama','k':'rey'};
    return n[(p||'').toLowerCase()] || 'pieza';
  }

  function materialTexto(){
    if(!hayTablero()) return '';
    var t = UI.motor.pos.tablero;
    var b = {}, n = {}, i, j, p;
    for(i=0;i<8;i++) for(j=0;j<8;j++){
      p = t[i][j];
      if(!p || p==='.') continue;
      if(p === p.toUpperCase()) b[p]=(b[p]||0)+1;
      else n[p.toUpperCase()]=(n[p.toUpperCase()]||0)+1;
    }
    var orden = ['P','N','B','R','Q'];
    function lista(tab){
      var s=[];
      for(var k=0;k<orden.length;k++){
        if(tab[orden[k]]) s.push(nombrePiezaLargo(orden[k])+' '+tab[orden[k]]);
      }
      return s.length ? s.join(', ') : 'nada';
    }
    return 'Blancas: '+lista(b)+'. Negras: '+lista(n)+'.';
  }

  /* ultimo movimiento y captura en numeros */
  function ultimoTexto(){
    if(!hayTablero() || !window.UI || !UI.jugadas || !UI.jugadas.length) return '';
    var u = UI.jugadas[UI.jugadas.length-1];
    if(!u || !u.mov) return '';
    var mov = u.mov;
    var na = numDe(aTexto(mov.origen)), nb = numDe(aTexto(mov.destino));
    if(!na||!nb) return '';
    var at = UI.motor.pos.tablero[mov.origen[0]][mov.origen[1]];
    var vt = UI.motor.pos.tablero[mov.destino[0]][mov.destino[1]];
    if(vt && vt!=='.'){
      return na+'x'+nb+'='+(na*nb);
    }
    return na+'-'+nb;
  }

  /* ---------------------------------------------------- jugadas voz */

  function leerNums(texto){
    var out = [];
    var tokens = texto.toLowerCase().replace(/[,.!?;:]/g,' ').split(/\s+/);
    for(var i=0;i<tokens.length;i++){
      var t = tokens[i];
      if(/^\d{1,2}$/.test(t)){
        var n = parseInt(t,10);
        if(n>=1 && n<=64 && casillaDeNum(n)) out.push(casillaDeNum(n));
      }
    }
    return out;
  }

  function leerLetras(texto){
    var out = [];
    var tokens = texto.toLowerCase().replace(/[,.!?;:]/g,' ').split(/\s+/);
    for(var i=0;i<tokens.length;i++){
      var t = tokens[i];
      if(t.length===2 && 'abcdefgh'.indexOf(t[0])>=0 && '12345678'.indexOf(t[1])>=0){
        out.push(t);
      }
    }
    return out;
  }

  function leerJugada(texto){
    /* acepta: numeros (1-64) o letras (e2 e4) */
    var nums = leerNums(texto);
    if(nums.length>=2) return nums[0]+nums[1];
    var let = leerLetras(texto);
    if(let.length>=2) return let[0]+let[1];
    return null;
  }

  function jugarUci(uci){
    if(!window.aplicarMov || !hayTablero()) return 'No hay tablero activo.';
    var mov = UI.motor.pos.movimientoDesdeTexto(uci);
    if(!mov) return 'Esa jugada no es legal.';
    if(!aplicarMov(mov)) return 'No pude aplicar esa jugada.';
    return 'Jugué '+decirUci(uci)+'.';
  }

  function intentarMoverPorVoz(preg){
    if(!hayTablero()) return null;
    var uci = leerJugada(preg);
    if(!uci) return null;
    /* solo si la pregunta parece una jugada: "mueve 44 a 56", "44 56", "44-56" */
    var esJugada = /(mueve|muevo|juega|mover|jugar|muevelo|paso|ok|ya)/.test(preg)
      || /^\s*\d{1,2}\s*[-a]+\s*\d{1,2}\s*$/.test(preg)
      || (leerNums(preg).length>=2 && preg.trim().split(/\s+/).length<=3);
    if(!esJugada) return null;
    var mov = UI.motor.pos.movimientoDesdeTexto(uci);
    if(!mov) return 'x';
    var na = numDe(aTexto(mov.origen)), nb = numDe(aTexto(mov.destino));
    if(!aplicarMov(mov)) return 'x';
    var tuya = na+'-'+nb;
    /* turno de la IA: responde */
    var m = mejorUci();
    if(m){
      var mm = UI.motor.pos.movimientoDesdeTexto(m);
      if(mm){
        var mia = formatoMov(mm);
        aplicarMov(mm);
        return tuya+'  |  '+mia;
      }
    }
    return tuya;
  }

  /* ------------------------------------------------------- comandos */

  function responder(preg){
    if(!preg) return '';
    var p = preg.toLowerCase();

    var porVoz = intentarMoverPorVoz(p);
    if(porVoz) return porVoz;

    if(/(nueva partida|otra partida|reiniciar|reinicia)/.test(p)){
      if(window.nuevaPartida){ nuevaPartida(); return 'ok'; }
      return 'x';
    }

    if(/(abandonar|rendirse|rendir|me rindo)/.test(p)){
      var b = document.getElementById('btn-abandonar');
      if(b){ b.click(); return 'ok'; }
      return 'x';
    }

    if(/(deshacer|atrás|atras|retrocede)/.test(p)){
      if(window.deshacer){ deshacer(); return 'ok'; }
      return 'x';
    }

    if(!hayTablero()){
      return 'x';
    }

    if(/(opciones|sugiere|sugerencia|sugerencias|alternativas|dame ideas)/.test(p)){
      return opcionesTexto(3);
    }

    if(/(mejor jugada|cual es la mejor|cuál es la mejor)/.test(p)){
      var m = mejorUci();
      if(!m) return 'x';
      return decirUci(m);
    }

    if(/(analiza|análisis|explica|cómo voy|como voy|posición|posicion)/.test(p)){
      return decirUci(mejorUci() || 'e2e4');
    }

    if(/(que ves|qué ves|describe|tablero|material)/.test(p)){
      return ultimoTexto() || 'sin jugadas';
    }

    if(/(ultima|última|último jugada|ultima jugada)/.test(p)){
      return ultimoTexto() || 'sin jugadas';
    }

    if(/(fen)/.test(p)){
      return 'FEN actual:\n'+fen();
    }

    if(/(hola|buenas|hey)/.test(p)){
      return '44 ... 56';
    }

    if(/(adiós|adios|chao|hasta luego|nos vemos)/.test(p)){
      return 'adios';
    }

    return '44 ... 56';
  }

  function enviar(txt){
    txt = (txt||'').trim();
    if(!txt) return;
    addMsg(txt,'user');
    guardar();
    setTimeout(function(){ addBot(responder(txt)); guardar(); }, 80);
    input.value='';
    if(typeof sugerir==='function') sugerir();
  }

  btnEnviar.onclick = function(){ enviar(input.value); };
  input.onkeydown = function(e){ if(e.key==='Enter') btnEnviar.click(); };
  btnLimpiar.onclick = limpiar;

  /* ---------------------------------------------------------- micro */

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recon = null;
  var escuchando = false;

  function pintarBtnVoz(){
    if(!btnVoz) return;
    if(escuchando){
      btnVoz.textContent = 'Escuchando...';
      btnVoz.classList.add('btn-peligro');
    }else{
      btnVoz.textContent = vozActiva ? 'Hablar' : 'Voz off';
      btnVoz.classList.remove('btn-peligro');
    }
  }

  function detener(){
    escuchando = false;
    pintarBtnVoz();
    try{ if(recon) recon.stop(); }catch(e){}
  }

  function iniciar(){
    if(!SR){
      alert('Tu navegador no reconoce voz. Usa Chrome o Edge (en el celular: Chrome).');
      return;
    }
    try{ speechSynthesis.cancel(); }catch(e){}
    recon = new SR();
    recon.lang = 'es-ES';
    recon.interimResults = false;
    recon.maxAlternatives = 1;
    recon.continuous = false;

    recon.onstart = function(){ escuchando = true; pintarBtnVoz(); };
    recon.onend = function(){ detener(); };
    recon.onerror = function(ev){
      detener();
      if(ev.error === 'not-allowed'){
        addBot('Permiso de micrófono denegado. Activalo en el navegador.');
      }else if(ev.error === 'no-speech'){
        addBot('No escuché nada. Probá de nuevo.');
      }
    };
    recon.onresult = function(ev){
      var texto = ev.results[0][0].transcript;
      escuchando = false;
      pintarBtnVoz();
      enviar(texto);
    };
    try{ recon.start(); }catch(e){ detener(); }
  }

  if(btnVoz){
    btnVoz.onclick = function(){
      if(escuchando){ detener(); return; }
      iniciar();
    };
    pintarBtnVoz();
  }

  window.hablarAsistente = decir;

  cargar();
  if(typeof sugerir==='function') sugerir();
  setInterval(function(){ if(typeof sugerir==='function') sugerir(); }, 4000);
})();
