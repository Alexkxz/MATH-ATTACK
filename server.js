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
const { createHttpAdminRoutes } = require('./src/server/http/adminRoutes');
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
  getAccountPlayerId,
  resolveAccountPlayer,
  getSessionId,
  getExternalPlayerId,
  findActiveSession,
  getConnectionId,
} = require('./src/identity');
const { createSessionStore } = require('./src/server/sessionStore');
const { buildPanelState, createPanelBroadcaster } = require('./src/server/panelState');
const { createWsContext } = require('./src/server/ws/wsContext');
const { createConnectionLifecycle } = require('./src/server/ws/connectionLifecycle');
const { createPlayerIdentityMessages } = require('./src/server/ws/playerIdentityMessages');
const { handleGameCheckpoint } = require('./src/server/ws/gameCheckpointMessages');
const { createSaveResultMessages } = require('./src/server/ws/saveResultMessages');
const { createResultIdempotency } = require('./src/server/ws/resultIdempotency');
const { createEconomyContext } = require('./src/server/ws/economyContext');
const { createPotDeductMessages } = require('./src/server/ws/potDeductMessages');
const { createPotAwardMessages } = require('./src/server/ws/potAwardMessages');
const { createPotDrawMessages } = require('./src/server/ws/potDrawMessages');
const { createMpWinnerBonusMessages } = require('./src/server/ws/mpWinnerBonusMessages');
const { createEconomicIdempotency } = require('./src/server/ws/economicIdempotency');
const { createStealPower } = require('./src/server/ws/stealPower');
const { createMaestroAnnouncementMessages } = require('./src/server/ws/maestroAnnouncementMessages');
const { createKickPlayerMessages } = require('./src/server/ws/kickPlayerMessages');
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
// gameSessions usa una identidad efimera: sessionId/connection player ID.
// El playerId externo se conserva por compatibilidad y no es el ID persistente
// de la cuenta en players.json (accountPlayerId).
const rooms       = new Map();
const gameSessions = createSessionStore({ onExpire: () => schedulePanelBroadcast() });
const pendingPotMsgs = new Map(); // nombre (lowercase) → mensaje pot_result pendiente de entregar
const _awardedPotGames = new Set(); // roomId_gameId ya liquidados — evita doble crédito por condición de carrera
const _mpEarnedByGame = new Map(); // roomId_gameId_nombre → Áureos ganados en esa partida (para duplicar al ganador)
const _awardedBonusGames = new Set(); // roomId_gameId ya con bono de ganador repartido
const economicIdempotency = createEconomicIdempotency();
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
const panelBroadcaster=createPanelBroadcaster({
  getClients:()=>maestroClients,
  getState:()=>buildPanelState({
    sessions:gameSessions.listSessions(),
    players:loadPlayers(),
    findRoom:roomId=>rooms.get(roomId),
    isOpen:ws=>ws?.readyState===WebSocket.OPEN,
    examMode,
    opStats:operationStatsCache.get(),
    examFinished:[...examFinished.values()],
  }),
  isOpen:ws=>ws.readyState===WebSocket.OPEN,
  send:(ws,state)=>ws.send(JSON.stringify({type:'panel_state',...state})),
  onBroadcast:()=>broadcastRankingLive(),
  hasSessions:()=>gameSessions.listSessions().length>0,
});
function broadcastPanelState(){ return panelBroadcaster.broadcast(); }
// Emite solo {name, score, grade} a los clientes de /ranking-live (sin datos sensibles)
function broadcastRankingLive(){
  if(rankingLiveClients.size===0) return;
  const live=gameSessions.listSessions()
    .filter(s=>s.status!=='finished'&&s.ws?.readyState===WebSocket.OPEN)
    .map(s=>({name:s.name, score:s.score||0, grade:s.grade||''}));
  const msg=JSON.stringify({type:'live_scores', sessions:live});
  rankingLiveClients.forEach(ws=>{
    if(ws.readyState!==WebSocket.OPEN) rankingLiveClients.delete(ws);
    else try{ ws.send(msg); }catch(e){}
  });
}
// El broadcaster conserva el throttle de 100 ms y el heartbeat dinámico.
function schedulePanelHeartbeat(){ panelBroadcaster.scheduleHeartbeat(); }
function schedulePanelBroadcast(){ return panelBroadcaster.scheduleBroadcast(); }
schedulePanelHeartbeat();

