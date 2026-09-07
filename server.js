/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║          🎮 Math Attack — Servidor Multijugador          ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  1. npm install ws                                       ║
 * ║  2. node server.js                                       ║
 * ║                                                          ║
 * ║  Rutas disponibles:                                      ║
 * ║  /           → Juego                                     ║
 * ║  /maestro    → Panel del maestro en tiempo real          ║
 * ║  /ranking    → Tabla de líderes                          ║
 * ╚══════════════════════════════════════════════════════════╝
 */

const http = require('http');
const WebSocket = require('ws');
const os   = require('os');
const fs   = require('fs');
const path = require('path');
const { createJsonStore } = require('./src/data/jsonStore');
const { createHtmlPages } = require('./src/server/htmlPages');
const {
  getPlayerExperience,
  ensurePlayerExperience,
  getPlayerLevel,
} = require('./src/game/playerLevels');
const {
  REGISTRATION_REQUIRED_ERROR,
  findPlayerById,
  findPlayerIndexById,
  findPlayerByName,
  resolveCanonicalPlayer,
  indexPlayersByName,
  preparePlayerRegistration,
  authenticatePlayer,
  buildPlayerProfile,
  normalizeAdminPin,
  updatePlayerPin,
  updatePlayerGrade,
  updatePlayerThemeColor,
  updatePlayerAvatar,
  addPlayerInventoryItem,
  setPlayerInventoryQuantity,
  consumePlayerInventoryItem,
  ensurePlayerCosmetics,
  unlockPlayerCosmetic,
} = require('./src/game/players');
const { ACHIEVEMENTS_DEF, checkNewAchievements } = require('./src/game/achievements');
const { calculateDailyStreak } = require('./src/game/dailyStreak');
const { calculateDirectGameReward, calculateGameRewards } = require('./src/game/gameRewards');
const {
  buildCompletedResultRecord,
  buildRankingCsv,
  importRankingRows,
  removePlayerResults,
  removeRankingResult,
  upsertCompletedResult,
} = require('./src/game/ranking');
const { upsertCheckpoint } = require('./src/game/checkpoints');
const {
  buildStudentHistory,
  calculatePlayerAverages,
  createOperationStatsCache,
} = require('./src/game/statistics');
const PORT = Number(process.env.PORT) || 8080;
// Poderes que SOLO deben afectar a un rival (no a toda la sala) — si el cliente
// olvida mandar targetIdx, el servidor descarta el mensaje en vez de reenviarlo
// a todos (eso fue exactamente el bug original de robo/drenar/inversión en 3-4p).
const SINGLE_TARGET_POWERS = new Set(['steal','drainlife','inversion']);
// Modos LAN cuya lógica depende de que la sala tenga exactamente 2 jugadores
// (usan aritmética binaria 1-idx). El cliente ya restringe esto en el selector,
// esta es la verificación de respaldo del lado del servidor.
const TWO_PLAYER_ONLY_MODES = new Set(['bomb','survival']);

// ── Estado del modo examen ────────────────────────────────────
let examMode=null; // null=inactivo, o {grade,tables,op,ops,opsConfig,timeLimit,total,startedAt} — opsConfig (config por operación, opcional) es la fuente de verdad para generar preguntas cuando está presente; tables/total son agregados para compatibilidad con UI existente
// Alumnos que terminaron durante el examen (visible en panel hasta que se detenga el examen)
const examFinished=new Map();
let _lastExamStartAt=0; // evita que un doble-submit accidental borre examFinished

