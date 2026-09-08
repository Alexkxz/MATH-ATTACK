function renderCard(s){
  const inv=s.inventory||{};
  const initials=s.name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'?';
  const isOnline=connectedNames.includes(s.name.toLowerCase());
  const onlineBadge=isOnline?`<span class="sc-online-badge"></span>`:'';
  const themeHex=THEME_COLORS_HEX[s.themeColor||'']||'#7c3aed';
  const powersHTML=POWERS_DEF.map(p=>{
    const qty=inv[p.id]||0;
    return `<div class="ptile${qty>0?' has-p':''}" data-sid="${s.id}" data-pid="${p.id}" onclick="event.stopPropagation();openPowerEdit(this)" title="${p.name} (${qty})">
      <span class="ptile-icon">${p.icon}</span>
      <span class="ptile-qty">${qty}</span>
    </div>`;
  }).join('');
  const activePowers=POWERS_DEF.filter(p=>(inv[p.id]||0)>0);
  const pwrCount=activePowers.length;
  const quickHTML=pwrCount
    ? activePowers.slice(0,10).map(p=>`<span class="sc-pq-item" title="${p.name}: ×${inv[p.id]}">${p.icon}</span>`).join('')
    : '<span class="sc-pq-empty">SIN PODERES</span>';

  // Nivel
  const aureos=s.aureos||0;
  const experiencia=s.experiencia??s.experience??s.xp??aureos;
  const lv=getLevel(experiencia);
  const nextLv=PLAYER_LEVELS.find(l=>l.min>experiencia);
  const pct=nextLv?Math.round(((experiencia-lv.min)/(nextLv.min-lv.min))*100):100;
  const hasStar=s.avgPct>=80;

  // Logros
  const achs=s.achievements||[];
  const achHTML=achs.length
    ? achs.map(id=>{
        const def=ACHIEVEMENTS_DEF.find(a=>a.id===id);
        return def?`<span class="ach-badge" title="${def.name}: ${def.desc}">${def.icon}</span>`:'';
      }).join('')
    : '';

  return `<div class="sc-card${isOnline?' is-online':''}" id="sca-${s.id}" onclick="togglePowers(this)">
    <div class="sc-banner">
      <span class="sc-banner-name">${esc(s.name)}</span>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <span class="sc-grade-pill" id="sgrd-${s.id}">${esc(s.grade||'?')}</span>
        <span class="sc-drag-handle" draggable="true" title="Arrastrar para reordenar" onclick="event.stopPropagation()">⠿</span>
      </div>
    </div>
    <div class="sc-av-section">
      <div class="sc-av-big" style="border-color:${themeHex}aa;box-shadow:0 0 16px ${themeHex}66;background:#0d0820;padding:0">${buildAvatarSVG(s.avatar,60)}${onlineBadge}</div>
    </div>
    <div class="sc-level-row">
      <span class="sc-level-badge">Lv${lv.level} ${lv.name}</span>
      <span class="sc-level-badge" title="Experiencia acumulada">${experiencia} XP</span>
      ${hasStar?'<span class="sc-star-badge">★ PRECISIÓN</span>':''}
      <div class="sc-level-bar"><div class="sc-level-bar-fill" style="width:${pct}%"></div></div>
    </div>
    ${achHTML?`<div class="sc-level-row"><div class="sc-ach-row">${achHTML}</div></div>`:''}
    <div class="sc-sep"></div>
    <div class="sc-hp-row">
      <span class="sc-hp-lbl">ÁUREOS</span>
      <span class="aureos-icon">🪙</span>
      <span class="aureos-amt sc-hp-val" id="aamt-${s.id}">${aureos}</span>
      <button class="sc-hp-btn" data-sid="${s.id}" data-aureos="${aureos}" onclick="event.stopPropagation();openAureosEdit(this)" title="Editar Áureos">✏</button>
      <button class="sc-hp-btn" data-sid="${s.id}" onclick="event.stopPropagation();openPinEdit(this)" title="Cambiar PIN" style="color:#fbbf24;border-color:rgba(251,191,36,.2)">🔑</button>
      <button class="sc-hp-btn" data-sid="${s.id}" onclick="event.stopPropagation();showPin(this)" title="Ver PIN" style="color:#60a5fa;border-color:rgba(96,165,250,.2)">👁</button>
    </div>
    <div class="sc-powers-section">
      <div class="sc-powers-toggle">
        <span class="sc-powers-title">◈ PODERES</span>
        <span class="sc-powers-count${pwrCount?' active':''}">×${pwrCount}</span>
        <span class="sc-powers-arrow">▾</span>
      </div>
      <div class="sc-powers-quick">${quickHTML}</div>
      <div class="sc-powers-grid" onclick="event.stopPropagation()"><div class="powers-grid">${powersHTML}</div></div>
    </div>
    <div class="sc-footer">
      <button class="sc-foot-btn" data-sid="${s.id}" data-grade="${esc(s.grade||'')}" onclick="event.stopPropagation();openGradeEdit(this)">🎓 ${esc(s.grade||'?')}</button>
      <button class="sc-foot-btn" data-name="${esc(s.name)}" onclick="event.stopPropagation();showHistory('${esc(s.name)}')" style="color:#60a5fa;border-color:rgba(96,165,250,.15)">📊</button>
      <button class="sc-foot-btn" onclick="event.stopPropagation();deleteStudent('${s.id}')" style="flex:0;padding:5px 8px;color:#f87171;border-color:rgba(248,113,113,.15)">✕</button>
    </div>
  </div>`;
}