const MAESTRO_FRONTEND_JS_ROUTE = '/src/client/maestro/';
const MAESTRO_FRONTEND_JS_DIR = path.resolve(__dirname, 'src', 'client', 'maestro');

function sendMaestroFrontendJavaScript(res, requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch (e) {
    res.writeHead(403);
    res.end('');
    return;
  }

  if (!decodedPath.startsWith(MAESTRO_FRONTEND_JS_ROUTE)) {
    res.writeHead(403);
    res.end('');
    return;
  }

  const relativePath = decodedPath.slice(MAESTRO_FRONTEND_JS_ROUTE.length);
  const filePath = path.resolve(MAESTRO_FRONTEND_JS_DIR, relativePath);
  const allowedPrefix = MAESTRO_FRONTEND_JS_DIR + path.sep;
  if (
    !relativePath ||
    relativePath.includes('\0') ||
    path.isAbsolute(relativePath) ||
    !filePath.startsWith(allowedPrefix) ||
    path.extname(filePath) !== '.js'
  ) {
    res.writeHead(403);
    res.end('');
    return;
  }

  try {
    const realBaseDir = fs.realpathSync(MAESTRO_FRONTEND_JS_DIR);
    const realFilePath = fs.realpathSync(filePath);
    if (!realFilePath.startsWith(realBaseDir + path.sep)) {
      res.writeHead(403);
      res.end('');
      return;
    }
    const js = fs.readFileSync(realFilePath);
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(js);
  } catch (e) {
    res.writeHead(404);
    res.end('');
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

  // ── JavaScript frontend del maestro (directorio restringido) ──
  if(req.method==='GET'&&url.startsWith(MAESTRO_FRONTEND_JS_ROUTE)){
    sendMaestroFrontendJavaScript(res,url);
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

  if(adminRoutes.matches(req)){
    adminRoutes.handle(req,res);
    return;
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
        gameSessions.listSessions().forEach(s=>{
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
const adminRoutes = createHttpAdminRoutes({
  readBody, sendJson, requireAdmin, send, WebSocket, wss, maestroClients, connLog,
  getSessionId, getExternalPlayerId, getConnectionId, findActiveSession, gameSessions,
  loadRanking, saveRanking, buildRankingCsv, importRankingRows, removePlayerResults,
  removeRankingResult, persistCheckpoint, L, loadPlayers, savePlayers,
  calculatePlayerAverages, buildPlayerProfile, findPlayerById, findPlayerIndexById,
  findPlayerByName, preparePlayerRegistration, authenticatePlayer, REGISTRATION_REQUIRED_ERROR,
  getPlayerExperience, getPlayerLevel, ensurePlayerExperience, addPlayerInventoryItem,
  setPlayerInventoryQuantity, consumePlayerInventoryItem, normalizeAdminPin,
  updatePlayerPin, updatePlayerGrade, updatePlayerThemeColor, updatePlayerAvatar,
  ensurePlayerCosmetics, unlockPlayerCosmetic, calculateDirectGameReward, logAureosTx,
  resolveAccountPlayer, loadAureosLog, saveAureosLog, buildStudentHistory,
  adminState: { get username(){ return ADMIN_USERNAME; }, set username(value){ ADMIN_USERNAME=value; },
    get password(){ return ADMIN_PASSWORD; }, set password(value){ ADMIN_PASSWORD=value; } },
  saveAdminConfig: saveConfig,
});
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
  const url=connectionLifecycle.initialize(ws,req);

  // ── Ranking en vivo WebSocket (solo {name, score, grade} — sin datos sensibles) ──
  if(url==='/ws-ranking-live'){
    ws._type='ranking-live';
    connectionLifecycle.registerClient(rankingLiveClients,ws);
    broadcastRankingLive();
    connectionLifecycle.attachCloseAndError(ws,{
      onClose:()=>connectionLifecycle.unregisterClient(rankingLiveClients,ws),
      onError:()=>{ connectionLifecycle.unregisterClient(rankingLiveClients,ws); try{ ws.terminate(); }catch(_){} },
    });
    return;
  }

  // ── Maestro panel WebSocket ──
  if(url==='/ws-maestro'){
    ws._type='maestro';
    connectionLifecycle.registerClient(maestroClients,ws);
    L.panel(`Panel del maestro conectado`);
    pushConnLog('connect', `🖥 Panel Maestro desde ${ws._ip}`);
    broadcastPanelState();
    ws.on('message',raw=>{
      ws._msgIn++;
      try{
        const msg=JSON.parse(raw);
        maestroAnnouncementMessages.handleMaestroAnnouncement(ws,msg);
        kickPlayerMessages.handleKickPlayer(ws,msg);
      }catch(e){}
    });
    connectionLifecycle.attachCloseAndError(ws,{
      onClose:()=>{ connectionLifecycle.unregisterClient(maestroClients,ws); pushConnLog('disconnect','🖥 Panel Maestro desconectado'); L.panel('Panel del maestro desconectado'); },
      onError:()=>connectionLifecycle.unregisterClient(maestroClients,ws),
    });
    return;
  }

  ws._type='player';
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
  connectionLifecycle.attachCloseAndError(ws,{
    onClose:()=>{ if(ws._closed) return; ws._closed=true; finalizePlayerDisconnect(ws); },
    onError:e=>{ if(ws._closed) return; ws._closed=true; L.err('WebSocket error:',e.message); finalizePlayerDisconnect(ws,{reason:'error'}); try{ ws.terminate(); }catch(_){} },
  });
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

const economyContext = createEconomyContext({
  rooms,
  gameSessions,
  _awardedPotGames,
  _awardedBonusGames,
  _mpEarnedByGame,
  pendingPotMsgs,
  sendOrQueueMsg: _sendOrQueueMsg,
  persistence: { loadPlayers, savePlayers, loadAureosLog, saveAureosLog, logAureosTx },
  identity: { getAccountPlayerId, getSessionId, getExternalPlayerId, getConnectionId, findActiveSession, resolveAccountPlayer },
  send,
  broadcasts: { panel: broadcastPanelState, rankingLive: broadcastRankingLive, rooms: broadcastRoomsList, connectionLog: pushConnLog },
  idempotency: economicIdempotency,
});

const wsContext = createWsContext({
  gameSessions,
  rooms,
  maestroClients,
  rankingLiveClients,
  examFinished,
  getExamMode: () => examMode,
  setExamMode: value => { examMode = value; },
  timers: {
    heartbeatInterval,
    reconnectWindowMs: 15_000,
    getSessionTimer: session => session?._disconnectTimer,
    getRoomDisconnectTimer: slot => slot?._disconnectTimer,
    getRoomEmptyTimer: room => room?._emptyTimer,
  },
  persistence: {
    loadRanking,
    saveRanking,
    loadPlayers,
    savePlayers,
    persistCheckpoint,
  },
  broadcasts: {
    panel: broadcastPanelState,
    rankingLive: broadcastRankingLive,
    rooms: broadcastRoomsList,
    connectionLog: pushConnLog,
  },
  identity: {
    getAccountPlayerId,
    getSessionId,
    getExternalPlayerId,
    getConnectionId,
    findActiveSession,
    resolveAccountPlayer,
  },
  panelState: {
    build: buildPanelState,
    broadcaster: panelBroadcaster,
  },
  economy: economyContext,
});
const resultIdempotency = createResultIdempotency();

const connectionLifecycle = createConnectionLifecycle({
  wsContext,
  WebSocket,
  nextConnectionId: () => ++_connCount,
  getClientCount: () => wss.clients.size,
  logConnection: message => L.conn(message),
});

const playerIdentityMessages = createPlayerIdentityMessages({
  wsContext,
  genId,
  checkExamNotify: _checkExamNotify,
  deliverPendingPotMsg: _deliverPendingPotMsg,
  schedulePanelBroadcast,
});

const saveResultMessages = createSaveResultMessages({
  wsContext,
  WebSocket,
  multiplayerRewards: { _mpEarnedByGame },
  buildCompletedResultRecord,
  upsertCompletedResult,
  calculateGameRewards,
  ensurePlayerExperience,
  logAureosTx,
  calculateDailyStreak,
  checkNewAchievements,
  ACHIEVEMENTS_DEF,
  send,
  L,
  resultIdempotency,
});

const potDeductMessages = createPotDeductMessages({
  wsContext,
  findPlayerByName,
  ensurePlayerExperience,
  logAureosTx,
  L,
});

const potAwardMessages = createPotAwardMessages({
  wsContext,
  findPlayerByName,
  ensurePlayerExperience,
  logAureosTx,
  L,
});
const potDrawMessages = createPotDrawMessages({
  wsContext,
  findPlayerByName,
  ensurePlayerExperience,
  logAureosTx,
  L,
});
const mpWinnerBonusMessages = createMpWinnerBonusMessages({
  wsContext,
  findPlayerByName,
  ensurePlayerExperience,
  logAureosTx,
  L,
});
const stealPower = createStealPower({ send, L });
const maestroAnnouncementMessages = createMaestroAnnouncementMessages({
  ADMIN_PASSWORD,
  gameSessions,
  send,
  L,
  WebSocket,
});
const kickPlayerMessages = createKickPlayerMessages({
  ADMIN_PASSWORD,
  gameSessions,
  findActiveSession,
  send,
  pushConnLog,
  L,
  WebSocket,
});

// ── Message handler ──────────────────────────────────────────
function handle(ws,msg){ // Procesa todos los mensajes entrantes de los clientes WebSocket
  switch(msg.type){

    case 'ping': break; // keepalive del cliente para mantener la conexión NAT activa

    case 'game_checkpoint': {
      handleGameCheckpoint({
        ws,
        message:msg,
        wsContext,
        sessionStore:wsContext.gameSessions,
        identity:{getAccountPlayerId,resolveAccountPlayer},
        persistence:{loadPlayers},
        ranking:{persistCheckpoint},
        broadcasts:{panel:broadcastPanelState,rankingLive:broadcastRankingLive},
      });
      break;
    }

    case 'player_identify':
      playerIdentityMessages.handlePlayerIdentify(ws,msg);
      break;

    case 'session_update':
      playerIdentityMessages.handleSessionUpdate(ws,msg);
      break;

    case 'save_result': {
      saveResultMessages.handleSaveResult(ws,msg);
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
      if(stealPower.handleStealPower(ws, room, msg)) break;
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

    case 'pot_deduct': {
      potDeductMessages.handlePotDeduct(ws,msg);
      break;
    }

    case 'pot_award': {
      potAwardMessages.handlePotAward(ws,msg);
      break;
    }

    // ── Apuesta multijugador: empate — reembolsa la apuesta a cada participante ──
    case 'pot_draw': {
      potDrawMessages.handlePotDraw(ws,msg);
      break;
    }

    // ── Multijugador (no apuestas): bono x2 al ganador, una vez que la sala completa terminó ──
    // El cliente que detecta que ya todos terminaron (incluidos los que ya se fueron) solo
    // manda quién ganó; el servidor busca cuánto le acreditó save_result a esa partida y le
    // suma esa misma cantidad otra vez (efecto: el ganador recibe el doble, el resto lo normal).
    case 'mp_winner_bonus': {
      mpWinnerBonusMessages.handleMpWinnerBonus(ws,msg);
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
  const session=gameSessions.listSessions().find(s=>s.name&&s.name.toLowerCase()===key);
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

// ── Disconnect ───────────────────────────────────────────────
function onDisconnect(ws){ // Marca la sesión como desconectada; la borra en 15 s si no reconecta
  const sessionId=getSessionId(ws);
  if(sessionId){
    const s=findActiveSession(gameSessions,sessionId);
    if(s&&s.name&&s.name!=='?'&&!ws._kicked){
      gameSessions.markDisconnected(sessionId);
      schedulePanelBroadcast();
    } else {
      gameSessions.removeSession(sessionId);
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
  panelBroadcaster.stop();
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
