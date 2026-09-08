function renderStudents(){
  const el=document.getElementById('studentsList');
  const cnt=document.getElementById('studentsCount');
  // Conservar qué tarjetas tenían el panel de poderes expandido antes de reconstruir
  // (antes el refresco automático de 5s las colapsaba sin avisar)
  const openIds=[...el.querySelectorAll('.sc-card.powers-open')].map(c=>c.id);
  if(!studentsData.length){
    el.innerHTML='<div style="color:#4b5563;font-size:12px;padding:8px;grid-column:1/-1">No hay alumnos registrados.</div>';
    cnt.textContent='';
    return;
  }
  let filtered=studentGradeFilter?studentsData.filter(s=>s.grade===studentGradeFilter):[...studentsData];
  if(customStudentOrder.length) filtered.sort((a,b)=>{
    const ai=customStudentOrder.indexOf(a.id), bi=customStudentOrder.indexOf(b.id);
    return (ai<0?1e9:ai)-(bi<0?1e9:bi);
  });
  cnt.textContent=`(${filtered.length}/${studentsData.length})`;
  const ab=document.getElementById('tabBadgeAlumnos'); if(ab) ab.textContent=studentsData.length;
  el.innerHTML=filtered.length?filtered.map(s=>renderCard(s)).join(''):'<div style="color:#4b5563;font-size:12px;padding:8px;grid-column:1/-1">Sin alumnos en este grado.</div>';
  openIds.forEach(id=>{ document.getElementById(id)?.classList.add('powers-open'); });
}
