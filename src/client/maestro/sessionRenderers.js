function _cardHash(s,now){
  const fa=now-(s.lastResultTs||0);
  return JSON.stringify([s.name,s.grade,s.gameMode,s.mpGameMode,s.gameType,s.difficulty,
    s.score,s.qIndex,s.totalQ,s.currentTable,s.currentQuestion,s.correct,s.wrong,
    s.tblSelMode,s.tables,s.paused,s.status,s.lives,s.livesTotal,s.streak,
    s.inventory,s.avatar,s.themeColor,fa<2000?s.lastResult:null,fa<2000]);
}
function _buildCard(s,now){
  // Alumno conectado pero todavía en el menú (no ha iniciado partida) — tarjeta compacta
  if(s.gameMode==='idle'){
    const themeHexIdle=THEME_COLORS_HEX[s.themeColor||'']||'#7c3aed';
    const discBadgeIdle=s.disconnected?'<span class="s-badge" style="background:rgba(148,163,184,.2);color:#94a3b8;border-color:rgba(148,163,184,.3)">📶 Reconectando...</span>':'';
    return '<div class="session-card idle" data-sid="'+s.id+'">'+
      '<div class="sc2-top" style="margin-bottom:0">'+
        '<div class="sc2-avatar-col">'+
          '<div class="sc2-avatar-wrap" style="width:46px;height:46px">'+
            '<div class="sc2-avatar-inner" style="inset:0;border-color:'+themeHexIdle+'">'+buildAvatarSVG(s.avatar,40)+'</div>'+
          '</div>'+
        '</div>'+
        '<div class="sc2-info">'+
          '<div class="sc2-name-row"><span class="s-name">'+esc(s.name)+'</span></div>'+
          '<div class="sc2-badges">'+
            (s.grade?'<span class="s-grade">'+esc(s.grade)+'</span>':'')+
            '<span class="s-badge" style="background:rgba(148,163,184,.15);color:#94a3b8;border:1px solid rgba(148,163,184,.25)">🟡 En el menú</span>'+
            discBadgeIdle+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }
  const pct=s.totalQ>0?Math.round((s.qIndex/s.totalQ)*100):0;
  const mode=s.gameMode==='duel'?'duel':s.gameMode==='online'?'online':'solo';
  const modeLbl=s.isExam?'📝 Prueba':s.gameMode==='duel'?'⚔️ Duelo':s.gameMode==='online'?'🌐 '+(s.mpGameMode||'MP'):'🧑 Individual';
  const statusCls=s.disconnected?'disconnected':s.paused?'paused':s.status==='finished'?'finished':'playing';
  const acc=s.correct+s.wrong>0?Math.round(s.correct/(s.correct+s.wrong)*100):0;
  const fa=now-(s.lastResultTs||0);
  const flashCls=s.disconnected?'':fa<2000?(s.lastResult==='correct'?' flash-correct':s.lastResult==='wrong'?' flash-wrong':''):'';
  const qFlashCls=fa<2000?(s.lastResult==='correct'?' flash-c':s.lastResult==='wrong'?' flash-w':''):'';
  const timePct=s.timeLimit>0?Math.max(0,Math.round((s.timeLeft/s.timeLimit)*100)):0;
  const timeColor=timePct>50?'#34d399':timePct>25?'#fbbf24':'#f87171';
  const timeBar=s.timeLimit>0&&!s.paused&&s.status!=='finished'&&!s.disconnected
    ?'<div class="time-mini"><div class="time-mini-fill" data-tf style="width:'+timePct+'%;background:'+timeColor+'"></div></div>':'';
  const elapsed=Math.floor((now-(s.startTime||now))/1000);
  let livesHtml='';
  if(s.gameType==='lives'&&s.livesTotal>0){
    const h='❤️'.repeat(Math.max(0,s.lives))+'🖤'.repeat(Math.max(0,s.livesTotal-s.lives));
    livesHtml='<div class="lives-row" style="margin-bottom:8px">'+h+'</div>';
  }
  const streakHtml=s.streak>=2?'<span class="streak-badge">🔥 '+s.streak+'</span>':'';
  const discBadge=s.disconnected?'<span class="s-badge" style="background:rgba(148,163,184,.2);color:#94a3b8;border-color:rgba(148,163,184,.3)">📶 Reconectando...</span>':'';
  const pausedBadge=s.paused&&!s.disconnected?'<span class="s-badge badge-paused">⏸ Pausa</span>':'';

  // ── Avatar + anillo de progreso ──
  const ringColor={playing:'#00ff88',paused:'#ffc800',finished:'#ff3264',disconnected:'#94a3b8'}[statusCls]||'#00ff88';
  const R=25,CIRC=2*Math.PI*R;
  const ringDash=(pct/100*CIRC).toFixed(1)+' '+CIRC.toFixed(1);
  const themeHex=THEME_COLORS_HEX[s.themeColor||'']||'#7c3aed';
  const avatarSVG=buildAvatarSVG(s.avatar,44);
  const statusIcon=s.disconnected?'📶':s.paused?'⏸':s.status==='finished'?'🏁':'🟢';
  const tablasLbl=s.tblSelMode==='all'?'1–12':s.tblSelMode==='random'?'🎲 Aleat.':(s.tables?.length||0)+' tbls';

  return '<div class="session-card '+statusCls+flashCls+'" data-sid="'+s.id+'">'+
    '<div class="sc2-top">'+
      '<div class="sc2-avatar-col">'+
        '<div class="sc2-avatar-wrap">'+
          '<svg class="sc2-ring" viewBox="0 0 60 60">'+
            '<circle class="sc2-ring-bg" cx="30" cy="30" r="'+R+'"/>'+
            '<circle class="sc2-ring-fill" cx="30" cy="30" r="'+R+'" stroke="'+ringColor+'" stroke-dasharray="'+ringDash+'" transform="rotate(-90 30 30)"/>'+
          '</svg>'+
          '<div class="sc2-avatar-inner" style="border-color:'+themeHex+'">'+avatarSVG+'</div>'+
          '<span class="sc2-status-dot">'+statusIcon+'</span>'+
        '</div>'+
        '<span class="sc2-qprog">'+s.qIndex+'/'+s.totalQ+'</span>'+
      '</div>'+
      '<div class="sc2-info">'+
        '<div class="sc2-name-row"><span class="s-name">'+esc(s.name)+'</span>'+streakHtml+'</div>'+
        '<div class="sc2-badges">'+
          (s.grade?'<span class="s-grade">'+esc(s.grade)+'</span>':'')+
          '<span class="s-badge badge-'+mode+'">'+modeLbl+'</span>'+
          pausedBadge+discBadge+
        '</div>'+
        '<div class="sc2-score">'+s.score.toLocaleString()+'<span class="sc2-score-lbl">pts</span></div>'+
      '</div>'+
    '</div>'+
    (s.currentQuestion?'<div class="q-display'+qFlashCls+'">'+s.currentQuestion+'</div>':'')+
    timeBar+
    '<div class="sc2-stats-row">'+
      '<span class="sc2-stat ok">✅ '+s.correct+'</span>'+
      '<span class="sc2-stat bad">❌ '+s.wrong+'</span>'+
      '<span class="sc2-stat acc">🎯 '+acc+'%</span>'+
    '</div>'+
    livesHtml+
    renderInventory(s.inventory)+
    '<div class="sc2-meta">'+
      '<span>⏱ <span data-el>'+fmt(elapsed)+'</span></span>'+
      '<span>'+(s.difficulty||s.gameType||'—')+'</span>'+
      '<span>'+tablasLbl+'</span>'+
    '</div>'+
    '<div class="s-actions">'+
    (!s.paused?`<button class="btn btn-pause" onclick="cmd('${s.id}','pause')">⏸ Pausar</button>`:`<button class="btn btn-resume" onclick="cmd('${s.id}','resume')">▶ Continuar</button>`)+
    `<button class="btn btn-end" onclick="cmd('${s.id}','end')">🛑 Terminar</button>`+
    '</div></div>';
}
function render(sessions){
  const grid=document.getElementById('grid');
  if(!sessions||!sessions.length){
    _cardHashes.clear();
    grid.innerHTML='<div class="empty"><div class="invader-float"><div class="invader-wrap"><div class="px-f fc"></div><div class="px-f fp"></div></div><div class="invader-lbl">NO HAY JUGADORES ACTIVOS</div></div></div>';
    return;
  }
  const now=Date.now();
  const ids=new Set(sessions.map(s=>s.id));
  // Eliminar tarjetas de sesiones que ya no existen
  grid.querySelectorAll('[data-sid]').forEach(el=>{
    if(!ids.has(el.dataset.sid)){ _cardHashes.delete(el.dataset.sid); el.remove(); }
  });
  // Actualizar o crear cada tarjeta sin tocar las demás
  sessions.forEach((s,i)=>{
    const hash=_cardHash(s,now);
    let el=grid.querySelector('[data-sid="'+s.id+'"]');
    if(!el){
      const tmp=document.createElement('div');
      tmp.innerHTML=_buildCard(s,now);
      el=tmp.firstElementChild;
      grid.appendChild(el);
      _cardHashes.set(s.id,hash);
    } else if(_cardHashes.get(s.id)!==hash){
      // Solo esta tarjeta cambió — reemplazarla individualmente
      const tmp=document.createElement('div');
      tmp.innerHTML=_buildCard(s,now);
      const newEl=tmp.firstElementChild;
      grid.replaceChild(newEl,el);
      el=newEl;
      _cardHashes.set(s.id,hash);
    } else {
      // Nada importante cambió — solo actualizar elapsed y barra de tiempo en el DOM directamente
      const elapsed=Math.floor((now-(s.startTime||now))/1000);
      const elEl=el.querySelector('[data-el]');
      if(elEl) elEl.textContent=fmt(elapsed);
      const tf=el.querySelector('[data-tf]');
      if(tf&&s.timeLimit>0){
        const tp=Math.max(0,Math.round((s.timeLeft/s.timeLimit)*100));
        tf.style.width=tp+'%';
        tf.style.background=tp>50?'#34d399':tp>25?'#fbbf24':'#f87171';
      }
    }
    // Mantener orden correcto sin mover tarjetas innecesariamente
    if(grid.children[i]!==el) grid.insertBefore(el,grid.children[i]||null);
  });
}
function renderMultiplayerRooms(sessions){
  const wrap=document.getElementById('mpRooms');
  if(!wrap) return;
  if(!sessions.length){
    wrap.innerHTML='<div class="empty"><div class="invader-float"><div class="invader-wrap"><div class="px-f fc"></div><div class="px-f fp"></div></div><div class="invader-lbl">NO HAY SALAS MULTIJUGADOR</div></div></div>';
    return;
  }
  const grouped=new Map();
  sessions.forEach(s=>{
    const key=s.roomId||('mp-'+(s.mpGameMode||'modo')+'-'+(s.roomName||'sin-sala'));
    if(!grouped.has(key)){
      grouped.set(key,{
        roomId:s.roomId||'',
        roomName:s.roomName||('Sala '+(s.mpGameMode||'multijugador')),
        hostName:s.roomHostName||'',
        roomStatus:s.roomStatus||'playing',
        roomPlayerCount:s.roomPlayerCount||0,
        roomMaxPlayers:s.roomMaxPlayers||0,
        mpGameMode:s.mpGameMode||'multijugador',
        players:[]
      });
    }
    grouped.get(key).players.push(s);
  });
  const rooms=[...grouped.values()].map(room=>{
    room.players.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
    if(!room.roomPlayerCount) room.roomPlayerCount=room.players.length;
    if(!room.hostName){
      const host=room.players.find(p=>p.role==='host'||p.playerIdx===0);
      room.hostName=host?.name||room.players[0]?.name||'';
    }
    return room;
  }).sort((a,b)=>{
    const sa=a.roomStatus==='playing'?0:a.roomStatus==='lobby'?1:2;
    const sb=b.roomStatus==='playing'?0:b.roomStatus==='lobby'?1:2;
    return sa-sb||b.roomPlayerCount-a.roomPlayerCount||a.roomName.localeCompare(b.roomName);
  });
  wrap.innerHTML=rooms.map(room=>{
    const leader=room.players[0];
    const stateCls=room.roomStatus==='lobby'?'wait':'';
    const cardCls=room.roomStatus==='lobby'?'lobby':'playing';
    const stateLbl=room.roomStatus==='lobby'?'Esperando':room.roomStatus==='playing'?'En partida':'Cerrada';
    const playersHtml=room.players.map((p,i)=>{
      const totalAnswers=(p.correct||0)+(p.wrong||0);
      const acc=totalAnswers?Math.round((p.correct||0)/totalAnswers*100):0;
      const prog=p.totalQ?`${p.qIndex||0}/${p.totalQ}`:'—';
      return `<div class="mp-player-row">
        <div class="mp-player-rank">#${i+1}</div>
        <div class="mp-player-main">
          <div class="mp-player-name">${esc(p.name||'?')}${p.name===room.hostName?'<span class="mp-host-star">★</span>':''}${p.disconnected?'<span class="mp-disc">📶 reconectando</span>':''}</div>
          <div class="mp-player-sub"><span>${acc}% precisión</span><span>${prog} progreso</span><span>${p.status==='finished'?'🏁 terminó':p.paused?'⏸ pausa':'🎮 activo'}</span></div>
        </div>
        <div class="mp-player-score">${(p.score||0).toLocaleString()}<small>${p.correct||0}✅ ${p.wrong||0}❌</small></div>
      </div>`;
    }).join('');
    return `<div class="mp-room-card ${cardCls}">
      <div class="mp-room-head">
        <div>
          <div class="mp-room-title">${esc(room.roomName||'Sala multijugador')}</div>
          <div class="mp-room-meta">
            ${room.roomId?`<span class="mp-pill">Sala ${esc(room.roomId)}</span>`:''}
            ${room.hostName?`<span class="mp-pill host">Anfitrión: ${esc(room.hostName)}</span>`:''}
            <span class="mp-pill mode">${esc(room.mpGameMode||'multijugador')}</span>
            <span class="mp-pill state ${stateCls}">${stateLbl}</span>
          </div>
        </div>
        <div class="mp-room-count">${room.roomPlayerCount}/${room.roomMaxPlayers||room.roomPlayerCount}<small>${leader?`Lidera ${esc(leader.name)}`:'Sin líder'}</small></div>
      </div>
      <div class="mp-room-list">${playersHtml}</div>
    </div>`;
  }).join('');
}
function renderMultiplayerRoomsEnhanced(sessions){
  const wrap=document.getElementById('mpRooms');
  if(!wrap) return;
  if(!sessions.length){
    renderMultiplayerRooms(sessions);
    return;
  }
  const grouped=new Map();
  sessions.forEach(s=>{
    const key=s.roomId||('mp-'+(s.mpGameMode||'modo')+'-'+(s.roomName||'sin-sala'));
    if(!grouped.has(key)){
      grouped.set(key,{
        roomId:s.roomId||'',
        roomName:s.roomName||('Sala '+(s.mpGameMode||'multijugador')),
        hostName:s.roomHostName||'',
        roomStatus:s.roomStatus||'playing',
        roomPlayerCount:s.roomPlayerCount||0,
        roomMaxPlayers:s.roomMaxPlayers||0,
        mpGameMode:s.mpGameMode||'multijugador',
        players:[]
      });
    }
    grouped.get(key).players.push(s);
  });
  const rooms=[...grouped.values()].map(room=>{
    room.players.sort((a,b)=>(b.score||0)-(a.score||0)||String(a.name||'').localeCompare(String(b.name||'')));
    if(!room.roomPlayerCount) room.roomPlayerCount=room.players.length;
    if(!room.hostName){
      const host=room.players.find(p=>p.role==='host'||p.playerIdx===0);
      room.hostName=host?.name||room.players[0]?.name||'';
    }
    return room;
  }).sort((a,b)=>{
    const sa=a.roomStatus==='playing'?0:a.roomStatus==='lobby'?1:2;
    const sb=b.roomStatus==='playing'?0:b.roomStatus==='lobby'?1:2;
    return sa-sb||b.roomPlayerCount-a.roomPlayerCount||a.roomName.localeCompare(b.roomName);
  });
  const getMpThemeHex=p=>THEME_COLORS_HEX[p?.themeColor||'']||'#60a5fa';
  const getMpAccuracy=p=>{
    const total=(p.correct||0)+(p.wrong||0);
    return total?Math.round((p.correct||0)/total*100):0;
  };
  const getMpProgress=p=>p.totalQ?`${p.qIndex||0}/${p.totalQ}`:'--';
  const getMpState=p=>p.status==='finished'?'Termino':p.paused?'Pausa':'Activo';
  const renderMpDuelist=(p,side,hostName)=>{
    if(!p){
      return `<div class="mp-duelist ${side}">
        <div class="mp-duel-avatar"></div>
        <div class="mp-duelist-info">
          <div class="mp-duelist-name">Esperando rival</div>
          <div class="mp-duelist-progress">Sin oponente aun</div>
        </div>
      </div>`;
    }
    const themeHex=getMpThemeHex(p);
    const hostMark=p.name===hostName?'<span class="mp-host-star">★</span>':'';
    const reconnectMark=p.disconnected?'<span class="mp-disc">Reconectando</span>':'';
    return `<div class="mp-duelist ${side}">
      <div class="mp-duel-avatar" style="border-color:${themeHex}99;box-shadow:0 12px 24px ${themeHex}22,inset 0 0 0 1px rgba(255,255,255,.04)">${buildAvatarSVG(p.avatar,68)}</div>
      <div class="mp-duelist-info">
        <div class="mp-duelist-name">${esc(p.name||'?')}${hostMark}${reconnectMark}</div>
        <div class="mp-duelist-score">${(p.score||0).toLocaleString()} pts</div>
        <div class="mp-duelist-meta">
          <span class="mp-pill">${getMpAccuracy(p)}% precision</span>
          <span class="mp-pill">${getMpProgress(p)} progreso</span>
        </div>
        <div class="mp-duelist-progress">${getMpState(p)}</div>
      </div>
    </div>`;
  };
  wrap.innerHTML=rooms.map(room=>{
    const leader=room.players[0];
    const stateCls=room.roomStatus==='lobby'?'wait':'';
    const cardCls=room.roomStatus==='lobby'?'lobby':'playing';
    const stateLbl=room.roomStatus==='lobby'?'Esperando':room.roomStatus==='playing'?'En partida':'Cerrada';
    const duelPlayers=room.players.slice(0,2);
    const hiddenCount=Math.max(0,room.players.length-2);
    const playersHtml=room.players.map((p,i)=>{
      const acc=getMpAccuracy(p);
      const prog=getMpProgress(p);
      const themeHex=getMpThemeHex(p);
      return `<div class="mp-player-row ${i<2?'top':''}">
        <div class="mp-player-rank">#${i+1}</div>
        <div class="mp-player-avatar" style="border-color:${themeHex}66;background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98))">${buildAvatarSVG(p.avatar,40)}</div>
        <div class="mp-player-main">
          <div class="mp-player-name">${esc(p.name||'?')}${p.name===room.hostName?'<span class="mp-host-star">★</span>':''}${p.disconnected?'<span class="mp-disc">Reconectando</span>':''}</div>
          <div class="mp-player-sub"><span>${acc}% precision</span><span>${prog} progreso</span><span>${getMpState(p)}</span></div>
        </div>
        <div class="mp-player-score">${(p.score||0).toLocaleString()}<small>${p.correct||0} aciertos ${p.wrong||0} errores</small></div>
      </div>`;
    }).join('');
    return `<div class="mp-room-card ${cardCls}">
      <div class="mp-room-head">
        <div>
          <div class="mp-room-title">${esc(room.roomName||'Sala multijugador')}</div>
          <div class="mp-room-meta">
            ${room.roomId?`<span class="mp-pill">Sala ${esc(room.roomId)}</span>`:''}
            ${room.hostName?`<span class="mp-pill host">Anfitrion: ${esc(room.hostName)}</span>`:''}
            <span class="mp-pill mode">${esc(room.mpGameMode||'multijugador')}</span>
            <span class="mp-pill state ${stateCls}">${stateLbl}</span>
          </div>
        </div>
        <div class="mp-room-count">${room.roomPlayerCount}/${room.roomMaxPlayers||room.roomPlayerCount}<small>${leader?`Lidera ${esc(leader.name)}`:'Sin lider'}</small></div>
      </div>
      <div class="mp-room-duel">
        ${renderMpDuelist(duelPlayers[0],'left',room.hostName)}
        <div class="mp-vs-badge">
          <div class="mp-vs-round">VS</div>
          <div class="mp-vs-text">DUELO</div>
          <div class="mp-duel-note">${room.roomStatus==='lobby'?'Esperando inicio':'Frente a frente'}</div>
        </div>
        ${renderMpDuelist(duelPlayers[1],'right',room.hostName)}
      </div>
      <div class="mp-room-extra">
        <div class="mp-room-extra-note">${hiddenCount?`+${hiddenCount} alumno${hiddenCount===1?'':'s'} adicional${hiddenCount===1?'':'es'} en la sala`:room.roomPlayerCount>1?'Duelo activo detectado':'Sala individual por ahora'}</div>
        ${leader?`<span class="mp-pill">Marcador lider ${esc(leader.name)}: ${(leader.score||0).toLocaleString()}</span>`:''}
      </div>
      <div class="mp-room-list">${playersHtml}</div>
    </div>`;
  }).join('');
}
