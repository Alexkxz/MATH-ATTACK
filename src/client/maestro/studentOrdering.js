function initStudentDragDrop(){
  const grid=document.getElementById('studentsList');
  grid.addEventListener('dragstart',e=>{
    const card=e.target.closest('.sc-card');
    if(!card) return;
    _dragSrcId=card.id.replace('sca-','');
    _isDragging=true;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',_dragSrcId);
  });
  grid.addEventListener('dragend',e=>{
    const card=e.target.closest('.sc-card');
    if(card) card.classList.remove('dragging');
    grid.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
    setTimeout(()=>{ _isDragging=false; },50);
  });
  grid.addEventListener('dragover',e=>{
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    const card=e.target.closest('.sc-card');
    grid.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
    if(card&&card.id.replace('sca-','')!==_dragSrcId) card.classList.add('drag-over');
  });
  grid.addEventListener('dragleave',e=>{
    if(!grid.contains(e.relatedTarget)) grid.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
  });
  grid.addEventListener('drop',e=>{
    e.preventDefault();
    const card=e.target.closest('.sc-card');
    grid.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
    if(!card) return;
    const targetId=card.id.replace('sca-','');
    if(!_dragSrcId||_dragSrcId===targetId) return;
    // Orden visible actual desde el DOM
    const visIds=[...grid.querySelectorAll('.sc-card')].map(c=>c.id.replace('sca-',''));
    const si=visIds.indexOf(_dragSrcId), ti=visIds.indexOf(targetId);
    if(si<0||ti<0) return;
    visIds.splice(si,1); visIds.splice(ti,0,_dragSrcId);
    // Asegurar que customStudentOrder contenga todos los alumnos actuales
    const allIds=studentsData.map(s=>s.id);
    if(!customStudentOrder.length) customStudentOrder=[...allIds];
    allIds.forEach(id=>{ if(!customStudentOrder.includes(id)) customStudentOrder.push(id); });
    // Combinar: preservar posiciones de alumnos no visibles
    const visSet=new Set(visIds);
    const remaining=[...visIds];
    const newOrder=customStudentOrder.map(id=>visSet.has(id)?remaining.shift():id);
    customStudentOrder=newOrder;
    localStorage.setItem('maestroStudentOrder',JSON.stringify(customStudentOrder));
    renderStudents();
  });
}

function resetStudentOrder(){
  customStudentOrder=[];
  localStorage.removeItem('maestroStudentOrder');
  renderStudents();
}
