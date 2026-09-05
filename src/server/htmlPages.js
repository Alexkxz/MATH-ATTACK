const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createHtmlPages({ baseDir, logger = console }) {
  let gameHTML = null;
  let gameHTMLGzip = null;
  const gameHTMLPath = path.join(baseDir, 'math-attack.html');

  let maestroHTML = null;
  let maestroHTMLGzip = null;
  const maestroHTMLPath = path.join(baseDir, 'maestro.html');

  let rankingLiveHTML = null;

  function logGame(...args) {
    if (logger && typeof logger.game === 'function') logger.game(...args);
  }

  function logPanel(...args) {
    if (logger && typeof logger.panel === 'function') logger.panel(...args);
  }

  function acceptsGzip(req) {
    return String(req.headers['accept-encoding'] || '').includes('gzip');
  }

  function getGameHTML() {
    if (gameHTML !== null) return gameHTML;
    try {
      gameHTML = fs.readFileSync(gameHTMLPath, 'utf8');
    } catch (e) {
      return null;
    }
    return gameHTML;
  }

  function getGameHTMLGzip() {
    if (gameHTMLGzip !== null) return gameHTMLGzip;
    const html = getGameHTML();
    if (!html) return null;
    try {
      gameHTMLGzip = zlib.gzipSync(html);
    } catch (e) {
      return null;
    }
    return gameHTMLGzip;
  }

  function getMaestroHTML() {
    if (maestroHTML) return maestroHTML;
    try {
      maestroHTML = fs.readFileSync(maestroHTMLPath, 'utf8');
    } catch (e) {
      return '<h1>maestro.html no encontrado</h1>';
    }
    return maestroHTML;
  }

  function getRankingLiveHTML() {
    if (rankingLiveHTML) return rankingLiveHTML;
    return (rankingLiveHTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🏆 Math Attack - Ranking en Vivo</title>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#07060f;color:#e2e8f0;min-height:100vh;overflow-x:hidden}
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:9000;
  background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.09) 3px,rgba(0,0,0,.09) 4px)}