// ── File logger ──────────────────────────────────────────────
const LOG_FILE = path.join(__dirname, 'server.log');
const LOG_MAX_BYTES = 1_000_000; // rota al llegar a 1 MB
const _ansiRe = /\x1b\[[0-9;]*m/g;
function logToFile(icon, args){
  try{
    const text=args.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ');
    const line=new Date().toLocaleString('es-MX')+' '+icon.replace(_ansiRe,'')+' '+text+'\n';
    try{ if(fs.statSync(LOG_FILE).size>LOG_MAX_BYTES) fs.renameSync(LOG_FILE,LOG_FILE+'.old'); }catch(_){}
    fs.appendFileSync(LOG_FILE,line,'utf8');
  }catch(_){}
}

// ── Terminal logger ──────────────────────────────────────────
const C={
  reset:'\x1b[0m',dim:'\x1b[2m',
  green:'\x1b[32m',blue:'\x1b[34m',
  cyan:'\x1b[36m',red:'\x1b[31m',
  gray:'\x1b[90m',
};
function ts(){ return C.gray+new Date().toLocaleTimeString('es-MX')+C.reset; } // Retorna la hora actual formateada
function isBrokenPipeError(err){
  return !!err && (err.code==='EPIPE' || String(err.message||err).includes('EPIPE'));
}
function log(color,icon,...a){
  logToFile(icon,a);
  if(!process.stdout || process.stdout.destroyed || process.stdout.writableEnded) return;
  try{
    console.log(`${ts()} ${color}${icon}${C.reset}`,...a);
  }catch(err){
    if(!isBrokenPipeError(err)) throw err;
  }
} // Imprime mensaje con color e ícono en consola y en archivo
const L={
  conn: (...a)=>log(C.cyan,  '\u{1F50C} CONN  ',...a),
  disc: (...a)=>log(C.gray,  '\u{1F50B} DISC  ',...a),
  room: (...a)=>log(C.green, '\u{1F3E0} ROOM  ',...a),
  game: (...a)=>log(C.blue,  '\u{1F3AE} GAME  ',...a),
  panel:(...a)=>log(C.cyan,  '\u{1F4CB} PANEL ',...a),
  rank: (...a)=>log(C.green, '\u{1F3C5} RANK  ',...a),
  err:  (...a)=>log(C.red,   '\u274C ERROR ',...a),
};
const dataStore = createJsonStore({ baseDir: __dirname, logger: L });
const htmlPages = createHtmlPages({ baseDir: __dirname, logger: L });
const {
  loadRanking,
  saveRanking:saveRankingData,
  loadPlayers,
  savePlayers,
  loadAureosLog,
  saveAureosLog,
  logAureosTx,
} = dataStore;
const operationStatsCache=createOperationStatsCache(loadRanking);
const saveRanking=operationStatsCache.wrapSave(saveRankingData);
const _config = dataStore.loadConfig();
let ADMIN_USERNAME = _config.adminUsername || 'admin';
let ADMIN_PASSWORD = _config.adminPassword || 'admin';

function saveConfig(){
  dataStore.saveConfig({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD });
}
function sendJson(res,status,obj){
  res.writeHead(status,{'Content-Type':'application/json'});
  res.end(JSON.stringify(obj));
}
function getAdminPasswordFromRequest(req, bodyData=null){
  if(bodyData&&typeof bodyData==='object'){
    const pwd=bodyData.password??bodyData.currentPassword??bodyData.pwd;
    if(pwd!==undefined) return String(pwd);
  }
  const headerPwd=req.headers['x-admin-password'];
  if(headerPwd!==undefined) return String(headerPwd);
  try{
    const qs=new URL('http://x'+req.url).searchParams;
    return qs.get('password')??qs.get('pwd')??'';
  }catch(e){
    return '';
  }
}
function isAdminAuthorized(req, bodyData=null){
  return getAdminPasswordFromRequest(req, bodyData)===ADMIN_PASSWORD;
}
function requireAdmin(req,res,bodyData=null){
  if(isAdminAuthorized(req,bodyData)) return true;
  sendJson(res,401,{ok:false,error:'No autorizado'});
  return false;
}
let _connCount=0;
function getActiveClientCount(excludeWs=null){
  let count=0;
  for(const client of wss.clients){
    if(client===excludeWs) continue;
    if(client.readyState===WebSocket.OPEN || client.readyState===WebSocket.CONNECTING) count++;
  }
  return count;
}

function finalizePlayerDisconnect(ws, opts={}){
  if(ws._disconnectHandled) return false;
  ws._disconnectHandled=true;
  const name=ws.playerName||'anonimo';
  const suffix=opts.reason ? ` (${opts.reason})` : '';
  pushConnLog('disconnect',`${name} desconectado${suffix}`);
  L.disc(`${name} desconectado${suffix} - activos: ${getActiveClientCount(ws)}`);
  onDisconnect(ws);
  return true;
}


for(const stream of [process.stdout, process.stderr]){
  if(!stream || typeof stream.on!=='function') continue;
  stream.on('error',(err)=>{
    if(isBrokenPipeError(err)){
      try{ stream.destroy(); }catch(_){}
      return;
    }
    logToFile('STREAM', [err?.message||err]);
  });
}

// ── Stores ──────────────────────────────────────────────────
const rooms       = new Map();
const gameSessions= new Map(); // playerId → session state
const pendingPotMsgs = new Map(); // nombre (lowercase) → mensaje pot_result pendiente de entregar
const _awardedPotGames = new Set(); // roomId_gameId ya liquidados — evita doble crédito por condición de carrera
const _mpEarnedByGame = new Map(); // roomId_gameId_nombre → Áureos ganados en esa partida (para duplicar al ganador)
const _awardedBonusGames = new Set(); // roomId_gameId ya con bono de ganador repartido
const maestroClients     = new Set(); // WebSocket connections of /maestro panel
const rankingLiveClients = new Set(); // WebSocket connections of /ranking-live (datos mínimos)

// ── Registro de eventos de conexión para pestaña Conexión ────
const connLog = [];
function pushConnLog(evType, msg) {
  connLog.unshift({ ts: Date.now(), evType, msg });
  if (connLog.length > 200) connLog.length = 200;
  const payload = JSON.stringify({ type: 'conn_event', ts: Date.now(), evType, msg });
  maestroClients.forEach(mc => { if (mc.readyState === WebSocket.OPEN) try { mc.send(payload); } catch(e) {} });
}

// ── Ranking persistence ──────────────────────────────────────
function persistCheckpoint(msg,canonicalName){
  const result=upsertCheckpoint(loadRanking(),msg,canonicalName);
  if(result.saved) saveRanking(result.ranking);
  return result;
}
// ── Utilities ────────────────────────────────────────────────
function genId(){ return Math.random().toString(36).substr(2,6).toUpperCase(); } // Genera un ID aleatorio de 6 caracteres en mayúsculas
function send(ws,obj){ // Envía un objeto JSON a un cliente WebSocket si está abierto
  if(ws&&ws.readyState===WebSocket.OPEN)
    try{ ws.send(JSON.stringify(obj)); if(ws._msgOut!==undefined) ws._msgOut++; }catch(e){}
}
// Lee el cuerpo de una petición HTTP con límite de 50 KB — rechaza con 413 si se excede
function readBody(req,res,cb){
  let body='',size=0;
  req.on('data',d=>{
    size+=d.length;
    if(size>2_000_000){
      if(!res.headersSent){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Solicitud demasiado grande'}));}
      req.destroy(); return;
    }
    body+=d;
  });
  req.on('end',()=>{ if(!res.writableEnded) cb(body); });
}
// ── Stats generales por operación (caché invalidada al guardar partida) ──
// ── Broadcast panel state to all maestro clients ─────────────
let _lastPanelHash='';
function broadcastPanelState(){ // Envía el estado de las sesiones al panel; omite el envío si nada cambió
  if(maestroClients.size===0) return;
  const now=Date.now();
  const players=loadPlayers();
  const playersByName=indexPlayersByName(players);
  const sessions=[...gameSessions.values()].map(s=>{
    const player=playersByName.get((s.name||'').toLowerCase());
    const roomId=s.roomId||s.ws?.roomId||null;
    const room=roomId?rooms.get(roomId):null;
    const roomPlayers=room?.players||[];
    return {
    id:s.id, name:s.name, grade:s.grade,
    avatar:player?.avatar||{}, themeColor:player?.themeColor||'',
    gameMode:s.gameMode||'idle', mpGameMode:s.mpGameMode||'',
    gameType:s.gameType||'', difficulty:s.difficulty||'', isExam:s.isExam||false,
    score:s.score||0, qIndex:s.qIndex||0, totalQ:s.totalQ||0,
    currentTable:s.currentTable||0, currentQuestion:s.currentQuestion||'',
    correct:s.correct||0, wrong:s.wrong||0,
    tblSelMode:s.tblSelMode||'', tables:s.tables||[],
    paused:!!s.paused, startTime:s.startTime,
    elapsed:Math.floor((now-(s.startTime||now))/1000),
    status:s.status||'',
    inventory:s.inventory||{},
    lives:s.lives||0, livesTotal:s.livesTotal||0,
    streak:s.streak||0,
    timeLeft:s.timeLeft||0, timeLimit:s.timeLimit||0,
    lastResult:s.lastResult||null, lastResultTs:s.lastResultTs||0,
    tblResults:s.tblResults||{},
    disconnected:!!s.disconnected,
    roomId,
    roomName:room?.name||'',
    roomHostName:room?.hostName||'',
    roomStatus:room?.status||'',
    roomPlayerCount:roomPlayers.length||0,
    roomMaxPlayers:room?.maxPlayers||0,
    roomPlayers:roomPlayers.map(p=>({name:p.name,idx:p.idx,role:p.role||'',disconnected:!!p.disconnected})),
    playerIdx:s.ws?.playerIdx??s.playerIdx??null,
    role:s.ws?.role||s.role||''
    };
  });
  const connectedNames=[...gameSessions.values()].filter(s=>s.ws?.readyState===WebSocket.OPEN).map(s=>s.name.toLowerCase());
  const opStats=operationStatsCache.get();
  // Comparar sin ts (que siempre cambia) — si el estado es idéntico, no enviar
  const examFinishedArr=[...examFinished.values()];
  const hash=JSON.stringify({sessions,connectedNames,examMode:examMode||null,opStats,examFinished:examFinishedArr});
  if(hash===_lastPanelHash) return;
  _lastPanelHash=hash;
  const msg=JSON.stringify({type:'panel_state', sessions, connectedNames, ts:now, examMode:examMode||null, opStats, examFinished:examFinishedArr});
  maestroClients.forEach(ws=>{
    if(ws.readyState!==WebSocket.OPEN) maestroClients.delete(ws);
    else ws.send(msg);
  });
  broadcastRankingLive();
}
// Emite solo {name, score, grade} a los clientes de /ranking-live (sin datos sensibles)
function broadcastRankingLive(){
  if(rankingLiveClients.size===0) return;
  const live=[...gameSessions.values()]
    .filter(s=>s.status!=='finished'&&s.ws?.readyState===WebSocket.OPEN)
    .map(s=>({name:s.name, score:s.score||0, grade:s.grade||''}));
  const msg=JSON.stringify({type:'live_scores', sessions:live});
  rankingLiveClients.forEach(ws=>{
    if(ws.readyState!==WebSocket.OPEN) rankingLiveClients.delete(ws);
    else try{ ws.send(msg); }catch(e){}
  });
}
// Heartbeat dinámico: solo para refrescar "elapsed" cuando no hay otros eventos —
// la reactividad real (puntaje, vidas, etc.) la cubre schedulePanelBroadcast() vía
// session_update con throttle de 100ms, así que este heartbeat no necesita ser tan agresivo
let _panelHeartbeatTimer = null;
function schedulePanelHeartbeat(){
  const interval = gameSessions.size > 0 ? 1000 : 5000;
  _panelHeartbeatTimer = setTimeout(()=>{
    broadcastPanelState();
    schedulePanelHeartbeat();
  }, interval);
}
schedulePanelHeartbeat();
// Throttle con leading edge: dispara inmediato en el primer evento y agrupa los siguientes en 100 ms
let _panelThrottleTimer = null;
let _panelLastSent = 0;
const PANEL_THROTTLE_MS = 100;
function schedulePanelBroadcast(){
  const now = Date.now();
  const elapsed = now - _panelLastSent;
  if(elapsed >= PANEL_THROTTLE_MS){
    // Primer evento del grupo → enviar de inmediato
    _panelLastSent = now;
    if(_panelThrottleTimer){ clearTimeout(_panelThrottleTimer); _panelThrottleTimer = null; }
    broadcastPanelState();
  } else if(!_panelThrottleTimer){
    // Dentro de la ventana → programar el envío al final del throttle
    _panelThrottleTimer = setTimeout(()=>{
      _panelThrottleTimer = null;
      _panelLastSent = Date.now();
      broadcastPanelState();
    }, PANEL_THROTTLE_MS - elapsed);
  }
}


// ── HTTP Server ──────────────────────────────────────────────
const server=http.createServer((req,res)=>{
  const url=req.url.split('?')[0];

  // ── Servir Chart.js local ──
  if(req.method==='GET'&&url==='/chart.umd.min.js'){
    htmlPages.sendChart(req,res);
    return;
  }

  // ── Serve game HTML ──
  if(req.method==='GET'&&(url==='/'||url==='/math-attack.html'||url==='/juego')){
    htmlPages.sendGame(req,res);
    return;
  }

  // ── Panel del maestro ──

  if(req.method==='GET'&&url==='/maestro'){
    L.panel(`Panel consultado desde ${req.socket.remoteAddress}`);
    htmlPages.sendMaestro(req,res);
    return;
  }

  // ── Ranking ──
  if(req.method==='GET'&&url==='/ranking'){
    htmlPages.sendRanking(req,res);
    return;
  }

  // ── Ranking data API ──
  // ── Export CSV ──
  if(req.method==='GET'&&url==='/api/ranking/export'){
    if(!requireAdmin(req,res)) return;
    res.writeHead(200,{
      'Content-Type':'text/csv;charset=utf-8',
      'Content-Disposition':'attachment;filename="math-attack-ranking.csv"'
    });
    res.end(buildRankingCsv(loadRanking())); // BOM for Excel UTF-8
    return;
  }
  if(req.method==='GET'&&url==='/api/ranking'){
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify(loadRanking()));
    return;
  }

  // ── Estado de conexiones WS (pestaña Conexión del maestro) ──
  if(req.method==='POST'&&url==='/api/connections'){
    readBody(req, res, body=>{
      let parsed={}; try{ parsed=JSON.parse(body||'{}'); }catch(e){}
      if(!requireAdmin(req,res,parsed)) return;
      const now=Date.now();
      const conns=[];
      wss.clients.forEach(c=>{
        if(c.readyState!==WebSocket.OPEN) return;
        const isMaestro=maestroClients.has(c);
        const session=!isMaestro&&c.playerId?gameSessions.get(c.playerId):null;
        conns.push({
          id:       c._connId||0,
          type:     isMaestro?'maestro':'player',
          name:     isMaestro?'Panel Maestro':(c.playerName||'Anónimo'),
          grade:    session?.grade||'',
          ip:       c._ip||'?',
          connectedMs: now-(c._connTime||now),
          msgIn:    c._msgIn||0,
          msgOut:   c._msgOut||0,
          latency:  c._latency,
          playerId: c.playerId||null,
          gameMode: session?.gameMode||'',
          score:    session?.score||0
        });
      });
      res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
      res.end(JSON.stringify({connections:conns, log:connLog.slice(0,100), ts:now}));
    });
    return;
  }

  // ── Autenticación del panel del maestro ──
  if(req.method==='POST'&&url==='/api/maestro/auth'){
    readBody(req, res, body=>{
      try{
        const {username,password}=JSON.parse(body);
        if(username!==ADMIN_USERNAME||password!==ADMIN_PASSWORD){ sendJson(res,401,{ok:false}); return; }
      }catch(e){ sendJson(res,401,{ok:false}); return; }
      sendJson(res,200,{ok:true});
    });
    return;
  }

  // ── Obtener configuración del maestro (sin contraseña) ──
  if(req.method==='GET'&&url==='/api/maestro/config'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({username:ADMIN_USERNAME}));
    return;
  }

  // ── Actualizar credenciales del maestro ──
  if(req.method==='POST'&&url==='/api/maestro/config'){
    readBody(req, res, body=>{
      try{
        const {currentPassword,newUsername,newPassword}=JSON.parse(body);
        if(!requireAdmin(req,res,{currentPassword})){ return; }
        if(newUsername) ADMIN_USERNAME=newUsername.trim();
        if(newPassword) ADMIN_PASSWORD=newPassword;
        saveConfig();
        L.panel(`Credenciales del maestro actualizadas — usuario: ${ADMIN_USERNAME}`);
        sendJson(res,200,{ok:true});
       }catch(e){ sendJson(res,400,{ok:false,error:'Solicitud inválida'}); }
    });
    return;
  }

  // ── Clear ranking ──
  if(req.method==='POST'&&url==='/api/ranking/clear'){
    readBody(req, res, body=>{
      let parsed;
      try{ parsed=JSON.parse(body); }catch(e){ sendJson(res,401,{ok:false}); return; }
      if(!requireAdmin(req,res,parsed)) return;
      saveRanking([]);
      L.rank('Ranking limpiado manualmente');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true}));
    });
    return;
  }

  // ── Clear student history ──
  if(req.method==='POST'&&url==='/api/ranking/clear-student'){
    readBody(req, res, body=>{
      let parsed;
      try{ parsed=JSON.parse(body); }catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false})); return; }
      const {password,name}=parsed;
      if(!requireAdmin(req,res,parsed)) return;
      if(!name){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false})); return; }
      const lower=name.toLowerCase();
      const result=removePlayerResults(loadRanking(),lower);
      const {removed}=result;
      saveRanking(result.ranking);
      L.rank(`Historial de "${name}" eliminado (${removed} partidas)`);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true,removed}));
    });
    return;
  }

  // ── Eliminar partida individual del ranking ──
  if(req.method==='POST'&&url==='/api/ranking/delete-game'){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        if(!requireAdmin(req,res,parsed)) return;
        const {id}=parsed;
        if(!id){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false})); return; }
        const result=removeRankingResult(loadRanking(),id);
        const {removed}=result;
        if(removed>0){ saveRanking(result.ranking); L.rank(`Partida ${id} eliminada`); }
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,removed}));
      }catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false})); }
    });
    return;
  }

  // ── Guardar checkpoint de partida en curso (sendBeacon del cliente) ──
  if(req.method==='POST'&&url==='/api/ranking/import'){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        const {password}=parsed;
        const rows=Array.isArray(parsed.rows)?parsed.rows:[];
        if(!requireAdmin(req,res,parsed)) return;
        if(!rows.length){
          res.writeHead(400,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:false,error:'No hay partidas para importar'}));
          return;
        }
        const imported=importRankingRows(loadRanking(),rows);
        if(imported.added) saveRanking(imported.ranking);
        L.rank(`Importación ranking: ${imported.added} nuevas, ${imported.skipped} duplicadas, ${imported.invalid} inválidas`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,added:imported.added,skipped:imported.skipped,invalid:imported.invalid,total:loadRanking().length}));
      }catch(e){
        res.writeHead(400,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:false,error:'Archivo o solicitud inválida'}));
      }
    });
    return;
  }

  if(req.method==='POST'&&url==='/api/ranking/checkpoint'){
    readBody(req, res, body=>{
      try{
        const msg=JSON.parse(body);
        const saved=persistCheckpoint(msg,msg.name||'?');
        if(saved.saved) L.rank(`Checkpoint incompleto: ${msg.name} (${msg.gameMode} ${msg.gameType})`);
        res.writeHead(204); res.end();
      }catch(e){ res.writeHead(400); res.end(); }
    });
    return;
  }

  // ── Maestro commands (pause/end) ──
  if(req.method==='POST'&&url.startsWith('/api/cmd/')){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        if(!requireAdmin(req,res,parsed)) return;
        const {action,playerId}=parsed;
        const session=gameSessions.get(playerId);
        if(!session){ res.writeHead(404); res.end('{}'); return; }
        if(action==='pause'){
          send(session.ws,{type:'maestro_cmd',cmd:'pause'});
          session.paused=true;
          L.panel(`⏸️  Pausa enviada a ${session.name}`);
        } else if(action==='resume'){
          send(session.ws,{type:'maestro_cmd',cmd:'resume'});
          session.paused=false;
          L.panel(`▶️  Continuar enviado a ${session.name}`);
        } else if(action==='end'){
          send(session.ws,{type:'maestro_cmd',cmd:'end'});
          L.panel(`🛑 Terminar enviado a ${session.name}`);
        }
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true}));
      } catch(e){ res.writeHead(400); res.end('{}'); }
    });
    return;
  }

  // ── Comandos grupales del maestro (por grado o todos) ──
  if(req.method==='POST'&&url==='/api/cmd/all'){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        if(!requireAdmin(req,res,parsed)) return;
        const {action,grade}=parsed;
        let count=0;
        gameSessions.forEach(s=>{
          if(grade&&s.grade!==grade) return;
          if(action==='pause'&&!s.paused){ send(s.ws,{type:'maestro_cmd',cmd:'pause'}); s.paused=true; count++; }
          else if(action==='resume'&&s.paused){ send(s.ws,{type:'maestro_cmd',cmd:'resume'}); s.paused=false; count++; }
          else if(action==='end'){ send(s.ws,{type:'maestro_cmd',cmd:'end'}); count++; }
        });
        L.panel(`Comando grupal "${action}"${grade?' grado:'+grade:' todos'} → ${count} jugadores`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,count}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Listar jugadores (panel maestro) ──
  if(req.method==='GET'&&url==='/api/players'){
    if(!requireAdmin(req,res)) return;
    const players=loadPlayers();
    const ranking=loadRanking();
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify(players.map(p=>{
      const {avgPct}=calculatePlayerAverages(ranking,p.name);
      return {...buildPlayerProfile(p),avgPct};
    })));
    return;
  }

  // ── Ver PIN de alumno (solo maestro) ──
  if(req.method==='GET'&&url.startsWith('/api/players/get-pin')){
    const _qs=new URL('http://x'+req.url).searchParams;
    const id=_qs.get('id')||'';
    if(!requireAdmin(req,res)) return;
    const players=loadPlayers();
    const player=findPlayerById(players,id);
    if(!player){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false})); return; }
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify({ok:true,pin:player.pin}));
    return;
  }

  // ── Exportar alumnos como CSV ──
  if(req.method==='GET'&&url==='/api/players/export'){
    if(!requireAdmin(req,res)) return;
    const players=loadPlayers();
    const ranking=loadRanking();
    const header='Nombre,Grado,Áureos,Experiencia,Nivel,Partidas,Puntaje Promedio,Precisión Promedio,Racha Actual,Logros\n';
    const rows=players.map(p=>{
      const {avgScore,avgPct}=calculatePlayerAverages(ranking,p.name);
      const experiencia=getPlayerExperience(p);
      const lvl=getPlayerLevel(experiencia);
      return [
        `"${(p.name||'').replace(/"/g,'""')}"`,
        `"${(p.grade||'').replace(/"/g,'""')}"`,
        p.aureos||0, experiencia, lvl.level+' '+lvl.name,
        p.gamesPlayed||0, avgScore, avgPct+'%',
        (p.dailyStreak||{}).current||0,
        (p.achievements||[]).length
      ].join(',');
    }).join('\n');
    res.writeHead(200,{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment;filename="alumnos-math-attack.csv"'});
    res.end('ï»¿'+header+rows);
    return;
  }

  // ── Registrar jugador (maestro) ──
  if(req.method==='POST'&&url==='/api/players/register'){
    readBody(req, res, body=>{
      try{
        const input=JSON.parse(body);
        const players=loadPlayers();
        const registration=preparePlayerRegistration(players,input);
        if(!registration.ok){
          res.writeHead(registration.error===REGISTRATION_REQUIRED_ERROR?400:200,{'Content-Type':'application/json'});
          res.end(JSON.stringify(registration)); return;
        }
        const {name,pin}=input;
        const newPlayer=registration.player;
        players.push(newPlayer); savePlayers(players);
        L.game(`Jugador registrado: ${name} (PIN:${pin})`);
        maestroClients.forEach(mc=>{ if(mc.readyState===WebSocket.OPEN) mc.send(JSON.stringify({type:'students_updated',newUser:name})); });
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,player:{id:newPlayer.id,name:newPlayer.name,aureos:0,experiencia:0,inventory:{}}}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Login con PIN ──
  if(req.method==='POST'&&url==='/api/players/login'){
    readBody(req, res, body=>{
      try{
        const {name,pin}=JSON.parse(body);
        const players=loadPlayers();
        const player=authenticatePlayer(players,name,pin);
        if(!player){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'PIN incorrecto'})); return; }
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,player:buildPlayerProfile(player)}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Sincronizar Áureos (toma el máximo) ──
  if(req.method==='POST'&&url==='/api/players/sync'){
    readBody(req, res, body=>{
      try{
        const {id,aureos}=JSON.parse(body);
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        ensurePlayerExperience(player);
        player.aureos=Math.max(player.aureos||0,aureos||0);
        savePlayers(players);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,aureos:player.aureos}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Comprar poder ──
  if(req.method==='POST'&&url==='/api/players/buy'){
    readBody(req, res, body=>{
      try{
        // Catálogo de precios en el servidor — el cliente nunca dicta el costo
        const POWER_COSTS={
          shield:60, magnifier:160, extratime:75, fifty:35, secondchance:40,
          streaksafe:45, doublepts:110, skip:40, blind:120, chaos:80,
          freeze:105, steal:150, bomb2:100, mirror:185, hardq:70,
          drainlife:90, timethief:85, sabotage:110, fog:75, curse:80, inversion:130,
          bounce:140, doubleornothing:60, slow:65, confusion:95, coinrob:100,
          aureosmagnet:120, streakbreak:85, blackout:140, aura:200, sticker:25,
        };
        const {id,powerId}=JSON.parse(body);
        const cost=POWER_COSTS[powerId];
        if(!cost){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'Poder no válido'})); return; }
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        ensurePlayerExperience(player);
        if((player.aureos||0)<cost){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'Áureos insuficientes'})); return; }
        player.aureos-=cost;
        logAureosTx(player,-cost,'compra_poder:'+powerId);
        addPlayerInventoryItem(player,powerId);
        savePlayers(players);
        L.game(`${player.name} compró poder [${powerId}] por ${cost} Áureos`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,aureos:player.aureos,inventory:player.inventory}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Eliminar jugador (requiere contraseña de maestro) ──
  if(req.method==='DELETE'&&url.startsWith('/api/players/')){
    const pid=url.split('/').pop();
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body||'{}');
        if(!requireAdmin(req,res,parsed)) return;
        const players=loadPlayers();
        const idx=findPlayerIndexById(players,pid);
        if(idx===-1){ res.writeHead(404); res.end('{}'); return; }
        const name=players[idx].name;
        players.splice(idx,1); savePlayers(players);
        L.panel(`Maestro elimin\u00F3 al jugador: ${name}`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Ajuste de Áureos por maestro (valor exacto) ──
  if(req.method==='POST'&&url==='/api/players/admin-aureos'){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        if(!requireAdmin(req,res,parsed)) return;
        const {id,aureos}=parsed;
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        ensurePlayerExperience(player);
        const _prevAureos=player.aureos||0;
        player.aureos=Math.max(0,Math.round(Number(aureos))||0);
        logAureosTx(player,player.aureos-_prevAureos,'ajuste_maestro');
        savePlayers(players);
        L.panel(`Maestro ajustó Áureos de ${player.name} → ${player.aureos}`);
        const _as=[...gameSessions.values()].find(s=>s.name.toLowerCase()===player.name.toLowerCase());
        if(_as?.ws?.readyState===WebSocket.OPEN) _as.ws.send(JSON.stringify({type:'admin_update',aureos:player.aureos}));
        maestroClients.forEach(mc=>{ if(mc.readyState===WebSocket.OPEN) mc.send(JSON.stringify({type:'students_updated'})); });
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,aureos:player.aureos}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Ajuste de cantidad de poder por maestro ──
  if(req.method==='POST'&&url==='/api/players/admin-power'){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        if(!requireAdmin(req,res,parsed)) return;
        const {id,powerId,qty}=parsed;
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        const n=setPlayerInventoryQuantity(player,powerId,qty);
        savePlayers(players);
        L.panel(`Maestro ajustó poder [${powerId}]×${n} de ${player.name}`);
        const _ps=[...gameSessions.values()].find(s=>s.name.toLowerCase()===player.name.toLowerCase());
        if(_ps?.ws?.readyState===WebSocket.OPEN) _ps.ws.send(JSON.stringify({type:'admin_update',inventory:player.inventory}));
        maestroClients.forEach(mc=>{ if(mc.readyState===WebSocket.OPEN) mc.send(JSON.stringify({type:'students_updated'})); });
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,inventory:player.inventory}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Agregar Áureos directamente (bomb/survival) ──
  if(req.method==='POST'&&url==='/api/players/add-aureos'){
    readBody(req, res, body=>{
      try{
        const {id,amount}=JSON.parse(body);
        if(!Number.isFinite(amount)||amount<=0){ res.writeHead(400); res.end('{}'); return; }
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        const {earnedAureos:gained,earnedExperience:gainedExperience}=calculateDirectGameReward(amount);
        const baseExperience=ensurePlayerExperience(player);
        player.aureos=(player.aureos||0)+gained;
        player.experiencia=baseExperience+gainedExperience;
        logAureosTx(player,gained,'bonus_juego');
        savePlayers(players);
        L.game(`${player.name} ganó ${gained} Áureos y ${gainedExperience} XP (bomb/survival)`);
        res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify({ok:true,aureos:player.aureos,experiencia:player.experiencia,experience:player.experiencia}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Uso de poder por el jugador durante la partida ──
  if(req.method==='POST'&&url==='/api/players/use-power'){
    readBody(req, res, body=>{
      try{
        const {id,powerId}=JSON.parse(body);
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        const useResult=consumePlayerInventoryItem(player,powerId);
        if(!useResult.ok){
          // El inventario del servidor ya estaba en 0 (desincronizado con el cliente) —
          // avisar con ok:false para que el cliente revierta el efecto/uso local
          res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
          res.end(JSON.stringify({ok:false,error:'Sin inventario',inventory:player.inventory}));
          return;
        }
        savePlayers(players);
        L.game(`${player.name} usó poder [${powerId}]`);
        res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify({ok:true,inventory:player.inventory}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Cambiar PIN de alumno por maestro ──
  if(req.method==='POST'&&url==='/api/players/admin-pin'){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        if(!requireAdmin(req,res,parsed)) return;
        const {id,pin}=parsed;
        const normalizedPin=normalizeAdminPin(pin);
        if(!normalizedPin.ok){ res.writeHead(400); res.end(JSON.stringify(normalizedPin)); return; }
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end(JSON.stringify({ok:false,error:'Jugador no encontrado'})); return; }
        updatePlayerPin(player,normalizedPin.pin);
        savePlayers(players);
        L.panel(`Maestro cambió PIN de ${player.name}`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Cambiar grado escolar de alumno por maestro ──
  if(req.method==='POST'&&url==='/api/players/admin-grade'){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        if(!requireAdmin(req,res,parsed)) return;
        const {id,grade}=parsed;
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end(JSON.stringify({ok:false,error:'Jugador no encontrado'})); return; }
        updatePlayerGrade(player,grade);
        savePlayers(players);
        L.panel(`Maestro cambió grado de ${player.name} a "${player.grade||'sin grado'}"`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,grade:player.grade}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Historial de partidas de un alumno ──
  if(req.method==='GET'&&url.startsWith('/api/students/history')){
    if(!requireAdmin(req,res)) return;
    const name=new URL('http://x'+req.url).searchParams.get('name')||'';
    const history=buildStudentHistory(loadRanking(),name,10);
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(history)); return;
  }

  // ── Borrar transacciones de Áureos ──
  if(req.method==='POST'&&url==='/api/players/aureos-log/clear'){
    readBody(req,res,body=>{
      try{
        const parsed=JSON.parse(body||'{}');
        if(!requireAdmin(req,res,parsed)) return;
        const {name,grade,date}=parsed;
        const nameLow=(name||'').toLowerCase().trim();
        const gradeVal=(grade||'').trim();
        const dateVal=(date||'').trim(); // 'YYYY-MM-DD'
        let log=loadAureosLog();
        const before=log.length;
        log=log.filter(t=>{
          const matchName=nameLow?t.name.toLowerCase()===nameLow:true;
          const matchGrade=gradeVal?t.grade===gradeVal:true;
          const matchDate=dateVal?new Date(t.ts).toLocaleDateString('sv')===dateVal:true;
          return !(matchName&&matchGrade&&matchDate);
        });
        saveAureosLog(log);
        const removed=before-log.length;
        L.panel(`Transacciones borradas: ${removed} entradas${nameLow?' ['+nameLow+']':''}${gradeVal?' ['+gradeVal+']':''}${dateVal?' ['+dateVal+']':''}`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,removed}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Historial de transacciones de Áureos ──
  if(req.method==='GET'&&url.startsWith('/api/players/aureos-log')){
    if(!requireAdmin(req,res)) return;
    const qs=new URL('http://x'+req.url).searchParams;
    const name=(qs.get('name')||'').toLowerCase().trim();
    const grade=(qs.get('grade')||'').trim();
    const date=(qs.get('date')||'').trim(); // 'YYYY-MM-DD'
    let entries=loadAureosLog();
    if(name) entries=entries.filter(t=>t.name.toLowerCase()===name);
    else if(grade) entries=entries.filter(t=>t.grade===grade);
    if(date) entries=entries.filter(t=>new Date(t.ts).toLocaleDateString('sv')===date);
    // El log ya está en orden de inserción (cronológico asc); devolver últimas 500 en desc
    const slice=entries.slice(-500).reverse();
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(slice)); return;
  }

  // ── Áureos masivos a un grado o a todos ──
  if(req.method==='POST'&&url==='/api/players/bulk-aureos'){
    readBody(req, res, body=>{
      try{
        const parsed=JSON.parse(body);
        if(!requireAdmin(req,res,parsed)) return;
        const {grade,amount}=parsed;
        const n=Math.max(1,Math.round(Number(amount))||1);
        const players=loadPlayers();
        const affected=players.filter(p=>!grade||p.grade===grade);
        affected.forEach(p=>{ ensurePlayerExperience(p); p.aureos=(p.aureos||0)+n; logAureosTx(p,n,'regalo_masivo'); });
        savePlayers(players);
        // Notificar jugadores activos
        affected.forEach(p=>{
          const s=[...gameSessions.values()].find(s=>s.name.toLowerCase()===p.name.toLowerCase());
          if(s?.ws?.readyState===WebSocket.OPEN) s.ws.send(JSON.stringify({type:'admin_update',aureos:p.aureos}));
        });
        maestroClients.forEach(mc=>{ if(mc.readyState===WebSocket.OPEN) mc.send(JSON.stringify({type:'students_updated'})); });
        L.panel(`Áureos masivos +${n} → ${affected.length} alumnos${grade?' ('+grade+')':''}`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,count:affected.length}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Guardar color de tema del alumno ──
  if(req.method==='POST'&&url==='/api/players/set-color'){
    readBody(req, res, body=>{
      try{
        const {id,color}=JSON.parse(body);
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        updatePlayerThemeColor(player,color);
        savePlayers(players);
        res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify({ok:true,themeColor:player.themeColor}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Comprar cosmético (accesorio de avatar) con Áureos ──
  if(req.method==='POST'&&url==='/api/players/buy-cosmetic'){
    readBody(req, res, body=>{
      try{
        const COSMETIC_PRICES={
          mask:40,headband:60,catears:80,monocle:90,cap:100,horns:120,wizard:150,halo:180,crown:250,
          stars:40,wink:30,unamused:35,angry:45,hearts:60,spiral:80,
          surprised:25,cat:30,grin:35,whistle:25,grumpy:30,laugh:40,drool:55,cool:45,
          crying:40,sparkle:55,robot:75,heterochromia:110,
          bun:60,afro:70,undercut:80,braids:90,
          pixie:60,emo:65,quiff:70,mullet:75,odango:80,cornrows:85,dreadlocks:95,liberty:100,
          pointed:55,earrings:45,pinky:35,
          hoop:50,bear:60,fox:65,dragon:85,
          freckles:35,clown:40,piggy:45,witch:50,
          green:50,orange:50,cyan:60,silver:70,
        };
        const {id,item}=JSON.parse(body);
        const cost=COSMETIC_PRICES[item];
        if(!cost){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'Accesorio no válido'})); return; }
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        ensurePlayerExperience(player);
        const cosmetics=ensurePlayerCosmetics(player);
        if(cosmetics[item]){ res.writeHead(200); res.end(JSON.stringify({ok:false,error:'Ya desbloqueado'})); return; }
        if((player.aureos||0)<cost){ res.writeHead(200); res.end(JSON.stringify({ok:false,error:'Áureos insuficientes'})); return; }
        player.aureos-=cost;
        logAureosTx(player,-cost,'compra_cosmetico:'+item);
        unlockPlayerCosmetic(player,item);
        savePlayers(players);
        res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify({ok:true,aureos:player.aureos,item}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Registrar robo de monedas (coinrob) en ambos jugadores ──
  if(req.method==='POST'&&url==='/api/players/coinrob'){
    readBody(req,res,body=>{
      try{
        const {attackerId,attackerName,victimName,stolen}=JSON.parse(body);
        const amount=Math.max(0,Math.floor(stolen||0));
        if(!amount){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true})); return; }
        const players=loadPlayers();
        const attacker=resolveCanonicalPlayer(players,{id:attackerId,name:attackerName||''});
        const victim=findPlayerByName(players,victimName||'');
        if(attacker){ ensurePlayerExperience(attacker); attacker.aureos=(attacker.aureos||0)+amount; logAureosTx(attacker,amount,'robo_realizado'); }
        if(victim){ ensurePlayerExperience(victim); victim.aureos=Math.max(0,(victim.aureos||0)-amount); logAureosTx(victim,-amount,'robo_recibido'); }
        if(attacker||victim){ savePlayers(players); L.game(`Coinrob: ${attackerName||'?'} robó ${amount} 🪙 a ${victimName||'?'}`); }
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Guardar avatar personalizado del alumno ──
  if(req.method==='POST'&&url==='/api/players/set-avatar'){
    readBody(req, res, body=>{
      try{
        const {id,avatar}=JSON.parse(body);
        const players=loadPlayers();
        const player=findPlayerById(players,id);
        if(!player){ res.writeHead(404); res.end('{}'); return; }
        updatePlayerAvatar(player,avatar);
        savePlayers(players);
        res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify({ok:true}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Modo Examen: activar ──
  if(req.method==='POST'&&url==='/api/exam/start'){
    readBody(req, res, body=>{
      try{
        const d=JSON.parse(body);
        if(!requireAdmin(req,res,d)) return;
        const _now=Date.now();
        if(_now-_lastExamStartAt<2000){
          // Doble-submit accidental (doble click) — ignorar y devolver el estado ya vigente
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:true,examMode}));
          return;
        }
        _lastExamStartAt=_now;
        const {grade,tables,timeLimit}=d;
        const op=d.op||d.operation||'mult';
        const ops=Array.isArray(d.ops)&&d.ops.length?d.ops:[];
        // opsConfig: configuración independiente por operación, ej. {mult:{tables:[1,2],qty:4},add:{qty:10,digits:2}}
        // Es la fuente de verdad para generar preguntas cuando está presente; tables/total siguen
        // viajando por compatibilidad con UI/lógica que aún lee esos campos planos (banners, etc.)
        let opsConfig=null;
        if(d.opsConfig&&typeof d.opsConfig==='object'&&!Array.isArray(d.opsConfig)){
          opsConfig={};
          for(const [opKey,cfg] of Object.entries(d.opsConfig)){
            if(!cfg||typeof cfg!=='object') continue;
            const entry={qty:Math.max(1,Number(cfg.qty)||1)};
            if(Array.isArray(cfg.tables)) entry.tables=cfg.tables.map(Number).filter(n=>!isNaN(n));
            if(cfg.digits!=null) entry.digits=Math.max(1,Number(cfg.digits)||1);
            if(cfg.manner==='ordered'||cfg.manner==='random') entry.manner=cfg.manner;
            if(cfg.carryMode==='direct'||cfg.carryMode==='carry') entry.carryMode=cfg.carryMode;
            opsConfig[opKey]=entry;
          }
        }
        // total agregado: suma de qty*tables.length (mult/div) y qty (add/sub) por operación,
        // usado solo para mostrar en banners/UI existentes que leen config.total — si no hay
        // opsConfig (config simple antigua) se respeta el total enviado por el cliente.
        let total=Number(d.total)||20;
        if(opsConfig){
          total=Object.entries(opsConfig).reduce((sum,[opKey,cfg])=>{
            if(Array.isArray(cfg.tables)) return sum+cfg.qty*cfg.tables.length;
            return sum+cfg.qty;
          },0)||total;
        }
        examMode={grade:grade||'',tables:tables||[],op,ops,opsConfig,timeLimit:Number(timeLimit)||0,total,startedAt:Date.now()};
        examFinished.clear(); // Nueva sesión de examen — limpiar terminados anteriores
        const payload=JSON.stringify({type:'exam_start',config:examMode});
        gameSessions.forEach(s=>{
          if(!examMode.grade||s.grade===examMode.grade){
            if(s.ws?.readyState===WebSocket.OPEN){
              s.ws.send(payload);
              s.ws._examNotified=true; // Marcar como notificado para evitar reenvío en session_update
            }
          }
        });
        maestroClients.forEach(mc=>{ if(mc.readyState===WebSocket.OPEN) mc.send(JSON.stringify({type:'exam_state',examMode})); });
        L.panel(`Modo Examen activado${grade?' grado:'+grade:' todos'}`);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true,examMode}));
      }catch(e){ res.writeHead(400); res.end('{}'); }
    }); return;
  }

  // ── Modo Examen: desactivar ──
  if(req.method==='POST'&&url==='/api/exam/stop'){
    readBody(req, res, body=>{
      let parsed={}; try{ parsed=JSON.parse(body||'{}'); }catch(e){}
      if(!requireAdmin(req,res,parsed)) return;
      examMode=null;
      examFinished.clear(); // Limpiar registro de terminados al detener el examen
      const payload=JSON.stringify({type:'exam_stop'});
      // Broadcast a TODOS los clientes WS de juego (incl. los que ya terminaron y no tienen sesión activa)
      wss.clients.forEach(ws=>{
        if(!maestroClients.has(ws)&&ws.readyState===WebSocket.OPEN) ws.send(payload);
        if(!maestroClients.has(ws)) ws._examNotified=false; // Resetear para próximo examen
      });
      maestroClients.forEach(mc=>{ if(mc.readyState===WebSocket.OPEN) mc.send(JSON.stringify({type:'exam_state',examMode:null})); });
      L.panel('Modo Examen desactivado');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true}));
    });
    return;
  }

  // ── Modo Examen: estado ──
  if(req.method==='GET'&&url==='/api/exam/status'){
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify({examMode:examMode||null}));
    return;
  }

  // ── Definición de logros (para el cliente) ──
  if(req.method==='GET'&&url==='/api/achievements'){
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify(ACHIEVEMENTS_DEF));
    return;
  }

  // ── Ranking en vivo ──
  if(req.method==='GET'&&url==='/ranking-live'){
    htmlPages.sendRankingLive(req,res);
    return;
  }

  res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify({status:'ok'}));
});

const wss=new WebSocket.Server({server});
server.on('error',err=>{
  if(err?.code==='EADDRINUSE'){
    L.err(`Puerto ${PORT} ya está en uso. Cierra la otra instancia antes de volver a iniciar.`);
    process.exit(1);
    return;
  }
  L.err('Error del servidor HTTP:',err?.message||err);
});

// ── WebSocket connections ────────────────────────────────────
wss.on('connection',(ws,req)=>{
  _connCount++;
  const url=(req.url||'').split('?')[0];
  // Metadata para panel de Conexión
  ws._connId   = _connCount;
  ws._connTime = Date.now();
  ws._msgIn    = 0;
  ws._msgOut   = 0;
  ws._latency  = null;
  ws._pingTs   = null;
  ws._ip       = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || '?';
  L.conn(`Cliente #${_connCount} conectado - activos: ${wss.clients.size} url:${url}`);

  // ── Ranking en vivo WebSocket (solo {name, score, grade} — sin datos sensibles) ──
  if(url==='/ws-ranking-live'){
    ws._type='ranking-live';
    ws.isAlive=true;
    ws.on('pong',()=>{ ws.isAlive=true; });
    rankingLiveClients.add(ws);
    broadcastRankingLive();
    ws.on('close',()=>{ rankingLiveClients.delete(ws); });
    ws.on('error',()=>{ rankingLiveClients.delete(ws); try{ ws.terminate(); }catch(_){} });
    return;
  }

  // ── Maestro panel WebSocket ──
  if(url==='/ws-maestro'){
    ws._type='maestro';
    ws.isAlive=true;
    ws.on('pong',()=>{ ws.isAlive=true; });
    maestroClients.add(ws);
    L.panel(`Panel del maestro conectado`);
    pushConnLog('connect', `🖥 Panel Maestro desde ${ws._ip}`);
    broadcastPanelState();
    ws.on('message',raw=>{
      ws._msgIn++;
      try{
        const msg=JSON.parse(raw);
        if(msg.type==='maestro_announcement'&&msg.text&&msg.password===ADMIN_PASSWORD){
          const txt=String(msg.text).slice(0,300);
          const payload=JSON.stringify({type:'announcement',text:txt});
          gameSessions.forEach(s=>{ if(s.ws?.readyState===WebSocket.OPEN) s.ws.send(payload); });
          L.panel(`Anuncio maestro: "${txt}"`);
        }
        // Desconexión forzada de cliente desde el panel de Conexión
        if(msg.type==='kick_player'&&msg.playerId&&msg.password===ADMIN_PASSWORD){
          const sess=gameSessions.get(msg.playerId);
          if(sess?.ws?.readyState===WebSocket.OPEN){
            const kname=sess.name||msg.playerId;
            pushConnLog('kick',`⚡ Maestro desconectó a ${kname}`);
            L.disc(`Maestro desconectó forzosamente a ${kname}`);
            const kickedWs=sess.ws;
            kickedWs._kicked=true; // evita que onDisconnect reserve el slot para reconexión
            send(kickedWs,{type:'kicked',reason:'El maestro te desconectó del juego.'});
            setTimeout(()=>kickedWs.terminate(),150); // da tiempo a que el mensaje llegue antes de cerrar
          }
        }
      }catch(e){}
    });
    ws.on('close',()=>{ maestroClients.delete(ws); pushConnLog('disconnect','🖥 Panel Maestro desconectado'); L.panel('Panel del maestro desconectado'); });
    return;
  }

  ws._type='player';
  ws.isAlive=true;
  ws.on('pong',()=>{ ws.isAlive=true; if(ws._pingTs!=null){ ws._latency=Date.now()-ws._pingTs; ws._pingTs=null; } });
  ws.roomId=null; ws.playerId=null; ws.playerName=''; ws.role=null;
  ws._examNotified=false; // Evita enviar exam_start duplicado al mismo cliente
  send(ws,{type:'rooms_list',rooms:getRoomsList()});
  ws.on('message',raw=>{
    ws._msgIn++;
    let msg; try{msg=JSON.parse(raw);}catch(e){return;}
    // Registrar eventos clave en el log de conexión
    if(msg.type==='session_update'&&ws._msgIn===1) pushConnLog('msg',`🎮 ${msg.name||'?'} → sesión iniciada`);
    if(msg.type==='save_result')  pushConnLog('msg',`🎮 ${ws.playerName||msg.name||'?'} → partida guardada`);
    if(msg.type==='join_room')    pushConnLog('msg',`🎮 ${ws.playerName||'?'} → unirse a sala`);
    if(msg.type==='create_room')  pushConnLog('msg',`🎮 ${ws.playerName||'?'} → crear sala`);
    handle(ws,msg);
  });
  ws.on('close',()=>{ if(ws._closed) return; ws._closed=true; finalizePlayerDisconnect(ws); });
  ws.on('error',(e)=>{ if(ws._closed) return; ws._closed=true; L.err('WebSocket error:',e.message); finalizePlayerDisconnect(ws,{reason:'error'}); try{ ws.terminate(); }catch(_){} });
});

// ── Heartbeat — detect dead connections ─────────────────────
const HEARTBEAT_INTERVAL = 30000;
const heartbeatInterval = setInterval(()=>{
  wss.clients.forEach(ws=>{
    if(ws.isAlive===false){
      if(maestroClients.has(ws)){
        maestroClients.delete(ws);
        pushConnLog('disconnect','🖥 Panel Maestro desconectado (timeout)');
        L.panel('Panel del maestro perdi\u00F3 conexi\u00F3n (heartbeat timeout)');
      } else {
        L.disc('Conexion muerta detectada - terminando');
        finalizePlayerDisconnect(ws,{reason:'timeout'});
      }
      return ws.terminate();
    }
    ws.isAlive=false;
    ws._pingTs=Date.now();
    try{ ws.ping(); }catch(e){}
  });
}, HEARTBEAT_INTERVAL);
wss.on('close',()=>clearInterval(heartbeatInterval));

// ── Message handler ──────────────────────────────────────────
function handle(ws,msg){ // Procesa todos los mensajes entrantes de los clientes WebSocket
  switch(msg.type){

    case 'ping': break; // keepalive del cliente para mantener la conexión NAT activa

    // ── Checkpoint de partida en curso (guardado progresivo) ──
    case 'game_checkpoint': {
      if(!msg.id||!msg.name) break;
      // Mismo criterio que save_result: usar el nombre exacto de la cuenta si coincide
      // (sin distinguir mayúsculas), para no fragmentar el ranking por capitalización.
      const cpPlayers=loadPlayers();
      const cpPlayer=resolveCanonicalPlayer(cpPlayers,{id:msg.playerId,name:msg.name||''});
      persistCheckpoint(msg,cpPlayer?cpPlayer.name:(msg.name||'?'));
      break;
    }

    // ── Identificación del jugador fuera de partida (para recibir admin_update) ──
    case 'player_identify': {
      // Intentar revivir sesión desconectada del mismo jugador
      let s=_reviveSession(ws, msg.name);
      if(!s){
        const sid=ws.playerId||ws._uid||(ws._uid=genId());
        if(msg.name) ws.playerName=msg.name;
        if(!ws.playerId) ws.playerId=sid;
        s=gameSessions.get(sid);
        if(!s){ s={id:sid,startTime:Date.now()}; gameSessions.set(sid,s); }
      }
      s.ws=ws; s.id=ws.playerId;
      s.name=msg.name||s.name||'?';
      s.grade=msg.grade||s.grade||'';
      if(!s.gameMode) s.gameMode='idle';
      // Si hay examen activo, avisar aunque el alumno aún esté en la pantalla de inicio
      _checkExamNotify(ws, s.grade);
      _deliverPendingPotMsg(s);
      break;
    }

    // ── Game session state updates from client ──
    case 'session_update': {
      // Intentar revivir sesión desconectada del mismo jugador
      let s=_reviveSession(ws, msg.name);
      if(!s){
        const sid=ws.playerId||ws._uid||(ws._uid=genId());
        if(msg.name){ ws.playerName=msg.name; }
        if(!ws.playerId) ws.playerId=sid;
        s=gameSessions.get(sid);
        if(!s){ s={id:sid,startTime:Date.now()}; gameSessions.set(sid,s); }
      } else {
        if(msg.name) ws.playerName=msg.name;
      }
      // Si hay examen activo y el grado coincide y aún no fue notificado, enviar exam_start
      _checkExamNotify(ws, msg.grade);
      s.ws=ws; s.id=ws.playerId||ws._uid;
      s.name=msg.name||ws.playerName||'?';
      s.grade=msg.grade||'';
      s.gameMode=msg.gameMode||'solo';
      s.mpGameMode=msg.mpGameMode||'';
      s.gameType=msg.gameType||'timed';
      s.difficulty=msg.difficulty||'';
      s.isExam=!!msg.isExam;
      s.score=msg.score||0;
      s.qIndex=msg.qIndex||0;
      s.totalQ=msg.totalQ||0;
      s.currentTable=msg.currentTable||0;
      s.currentQuestion=msg.currentQuestion||'';
      s.correct=msg.correct||0;
      s.wrong=msg.wrong||0;
      s.tblSelMode=msg.tblSelMode||'all';
      s.tables=msg.tables||[];
      s.paused=msg.paused||false;
      s.status=msg.status||'playing';
      s.inventory=msg.inventory||{};
      s.lives=msg.lives||0; s.livesTotal=msg.livesTotal||0;
      s.streak=msg.streak||0;
      s.timeLeft=msg.timeLeft||0; s.timeLimit=msg.timeLimit||0;
      s.lastResult=msg.lastResult||null; s.lastResultTs=msg.lastResultTs||0;
      s.tblResults=msg.tblResults||{};
      schedulePanelBroadcast();
      _deliverPendingPotMsg(s);
      break;
    }

    // ── Save completed game to ranking ──
    case 'save_result': {
      const ranking=loadRanking();
      // Si el nombre coincide (sin distinguir mayúsculas) con una cuenta registrada, usar el
      // nombre EXACTO de esa cuenta en el ranking — si no, alumnos que escriben su nombre con
      // distinta capitalización cada vez (ej. "Fernanda"/"FERNANDA"/"fernanda") terminan
      // fragmentados en entradas separadas que se ven como personas distintas.
      const players=loadPlayers();
      const player=resolveCanonicalPlayer(players,{id:msg.playerId,name:msg.name||''});
      const resolvedGrade=msg.grade||player?.grade||ws.grade||'';
      const resolvedDurationMs=Number(msg.durationMs)||(
        msg.isExam&&msg.examStartedAt?Math.max(0,Date.now()-Number(msg.examStartedAt)):0
      );
      const finalRecord=buildCompletedResultRecord(msg,{
        canonicalName:player?player.name:(msg.name||'?'),
        grade:resolvedGrade,
      });
      // Actualizar checkpoint existente si hay (misma partida), o insertar nuevo
      saveRanking(upsertCompletedResult(ranking,finalRecord,msg.id));
      const gameRewards=calculateGameRewards(msg,{
        hasPlayer:!!player,
        tableHistory:player?.tableHistory,
      });
      const {earnedAureos,earnedExperience,varietyMult}=gameRewards;
      if(player&&gameRewards.tableHistoryChanged) player.tableHistory=gameRewards.tableHistory;
      if(player){
        // Áureos por partida
        const baseExperience=ensurePlayerExperience(player);
        player.aureos=(player.aureos||0)+earnedAureos;
        player.experiencia=baseExperience+earnedExperience;
        if(earnedAureos>0) logAureosTx(player,earnedAureos,'partida');
        // Multijugador online (no apuestas): se guarda lo ganado en ESTA partida para poder
        // duplicárselo después al ganador real, una vez que toda la sala haya terminado
        // (ver case 'mp_winner_bonus') — el cliente que detecta el cierre solo avisa quién ganó,
        // el monto exacto a acreditar lo decide el servidor con este registro.
        if(msg.gameMode==='online'&&msg.mpGameMode&&msg.mpGameMode!=='apuestas'&&msg.gameId){
          _mpEarnedByGame.set(`${ws.roomId||'?'}_${msg.gameId}_${player.name.toLowerCase()}`,earnedAureos);
        }
        // Partidas jugadas
        player.gamesPlayed=(player.gamesPlayed||0)+1;
        // Racha diaria
        const dailyStreak=calculateDailyStreak(player.dailyStreak);
        player.dailyStreak=dailyStreak.dailyStreak;
        const streakBonus=dailyStreak.bonus;
        if(streakBonus>0){ player.aureos+=streakBonus; player.experiencia+=streakBonus; logAureosTx(player,streakBonus,'racha_diaria'); }
        // Logros nuevos
        const newAchievements=checkNewAchievements(player,{...msg,tblResults:msg.tblResults||{}},loadRanking());
        let bonusTotal=earnedAureos+streakBonus;
        if(newAchievements.length){
          newAchievements.forEach(aid=>{
            const def=ACHIEVEMENTS_DEF.find(a=>a.id===aid);
            if(def){ player.aureos+=def.bonus; player.experiencia+=def.bonus; bonusTotal+=def.bonus; logAureosTx(player,def.bonus,'logro:'+aid); }
          });
        }
        savePlayers(players);
        if(earnedAureos>0||streakBonus>0||newAchievements.length){
          send(ws,{type:'aureos_earned',amount:earnedAureos,total:player.aureos,experiencia:player.experiencia,experience:player.experiencia,streakBonus,streak:player.dailyStreak.current,newAchievements,varietyMult,magnetBonus:!!msg.aureosBonus});
        }
        if(newAchievements.length){
          send(ws,{type:'achievements_unlocked',achievements:newAchievements,defs:newAchievements.map(id=>ACHIEVEMENTS_DEF.find(a=>a.id===id)).filter(Boolean)});
        }
        maestroClients.forEach(mc=>{ if(mc.readyState===WebSocket.OPEN) mc.send(JSON.stringify({type:'students_updated'})); });
      } else if(earnedAureos>0){
        // Jugador no registrado, solo notificar áureos
        send(ws,{type:'aureos_earned',amount:earnedAureos,total:earnedAureos,streakBonus:0,newAchievements:[],magnetBonus:!!msg.aureosBonus});
      }
      const modeLabel={
        solo:'\u{1F9D1} Individual',
        duel:'\u2694\uFE0F Duelo',
        online:'\u{1F310} LAN'
      }[msg.gameMode||'solo']||msg.gameMode;
      const typeLabel={timed:'cronometro',lives:'vidas',countdown:'contrarreloj',free:'libre'}[msg.gameType||'timed']||msg.gameType;
      const diffLabel=msg.difficulty?`[${msg.difficulty}]`:'';
      const tables=(msg.tables||[]).length?`tablas:${(msg.tables||[]).join(',')}`:'';
      const stats=`\u2705${msg.correct||0} \u274C${msg.wrong||0} \u23F1${msg.timeout||0}`;
      const gradeStr=resolvedGrade?` \u00B7 ${resolvedGrade}`:'';
      if((msg.gameMode||'solo')==='solo'){
        L.rank(`${msg.name}${gradeStr} - ${msg.score}pts (${msg.pct}%) | ${modeLabel} ${typeLabel} ${diffLabel} ${tables} | ${stats}`);
      } else {
        L.rank(`${msg.name}${gradeStr} - ${msg.score}pts (${msg.pct}%) | ${modeLabel}${msg.mpGameMode?` - ${msg.mpGameMode}`:``} | ${stats}`);
      }
      // Registrar al alumno como terminado para el panel si: hay examen activo (caso normal),
      // o no hay ninguno activo (el maestro detuvo la prueba mientras este alumno seguía
      // respondiendo, y se le dejó terminar a su ritmo — startPrueba/handleExamStop), siempre
      // que no se trate de una prueba NUEVA distinta ya en curso (entonces no corresponde).
      if(msg.isExam&&(!examMode||examMode.startedAt===msg.examStartedAt)){
        const eName=msg.name||ws.playerName||'?';
        examFinished.set(eName,{
          name:eName,
          grade:resolvedGrade,
          score:msg.score||0,
          pct:msg.pct||0,
          correct:msg.correct||0,
          total:msg.total||0,
          durationMs:resolvedDurationMs,
          finished:msg.finished!==false, // false = se le acabó la prueba sin terminar (alumno se salió)
          finishedAt:Date.now()
        });
      }
      gameSessions.delete(ws.playerId||ws._uid);
      break;
    }

    // ── Regular rooms ──
    case 'room_start': {
      const room=rooms.get(ws.roomId); if(!room||ws.role!=='host')return;
      if(room.status==='playing') return; // doble click — ya estaba iniciada, ignorar
      if(room.players.length<2){send(ws,{type:'error',message:'Necesitas al menos 2 jugadores'});return;}
      room.status='playing';
      const playerList=room.players.map(p=>({name:p.name,idx:p.idx}));
      room.players.forEach(p=>send(p.ws,{type:'room_start',playerList,playerCount:room.players.length}));
      L.room(`Sala [${ws.roomId}] iniciada con ${room.players.length} jugadores`);
      broadcastRoomsList(); break;
    }
    case 'list_rooms': send(ws,{type:'rooms_list',rooms:getRoomsList()}); break;
    case 'create_room': {
      if(ws.roomId && rooms.has(ws.roomId)){
        const _oldRoom=rooms.get(ws.roomId);
        _oldRoom.players=_oldRoom.players.filter(p=>p.ws!==ws);
        _oldRoom.players.forEach(p=>send(p.ws,{type:'player_left',name:ws.playerName,idx:ws.playerIdx,remaining:_oldRoom.players.length}));
        if(_oldRoom.players.length===0) rooms.delete(ws.roomId);
      }
      let rid;
      do { rid=String(Math.floor(1000+Math.random()*9000)); } while(rooms.has(rid));
      const maxP=Math.min(4,Math.max(2,msg.maxPlayers||2));
      ws.roomId=rid; ws.playerName=msg.playerName||'Jugador 1'; ws.role='host'; ws.playerIdx=0;
      const room={name:msg.roomName||`Sala de ${ws.playerName}`,hostName:ws.playerName,maxPlayers:maxP,
                  players:[{ws,name:ws.playerName,idx:0,role:'host'}],status:'lobby',gameStarted:false};
      rooms.set(rid,room);
      L.room(`Sala creada: [${rid}] ${maxP}P por ${ws.playerName}`);
      send(ws,{type:'room_created',roomId:rid,roomName:room.name,maxPlayers:maxP,playerIdx:0,playerList:[{name:ws.playerName,idx:0}]});
      broadcastRoomsList(); break;
    }
    case 'update_room_maxplayers': {
      // Cambiar el máximo de jugadores de la sala ya creada, sin recrearla
      // (recrearla dejaba huérfana la sala anterior con los invitados ya conectados)
      const room=rooms.get(ws.roomId);
      if(!room||ws.role!=='host'||room.status!=='lobby')return;
      const lo=Math.max(2,room.players.length);
      const maxP=Math.min(4,Math.max(lo,msg.maxPlayers||2));
      room.maxPlayers=maxP;
      L.room(`Sala [${ws.roomId}] cambio a ${maxP}P`);
      room.players.forEach(p=>send(p.ws,{type:'room_maxplayers_update',maxPlayers:maxP}));
      broadcastRoomsList(); break;
    }
    case 'join_room': {
      const room=rooms.get(msg.roomId);
      if(!room||room.status!=='lobby'||room.players.length>=room.maxPlayers){send(ws,{type:'error',message:'Sala no disponible'});return;}
      if(room.players.find(p=>p.ws===ws)) return; // doble click — ya es miembro de esta sala, ignorar
      if(ws.roomId && ws.roomId!==msg.roomId && rooms.has(ws.roomId)){
        // Estaba en otra sala sin salir — limpiarla para no dejar un jugador fantasma
        const _oldRoom=rooms.get(ws.roomId);
        _oldRoom.players=_oldRoom.players.filter(p=>p.ws!==ws);
        _oldRoom.players.forEach(p=>send(p.ws,{type:'player_left',name:ws.playerName,idx:ws.playerIdx,remaining:_oldRoom.players.length}));
        if(_oldRoom.players.length===0) rooms.delete(ws.roomId);
      }
      ws.roomId=msg.roomId; ws.playerName=msg.playerName||('Jugador '+(room.players.length+1));
      ws.role='guest'; ws.playerIdx=room.players.length;
      room.players.push({ws,name:ws.playerName,idx:ws.playerIdx,role:'guest'});
      L.room(`${ws.playerName} se unio [${msg.roomId}] (${room.players.length}/${room.maxPlayers})`);
      const playerList=room.players.map(p=>({name:p.name,idx:p.idx}));
      send(ws,{type:'joined',roomId:msg.roomId,hostName:room.hostName,playerIdx:ws.playerIdx,playerList,maxPlayers:room.maxPlayers});
      room.players.filter(p=>p.ws!==ws).forEach(p=>send(p.ws,{type:'player_joined',name:ws.playerName,idx:ws.playerIdx,playerList,maxPlayers:room.maxPlayers}));
      broadcastRoomsList(); break;
    }
    case 'rejoin_room': {
      const room=rooms.get(msg.roomId);
      if(!room||room.status!=='playing'){ send(ws,{type:'error',message:'Sala no disponible'}); return; }
      const slot=room.players.find(p=>p.name===msg.playerName);
      if(!slot){ send(ws,{type:'error',message:'No perteneces a esta sala'}); return; }
      if(slot._disconnectTimer){ clearTimeout(slot._disconnectTimer); slot._disconnectTimer=null; }
      if(room._emptyTimer){ clearTimeout(room._emptyTimer); room._emptyTimer=null; }
      slot.ws=ws; slot.disconnected=false; ws.roomId=msg.roomId; ws.playerName=msg.playerName; ws.playerIdx=slot.idx; ws.role=slot.role||ws.role;
      send(ws,{type:'rejoined',roomId:msg.roomId,idx:slot.idx});
      room.players.forEach(p=>{ if(p.ws&&p.ws!==ws) send(p.ws,{type:'player_rejoined',name:msg.playerName,idx:slot.idx}); });
      L.room(`${msg.playerName} se reconecto a sala ${msg.roomId}`);
      break;
    }
    case 'game_msg': {
      const room=rooms.get(ws.roomId); if(!room)return;
      const d=msg.data||{};
      if(d.type==='start'){
        room.gameStarted=true;
        const mpMode=d.cfg?.mpGameMode;
        L.game(`Partida [${ws.roomId}]: ${room.players.map(p=>p.name).join(' vs ')} modo:${mpMode||'?'}`);
        if(TWO_PLAYER_ONLY_MODES.has(mpMode)&&room.players.length!==2){
          // El selector del cliente ya evita esto, pero si llega igual (cliente
          // manipulado o desincronizado), bomba/supervivencia rompen su aritmética 1-idx
          // con 3-4 jugadores — se descarta en vez de iniciar una partida rota.
          L.game(`⚠️ Sala [${ws.roomId}] intentó iniciar "${mpMode}" con ${room.players.length} jugadores — bloqueado`);
          send(ws,{type:'error',message:'Este modo requiere exactamente 2 jugadores'});
          return;
        }
      }
      else if(d.type==='peer_finished') L.game(`${ws.playerName} termino`);
      if(d.type==='power_use'&&SINGLE_TARGET_POWERS.has(d.powerId)&&d.targetIdx==null&&!d.area){
        // Salvaguarda: este poder debe traer targetIdx sí o sí — sin él, reenviarlo
        // a todos reproduciría el bug original (afectar a todos los rivales a la vez).
        // Excepción: d.area=true es un contraataque de Espejo, intencionalmente de área.
        L.game(`⚠️ Poder "${d.powerId}" sin targetIdx en sala [${ws.roomId}] — descartado`);
        return;
      }
      if(d.targetIdx!=null){
        // Poder de objetivo único (robar/drenar/etc.) — solo el destinatario calculado lo recibe,
        // en vez de afectar a todos los rivales de la sala (importante en salas de 3-4 jugadores)
        const target=room.players.find(p=>p.idx===d.targetIdx&&p.ws!==ws);
        if(target) send(target.ws,{type:'game_msg',data:msg.data});
      } else {
        room.players.filter(p=>p.ws!==ws).forEach(p=>send(p.ws,{type:'game_msg',data:msg.data}));
      }
      break;
    }

    // ── Apuesta multijugador: descontar Áureos del jugador actual ──
    case 'pot_deduct': {
      const pname=ws.playerName||'';
      if(!pname||!msg.amount) break;
      const players=loadPlayers();
      const player=findPlayerByName(players,pname);
      if(!player){ send(ws,{type:'pot_deduct_result',ok:false,error:'Jugador no encontrado'}); break; }
      ensurePlayerExperience(player);
      const cost=Math.max(0,Math.floor(msg.amount));
      if((player.aureos||0)<cost){ send(ws,{type:'pot_deduct_result',ok:false,error:'Áureos insuficientes',aureos:player.aureos||0}); break; }
      player.aureos=(player.aureos||0)-cost;
      logAureosTx(player,-cost,'apuesta_jugada');
      savePlayers(players);
      L.game(`${pname} apostó ${cost} Áureos (pot_deduct) — quedan ${player.aureos}`);
      send(ws,{type:'pot_deduct_result',ok:true,aureos:player.aureos,amount:cost});
      break;
    }

    // ── Apuesta multijugador: única fuente de verdad — acredita al ganador y
    // notifica a todos los participantes (gane, pierda o se haya ido de la sala) ──
    case 'pot_award': {
      const winnerName=msg.winnerName||'';
      if(!winnerName||!msg.amount) break;
      // gameId (mpSeed del cliente) + sala identifican la partida concreta — si dos clientes
      // se creen "el último en terminar" por una condición de carrera, solo se paga una vez
      const gameKey=`${ws.roomId||'?'}_${msg.gameId||''}`;
      if(_awardedPotGames.has(gameKey)) break;
      _awardedPotGames.add(gameKey);
      const players=loadPlayers();
      const winner=findPlayerByName(players,winnerName);
      const prize=Math.max(0,Math.floor(msg.amount));
      if(winner){
        ensurePlayerExperience(winner);
        winner.aureos=(winner.aureos||0)+prize;
        logAureosTx(winner,prize,'apuesta_ganada');
        savePlayers(players);
      }
      L.game(`${winnerName} ganó ${prize} Áureos (pot_award) — total ${winner?winner.aureos:'?'}`);
      if(winner) _sendOrQueueMsg(winnerName,{type:'pot_result',result:'win',amount:prize,total:winner.aureos});
      // Perdedores: ya se les descontó la apuesta al inicio (pot_deduct) — aquí solo se les avisa
      const betAmount=Math.max(0,Math.floor(msg.betAmount||0));
      const losers=Array.isArray(msg.losers)?msg.losers:[];
      losers.forEach(name=>{
        if(!name||name.toLowerCase()===winnerName.toLowerCase()) return;
        _sendOrQueueMsg(name,{type:'pot_result',result:'lose',amount:betAmount});
      });
      send(ws,{type:'pot_award_result',ok:true,winnerName,amount:prize,total:winner?winner.aureos:null});
      break;
    }

    // ── Apuesta multijugador: empate — reembolsa la apuesta a cada participante ──
    case 'pot_draw': {
      const gameKey=`${ws.roomId||'?'}_${msg.gameId||''}`;
      if(_awardedPotGames.has(gameKey)) break;
      _awardedPotGames.add(gameKey);
      const betAmount=Math.max(0,Math.floor(msg.betAmount||0));
      const names=Array.isArray(msg.names)?msg.names:[];
      if(betAmount<=0||!names.length) break;
      const players=loadPlayers();
      names.forEach(name=>{
        const p=findPlayerByName(players,name);
        if(!p) return;
        ensurePlayerExperience(p);
        p.aureos=(p.aureos||0)+betAmount;
        logAureosTx(p,betAmount,'apuesta_empate');
        _sendOrQueueMsg(name,{type:'pot_result',result:'draw',amount:betAmount,total:p.aureos});
      });
      savePlayers(players);
      L.game(`Empate en pozo de apuestas — reembolsados ${betAmount} a [${names.join(', ')}]`);
      send(ws,{type:'pot_award_result',ok:true,draw:true});
      break;
    }

    // ── Multijugador (no apuestas): bono x2 al ganador, una vez que la sala completa terminó ──
    // El cliente que detecta que ya todos terminaron (incluidos los que ya se fueron) solo
    // manda quién ganó; el servidor busca cuánto le acreditó save_result a esa partida y le
    // suma esa misma cantidad otra vez (efecto: el ganador recibe el doble, el resto lo normal).
    case 'mp_winner_bonus': {
      const winners=Array.isArray(msg.winners)?msg.winners:[];
      if(!winners.length||!msg.gameId) break;
      const gameKey=`${ws.roomId||'?'}_${msg.gameId}_bonus`;
      if(_awardedBonusGames.has(gameKey)) break;
      _awardedBonusGames.add(gameKey);
      const players=loadPlayers();
      winners.forEach(name=>{
        const earnedKey=`${ws.roomId||'?'}_${msg.gameId}_${(name||'').toLowerCase()}`;
        const earned=_mpEarnedByGame.get(earnedKey);
        if(!earned) return; // no se registró esta partida para este jugador — nada que duplicar
        const p=findPlayerByName(players,name||'');
        if(!p) return;
        const baseExperience=ensurePlayerExperience(p);
        p.aureos=(p.aureos||0)+earned;
        p.experiencia=baseExperience+earned;
        logAureosTx(p,earned,'bono_ganador_mp');
        _mpEarnedByGame.delete(earnedKey);
        _sendOrQueueMsg(name,{type:'coin_bonus',amount:earned,total:p.aureos,experiencia:p.experiencia,experience:p.experiencia});
      });
      savePlayers(players);
      L.game(`Bono de ganador (x2) repartido a [${winners.join(', ')}] en sala [${ws.roomId||'?'}]`);
      break;
    }

  }
}

// Avisa al cliente que hay un examen activo (se llama tanto al identificarse como al jugar,
// para que alumnos que aún están en la pantalla de inicio también reciban el aviso)
function _checkExamNotify(ws, grade){
  if(examMode&&(!examMode.grade||examMode.grade===(grade||''))&&!ws._examNotified){
    if(ws.readyState===WebSocket.OPEN){
      ws.send(JSON.stringify({type:'exam_start',config:examMode}));
      ws._examNotified=true;
    }
  }
}

// ── Notificación de resultado de pozo/bono pendiente ──────────
// Si el jugador tiene una sesión abierta lo notifica ya; si no, la deja en cola (puede
// acumular más de un mensaje — p.ej. pozo de apuestas y bono de ganador casi a la vez) para
// entregarla en cuanto vuelva a identificarse (p.ej. ya está jugando otra partida)
function _sendOrQueueMsg(name, payload){
  const key=(name||'').toLowerCase();
  if(!key) return;
  const session=[...gameSessions.values()].find(s=>s.name&&s.name.toLowerCase()===key);
  if(session?.ws?.readyState===WebSocket.OPEN){ send(session.ws,payload); }
  else { const q=pendingPotMsgs.get(key)||[]; q.push(payload); pendingPotMsgs.set(key,q); }
}
function _deliverPendingPotMsg(s){
  if(!s||!s.name) return;
  const key=s.name.toLowerCase();
  const q=pendingPotMsgs.get(key);
  if(q&&q.length&&s.ws?.readyState===WebSocket.OPEN){
    q.forEach(payload=>send(s.ws,payload));
    pendingPotMsgs.delete(key);
  }
}

// ── Reconexión tolerante ─────────────────────────────────────
// Busca sesión desconectada por nombre y la revive en el nuevo WS
function _reviveSession(ws, name){
  if(!name) return null;
  const low=name.toLowerCase();
  for(const [sid,s] of gameSessions){
    if(s.disconnected&&s.name&&s.name.toLowerCase()===low){
      if(s._disconnectTimer){ clearTimeout(s._disconnectTimer); s._disconnectTimer=null; }
      s.disconnected=false; s.disconnectedAt=null; s.ws=ws;
      ws.playerId=sid; ws._uid=sid; ws.playerName=name;
      return s;
    }
  }
  return null;
}

// ── Disconnect ───────────────────────────────────────────────
function onDisconnect(ws){ // Marca la sesión como desconectada; la borra en 15 s si no reconecta
  const sid=ws.playerId||ws._uid;
  if(sid){
    const s=gameSessions.get(sid);
    if(s&&s.name&&s.name!=='?'&&!ws._kicked){
      s.disconnected=true; s.disconnectedAt=Date.now(); s.ws=null;
      if(s._disconnectTimer) clearTimeout(s._disconnectTimer);
      s._disconnectTimer=setTimeout(()=>{
        if(gameSessions.get(sid)===s){ gameSessions.delete(sid); schedulePanelBroadcast(); }
      },15000);
      schedulePanelBroadcast();
    } else {
      gameSessions.delete(sid);
    }
  }
  if(ws.roomId){
    const room=rooms.get(ws.roomId);
    if(room){
      if(ws._kicked){
        // Expulsado por el maestro → remoción permanente, sin reservar slot de reconexión
        room.players=room.players.filter(p=>p.ws!==ws);
        const remaining=room.players.filter(p=>p.ws?.readyState===WebSocket.OPEN);
        remaining.forEach(p=>send(p.ws,{type:'player_left',name:ws.playerName,idx:ws.playerIdx,remaining:remaining.length}));
        if(remaining.length===0) rooms.delete(ws.roomId);
      } else if(ws.role==='host'&&room.status!=='playing'){
        // Anfitrión salió del lobby → eliminar sala y avisar a los guests
        room.players.forEach(p=>{ if(p.ws!==ws) send(p.ws,{type:'host_left',name:ws.playerName}); });
        rooms.delete(ws.roomId);
      } else if(ws.role==='host'&&room.status==='playing'&&!room.gameStarted){
        // El host ya habia abierto la configuracion multijugador, pero la partida real
        // aun no iniciaba. En este punto los invitados deben salir de inmediato y no
        // quedarse viendo una configuracion "fantasma" de una sala que ya no existe.
        room.players.forEach(p=>{ if(p.ws!==ws) send(p.ws,{type:'host_left',name:ws.playerName}); });
        rooms.delete(ws.roomId);
      } else if(room.status==='playing'){
        // Partida en curso → conservar el slot para permitir reconexión, con expiración
        // (antes el slot quedaba ocupado para siempre si el alumno nunca volvía a conectar)
        const slot=room.players.find(p=>p.ws===ws);
        if(slot){
          slot.ws=null; slot.disconnected=true;
          if(slot._disconnectTimer) clearTimeout(slot._disconnectTimer);
          slot._disconnectTimer=setTimeout(()=>{
            const r=rooms.get(ws.roomId); if(!r) return;
            r.players=r.players.filter(p=>p!==slot);
            const remaining=r.players.filter(p=>p.ws?.readyState===WebSocket.OPEN);
            remaining.forEach(p=>send(p.ws,{type:'player_left',name:slot.name,idx:slot.idx,remaining:remaining.length}));
            if(r.players.length===0) rooms.delete(ws.roomId);
            broadcastRoomsList();
          },60000);
        }
        const active=room.players.filter(p=>p.ws?.readyState===WebSocket.OPEN);
        active.forEach(p=>send(p.ws,{type:'player_left',name:ws.playerName,idx:ws.playerIdx,remaining:active.length}));
        if(active.length===0&&!room._emptyTimer){
          // Nadie activo: dar margen de 60s para que alguien reconecte antes de borrar la sala
          // (antes se borraba de inmediato y el último jugador perdía la partida sin poder volver)
          room._emptyTimer=setTimeout(()=>{
            const r=rooms.get(ws.roomId);
            if(r&&r.players.every(p=>p.ws?.readyState!==WebSocket.OPEN)) rooms.delete(ws.roomId);
          },60000);
        }
      } else {
        // Lobby: eliminar jugador normalmente
        room.players=room.players.filter(p=>p.ws!==ws);
        const remaining=room.players.length;
        room.players.forEach(p=>send(p.ws,{type:'player_left',name:ws.playerName,idx:ws.playerIdx,remaining}));
        if(remaining===0) rooms.delete(ws.roomId);
      }
      broadcastRoomsList();
    }
  }
}

function getRoomsList(){ return [...rooms.entries()].filter(([,r])=>r.status==='lobby'&&r.players.length<r.maxPlayers).map(([id,r])=>({id,name:r.name,host:r.hostName,playerCount:r.players.length,maxPlayers:r.maxPlayers})); } // Retorna la lista de salas disponibles en lobby con espacio libre
function broadcastRoomsList(){ const msg={type:'rooms_list',rooms:getRoomsList()}; wss.clients.forEach(ws=>{ if(!ws.roomId) send(ws,msg); }); }

// ── IP helper ────────────────────────────────────────────────
function getLocalIP(){
  for(const ifaces of Object.values(os.networkInterfaces()))
    for(const i of ifaces)
      if(i.family==='IPv4'&&!i.internal) return i.address;
  return 'localhost';
}

// ── Start ────────────────────────────────────────────────────
server.listen(PORT,'0.0.0.0',()=>{
  const ip=getLocalIP();
  console.log('------------------------------------------------------');
  console.log('  Math Attack - Servidor Multijugador');
  console.log('------------------------------------------------------');
  console.log('  Puerto: '+PORT);
  console.log('  IP: '+ip);
  console.log('');
  console.log('  Juego:    http://'+ip+':'+PORT);
  console.log('  Maestro:  http://'+ip+':'+PORT+'/maestro');
  console.log('  Ranking:  http://'+ip+':'+PORT+'/ranking');
  console.log('');
  console.log('  Celulares: abrir Chrome -> http://'+ip+':'+PORT);
  console.log('------------------------------------------------------');
});
function shutdown(){
  console.log('\n  Deteniendo servidor...');
  if(_panelHeartbeatTimer) clearTimeout(_panelHeartbeatTimer);
  if(_panelThrottleTimer)  clearTimeout(_panelThrottleTimer);
  clearInterval(heartbeatInterval);
  // Por si quedó algo en cola sin escribir todavía (las escrituras son asíncronas)
  dataStore.flushSync();
  wss.clients.forEach(ws=>{ try{ ws.close(); }catch(e){} });
  server.close(()=>{ console.log('  Servidor detenido. Hasta luego.\\n'); process.exit(0); });
  setTimeout(()=>process.exit(0), 2000);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP',  shutdown);
process.on('uncaughtException',  (err)=>{
  if(isBrokenPipeError(err)) return;
  if(err?.code==='EADDRINUSE'){
    L.err(`Puerto ${PORT} ya está en uso. Cierra la otra instancia antes de volver a iniciar.`);
    process.exit(1);
    return;
  }
  L.err('Excepción no capturada:',  err.message);
});
process.on('unhandledRejection', (r)  =>{ L.err('Promesa rechazada:',       r?.message||r); });
