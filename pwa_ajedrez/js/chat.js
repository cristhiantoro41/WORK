(function(){
  var mensajes = document.getElementById('chat-mensajes');
  var input = document.getElementById('chat-input');
  var btnEnviar = document.getElementById('btn-enviar-chat');
  var btnLimpiar = document.getElementById('btn-limpiar-chat');
  var btnVoz = document.getElementById('btn-voz');
  var sugerencias = document.getElementById('chat-sugerencias');

  /* ------------------------------------------------------------ idioma */

  var idioma = 'es';
  try{ var idiomaGuardado = localStorage.getItem('ajedrez_idioma'); if(idiomaGuardado==='en'||idiomaGuardado==='es') idioma=idiomaGuardado; }catch(e){}
  var idiomaAct = idioma;

  function L(es,en){ return idiomaAct==='en' ? en : es; }

  var PALABRAS_EN = {the:1,what:1,how:1,who:1,whose:1,help:1,move:1,moves:1,moving:1,play:1,playing:1,game:1,new:1,best:1,board:1,turn:1,last:1,undo:1,resign:1,hello:1,hi:1,hey:1,thanks:1,thank:1,piece:1,pieces:1,analysis:1,analyze:1,analyse:1,suggest:1,option:1,options:1,show:1,evaluate:1,evaluation:1,winning:1,position:1,for:1,me:1,you:1,is:1,am:1,please:1,deeper:1,advantage:1};
  var PALABRAS_ES = {que:1,'qué':1,como:1,'cómo':1,hola:1,buenas:1,ayuda:1,mueve:1,muevo:1,jugada:1,mejor:1,tablero:1,turno:1,pieza:1,piezas:1,nueva:1,partida:1,opciones:1,analiza:1,analisis:1,'análisis':1,deshacer:1,abandonar:1,gracias:1,muestra:1,quien:1,'quién':1};

  function detectar(p){
    if(/[áéíóúñ¿¡]/.test(p)) return 'es';
    var toks = p.toLowerCase().replace(/[.,!?;:]/g,' ').split(/\s+/);
    var ce = 0, cs = 0;
    for(var i=0;i<toks.length;i++){ if(PALABRAS_EN[toks[i]]) ce++; if(PALABRAS_ES[toks[i]]) cs++; }
    if(ce>cs) return 'en';
    if(cs>ce) return 'es';
    return idioma;
  }

  function lenguajeVoz(){ return idiomaAct==='en' ? 'en-US' : 'es-ES'; }

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
    var exacto = idiomaAct==='en' ? 'en-us' : 'es-es';
    var base = idiomaAct==='en' ? 'en' : 'es';
    var v = speechSynthesis.getVoices();
    for(var i=0;i<v.length;i++){
      if((v[i].lang||'').toLowerCase().indexOf(exacto)===0) return v[i];
    }
    for(var j=0;j<v.length;j++){
      if((v[j].lang||'').toLowerCase().indexOf(base)===0) return v[j];
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
      u.lang = voz ? voz.lang : lenguajeVoz();
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

  /* puntaje del motor a texto: centipeones o mate */
  function puntajeTexto(v){
    var a = Math.abs(v);
    if(a > 90000000){
      var n = Math.ceil((100000000 - a)/2);
      return (v>0 ? L('mate en '+n+' a favor','mate in '+n+' for you')
                  : L('mate en '+n+' en contra','mate in '+n+' against you'));
    }
    var p = v/100;
    return (p>=0?'+':'')+p.toFixed(2);
  }

  /* una linea (lista de uci) a numeros: '44-56 12-34' */
  function txtLinea(linea){
    if(!linea || !linea.length) return '';
    var out = [];
    for(var i=0;i<linea.length;i++) out.push(txtUci(linea[i]));
    return out.join(' ');
  }

  /* analisis profundo del motor: mejor + linea + candidatas */
  function analizarProfundo(ms){
    try{
      if(!window.analizar || !hayTablero()) return null;
      return analizar(UI.motor.pos, {ms: ms||1500, profundidad: 60});
    }catch(e){ return null; }
  }

  function analisisTexto(){
    var res = analizarProfundo(1500);
    if(!res || !res.mejor) return L('No pude analizar ahora.','I could not analyze now.');
    var signo = UI.motor.pos.turno ? 1 : -1; /* perspectiva de blancas */
    var partes = [];
    partes.push(L('Mejor ','Best ')+txtUci(res.mejor.uci)+L('  |  prof ','  |  depth ')+res.profundidad+
      L('  |  eval ','  |  eval ')+puntajeTexto(res.puntaje*signo));
    var linea = txtLinea(res.linea);
    if(linea) partes.push(L('Línea: ','Line: ')+linea);
    if(res.candidatas && res.candidatas.length){
      var arr = res.candidatas.slice().sort(function(a,b){ return b.valor - a.valor; });
      var ops = [], vistos = {};
      for(var i=0;i<arr.length && ops.length<3;i++){
        var f = formatoMov(arr[i].mov);
        if(f && !vistos[f]){ vistos[f]=1; ops.push(f+' ('+puntajeTexto(arr[i].valor*signo)+')'); }
      }
      if(ops.length) partes.push(L('Opciones: ','Options: ')+ops.join(', '));
    }
    return partes.join('\n');
  }

  /* opciones: mejores jugadas legales con sus numeros multiplicados */
  function opcionesTexto(cuantas){
    if(!hayTablero()) return L('Aún no hay partida. Pulsá "Nueva partida".','No game yet. Tap "New game".');
    var res = analizarProfundo(1200);
    if(res && res.candidatas && res.candidatas.length){
      var arr = res.candidatas.slice().sort(function(a,b){ return b.valor - a.valor; });
      var outO = [], vistosO = {};
      for(var i=0;i<arr.length && outO.length<cuantas;i++){
        var fO = formatoMov(arr[i].mov);
        if(fO && !vistosO[fO]){ vistosO[fO]=1; outO.push(fO); }
      }
      if(outO.length) return outO.join(', ');
    }
    var leg = legales();
    if(!leg.length) return L('No hay jugadas legales.','No legal moves.');
    var vistos = {}, out = [];
    for(var j=0;j<leg.length && out.length<cuantas;j++){
      var f = formatoMov(leg[j]);
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

  /* botones de sugerencia bajo la entrada del chat */
  function sugerir(){
    if(!sugerencias) return;
    var lista = idioma==='en'
      ? ['Analyze','Best move','What should I play?','Last move','FEN']
      : ['Analiza','Mejor jugada','¿Qué muevo?','Última jugada','FEN'];
    var html = '';
    for(var i=0;i<lista.length;i++){
      html += '<button class="btn btn-chico btn-sug" type="button" data-sug="' + lista[i] + '">' + lista[i] + '</button>';
    }
    if(sugerencias.getAttribute('data-lista') === html) return;
    sugerencias.setAttribute('data-lista', html);
    sugerencias.innerHTML = html;
    var botones = sugerencias.querySelectorAll('.btn-sug');
    for(var j=0;j<botones.length;j++){
      botones[j].onclick = function(){ enviar(this.getAttribute('data-sug')); };
    }
  }

  /* ------------------------------------------------------- idioma UI */

  var btnIdioma = document.createElement('button');
  btnIdioma.className = 'btn btn-chico';
  btnIdioma.type = 'button';
  btnIdioma.id = 'btn-idioma-chat';
  btnIdioma.title = 'ES / EN';

  function pintarIdioma(){
    btnIdioma.textContent = (idioma==='en') ? 'EN' : 'ES';
    if(input) input.placeholder = L('Analiza, mejor jugada, profundiza...','Analyze, best move, go deeper...');
  }

  function cambiarIdioma(l){
    idioma = (l==='en') ? 'en' : 'es';
    idiomaAct = idioma;
    try{ localStorage.setItem('ajedrez_idioma', idioma); }catch(e){}
    pintarIdioma();
    sugerir();
    addBot(L('Idioma cambiado a español.','Language changed to English.'));
  }
  window.cambiarIdiomaChat = cambiarIdioma;

  btnIdioma.onclick = function(){ cambiarIdioma(idioma==='en'?'es':'en'); };
  if(btnLimpiar && btnLimpiar.parentNode) btnLimpiar.parentNode.insertBefore(btnIdioma, btnLimpiar);
  pintarIdioma();

  /* ------------------------------------------------------------- estado */

  function hayTablero(){
    try{ return !!(window.UI && UI.motor && UI.motor.pos && UI.motor.pos.tablero); }catch(e){ return false; }
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
      var res = analizarProfundo(1200);
      if(res && res.mejor) return res.mejor.uci;
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
    return hayTablero() ? (UI.motor.pos.turno ? L('blancas','white') : L('negras','black')) : '';
  }

  function fen(){
    try{ return hayTablero() ? UI.motor.a_fen() : ''; }catch(e){ return ''; }
  }

  function piezaEn(casilla){
    if(!hayTablero() || !window.desdeTexto) return '.';
    var c = desdeTexto(casilla);
    if(!c || c[0]<0) return '.';
    return UI.motor.pos.tablero[c[0]][c[1]] || '.';
  }

  function nombrePiezaLargo(p){
    var es = {'p':'peón','n':'caballo','b':'alfil','r':'torre','q':'dama','k':'rey'};
    var en = {'p':'pawn','n':'knight','b':'bishop','r':'rook','q':'queen','k':'king'};
    var m = (idiomaAct==='en') ? en : es;
    return m[(p||'').toLowerCase()] || L('pieza','piece');
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
      return s.length ? s.join(', ') : L('nada','nothing');
    }
    return L('Blancas: ','White: ')+lista(b)+L('. Negras: ','. Black: ')+lista(n)+'.';
  }

  /* ultimo movimiento y captura en numeros */
  /* ultimo movimiento y captura en numeros */
  function ultimoTexto(){
    if(!hayTablero() || !window.UI || !UI.jugadas || !UI.jugadas.length) return '';
    var u = UI.jugadas[UI.jugadas.length-1];
    if(!u || !u.mov) return '';
    var mov = u.mov;
    var na = numDe(aTexto(mov.origen)), nb = numDe(aTexto(mov.destino));
    if(!na||!nb) return '';
    if(u.captura){
      return na+'x'+nb+'='+(na*nb);
    }
    return na+'-'+nb;
  }

  /* ---------------------------------------------------- jugadas voz */

  function tokens(preg){
    return preg.toLowerCase().replace(/[,.!?;:]/g,' ').split(/\s+/);
  }

  function leerNums(texto){
    var out = [];
    var tk = tokens(texto);
    for(var i=0;i<tk.length;i++){
      var t = tk[i];
      if(/^\d{1,2}$/.test(t)){
        var n = parseInt(t,10);
        if(n>=1 && n<=64 && casillaDeNum(n)) out.push(casillaDeNum(n));
      }
    }
    return out;
  }

  function leerLetras(texto){
    var out = [];
    var tk = tokens(texto);
    for(var i=0;i<tk.length;i++){
      var t = tk[i];
      var m = t.match(/^([a-h])([1-8])$/);
      if(m) out.push(t);
      else {
        var m2 = t.match(/^([a-h])(\d)$/);
        if(m2 && parseInt(m2[2],10)>=1 && parseInt(t[2],10)<=8) out.push(t);
      }
    }
    return out;
  }

  function intentarMoverPorVoz(preg){
    var nums = leerNums(preg);
    var lets = leerLetras(preg);
    var uci = null;
    if(nums.length>=2){
      uci = nums[0] + nums[1];
    } else if(lets.length>=2){
      uci = lets[0] + lets[1];
    } else {
      return null;
    }
    var mov = UI.motor.pos.movimientoDesdeTexto(uci);
    if(!mov) return L('Esa jugada no es legal. Revisá las casillas (números 1-64 o letras como e2).','That move is not legal. Check the squares (numbers 1-64 or letters like e2).');
    var na = numDe(aTexto(mov.origen)), nb = numDe(aTexto(mov.destino));
    if(!aplicarMov(mov)) return L('No pude aplicar esa jugada.','I could not apply that move.');
    return L('Jugada: '+na+'-'+nb+'.','Move: '+na+'-'+nb+'.');
  }

  /* ------------------------------------------------------------- chat */

  function AYUDA(){
    return L(
      'Puedo: analizar la posición (analiza, mejor jugada), sugerir opciones, describir el tablero, decir la última jugada, el FEN y de quién es el turno. También mover por números (por ejemplo "mueve 44 56") o por letras ("e2 e4"). Comandos: nueva partida, deshacer, abandonar.',
      'I can: analyze the position (analyze, best move), suggest options, describe the board, tell the last move, the FEN and whose turn it is. I can also move by numbers (for example "move 44 56") or by letters ("e2 e4"). Commands: new game, undo, resign.'
    );
  }

  function responder(preg){
    preg = (preg||'').trim();
    if(!preg) return '';
    var p = preg.toLowerCase();
    idiomaAct = detectar(p);

    /* 1) ayuda / comandos */
    if(/(ayuda|qu[eé] puedo|que puedo|comandos|instrucciones|qu[eé] sab|para qu[eé] serv|opciones disponibles|help|what can you|commands|instructions|what do you do|options available)/.test(p)){
      return AYUDA();
    }

    /* 2) nueva partida */
    if(/(nueva partida|partida nueva|otra partida|reinici|empezar|empieza|empezamos|reset|borr[oó]n|de nuevo|new game|restart|start over|start a new)/.test(p)){
      if(window.nuevaPartida){ nuevaPartida(); return L('Nueva partida lista.','New game ready.'); }
      return L('No pude iniciar la partida.','I could not start the game.');
    }

    /* 3) abandonar */
    if(/(abandon|rendir|rend[íi]c|me rindo|resign|give up|forfeit|i quit)/.test(p)){
      if(window.UI && UI.fin) return L('La partida ya terminó.','The game is already over.');
      var btnAb = document.getElementById('btn-abandonar');
      if(btnAb){ btnAb.click(); return L('Partida abandonada.','Game resigned.'); }
      return L('No hay partida para abandonar.','There is no game to resign.');
    }

    /* 4) deshacer */
    if(/(deshac|deshaz|atr[áa]s|retroced|volver atr|undo|take ?back|takeback|go back)/.test(p)){
      if(window.UI && UI.fin) return L('La partida ya terminó.','The game is already over.');
      if(typeof deshacer==='function'){ deshacer(); return L('Listo, deshice la última jugada.','Done, I took back the last move.'); }
      return L('No pude deshacer.','I could not undo.');
    }

    if(!hayTablero()){
      return L('Aún no hay partida. Pulsá "Nueva partida".','No game yet. Tap "New game".');
    }

    /* 5) opciones / ideas */
    if(/(opci[oó]n|opciones|suger|sugier|idea|alternativ|recomend|propone|propuesta|qu[eé] muevo|que juego|qu[eé] hago|no s[eé] qu[eé]|option|options|suggest|alternative|recommend|what should i|what do i (play|move|do)|i don.?t know)/.test(p)){
      return opcionesTexto(3);
    }

    /* 6) analisis / mejor jugada / evaluacion */
    if(/(analiz|an[áa]lisis|explic|profundiz|a fondo|mejor|eval|valora|ventaja|c[oó]mo voy|como voy|c[oó]mo estoy|como estoy|posici[oó]n|posicion|qui[eé]n va|quien va|qui[eé]n gana|quien gana|qu[eé] tal voy|convien|analy|analysis|explain|deeper|best|advantage|how am i|how do i stand|who.?s winning|worth)/.test(p)){
      return analisisTexto();
    }

    /* 7) describir / material */
    if(/(qu[eé] ves|que ves|describe|tablero|material|piezas|cu[aá]ntas|what do you see|describe|board|material|pieces|how many)/.test(p)){
      return materialTexto() || ultimoTexto() || L('sin jugadas','no moves yet');
    }

    /* 8) ultima jugada */
    if(/[uú]ltim|pen[úu]ltim|ante[úu]ltim|last move|\blast\b|previous move/.test(p)){
      return ultimoTexto() || L('sin jugadas','no moves yet');
    }

    /* 9) fen */
    if(/fen/.test(p)){
      return L('FEN actual:\n','Current FEN:\n')+fen();
    }

    /* 10) turno */
    if(/(turno|de qui[eé]n es|a qui[eé]n le toca|a quien le toca|mueven las|le toca|whose turn|who moves|to move)/.test(p)){
      return L('Le toca a las '+turnoTexto()+'.','It is '+turnoTexto()+"'s turn.");
    }

    /* 11) saludo */
    if(/(^|\s)(hola|buenas|buen d[íi]a|hey|qu[eé] tal|holi|hello|hi|good morning|good day|good afternoon|good evening)(\s|$)/.test(p)){
      return L('¡Hola! ','Hi! ')+AYUDA();
    }

    /* 12) despedida */
    if(/(adi[oó]s|adios|chao|chau|hasta luego|nos vemos|bye|goodbye|see you)/.test(p)){
      return L('¡Hasta luego!','See you!');
    }

    /* 13) mover (numeros o letras) */
    var porVoz = intentarMoverPorVoz(p);
    if(porVoz !== null) return porVoz;

    /* 14) jugar por el usuario */
    if(/(\bjug[aá]\b|\bjuega\b|\bmov[eé]me\b|\bmueveme\b|\bjug[aá] por m|\bmueve por m|hac[eé] la jugada|te toca|you play|play for me|move for me|your move|your turn)/.test(p)){
      return jugarMejor();
    }

    return L('No te entendí. ','I did not understand. ')+AYUDA();
  }

  function jugarMejor(){
    try{
      var uci = mejorUci();
      if(!uci) return L('No encontré una jugada.','I could not find a move.');
      var mov = UI.motor.pos.movimientoDesdeTexto(uci);
      if(!mov) return L('Esa jugada no es legal.','That move is not legal.');
      aplicarMov(mov);
      return L('Jugué ','I played ')+txtUci(uci)+'.';
    }catch(e){ return L('No pude jugar.','I could not play.'); }
  }

  function enviar(txt){
    txt = (txt||'').trim();
    if(!txt) return;
    addMsg(txt,'user');
    guardar();
    setTimeout(function(){ addBot(responder(txt)); guardar(); }, 80);
    input.value='';
    sugerir();
  }

  btnEnviar.onclick = function(){ enviar(input.value); };
  input.onkeydown = function(e){ if(e.key==='Enter') btnEnviar.click(); };
  btnLimpiar.onclick = limpiar;

  /* ---------------------------------------------------------- micro */

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recon = null;

  function crearRecon(){
    if(!SR) return null;
    var r = new SR();
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    return r;
  }

  var escuchando = false;

  function pintarVoz(){
    if(btnVoz) btnVoz.textContent = escuchando ? L('...','...') : L('Hablar','Speak');
  }

  function detener(){
    escuchando = false;
    pintarVoz();
  }

  function escuchar(){
    if(!SR){ addBot(L('Tu navegador no permite voz.','Your browser does not support voice.')); return; }
    if(escuchando) return;
    try{ speechSynthesis.cancel(); }catch(e){}
    recon = crearRecon();
    recon.lang = lenguajeVoz();
    recon.onstart = function(){ escuchando = true; pintarVoz(); };
    recon.onend = function(){ detener(); };
    recon.onerror = function(){ detener(); };
    recon.onresult = function(ev){
      var t = ev.results[0][0].transcript;
      detener();
      enviar(t);
    };
    try{ recon.start(); }catch(e){ detener(); }
  }

  if(btnVoz) btnVoz.onclick = escuchar;
  pintarVoz();

  cargar();
  sugerir();

  window.chatResponder = responder;
  window.idiomaActual = function(){ return idiomaAct; };
  window.decirMensaje = decir;
})();
