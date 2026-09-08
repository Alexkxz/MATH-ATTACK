function renderInventory(inv){
  if(!inv) return '';
  const entries=Object.entries(inv).filter(([,v])=>v>0);
  if(!entries.length) return '<div class="s-item" style="grid-column:1/-1"><div class="k">Poderes</div><div class="v" style="color:#64748b">Sin poderes</div></div>';
  return '<div class="s-item" style="grid-column:1/-1"><div class="k">Poderes restantes</div><div class="v" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">'+
    entries.map(([id,qty])=>'<span title="'+id+'" style="background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.25);border-radius:6px;padding:2px 6px;font-size:12px">'+(POWER_ICONS[id]||'?')+' \xd7'+qty+'</span>').join('')+
  '</div></div>';
}
function fmt(s){ const m=Math.floor(s/60),sec=s%60; return m+':'+(sec<10?'0':'')+sec; }

const PLAYER_LEVELS=[
  {level:0,name:'Novato',min:0},{level:1,name:'Explorador',min:100},
  {level:2,name:'Estudioso',min:250},{level:3,name:'Calculador',min:500},
  {level:4,name:'Resolvedor',min:1000},{level:5,name:'Matematico',min:1600},
  {level:6,name:'Analitico',min:2400},{level:7,name:'Estratega',min:3600},
  {level:8,name:'Genio',min:5200},{level:9,name:'Sabio',min:7500},
  {level:10,name:'Gran Maestro',min:10000},
];
const THEME_COLORS_HEX={
  blue:'#60a5fa',purple:'#a78bfa',green:'#34d399',yellow:'#fbbf24',
  pink:'#f472b6',red:'#f87171',cyan:'#22d3ee',orange:'#fb923c',
};
function getLevel(experiencia){
  let lv=PLAYER_LEVELS[0];
  for(const l of PLAYER_LEVELS){ if(experiencia>=l.min) lv=l; }
  return lv;
}

