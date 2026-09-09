// ── Áureos masivos ──
function openBulkAureos(){
  document.getElementById('bulkAmount').value=50;
  document.getElementById('bulkGrade').value='';
  document.getElementById('bulkMsg').textContent='';
  document.getElementById('bulkOverlay').classList.add('open');
  document.getElementById('bulkModal').style.display='block';
  document.getElementById('bulkAmount').focus();
}
function closeBulkAureos(){
  document.getElementById('bulkOverlay').classList.remove('open');
  document.getElementById('bulkModal').style.display='none';
}
async function saveBulkAureos(){
  const amount=parseInt(document.getElementById('bulkAmount').value)||0;
  const grade=document.getElementById('bulkGrade').value;
  const msgEl=document.getElementById('bulkMsg');
  if(amount<1){ msgEl.style.color='#f87171'; msgEl.textContent='Cantidad mínima: 1'; return; }
  try{
    const res=await fetch('/api/players/bulk-aureos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(withAdminPassword({grade,amount}))});
    const data=await res.json();
    if(data.ok){ showMsg(`✅ +${amount} Áureos a ${data.count} alumnos`); closeBulkAureos(); }
    else { msgEl.style.color='#f87171'; msgEl.textContent='Error al procesar'; }
  }catch(e){ msgEl.style.color='#f87171'; msgEl.textContent='Error de red'; }
}