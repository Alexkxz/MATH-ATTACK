function saveTabOrder(){
  const order=[...document.querySelectorAll('.tab-bar .tab-btn')].map(b=>b.id.replace('tab-',''));
  localStorage.setItem('prTabOrder',JSON.stringify(order));
}
function loadTabOrder(){
  try{
    const order=JSON.parse(localStorage.getItem('prTabOrder')||'null');
    if(!Array.isArray(order)) return;
    const bar=document.querySelector('.tab-bar');
    order.forEach(name=>{ const btn=document.getElementById('tab-'+name); if(btn) bar.appendChild(btn); });
  }catch(e){}
}
function initTabDrag(){
  const bar=document.querySelector('.tab-bar');
  let dragSrc=null;
  bar.querySelectorAll('.tab-btn[draggable]').forEach(btn=>{
    btn.addEventListener('dragstart',e=>{
      dragSrc=btn; btn.style.opacity='.45';
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',btn.id);
    });
    btn.addEventListener('dragend',()=>{
      if(dragSrc) dragSrc.style.opacity='';
      dragSrc=null;
      bar.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('tab-drag-over'));
    });
    btn.addEventListener('dragover',e=>{
      e.preventDefault(); e.dataTransfer.dropEffect='move';
      bar.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('tab-drag-over'));
      if(btn!==dragSrc) btn.classList.add('tab-drag-over');
    });
    btn.addEventListener('dragleave',()=>btn.classList.remove('tab-drag-over'));
    btn.addEventListener('drop',e=>{
      e.preventDefault();
      if(!dragSrc||dragSrc===btn) return;
      btn.classList.remove('tab-drag-over');
      const allBtns=[...bar.querySelectorAll('.tab-btn')];
      const si=allBtns.indexOf(dragSrc), di=allBtns.indexOf(btn);
      if(si<di) bar.insertBefore(dragSrc,btn.nextSibling);
      else bar.insertBefore(dragSrc,btn);
      saveTabOrder();
    });
  });
}

// ── Exportar CSV ──
