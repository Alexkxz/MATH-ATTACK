function toggleProjector(){
  projectorMode=!projectorMode;
  if(projectorMode) switchTab('sesiones');
  document.body.classList.toggle('proj-mode',projectorMode);
  document.getElementById('btnProj').classList.toggle('on',projectorMode);
}