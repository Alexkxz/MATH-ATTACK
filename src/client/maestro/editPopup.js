function openPopup(title, hint, currentVal, anchorEl, callback){
  _popupCb=callback;
  document.getElementById('epTitle').textContent=title;
  document.getElementById('epHint').textContent=hint;
  const inp=document.getElementById('epInput');
  inp.style.display=''; inp.type='number'; inp.value=currentVal;
  document.getElementById('epSelect').style.display='none';
  const popup=document.getElementById('editPopup');
  const overlay=document.getElementById('editOverlay');
  popup.style.display='block';
  overlay.classList.add('open');
  // Posicionar cerca del elemento anclado
  const rect=anchorEl.getBoundingClientRect();
  const popW=220, popH=140;
  let left=rect.left;
  let top=rect.bottom+8;
  if(left+popW>window.innerWidth-8) left=window.innerWidth-popW-8;
  if(top+popH>window.innerHeight-8) top=rect.top-popH-8;
  popup.style.left=Math.max(8,left)+'px';
  popup.style.top=Math.max(8,top)+'px';
  document.getElementById('epInput').focus();
  document.getElementById('epInput').select();
}

function closePopup(){
  document.getElementById('editPopup').style.display='none';
  document.getElementById('editOverlay').classList.remove('open');
  // Restaurar input numérico y ocultar select
  const inp=document.getElementById('epInput');
  inp.style.display=''; inp.type='number';
  document.getElementById('epSelect').style.display='none';
  _popupCb=null;
}

async function savePopup(){
  if(!_popupCb) return closePopup();
  const input=document.getElementById('epInput');
  const sel=document.getElementById('epSelect');
  // Select de grado visible
  if(sel.style.display!=='none'){
    const ok=await _popupCb(sel.value);
    if(ok!==false) closePopup();
  } else if(input.type==='text'){
    // PIN (texto)
    const ok=await _popupCb();
    if(ok!==false){ input.type='number'; closePopup(); }
  } else {
    const val=Math.max(0,parseInt(input.value)||0);
    await _popupCb(val);
    closePopup();
  }
}
