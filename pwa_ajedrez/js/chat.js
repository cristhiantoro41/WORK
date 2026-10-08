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
    localStorage.removeItem('ajedrez_chat');
  }

  function guardar(){
    const items = [];
    mensajes.querySelectorAll('.msg').forEach(m=>{
      const who = m.classList.contains('msg-user')?'user':'bot';
      items.push({who,text:m.textContent});
    });
    localStorage.setItem('ajedrez_chat', JSON.stringify(items.slice(-30)));
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
    return {fen, turno: pos.turno, legals: (pos.movimientosLegales||[]).map(m=>m.uci)};
  }

  function sugerir(){
    const st = getEstado();
    if(!st)return;
    sugerencias.innerHTML='';
    const ideas = ['mejor jugada','explica posición','analiza FEN','sugiere 2 jugadas','explica última jugada'];
    ideas.forEach(t=>{
      const b=document.createElement('button');
      b.className='sug'; b.textContent=t;
      b.onclick=()=>{input.value=t+' ('+st.fen+')';};
      sugerencias.appendChild(b);
    });
  }

  function mejorUci(){
    try{
      if(!window.buscarRaiz||!UI.motor)return null;
      const r = buscarRaiz(UI.motor.pos, 3, {fecha:Date.now(),nodos:0,paso:4096,mejor:null}, false);
      return r&&r.mov?r.mov.uci:null;
    }catch(e){return null;}
  }

  function responder(preg){
    const st = getEstado();
    if(!st)return 'Sin posición.';
    const p = preg.toLowerCase();
    if(p.includes('mejor jugada')){
      const m = mejorUci();
      return m? 'Mejor jugada sugerida (profundidad ~3): '+m : 'No encuentro sugerencia ahora.';
    }
    if(p.includes('explica posicion')||p.includes('analiza fen')||p.includes('analiza pos')){
      const m = mejorUci();
      return 'FEN: '+st.fen+'\nTurno: '+(st.turno?'Blancas':'Negras')+'\nJugadas legales: '+st.legals.length+'\nSugerencia: '+(m||'-')+'\n(Análisis local, offline)';
    }
    if(p.includes('ultima jugada')||p.includes('explica última')){
      return 'Usa historial/capturas para ver última jugada. Puedo sugerir mejor respuesta desde posición actual.';
    }
    if(p.includes('sugiere 2')){
      const m = mejorUci();
      const otros = st.legals.filter(x=>x!==m).slice(0,1);
      return 'Sugerencias:\n1) '+(m||otros[0]||'-')+'\n2) '+(otros[0]||'-');
    }
    return 'Puedo: "mejor jugada", "explica posición", "analiza FEN", "sugiere 2 jugadas". FEN actual: '+st.fen;
  }

  btnEnviar.onclick=()=>{
    const txt=input.value.trim(); if(!txt)return;
    addMsg(txt,'user'); guardar();
    setTimeout(()=>{addMsg(responder(txt),'bot'); guardar();},100);
    input.value=''; sugerir();
  };
  input.onkeydown=e=>{if(e.key==='Enter')btnEnviar.click();};
  btnLimpiar.onclick=limpiar;
  cargar(); sugerir();
  setInterval(sugerir,5000);
})();
