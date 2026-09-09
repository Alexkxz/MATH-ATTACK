async function saveAjustes(){
  const curPass=document.getElementById('ajCurPass').value;
  const newUser=document.getElementById('ajNewUser').value.trim();
  const newPass=document.getElementById('ajNewPass').value;
  const newPass2=document.getElementById('ajNewPass2').value;
  const msgEl=document.getElementById('ajMsg');
  msgEl.className='aj-msg';
  msgEl.textContent='';

  if(!curPass){ msgEl.className='aj-msg err'; msgEl.textContent='Ingresa tu contraseña actual'; return; }
  if(!newUser&&!newPass){ msgEl.className='aj-msg err'; msgEl.textContent='Ingresa al menos un campo a cambiar'; return; }
  if(newPass&&newPass!==newPass2){ msgEl.className='aj-msg err'; msgEl.textContent='Las contraseñas no coinciden'; return; }
  if(newPass&&newPass.length<4){ msgEl.className='aj-msg err'; msgEl.textContent='La contraseña debe tener al menos 4 caracteres'; return; }
  if(newUser&&newUser.length<2){ msgEl.className='aj-msg err'; msgEl.textContent='El usuario debe tener al menos 2 caracteres'; return; }

  try{
    const res=await fetch('/api/maestro/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:curPass,newUsername:newUser||undefined,newPassword:newPass||undefined})});
    const data=await res.json();
    if(data.ok){
      msgEl.className='aj-msg ok'; msgEl.textContent='✅ Credenciales actualizadas correctamente';
      document.getElementById('ajCurPass').value='';
      document.getElementById('ajNewUser').value='';
      document.getElementById('ajNewPass').value='';
      document.getElementById('ajNewPass2').value='';
      loadAjustes();
      // Invalidar sesión para que deba iniciar sesión de nuevo con las nuevas credenciales
      sessionStorage.removeItem('maestroAuth');
      setTimeout(()=>{ location.reload(); }, 2000);
    } else {
      msgEl.className='aj-msg err'; msgEl.textContent='❌ '+(data.error||'Error al guardar');
    }
  }catch(e){ msgEl.className='aj-msg err'; msgEl.textContent='Error de conexión'; }
}