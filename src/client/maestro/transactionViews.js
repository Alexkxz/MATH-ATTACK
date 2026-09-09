// ── Transacciones de Áureos ──
const TX_REASON_LBL={
  partida:'🎮 Partida',racha_diaria:'🔥 Racha diaria',bonus_juego:'⚡ Bonus en juego',
  regalo_masivo:'🎁 Regalo del maestro',ajuste_maestro:'✏️ Ajuste maestro',
  apuesta_jugada:'🎲 Apuesta (jugada)',apuesta_ganada:'🏅 Apuesta (ganada)',
  robo_realizado:'💴 Robo de Monedas (robó)',robo_recibido:'💴 Robo de Monedas (recibió)',
};
function txReasonLbl(r){
  if(!r) return '—';
  if(r.startsWith('compra_poder:')){ const id=r.split(':')[1]; return '🛒 Compra: '+(id||'?'); }
  if(r.startsWith('compra_cosmetico:')){ const id=r.split(':')[1]; return '💄 Cosmético: '+(id||'?'); }
  if(r.startsWith('logro:')){ const id=r.split(':')[1]; return '🏆 Logro: '+(id||'?'); }
  return TX_REASON_LBL[r]||r;
}
let _txInterval=null;
function initTxTab(){
  populateTxFilter();
  loadTransactions();
  if(_txInterval) return;
  _txInterval=setInterval(()=>loadTransactions(true),5000);
}
function stopTxTab(){
  clearInterval(_txInterval); _txInterval=null;
}
let _txGrade='';
function setTxGrade(grade,btn){
  _txGrade=grade;
  document.querySelectorAll('#txGradeBar .fchip').forEach(b=>b.classList.toggle('active',b===btn));
  // Al cambiar grado, limpiar filtro de alumno y repoblar solo alumnos de ese grado
  const sel=document.getElementById('txStudentFilter');
  if(sel) sel.value='';
  populateTxFilter();
  loadTransactions();
}
function setTxStudent(name){
  // Al seleccionar alumno concreto, quitar filtro de grado
  if(name){
    _txGrade='';
    document.querySelectorAll('#txGradeBar .fchip').forEach(b=>b.classList.toggle('active',b.textContent.trim()==='Todos'));
  }
  loadTransactions();
}
function populateTxFilter(){
  const sel=document.getElementById('txStudentFilter');
  if(!sel) return;
  const current=sel.value;
  const source=_txGrade?studentsData.filter(s=>s.grade===_txGrade):studentsData;
  const names=[...new Set(source.map(s=>s.name))].sort((a,b)=>a.localeCompare(b,'es'));
  sel.innerHTML='<option value="">— Todos los alumnos —</option>'+
    names.map(n=>`<option value="${esc(n)}"${n===current?' selected':''}>${esc(n)}</option>`).join('');
}
function _txParams(){
  const name=(document.getElementById('txStudentFilter')||{}).value||'';
  const date=(document.getElementById('txDateFilter')||{}).value||'';
  const params=new URLSearchParams();
  if(name) params.set('name',name);
  else if(_txGrade) params.set('grade',_txGrade);
  if(date) params.set('date',date);
  return params;
}
async function loadTransactions(silent){
  const tbody=document.getElementById('txTableBody');
  if(!tbody) return;
  const qs=_txParams().toString();
  if(!silent) tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#64748b;padding:16px">Cargando...</td></tr>';
  try{
    const res=await fetch(adminUrl('/api/players/aureos-log'+(qs?'?'+qs:'')));
    const log=await res.json();
    if(!log.length){ tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#64748b;padding:16px">Sin transacciones registradas.</td></tr>'; return; }
    tbody.innerHTML=log.map(t=>{
      const d=new Date(t.ts);
      const fecha=d.toLocaleDateString('es-MX')+' '+d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
      const pos=t.delta>=0;
      const sign=pos?'+':'';
      const col=pos?'#34d399':'#f87171';
      return `<tr>
        <td style="white-space:nowrap;color:#94a3b8;font-size:11px">${fecha}</td>
        <td style="font-weight:700">${esc(t.name||'')}${t.grade?`<span style="font-size:9px;color:#64748b;margin-left:4px">${esc(t.grade)}</span>`:''}</td>
        <td>${txReasonLbl(t.reason)}</td>
        <td style="color:${col};font-weight:800;white-space:nowrap">${sign}${t.delta} 🪙</td>
        <td style="color:#fbbf24;white-space:nowrap">${t.balance} 🪙</td>
      </tr>`;
    }).join('');
  }catch(e){ tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#f87171;padding:16px">Error al cargar.</td></tr>'; }
}
async function clearTransactions(){
  const name=(document.getElementById('txStudentFilter')||{}).value||'';
  const date=(document.getElementById('txDateFilter')||{}).value||'';
  const parts=[];
  if(name) parts.push(`alumno: ${name}`);
  else if(_txGrade) parts.push(`grado: ${_txGrade}`);
  else parts.push('TODOS los registros');
  if(date) parts.push(`día: ${date}`);
  if(!confirm(`¿Borrar transacciones de ${parts.join(', ')}?\nEsta acción no se puede deshacer.`)) return;
  try{
    const body={};
    if(name) body.name=name;
    else if(_txGrade) body.grade=_txGrade;
    if(date) body.date=date;
    const res=await fetch('/api/players/aureos-log/clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(withAdminPassword(body))});
    const data=await res.json();
    if(data.ok){ showMsg(`🗑 ${data.removed} registros eliminados`); loadTransactions(); }
    else showMsg('Error al borrar',false);
  }catch(e){ showMsg('Error al borrar',false); }
}

// ── Historial ──
function openHistory(){ document.getElementById('histOverlay').classList.add('open'); document.getElementById('histModal').style.display='block'; }
function closeHistory(){ document.getElementById('histOverlay').classList.remove('open'); document.getElementById('histModal').style.display='none'; }
async function showHistory(name){
  document.getElementById('histTitle').textContent=name;
  document.getElementById('histContent').innerHTML='<div style="text-align:center;padding:24px;color:#64748b">Cargando...</div>';
  openHistory();
  try{
    const res=await fetch(adminUrl('/api/students/history?name='+encodeURIComponent(name)));
    const history=await res.json();
    if(!history.length){ document.getElementById('histContent').innerHTML='<div style="color:#64748b;text-align:center;padding:20px">Sin partidas registradas.</div>'; return; }
    const modeLbl={solo:'Individual',duel:'Duelo',online:'LAN'};
    const last10=history.slice(-10);
    const chartId='histChart_'+Date.now();
    document.getElementById('histContent').innerHTML=`
      <div class="hist-chart-wrap">
        <div class="hist-chart-title">ÚLTIMAS ${last10.length} PARTIDAS — PUNTAJE</div>
        <canvas id="${chartId}" height="90"></canvas>
      </div>
      <table class="hist-table">
        <thead><tr><th>Fecha</th><th>Modo</th><th>Tipo</th><th>Puntaje</th><th>%</th><th>✅</th><th>❌</th></tr></thead>
        <tbody>${history.map(r=>{
          const cls=r.pct>=80?'g':r.pct>=50?'y':'r';
          return `<tr>
            <td>${r.date||''} ${r.time||''}</td>
            <td>${modeLbl[r.gameMode]||r.gameMode}</td>
            <td>${r.difficulty||r.gameType||'—'}</td>
            <td style="font-weight:700">${(r.score||0).toLocaleString()}</td>
            <td class="hist-pct ${cls}">${r.pct}%</td>
            <td style="color:#34d399">${r.correct}</td>
            <td style="color:#f87171">${r.wrong}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    if(window.Chart){
      const ctx=document.getElementById(chartId).getContext('2d');
      new Chart(ctx,{
        type:'line',
        data:{
          labels:last10.map((_,i)=>`#${history.length-last10.length+i+1}`),
          datasets:[{
            label:'Puntaje',data:last10.map(r=>r.score||0),
            borderColor:'#a78bfa',backgroundColor:'rgba(167,139,250,.08)',
            tension:.35,pointRadius:3,pointBackgroundColor:'#a78bfa',fill:true,
          },{
            label:'% Precisión',data:last10.map(r=>r.pct||0),
            borderColor:'#34d399',backgroundColor:'rgba(52,211,153,.06)',
            tension:.35,pointRadius:3,pointBackgroundColor:'#34d399',fill:true,
            yAxisID:'y2',
          }],
        },
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{legend:{labels:{color:'#64748b',font:{size:10}}}},
          scales:{
            x:{ticks:{color:'#475569',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},
            y:{ticks:{color:'#475569',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},
            y2:{position:'right',ticks:{color:'#34d399',font:{size:9}},grid:{display:false},min:0,max:100},
          },
        },
      });
    }
  }catch(e){ document.getElementById('histContent').innerHTML='<div style="color:#f87171;text-align:center;padding:20px">Error al cargar historial.</div>'; }
}