header{background:#07060f;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;
  border-bottom:2px solid #00e5ff;box-shadow:0 0 20px rgba(0,229,255,.2)}
.h-title{font-family:'Press Start 2P',monospace;font-size:11px;color:#00e5ff;
  text-shadow:0 0 8px #00e5ff;letter-spacing:1px}
.h-right{display:flex;align-items:center;gap:12px}
.live-dot{width:8px;height:8px;border-radius:2px;background:#00ff88;display:inline-block;animation:ldot 1s steps(1) infinite}
@keyframes ldot{0%,100%{opacity:1}50%{opacity:0}}
.h-count{font-family:'Press Start 2P',monospace;font-size:8px;color:#445566}
.h-link{font-family:'Press Start 2P',monospace;font-size:8px;color:#a78bfa;text-decoration:none}
.h-link:hover{color:#c4b5fd}
.container{padding:16px 20px;max-width:1100px;margin:0 auto}

/* Podio top 3 */
.podio{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:12px;margin-bottom:24px;align-items:end;min-height:180px}
.podio-slot{background:#0c0a1a;border-radius:6px;padding:14px 10px;text-align:center;position:relative;
  border:1px solid rgba(255,255,255,.07);overflow:hidden;transition:all .4s ease}
.podio-slot::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.p1-slot{border-color:rgba(251,191,36,.5);box-shadow:0 0 20px rgba(251,191,36,.08),0 0 0 1px rgba(251,191,36,.12)}
.p1-slot::before{background:linear-gradient(90deg,transparent,#fbbf24,transparent)}
.p2-slot{border-color:rgba(148,163,184,.35);box-shadow:0 0 12px rgba(148,163,184,.05)}
.p2-slot::before{background:linear-gradient(90deg,transparent,#94a3b8,transparent)}
.p3-slot{border-color:rgba(180,120,60,.3);box-shadow:0 0 12px rgba(180,120,60,.04)}
.p3-slot::before{background:linear-gradient(90deg,transparent,rgba(180,120,60,.7),transparent)}
.podio-medal{font-size:26px;display:block;margin-bottom:6px;animation:medalBob 2s ease-in-out infinite}
@keyframes medalBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.podio-rank{font-family:'Press Start 2P',monospace;font-size:7px;margin-bottom:8px}
.p1-slot .podio-rank{color:#fbbf24;text-shadow:0 0 8px rgba(251,191,36,.6)}
.p2-slot .podio-rank{color:#94a3b8}
.p3-slot .podio-rank{color:rgba(180,120,60,.9)}
.podio-av{width:52px;height:52px;border-radius:4px;margin:0 auto 8px;
  background:linear-gradient(135deg,#2e1065,#7c3aed);display:flex;align-items:center;
  justify-content:center;font-family:'Press Start 2P',monospace;font-size:14px;color:#fff;
  border:2px solid rgba(255,255,255,.15)}
.p1-slot .podio-av{border-color:rgba(251,191,36,.6);box-shadow:0 0 12px rgba(251,191,36,.3)}
.podio-name{font-family:'Press Start 2P',monospace;font-size:7px;color:#e2e8f0;
  margin-bottom:5px;line-height:1.7;min-height:14px}
.podio-grade{font-size:9px;color:#445566;margin-bottom:6px}
.podio-score{font-family:'Press Start 2P',monospace;font-size:13px;margin-bottom:3px}
.p1-slot .podio-score{color:#fbbf24;text-shadow:0 0 10px rgba(251,191,36,.5)}
.p2-slot .podio-score{color:#94a3b8}
.p3-slot .podio-score{color:rgba(180,120,60,.9)}
.podio-pct{font-size:10px;color:#4b5563}
.podio-empty{opacity:.25;filter:grayscale(.8)}

/* Lista del resto */
.rank-list{display:flex;flex-direction:column;gap:4px}
.rank-row{background:#0c0a1a;border:1px solid rgba(255,255,255,.05);border-radius:4px;
  padding:8px 12px;display:flex;align-items:center;gap:10px;transition:all .3s ease;position:relative;overflow:hidden}
.rank-row::before{content:'';position:absolute;top:0;left:0;bottom:0;width:3px;background:rgba(167,139,250,.3)}
.rank-row.rank-4::before,.rank-row.rank-5::before{background:rgba(96,165,250,.2)}
.rr-pos{font-family:'Press Start 2P',monospace;font-size:8px;color:#2a2545;width:22px;text-align:right;flex-shrink:0}
.rr-av{width:28px;height:28px;border-radius:3px;background:linear-gradient(135deg,#2e1065,#7c3aed);
  display:flex;align-items:center;justify-content:center;font-family:'Press Start 2P',monospace;
  font-size:9px;color:#fff;flex-shrink:0;border:1px solid rgba(255,255,255,.1)}
.rr-name{font-family:'Press Start 2P',monospace;font-size:7px;color:#d4c8ff;flex:1;line-height:1.7}
.rr-grade{font-size:10px;color:#374151;flex-shrink:0}
.rr-score{font-family:'Press Start 2P',monospace;font-size:10px;color:#a78bfa;
  text-shadow:0 0 6px rgba(167,139,250,.4);flex-shrink:0;min-width:80px;text-align:right}
.rr-pct{font-size:11px;color:#374151;width:44px;text-align:right;flex-shrink:0}

/* Estado vacio */
.empty-state{text-align:center;padding:60px 20px;color:#2a2545}
.empty-title{font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:1px;margin-top:20px}

/* Animaciones de entrada */
@keyframes slideIn{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
.rank-row{animation:slideIn .3s ease both}
</style>
</head>
<body>
<header>
  <div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <span class="h-title">RANKING EN VIVO</span>
  </div>
  <div class="h-right">
    <span class="live-dot"></span>
    <span class="h-count" id="hCount">0 jugadores</span>
    <a href="/maestro" class="h-link">📋 MAESTRO</a>
  </div>
</header>
<div class="container">
  <div class="podio" id="podio">
    <div class="podio-slot p2-slot podio-empty" id="p2"><span class="podio-medal">🥈</span><div class="podio-rank">#2</div><div class="podio-av">👤</div><div class="podio-name">-</div><div class="podio-score">-</div></div>
    <div class="podio-slot p1-slot podio-empty" id="p1"><span class="podio-medal">🥇</span><div class="podio-rank">#1</div><div class="podio-av">👤</div><div class="podio-name">-</div><div class="podio-score">-</div></div>
    <div class="podio-slot p3-slot podio-empty" id="p3"><span class="podio-medal">🥉</span><div class="podio-rank">#3</div><div class="podio-av">👤</div><div class="podio-name">-</div><div class="podio-score">-</div></div>
  </div>
  <div class="rank-list" id="rankList"></div>
</div>
<script>
const WS_URL='ws://'+location.host+'/ws-ranking-live';
let ws, sessions=[];

function connect(){
  ws=new WebSocket(WS_URL);
  ws.onmessage=e=>{
    try{
      const d=JSON.parse(e.data);
      if(d.type==='live_scores'){ sessions=d.sessions||[]; render(); }
    }catch(_){}
  };
  ws.onclose=()=>setTimeout(connect,1500);
}

function initials(name){ return (name||'?').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'?'; }

function render(){
  const sorted=[...sessions].filter(s=>s.status!=='finished').sort((a,b)=>b.score-a.score);
  document.getElementById('hCount').textContent=sorted.length+' jugador'+(sorted.length!==1?'es':'');

  // Podio (orden visual: 2, 1, 3)
  const slots=[
    {el:document.getElementById('p1'),idx:0,cls:'p1-slot',medal:'🥇',rank:'#1'},
    {el:document.getElementById('p2'),idx:1,cls:'p2-slot',medal:'🥈',rank:'#2'},
    {el:document.getElementById('p3'),idx:2,cls:'p3-slot',medal:'🥉',rank:'#3'},
  ];
  slots.forEach(({el,idx,medal,rank})=>{
    const s=sorted[idx];
    if(!s){ el.classList.add('podio-empty'); el.innerHTML=\`<span class="podio-medal">\${medal}</span><div class="podio-rank">\${rank}</div><div class="podio-av">👤</div><div class="podio-name">-</div><div class="podio-score">-</div>\`; return; }
    el.classList.remove('podio-empty');
    const pct=s.correct+s.wrong>0?Math.round(s.correct/(s.correct+s.wrong)*100):0;
    el.innerHTML=\`
      <span class="podio-medal">\${medal}</span>
      <div class="podio-rank">\${rank}</div>
      <div class="podio-av">\${initials(s.name)}</div>
      <div class="podio-name">\${s.name}</div>
      \${s.grade?'<div class="podio-grade">'+s.grade+'</div>':''}
      <div class="podio-score">\${s.score.toLocaleString()}</div>
      <div class="podio-pct">\${pct}% precisión</div>
    \`;
  });

  // Lista resto
  const rest=sorted.slice(3);
  const list=document.getElementById('rankList');
  if(!rest.length){ list.innerHTML=''; return; }
  list.innerHTML=rest.map((s,i)=>{
    const pct=s.correct+s.wrong>0?Math.round(s.correct/(s.correct+s.wrong)*100):0;
    return \`<div class="rank-row rank-\${i+4}" style="animation-delay:\${i*40}ms">
      <span class="rr-pos">#\${i+4}</span>
      <div class="rr-av">\${initials(s.name)}</div>
      <span class="rr-name">\${s.name}</span>
      <span class="rr-grade">\${s.grade||''}</span>
      <span class="rr-score">\${s.score.toLocaleString()}</span>
      <span class="rr-pct">\${pct}%</span>
    </div>\`;
  }).join('');

  // Estado vacio
  if(!sorted.length){
    document.getElementById('podio').style.display='none';
    list.innerHTML='<div class="empty-state"><div style="font-size:48px">👾</div><div class="empty-title">ESPERANDO JUGADORES...</div></div>';
  } else {
    document.getElementById('podio').style.display='';
  }
}

connect();
render();
</script>
</body></html>`);
  }

  function watchFiles() {
    try {
      getGameHTML();
      fs.watch(gameHTMLPath, () => {
        gameHTML = null;
        gameHTMLGzip = null;
        logGame('math-attack.html modificado — caché invalidada');
      });
    } catch (e) {}

    try {
      getMaestroHTML();
      fs.watch(maestroHTMLPath, () => {
        maestroHTML = null;
        maestroHTMLGzip = null;
        logPanel('maestro.html modificado — caché invalidada');
      });
    } catch (e) {}
  }

  function sendChart(req, res) {
    try {
      const js = fs.readFileSync(path.join(baseDir, 'chart.umd.min.js'));
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=86400' });
      res.end(js);
    } catch (e) {
      res.writeHead(404);
      res.end('');
    }
  }

  function sendGame(req, res) {
    const html = getGameHTML();
    if (html !== null) {
      const gz = acceptsGzip(req) && getGameHTMLGzip();
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      };
      if (gz) {
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Length'] = gz.length;
        res.writeHead(200, headers);
        res.end(gz);
      } else {
        res.writeHead(200, headers);
        res.end(html);
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Coloca math-attack.html en la misma carpeta que server.js</h1>`);
    }
  }

  function sendMaestro(req, res) {
    if (acceptsGzip(req)) {
      if (!maestroHTMLGzip) maestroHTMLGzip = zlib.gzipSync(getMaestroHTML());
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Length': maestroHTMLGzip.length,
      });
      res.end(maestroHTMLGzip);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getMaestroHTML());
    }
  }

  function sendRanking(req, res) {
    try {
      const html = fs.readFileSync(path.join(baseDir, 'ranking.html'), 'utf8');
      if (acceptsGzip(req)) {
        const gz = zlib.gzipSync(html);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Content-Length': gz.length,
        });
        res.end(gz);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      }
    } catch (e) {
      res.writeHead(500);
      res.end('Error al leer ranking.html');
    }
  }

  function sendRankingLive(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getRankingLiveHTML());
  }

  watchFiles();

  return {
    sendChart,
    sendGame,
    sendMaestro,
    sendRanking,
    sendRankingLive,
  };
}

module.exports = { createHtmlPages };
