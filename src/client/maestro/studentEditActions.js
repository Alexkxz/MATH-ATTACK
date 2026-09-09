function openAureosEdit(btn){
  const sid=btn.dataset.sid;
  const current=parseInt(btn.dataset.aureos)||0;
  openPopup('🪙 Editar Áureos','Nuevo saldo de Áureos para este alumno',current,btn,async val=>{
    try{
      const res=await fetch('/api/players/admin-aureos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sid,aureos:val,password:_adminPass})});
      const data=await res.json();
      if(data.ok){
        const s=studentsData.find(x=>x.id===sid);
        if(s){ s.aureos=data.aureos; const card=document.getElementById('sca-'+sid); if(card) card.outerHTML=renderCard(s); }
        showMsg('✅ Áureos actualizados');
      }
    }catch(e){ showMsg('Error al actualizar Áureos',false); }
  });
}

// ── Cambiar PIN ──
function openPinEdit(btn){
  const sid=btn.dataset.sid;
  const input=document.getElementById('epInput');
  const title=document.getElementById('epTitle');
  const hint=document.getElementById('epHint');
  // Configurar popup para PIN (texto, no número)
  title.textContent='🔑 Cambiar PIN';
  hint.textContent='Nuevo PIN de 4 dígitos (0000–9999)';
  document.getElementById('epSelect').style.display='none';
  input.style.display=''; input.value=''; input.type='text';
  input.maxLength=4; input.pattern='[0-9]{4}'; input.placeholder='0000';
  const popup=document.getElementById('editPopup');
  const overlay=document.getElementById('editOverlay');
  popup.style.display='block';
  overlay.classList.add('open');
  const rect=btn.getBoundingClientRect();
  const popW=220,popH=140;
  let left=rect.left, top=rect.bottom+8;
  if(left+popW>window.innerWidth-8) left=window.innerWidth-popW-8;
  if(top+popH>window.innerHeight-8) top=rect.top-popH-8;
  popup.style.left=Math.max(8,left)+'px';
  popup.style.top=Math.max(8,top)+'px';
  input.focus();
  _popupCb=async ()=>{
    const pin=input.value.trim().padStart(4,'0');
    if(pin.length!==4||isNaN(Number(pin))){ showMsg('❌ PIN debe ser de 4 dígitos',false); return false; }
    try{
      const res=await fetch('/api/players/admin-pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(withAdminPassword({id:sid,pin}))});
      const data=await res.json();
      if(data.ok){ showMsg('✅ PIN actualizado'); input.type='number'; return true; }
      else { showMsg('❌ '+(data.error||'Error'),false); return false; }
    }catch(e){ showMsg('Error al cambiar PIN',false); return false; }
  };
}

// ── Ver PIN ──
async function showPin(btn){
  const sid=btn.dataset.sid;
  const orig=btn.innerHTML;
  btn.textContent='...';
  try{
    const res=await fetch('/api/players/get-pin?id='+sid+'&pwd='+encodeURIComponent(_adminPass));
    const data=await res.json();
    if(data.ok){
      btn.textContent=data.pin;
      btn.style.background='rgba(96,165,250,.2)';
      btn.style.color='#60a5fa';
      setTimeout(()=>{ btn.innerHTML=orig; btn.style.background=''; btn.style.color=''; },4000);
    } else { btn.innerHTML=orig; }
  }catch(e){ btn.innerHTML=orig; }
}

// ── Cambiar grado escolar ──
function openGradeEdit(btn){
  const sid=btn.dataset.sid;
  const currentGrade=btn.dataset.grade||'';
  const input=document.getElementById('epInput');
  const sel=document.getElementById('epSelect');
  const title=document.getElementById('epTitle');
  const hint=document.getElementById('epHint');
  title.textContent='🎓 Cambiar grado escolar';
  hint.textContent='Selecciona el nuevo grado del alumno';
  input.style.display='none';
  sel.style.display='';
  sel.value=currentGrade;
  const popup=document.getElementById('editPopup');
  const overlay=document.getElementById('editOverlay');
  popup.style.display='block';
  overlay.classList.add('open');
  const rect=btn.getBoundingClientRect();
  const popW=230,popH=160;
  let left=rect.left, top=rect.bottom+8;
  if(left+popW>window.innerWidth-8) left=window.innerWidth-popW-8;
  if(top+popH>window.innerHeight-8) top=rect.top-popH-8;
  popup.style.left=Math.max(8,left)+'px';
  popup.style.top=Math.max(8,top)+'px';
  sel.focus();
  _popupCb=async (grade)=>{
    try{
      const res=await fetch('/api/players/admin-grade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(withAdminPassword({id:sid,grade}))});
      const data=await res.json();
      if(data.ok){
        const s=studentsData.find(x=>x.id===sid);
        if(s) s.grade=data.grade;
        btn.dataset.grade=data.grade||'';
        const lbl=document.getElementById('sgrd-'+sid);
        if(lbl) lbl.textContent=data.grade||'Sin grado';
        showMsg('✅ Grado actualizado');
        return true;
      } else { showMsg('❌ '+(data.error||'Error'),false); return false; }
    }catch(e){ showMsg('Error al cambiar grado',false); return false; }
  };
}

// ── Editar poder ──
function openPowerEdit(tile){
  const sid=tile.dataset.sid;
  const pid=tile.dataset.pid;
  const current=parseInt(tile.querySelector('.ptile-qty').textContent)||0;
  const def=POWERS_DEF.find(p=>p.id===pid);
  if(!def) return;
  openPopup(def.icon+' '+def.name,'Cantidad en el inventario del alumno',current,tile,async val=>{
    try{
      const res=await fetch('/api/players/admin-power',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sid,powerId:pid,qty:val,password:_adminPass})});
      const data=await res.json();
      if(data.ok){
        const s=studentsData.find(x=>x.id===sid);
        if(s){ s.inventory=s.inventory||{}; if(val>0) s.inventory[pid]=val; else delete s.inventory[pid]; }
        // Actualizar solo la tarjeta afectada
        const card=document.getElementById('sca-'+sid);
        if(card&&s) card.outerHTML=renderCard(s);
        showMsg('✅ Poder actualizado');
      }
    }catch(e){ showMsg('Error al actualizar poder',false); }
  });
}

// ── Registrar y eliminar alumnos ──
function openAddStudent(){
  document.getElementById('asmName').value='';
  document.getElementById('asmGrade').value='';
  document.getElementById('asmPin').value='';
  document.getElementById('asmMsg').textContent='';
  document.getElementById('asmOverlay').classList.add('open');
  document.getElementById('asmModal').style.display='block';
  document.getElementById('asmName').focus();
}
function closeAddStudent(){
  document.getElementById('asmOverlay').classList.remove('open');
  document.getElementById('asmModal').style.display='none';
}