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
async function registerStudent(){
  const name=document.getElementById('asmName').value.trim();
  const grade=document.getElementById('asmGrade').value.trim();
  const pin=String(document.getElementById('asmPin').value).padStart(4,'0');
  const msgEl=document.getElementById('asmMsg');
  if(!name){ msgEl.textContent='El nombre es requerido'; return; }
  if(pin.length!==4||isNaN(Number(pin))){ msgEl.textContent='La contraseña debe ser de 4 dígitos'; return; }
  try{
    const res=await fetch('/api/players/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,pin,grade})});
    const data=await res.json();
    if(data.ok){ closeAddStudent(); showMsg('✅ '+name+' registrado'); loadStudents(); }
    else { msgEl.textContent='❌ '+data.error; }
  }catch(e){ msgEl.textContent='Error al registrar'; }
}

async function deleteStudent(id){
  if(!confirm('¿Eliminar este alumno y todos sus datos?')) return;
  const pwd=prompt('Contraseña de administrador:');
  if(!pwd) return;
  try{
    const r=await fetch('/api/players/'+id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
    const res=await r.json();
    if(!res.ok){ alert('Contraseña incorrecta'); return; }
    loadStudents();
  }catch(e){}
}