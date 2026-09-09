// ── WebSocket ──
const WS_URL='ws://'+location.host+'/ws-maestro';
let ws;
let _reconnectAttempts=0;
function connect(){
  ws=new WebSocket(WS_URL);
  ws.onopen=()=>{
    _reconnectAttempts=0;
    document.getElementById('dot').style.background='#34d399'; document.getElementById('connTxt').textContent='Conectado';
    const grid=document.getElementById('grid'); if(grid) grid.style.opacity='1';
  };
  ws.onclose=()=>{
    document.getElementById('dot').style.background='#f87171';
    document.getElementById('connTxt').textContent='Desconectado — reconectando...';
    // Las tarjetas que quedan en pantalla son del último estado conocido — atenuarlas
    // para que el profesor no las confunda con datos en vivo mientras se reconecta
    const grid=document.getElementById('grid'); if(grid) grid.style.opacity='0.4';
    _reconnectAttempts++;
    const delay=Math.min(1000*_reconnectAttempts,10000);
    setTimeout(connect,delay);
  };
  ws.onmessage=e=>{ try{
    const d=JSON.parse(e.data);
    if(d.type==='panel_state'){
      latestSessions=d.sessions||[]; connectedNames=d.connectedNames||[];
      if(d.examFinished!==undefined){
        latestExamFinished=d.examFinished||[];
        _notifyLateExamFinishers(latestExamFinished);
      }
      renderFromState();
      updateOnlineBadges();
      if(d.examMode!==undefined) updateExamBanner(d.examMode);
      if(d.opStats) updateOpStats(d.opStats);
    } else if(d.type==='students_updated'){
      if(d.newUser) showMsg('👤 Nuevo usuario "'+d.newUser+'" creado');
      // Solo re-renderizar si la pestaña alumnos está activa; si no, marcar como sucio
      if(document.getElementById('panel-alumnos')?.classList.contains('active')) loadStudents();
      else _studentsDirty=true;
    } else if(d.type==='conn_event'){
      appendCxLog(d);
    }
  }catch(e){} };
}