// ── Generador SVG de avatar (sincronizado con math-attack.html — incluye orejas/nariz y todas las opciones nuevas) ──
const _AV_SKIN={light:'#FDDBB4',canela:'#F1C27D',miel:'#E0AC69',caramel:'#C68642',dark:'#8D5524',ebony:'#4A2912'};
const _AV_HAIR={black:'#1a1a2e',dbrown:'#3B1F0A',brown:'#6B3A2A',blonde:'#D4A847',red:'#C0392B',gray:'#888888',white:'#E0E0E0',blue:'#3B82F6',pink:'#EC4899',purple:'#8B5CF6',green:'#22C55E',orange:'#F97316',cyan:'#06B6D4',silver:'#C0C5CE'};
const _AV_EYE={brown:'#6B3A2A',blue:'#3B82F6',green:'#10B981',gray:'#6B7280',amber:'#F59E0B',violet:'#8B5CF6',hazel:'#9C7A3C',black:'#1a1a1a',turquoise:'#06B6D4',pink:'#EC4899',red:'#DC2626',golden:'#D4AF37'};
const _AV_DEF={skin:'canela',hairStyle:'short',hairColor:'black',eyeType:'normal',eyeColor:'brown',mouth:'smile',accessory:'none',ears:'normal',nose:'shadow'};
function _avShade(hex,amt){const n=parseInt(hex.replace('#',''),16);const r=Math.min(255,Math.max(0,(n>>16)+amt));const g=Math.min(255,Math.max(0,((n>>8)&0xFF)+amt));const b=Math.min(255,Math.max(0,(n&0xFF)+amt));return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');}
function _avHB(s,hc){
  if(s==='long')return`<path d="M11,20 Q1,40 7,58 Q3,72 10,79 Q18,72 13,58 Q19,40 16,20 Z" fill="${hc}"/><path d="M69,20 Q79,40 73,58 Q77,72 70,79 Q62,72 67,58 Q61,40 64,20 Z" fill="${hc}"/>`;
  if(s==='wavy')return`<path d="M12,20 Q2,32 10,42 Q1,52 10,62 Q3,72 11,79 Q19,72 13,62 Q20,52 12,42 Q19,32 16,20 Z" fill="${hc}"/><path d="M68,20 Q78,32 70,42 Q79,52 70,62 Q77,72 69,79 Q61,72 67,62 Q60,52 68,42 Q61,32 64,20 Z" fill="${hc}"/>`;
  if(s==='curly')return`<circle cx="13" cy="35" r="11" fill="${hc}"/><circle cx="67" cy="35" r="11" fill="${hc}"/><circle cx="40" cy="13" r="15" fill="${hc}"/>`;
  if(s==='twin')return`<path d="M6,30 Q1,46 3,64 Q5,71 9,65 Q7,48 8,32 Z" fill="${hc}"/><path d="M74,30 Q79,46 77,64 Q75,71 71,65 Q73,48 72,32 Z" fill="${hc}"/>`;
  if(s==='ponytail')return`<path d="M50,14 Q71,16 74,34 Q77,50 68,61 Q63,65 62,57 Q69,45 66,32 Q63,19 50,14 Z" fill="${hc}"/>`;
  if(s==='afro')return`<circle cx="40" cy="27" r="29" fill="${hc}"/>`;
  if(s==='braids')return`<path d="M10,28 L18,38 L11,48 L18,58 L12,68 L18,77 L11,79" stroke="${hc}" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M70,28 L62,38 L69,48 L62,58 L68,68 L62,77 L69,79" stroke="${hc}" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
  return'';
}
function _avHF(s,hc){
  const b=`<path d="M13,48 Q13,14 40,12 Q67,14 67,48 Q55,27 40,21 Q25,27 13,48 Z" fill="${hc}"/>`;
  if(s==='short')return b+`<polygon points="26,18 21,7 31,17" fill="${hc}"/><polygon points="40,16 36,5 44,5 40,16" fill="${hc}"/><polygon points="54,18 49,17 59,7" fill="${hc}"/>`;
  if(s==='long')return b;
  if(s==='curly')return b+`<circle cx="18" cy="30" r="9" fill="${hc}"/><circle cx="62" cy="30" r="9" fill="${hc}"/><circle cx="28" cy="17" r="9" fill="${hc}"/><circle cx="52" cy="17" r="9" fill="${hc}"/><circle cx="40" cy="13" r="8" fill="${hc}"/>`;
  if(s==='ponytail')return b+`<ellipse cx="51" cy="16" rx="6" ry="5" fill="${hc}"/>`;
  if(s==='buzz')return`<path d="M15,48 Q15,20 40,17 Q65,20 65,48 Q56,32 40,26 Q24,32 15,48 Z" fill="${hc}" opacity="0.55"/>`;
  if(s==='mohawk'){const sides=`<path d="M15,50 Q15,22 40,20 Q65,22 65,50 Q56,36 40,30 Q24,36 15,50 Z" fill="${hc}" opacity="0.5"/>`;const spike=`<path d="M33,24 Q31,13 35,5 Q40,0 45,5 Q49,13 47,24 Q43,21 40,21 Q37,21 33,24Z" fill="${hc}"/>`;const sb=`<ellipse cx="40" cy="24" rx="8" ry="4" fill="${hc}"/>`;return sides+spike+sb;}
  if(s==='bang')return b+`<path d="M20,30 Q22,22 40,22 Q58,22 60,28 Q50,25 40,27 Q28,25 20,30" fill="${hc}"/>`;
  if(s==='twin')return b+`<ellipse cx="9" cy="28" rx="7" ry="6" fill="${hc}"/><ellipse cx="71" cy="28" rx="7" ry="6" fill="${hc}"/>`;
  if(s==='spiky')return b+`<polygon points="22,18 15,2 30,13" fill="${hc}"/><polygon points="35,14 30,0 44,2 40,14" fill="${hc}"/><polygon points="56,16 48,1 62,5 60,16" fill="${hc}"/><polygon points="18,24 11,12 22,20" fill="${hc}"/><polygon points="62,24 58,20 69,12" fill="${hc}"/>`;
  if(s==='wavy')return b;
  if(s==='afro')return`<circle cx="17" cy="33" r="11" fill="${hc}"/><circle cx="63" cy="33" r="11" fill="${hc}"/><circle cx="26" cy="16" r="11" fill="${hc}"/><circle cx="54" cy="16" r="11" fill="${hc}"/><circle cx="40" cy="9" r="12" fill="${hc}"/>`;
  if(s==='bun')return b+`<circle cx="40" cy="8" r="10" fill="${hc}"/><rect x="35" y="13" width="10" height="8" fill="${hc}"/>`;
  if(s==='braids')return b;
  if(s==='undercut'){const side=`<path d="M15,48 Q15,20 40,17 Q65,20 65,48 Q56,32 40,26 Q24,32 15,48 Z" fill="${hc}" opacity="0.45"/>`;const top=`<path d="M22,22 Q30,8 50,9 Q64,11 60,22 Q48,16 36,18 Q28,19 22,22Z" fill="${hc}"/>`;return side+top;}
  return b;
}
function _avEyes(t,ec,sk){
  const eye=(cx,cy)=>`<ellipse cx="${cx}" cy="${cy}" rx="8" ry="8" fill="white"/><circle cx="${cx}" cy="${cy}" r="5.5" fill="${ec}"/><circle cx="${cx}" cy="${cy}" r="3" fill="#111"/><circle cx="${cx+2}" cy="${cy-2}" r="1.2" fill="white"/>`;
  if(t==='normal')return eye(29,38)+eye(51,38);
  if(t==='almond'){const al=(cx,cy)=>`<path d="M${cx-8},${cy} Q${cx},${cy-7} ${cx+8},${cy} Q${cx},${cy+7} ${cx-8},${cy}" fill="white"/><path d="M${cx-6},${cy} Q${cx},${cy-5} ${cx+6},${cy} Q${cx},${cy+5} ${cx-6},${cy}" fill="${ec}"/><ellipse cx="${cx}" cy="${cy}" rx="3" ry="4" fill="#111"/><circle cx="${cx+1}" cy="${cy-2}" r="1.2" fill="white"/>`;return al(29,38)+al(51,38);}
  if(t==='happy')return`<path d="M21,40 Q29,31 37,40" stroke="#333" fill="${sk}" stroke-width="2.5" stroke-linecap="round"/><path d="M43,40 Q51,31 59,40" stroke="#333" fill="${sk}" stroke-width="2.5" stroke-linecap="round"/>`;
  if(t==='stars')return`<text x="29" y="44" text-anchor="middle" font-size="14" fill="${ec}" font-family="serif">&#9733;</text><text x="51" y="44" text-anchor="middle" font-size="14" fill="${ec}" font-family="serif">&#9733;</text>`;
  if(t==='sleepy'){const sl=(cx,cy)=>`<ellipse cx="${cx}" cy="${cy+1}" rx="8" ry="7" fill="white"/><circle cx="${cx}" cy="${cy+1}" r="5" fill="${ec}"/><circle cx="${cx}" cy="${cy+1}" r="3" fill="#111"/><path d="M${cx-8},${cy} Q${cx},${cy-9} ${cx+8},${cy}" fill="${sk}"/><path d="M${cx-8},${cy} Q${cx},${cy-3} ${cx+8},${cy}" stroke="#666" fill="none" stroke-width="1.2"/>`;return sl(29,38)+sl(51,38);}
  if(t==='wink'){const wl=(cx,cy)=>`<path d="M${cx-7},${cy} Q${cx},${cy+7} ${cx+7},${cy}" stroke="#333" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;return eye(29,38)+wl(51,38);}
  if(t==='unamused'){const un=(cx,cy)=>`<ellipse cx="${cx}" cy="${cy}" rx="8" ry="7" fill="white"/><circle cx="${cx+2}" cy="${cy}" r="5" fill="${ec}"/><circle cx="${cx+2}" cy="${cy}" r="3" fill="#111"/><circle cx="${cx+3}" cy="${cy-1}" r="1" fill="white"/>`;return un(29,38)+un(51,38);}
  if(t==='angry'){const ae=(cx,cy)=>`<ellipse cx="${cx}" cy="${cy}" rx="8" ry="7.5" fill="white"/><circle cx="${cx}" cy="${cy}" r="5" fill="${ec}"/><circle cx="${cx}" cy="${cy}" r="3" fill="#111"/><circle cx="${cx+2}" cy="${cy-2}" r="1.2" fill="white"/>`;return `<path d="M20,30 L34,35" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><path d="M46,35 L60,30" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>`+ae(29,38)+ae(51,38);}
  if(t==='hearts'){const heart=(cx,cy)=>`<path d="M${cx},${cy+5} C${cx-8},${cy-1} ${cx-10},${cy-7} ${cx},${cy-3} C${cx+10},${cy-7} ${cx+8},${cy-1} ${cx},${cy+5}Z" fill="#f43f5e"/>`;return heart(29,38)+heart(51,38);}
  if(t==='spiral'){const sp=(cx,cy)=>`<ellipse cx="${cx}" cy="${cy}" rx="8" ry="8" fill="white"/><path d="M${cx},${cy} m4,0 a4,4 0 1,1 -4,-4 a5.5,5.5 0 1,0 5.5,5.5 a7,7 0 1,1 -7,-7" stroke="#111" stroke-width="1.5" fill="none"/><circle cx="${cx}" cy="${cy}" r="1.5" fill="#111"/>`;return sp(29,38)+sp(51,38);}
  if(t==='crying'){const cr=(cx,cy)=>eye(cx,cy)+`<path d="M${cx-2},${cy+8} Q${cx-4},${cy+13} ${cx-2},${cy+16} Q${cx},${cy+13} ${cx-2},${cy+8}Z" fill="#60A5FA"/>`;return cr(29,38)+cr(51,38);}
  if(t==='sparkle'){const star=(x,y,s)=>`<path d="M${x},${y-s} L${x+s*0.3},${y-s*0.3} L${x+s},${y} L${x+s*0.3},${y+s*0.3} L${x},${y+s} L${x-s*0.3},${y+s*0.3} L${x-s},${y} L${x-s*0.3},${y-s*0.3} Z" fill="#FDE68A"/>`;const sp=(cx,cy)=>eye(cx,cy)+star(cx+6,cy-6,4)+star(cx-7,cy+3,2.2);return sp(29,38)+sp(51,38);}
  if(t==='robot'){const rb=(cx,cy)=>`<rect x="${cx-8}" y="${cy-6}" width="16" height="12" rx="2" fill="#0F172A" stroke="#475569" stroke-width="1.5"/><rect x="${cx-6}" y="${cy-1}" width="12" height="2.5" fill="#22D3EE"/>`;return rb(29,38)+rb(51,38);}
  if(t==='heterochromia'){const e2=(cx,cy,col)=>`<ellipse cx="${cx}" cy="${cy}" rx="8" ry="8" fill="white"/><circle cx="${cx}" cy="${cy}" r="5.5" fill="${col}"/><circle cx="${cx}" cy="${cy}" r="3" fill="#111"/><circle cx="${cx+2}" cy="${cy-2}" r="1.2" fill="white"/>`;return e2(29,38,ec)+e2(51,38,'#FBBF24');}
  return eye(29,38)+eye(51,38);
}
function _avMouth(t,sk){
  const mc=_avShade(sk,-40);
  if(t==='smile')return`<path d="M30,57 Q40,64 50,57" stroke="${mc}" fill="none" stroke-width="2.5" stroke-linecap="round"/>`;
  if(t==='bigsmile')return`<path d="M28,55 Q40,69 52,55" fill="#CC6644"/><rect x="29" y="55" width="22" height="5" fill="white" rx="1"/><path d="M28,55 Q40,69 52,55" stroke="#AA4422" fill="none" stroke-width="1.5"/>`;
  if(t==='serious')return`<line x1="30" y1="59" x2="50" y2="59" stroke="${mc}" stroke-width="2.5" stroke-linecap="round"/>`;
  if(t==='smirk')return`<path d="M30,59 Q40,63 48,57" stroke="${mc}" fill="none" stroke-width="2.5" stroke-linecap="round"/>`;
  if(t==='tongue')return`<path d="M30,57 Q40,64 50,57" stroke="${mc}" fill="none" stroke-width="2" stroke-linecap="round"/><ellipse cx="40" cy="64" rx="5" ry="4" fill="#E87070"/>`;
  if(t==='sad')return`<path d="M30,62 Q40,55 50,62" stroke="${mc}" fill="none" stroke-width="2.5" stroke-linecap="round"/>`;
  if(t==='surprised')return`<ellipse cx="40" cy="59" rx="5" ry="7" fill="#CC6644"/><ellipse cx="40" cy="60" rx="3" ry="5" fill="#111"/>`;
  if(t==='cat')return`<path d="M30,58 Q34,63 38,58 Q40,61 42,58 Q46,63 50,58" stroke="${mc}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  if(t==='grin')return`<path d="M27,56 Q40,70 53,56" fill="#CC6644"/><rect x="28" y="56" width="24" height="5" fill="white" rx="1"/><path d="M27,56 Q40,70 53,56" stroke="#AA4422" fill="none" stroke-width="1.5"/>`;
  if(t==='whistle')return`<ellipse cx="40" cy="60" rx="4" ry="5" fill="#CC6644"/><ellipse cx="40" cy="60" rx="2.5" ry="3.5" fill="#111"/>`;
  if(t==='grumpy')return`<path d="M28,60 Q33,67 40,62 Q47,67 52,60" stroke="${mc}" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  if(t==='laugh')return`<path d="M25,55 Q40,71 55,55" fill="#CC6644"/><rect x="27" y="55" width="26" height="6" fill="white" rx="2"/><line x1="36" y1="55" x2="36" y2="61" stroke="#e8c09a" stroke-width="1"/><line x1="44" y1="55" x2="44" y2="61" stroke="#e8c09a" stroke-width="1"/><path d="M25,55 Q40,71 55,55" stroke="#AA4422" fill="none" stroke-width="1.5"/>`;
  if(t==='drool')return`<path d="M30,57 Q40,64 50,57" stroke="${mc}" fill="none" stroke-width="2.5" stroke-linecap="round"/><path d="M38,62 Q37,66 38,68" stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round" fill="none"/><ellipse cx="38" cy="69" rx="2.5" ry="1.8" fill="#93c5fd" opacity="0.9"/>`;
  if(t==='cool')return`<line x1="30" y1="60" x2="42" y2="60" stroke="${mc}" stroke-width="2.5" stroke-linecap="round"/><path d="M42,60 Q47,63 51,56" stroke="${mc}" fill="none" stroke-width="2.5" stroke-linecap="round"/>`;
  return'';
}
function _avEars(t,sk,skd){
  if(t==='small')return`<ellipse cx="13" cy="46" rx="5" ry="7" fill="${sk}"/><ellipse cx="13" cy="46" rx="3" ry="4" fill="${skd}"/><ellipse cx="67" cy="46" rx="5" ry="7" fill="${sk}"/><ellipse cx="67" cy="46" rx="3" ry="4" fill="${skd}"/>`;
  if(t==='round')return`<ellipse cx="12" cy="46" rx="9" ry="10" fill="${sk}"/><ellipse cx="12" cy="46" rx="5" ry="6" fill="${skd}"/><ellipse cx="68" cy="46" rx="9" ry="10" fill="${sk}"/><ellipse cx="68" cy="46" rx="5" ry="6" fill="${skd}"/>`;
  if(t==='pointed')return`<path d="M16,39 Q17,47 15,55 Q7,54 3,47 Q0,38 4,30 Q11,31 16,39Z" fill="${sk}"/><path d="M14,42 Q15,47 14,51 Q9,50 7,46 Q6,41 9,37 Q12,38 14,42Z" fill="${skd}"/><path d="M64,39 Q63,47 65,55 Q73,54 77,47 Q80,38 76,30 Q69,31 64,39Z" fill="${sk}"/><path d="M66,42 Q65,47 66,51 Q71,50 73,46 Q74,41 71,37 Q68,38 66,42Z" fill="${skd}"/>`;
  if(t==='earrings')return`<ellipse cx="13" cy="46" rx="7" ry="9" fill="${sk}"/><ellipse cx="13" cy="46" rx="4" ry="5.5" fill="${skd}"/><circle cx="13" cy="55" r="2.2" fill="#FBBF24" stroke="#B45309" stroke-width="0.6"/><ellipse cx="67" cy="46" rx="7" ry="9" fill="${sk}"/><ellipse cx="67" cy="46" rx="4" ry="5.5" fill="${skd}"/><circle cx="67" cy="55" r="2.2" fill="#FBBF24" stroke="#B45309" stroke-width="0.6"/>`;
  if(t==='fox')return`<path d="M16,30 L24,8 L29,32 Q22,38 16,36Z" fill="#F97316"/><path d="M18,28 L23,14 L26,29 Q22,32 18,30Z" fill="#FFF7ED"/><path d="M64,30 L56,8 L51,32 Q58,38 64,36Z" fill="#F97316"/><path d="M62,28 L57,14 L54,29 Q58,32 62,30Z" fill="#FFF7ED"/>`;
  if(t==='bear')return`<circle cx="11" cy="32" r="11" fill="#92654A"/><circle cx="11" cy="32" r="6" fill="#C99172"/><circle cx="69" cy="32" r="11" fill="#92654A"/><circle cx="69" cy="32" r="6" fill="#C99172"/>`;
  if(t==='dragon')return`<path d="M16,39 Q17,47 15,55 Q7,54 3,47 Q0,38 4,30 Q11,31 16,39Z" fill="#22C55E"/><path d="M14,42 Q15,47 14,51 Q9,50 7,46 Q6,41 9,37 Q12,38 14,42Z" fill="#15803D"/><polygon points="6,33 2,26 9,30" fill="#15803D"/><polygon points="3,40 0,35 5,38" fill="#15803D"/><path d="M64,39 Q63,47 65,55 Q73,54 77,47 Q80,38 76,30 Q69,31 64,39Z" fill="#22C55E"/><path d="M66,42 Q65,47 66,51 Q71,50 73,46 Q74,41 71,37 Q68,38 66,42Z" fill="#15803D"/><polygon points="74,33 78,26 71,30" fill="#15803D"/><polygon points="77,40 80,35 75,38" fill="#15803D"/>`;
  if(t==='hoop')return`<ellipse cx="13" cy="46" rx="7" ry="9" fill="${sk}"/><ellipse cx="13" cy="46" rx="4" ry="5.5" fill="${skd}"/><circle cx="13" cy="58" r="5" fill="none" stroke="#FBBF24" stroke-width="1.8"/><ellipse cx="67" cy="46" rx="7" ry="9" fill="${sk}"/><ellipse cx="67" cy="46" rx="4" ry="5.5" fill="${skd}"/><circle cx="67" cy="58" r="5" fill="none" stroke="#FBBF24" stroke-width="1.8"/>`;
  return`<ellipse cx="13" cy="46" rx="7" ry="9" fill="${sk}"/><ellipse cx="13" cy="46" rx="4" ry="5.5" fill="${skd}"/><ellipse cx="67" cy="46" rx="7" ry="9" fill="${sk}"/><ellipse cx="67" cy="46" rx="4" ry="5.5" fill="${skd}"/>`;
}
function _avNose(t,skd){
  if(t==='button')return`<ellipse cx="40" cy="51" rx="3" ry="2.5" fill="${skd}" opacity="0.55"/>`;
  if(t==='wide')return`<path d="M35,48 Q40,56 45,48" stroke="${skd}" fill="none" stroke-width="2" stroke-linecap="round"/>`;
  if(t==='pinky')return`<ellipse cx="40" cy="50" rx="3.5" ry="3" fill="#F472B6"/><ellipse cx="38.7" cy="48.8" rx="1" ry="0.8" fill="#FBCFE8"/>`;
  if(t==='piggy')return`<ellipse cx="40" cy="50" rx="5" ry="3.5" fill="#F4A7A7"/><ellipse cx="38" cy="50" rx="1.1" ry="1.5" fill="#B45757"/><ellipse cx="42" cy="50" rx="1.1" ry="1.5" fill="#B45757"/>`;
  if(t==='witch')return`<path d="M39,40 Q35,48 33,54 Q36,58 40,55 Q38,48 41,42Z" fill="${skd}" opacity="0.85"/><circle cx="34" cy="53" r="1.4" fill="${skd}"/>`;
  if(t==='clown')return`<circle cx="40" cy="52" r="5.5" fill="#EF4444"/><circle cx="38" cy="50" r="1.5" fill="#FCA5A5"/>`;
  if(t==='freckles')return`<path d="M37,50 Q40,54 43,50" stroke="${skd}" fill="none" stroke-width="1.5" stroke-linecap="round"/><circle cx="32" cy="48" r="0.8" fill="${skd}" opacity="0.6"/><circle cx="35" cy="51" r="0.8" fill="${skd}" opacity="0.6"/><circle cx="29" cy="51" r="0.8" fill="${skd}" opacity="0.6"/><circle cx="48" cy="48" r="0.8" fill="${skd}" opacity="0.6"/><circle cx="45" cy="51" r="0.8" fill="${skd}" opacity="0.6"/><circle cx="51" cy="51" r="0.8" fill="${skd}" opacity="0.6"/>`;
  return`<path d="M37,50 Q40,54 43,50" stroke="${skd}" fill="none" stroke-width="1.5" stroke-linecap="round"/>`;
}
function _avAcc(a){if(a==='glasses')return`<circle cx="29" cy="38" r="9" fill="rgba(180,210,255,0.12)" stroke="#555" stroke-width="2"/><circle cx="51" cy="38" r="9" fill="rgba(180,210,255,0.12)" stroke="#555" stroke-width="2"/><line x1="38" y1="38" x2="42" y2="38" stroke="#555" stroke-width="2"/><line x1="11" y1="37" x2="20" y2="37" stroke="#555" stroke-width="1.5"/><line x1="60" y1="37" x2="69" y2="37" stroke="#555" stroke-width="1.5"/>`;if(a==='sunglasses')return`<rect x="20" y="33" width="18" height="10" rx="4" fill="#111" opacity="0.9"/><rect x="42" y="33" width="18" height="10" rx="4" fill="#111" opacity="0.9"/><line x1="38" y1="38" x2="42" y2="38" stroke="#333" stroke-width="2"/><line x1="11" y1="37" x2="20" y2="37" stroke="#333" stroke-width="1.5"/><line x1="60" y1="37" x2="69" y2="37" stroke="#333" stroke-width="1.5"/>`;if(a==='cap')return`<ellipse cx="40" cy="21" rx="28" ry="12" fill="#4B5563"/><rect x="9" y="24" width="62" height="7" rx="3" fill="#374151"/><rect x="8" y="24" width="22" height="5" rx="2" fill="#4B5563"/><circle cx="40" cy="10" r="3" fill="#374151"/>`;if(a==='crown')return`<rect x="18" y="14" width="44" height="12" rx="1" fill="#F59E0B"/><polygon points="18,14 22,4 26,14" fill="#F59E0B"/><polygon points="36,14 40,2 44,14" fill="#F59E0B"/><polygon points="54,14 58,4 62,14" fill="#F59E0B"/><circle cx="22" cy="18" r="2.5" fill="#EF4444"/><circle cx="40" cy="18" r="2.5" fill="#10B981"/><circle cx="58" cy="18" r="2.5" fill="#3B82F6"/>`;if(a==='headband')return`<path d="M13,36 Q40,26 67,36" stroke="#EC4899" fill="none" stroke-width="5.5" stroke-linecap="round"/>`;if(a==='mask')return`<rect x="23" y="52" width="34" height="16" rx="7" fill="#E5E7EB"/><path d="M23,60 Q40,64 57,60" stroke="#9CA3AF" fill="none" stroke-width="1"/><line x1="23" y1="58" x2="12" y2="54" stroke="#9CA3AF" stroke-width="1.5"/><line x1="57" y1="58" x2="68" y2="54" stroke="#9CA3AF" stroke-width="1.5"/>`;if(a==='catears')return`<path d="M14,28 L7,8 L24,18 Z" fill="#6B3A2A"/><path d="M14,27 L10,14 L21,21 Z" fill="#EC4899" opacity="0.75"/><path d="M66,28 L73,8 L56,18 Z" fill="#6B3A2A"/><path d="M66,27 L70,14 L59,21 Z" fill="#EC4899" opacity="0.75"/>`;if(a==='monocle')return`<circle cx="51" cy="38" r="9" fill="rgba(180,210,255,0.12)" stroke="#888" stroke-width="2"/><line x1="60" y1="37" x2="69" y2="35" stroke="#888" stroke-width="1.5"/>`;if(a==='horns')return`<path d="M16,26 Q12,12 20,8 Q18,18 20,24" fill="#DC2626"/><path d="M64,26 Q68,12 60,8 Q62,18 60,24" fill="#DC2626"/>`;if(a==='wizard')return`<path d="M40,0 L22,26 L58,26 Z" fill="#7C3AED"/><ellipse cx="40" cy="26" rx="22" ry="6" fill="#6D28D9"/><circle cx="35" cy="17" r="2.5" fill="#FCD34D"/>`;if(a==='halo')return`<ellipse cx="40" cy="8" rx="18" ry="5" fill="none" stroke="#FCD34D" stroke-width="3.5"/><ellipse cx="40" cy="8" rx="18" ry="5" fill="rgba(252,211,77,0.1)"/>`;return'';}
function buildAvatarSVG(cfg,size=80){
  const av=Object.assign({},_AV_DEF,cfg||{});
  const sk=_AV_SKIN[av.skin]||'#F1C27D', hc=_AV_HAIR[av.hairColor]||'#1a1a2e', ec=_AV_EYE[av.eyeColor]||'#6B3A2A', skd=_avShade(sk,-25);
  const p=[];
  p.push(_avHB(av.hairStyle,hc));
  p.push(`<ellipse cx="40" cy="46" rx="27" ry="30" fill="${sk}"/>`);
  p.push(_avEars(av.ears,sk,skd));
  p.push(`<path d="M21,29 Q29,25 37,29" stroke="${hc}" fill="none" stroke-width="2.5" stroke-linecap="round"/><path d="M43,29 Q51,25 59,29" stroke="${hc}" fill="none" stroke-width="2.5" stroke-linecap="round"/>`);
  p.push(_avEyes(av.eyeType,ec,sk));
  p.push(_avNose(av.nose,skd));
  p.push(_avMouth(av.mouth,sk));
  p.push(_avHF(av.hairStyle,hc));
  p.push(_avAcc(av.accessory));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="${size}" height="${size}">${p.join('')}</svg>`;
}
