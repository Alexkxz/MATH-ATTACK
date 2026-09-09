// ── Anuncio ──
function openAnnounce(){
  document.getElementById('annText').value='';
  document.getElementById('announceOverlay').classList.add('open');
  document.getElementById('announceModal').style.display='block';
  document.getElementById('annText').focus();
}
function closeAnnounce(){
  document.getElementById('announceOverlay').classList.remove('open');
  document.getElementById('announceModal').style.display='none';
}
function addEmoji(e){ const t=document.getElementById('annText'); t.value+=e; t.focus(); }
function sendAnnouncement(){
  const text=document.getElementById('annText').value.trim();
  if(!text) return;
  if(!ws||ws.readyState!==WebSocket.OPEN){ showMsg('❌ Sin conexión — el anuncio no se envió',false); return; }
  ws.send(JSON.stringify({type:'maestro_announcement',text,password:_adminPass}));
  showMsg('✅ Anuncio enviado');
  closeAnnounce();
}