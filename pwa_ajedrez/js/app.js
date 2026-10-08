(function(){
  const mensajes = document.getElementById('chat-mensajes');
  const input = document.getElementById('chat-input');
  const btnEnviar = document.getElementById('btn-enviar-chat');
  const btnLimpiar = document.getElementById('btn-limpiar-chat');
  const sugerencias = document.getElementById('chat-sugerencias');

  function addMsg(text,who){
    const div = document.createElement('div');
    div.className = 'msg msg-'+who;
    div.textContent = text;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  function limpiar(){
    mensajes.innerHTML='';
    try{localStorage.removeItem('ajedrez_chat');}catch(e){}
  }

  function guardar(){
    const items = [];
    mensajes.querySelectorAll('.msg').forEach(m=>{
      const who = m.classList.contains('msg-user')?'user':'bot';
      items.push({who,text:m.textContent});
    });
    try{localStorage.setItem('ajedrez_chat', JSON.stringify(items.slice(-40)));}catch(e){}
  }

  function cargar(){
    try{
      const data = JSON.parse(localStorage.getItem('ajedrez_chat')||'[]');
      data.forEach(x=>addMsg(x.text,x.who));
    }catch(e){}
  }

  function getEstado(){
    if(!window.UI||!UI.motor)return null;
    const fen = UI.motor.fen();
    const pos = UI.motor.pos;
    const legals = (pos.movimientosLegales||[]).map(m=>m.uci);
    const hist = (UI.jugadas||[]).slice(-10);
    return {fen, turno: pos.turno, legals, hist};
  }

  function mejorUci(){
    try{
      if(!window.buscarRaiz||!UI.motor)return null;
      const r = buscarRaiz(UI.motor.pos, 4, {fecha:Date.now(),nodos:0,paso:4096,mejor:null}, false);
      return r&&r.mov?r.mov.uci:null;
    }catch(e){return null;}
  }

  function evalSimple(){
    try{ if(window.evaluar&&UI.motor) return evaluar(UI.motor.pos); }catch(e){}
    return 0;
  }

  function responder(preg){
    const st = getEstado();
    if(!st)return 'Sin posición. Empezá una partida o mueve una pieza.';
    const p = preg.toLowerCase();
    if(p.includes('mejor jugada')){
      const m = mejorUci();
      if(!m) return 'Jugadas legales: '+st.legals.slice(0,8).join(', ')+(st.legals.length>8?'...':'');
      return 'Mejor jugada: '+m+'\nFEN: '+st.fen;
    }
    if(p.includes('analiza')||p.includes('explica posicion')||p.includes('explica la posicion')){
      const m = mejorUci();
      const ev = evalSimple();
      return 'FEN: '+st.fen+'\nTurno: '+(st.turno?'Blancas':'Negras')+'\nLegales: '+st.legals.length+'\nEval (aprox): '+ev+'\nRecomendado: '+(m||'-')+'\nÚltimas: '+(st.hist.length?st.hist.join(' '):'-');
    }
    if(p.includes('cual es la mejor jugada')){
      const m = mejorUci();
      return m? 'La mejor jugada ahora es '+m : 'Dame un momento o indica posición.';
    }
    if(p.includes('sugerir')||p.includes('sugerencia')){
      const m = mejorUci();
      const otros = st.legals.filter(x=>x!==m).slice(0,2);
      return 'Te sugiero:\n- '+(m||otros[0]||'-')+(otros[0]&&m?'\n- '+otros[0]:'')+(otros[1]?'\n- '+otros[1]:'');
    }
    if(p.includes('fen')){
      return 'FEN actual:\n'+st.fen;
    }
    return 'Puedo: "mejor jugada", "analiza", "sugerir 2 jugadas", "FEN". Pregunta lo que quieras.';
  }

  btnEnviar.onclick=function(){
    const txt=input.value.trim(); if(!txt)return;
    addMsg(txt,'user'); guardar();
    setTimeout(function(){ addMsg(responder(txt),'bot'); guardar(); }, 80);
    input.value=''; sugerir();
  };
  input.onkeydown=function(e){ if(e.key==='Enter') btnEnviar.click(); };
  btnLimpiar.onclick=limpiar;
  cargar(); sugerir();
  setInterval(sugerir,4000);
})();
document.addEventListener('DOMContentLoaded', function(){
  var btnA = document.getElementById('btn-abandonar');
  if(btnA){
    btnA.onclick = function(){
      if(UI.fin) return;
      var quien = UI.humanoEsBlancas ? 'Blancas abandonan' : 'Negras abandonan';
      var gana = UI.humanoEsBlancas ? 'Ganan las Negras' : 'Ganan las Blancas';
      UI.fin = true;
      UI.estado = gana + ' - ' + quien;
      id('fin-titulo').textContent = 'Partida abandonada';
      id('fin-texto').textContent = gana + '. ' + quien + '.';
      id('fin-resumen').innerHTML = '';
      id('modal-fin').hidden = false;
      if(UI.tick){ clearInterval(UI.tick); UI.tick=null; UI.relojArrancado=false; }
      if(window.UI && UI.iaTimeout){ clearTimeout(UI.iaTimeout); UI.iaTimeout=null; }
    };
  }
});
