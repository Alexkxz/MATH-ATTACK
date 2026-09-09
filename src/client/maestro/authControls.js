function logout(){
  sessionStorage.removeItem('maestroAuth');
  location.reload();
}

function initLoginCanvas(){
  const canvas=document.getElementById('loginCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  let stars=[], W, H, raf, running=true;
  function resize(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
  function mkStar(){ return {x:Math.random()*W, y:Math.random()*H, z:Math.random()*W, pz:0}; }
  function initStars(){
    stars=Array.from({length:130},()=>{ const s=mkStar(); s.pz=s.z; return s; });
  }
  function frame(){
    if(!running) return;
    ctx.fillStyle='rgba(7,6,15,.16)';
    ctx.fillRect(0,0,W,H);
    stars.forEach(s=>{
      s.z-=2.8;
      if(s.z<=0){ Object.assign(s,mkStar()); s.pz=s.z; }
      const sx=(s.x-W/2)*(W/s.z)+W/2, sy=(s.y-H/2)*(W/s.z)+H/2;
      const px=(s.x-W/2)*(W/s.pz)+W/2, py=(s.y-H/2)*(W/s.pz)+H/2;
      s.pz=s.z;
      const a=Math.max(0,Math.min(.85,(W-s.z)/W*1.3));
      const sz=Math.max(.4,(W-s.z)/W*2.8);
      ctx.beginPath(); ctx.strokeStyle=`rgba(0,229,255,${a})`; ctx.lineWidth=sz;
      ctx.moveTo(px,py); ctx.lineTo(sx,sy); ctx.stroke();
    });
    raf=requestAnimationFrame(frame);
  }
  window.addEventListener('resize',()=>{ resize(); initStars(); });
  resize(); initStars(); frame();
  // Cargar top score y conteo de alumnos
  Promise.all([
    fetch('/api/ranking').then(r=>r.json()).catch(()=>[]),
    fetch(adminUrl('/api/players')).then(r=>r.json()).catch(()=>[])
  ]).then(([ranking, players])=>{
    if(ranking.length){
      const top=Math.max(...ranking.map(r=>r.score||0));
      const el=document.getElementById('loginTopScore');
      if(el) el.textContent=String(top).padStart(6,'0');
    }
    if(players.length){
      const el=document.getElementById('loginAlumnos');
      if(el) el.textContent=String(players.length).padStart(2,'0');
    }
  });
  // Detener al ocultar el overlay
  new MutationObserver(()=>{
    if(document.getElementById('loginOverlay').classList.contains('hidden')){
      running=false; cancelAnimationFrame(raf);
    }
  }).observe(document.getElementById('loginOverlay'),{attributes:true,attributeFilter:['class']});
}