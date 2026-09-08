function syncSessionViewUI(){
  ['individual','multiplayer'].forEach(v=>{
    document.getElementById('sessionView-'+v)?.classList.toggle('active',sessionView===v);
    document.getElementById('sessionPane-'+v)?.classList.toggle('active',sessionView===v);
  });
}
function setSessionView(view){
  sessionView=view==='multiplayer'?'multiplayer':'individual';
  try{ localStorage.setItem('maestroSessionView',sessionView); }catch(e){}
  syncSessionViewUI();
}

function setStudentFilter(grade, btn){
  studentGradeFilter=grade;
  document.querySelectorAll('#studentFilterBar .fchip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderStudents();
}
function setSessionFilter(grade, btn){
  sessionGradeFilter=grade;
  btn.closest('.sort-row').querySelectorAll('.fchip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderFromState();
}

// ── Modo proyector ──
