'use strict';

function createHttpAdminRoutes(context) {
  const { readBody, sendJson, requireAdmin, send, WebSocket, wss, maestroClients, connLog, getSessionId, getExternalPlayerId, getConnectionId, findActiveSession, gameSessions, loadRanking, saveRanking, buildRankingCsv, importRankingRows, removePlayerResults, removeRankingResult, persistCheckpoint, L, loadPlayers, savePlayers, calculatePlayerAverages, buildPlayerProfile, findPlayerById, findPlayerIndexById, findPlayerByName, preparePlayerRegistration, authenticatePlayer, REGISTRATION_REQUIRED_ERROR, getPlayerExperience, getPlayerLevel, ensurePlayerExperience, addPlayerInventoryItem, setPlayerInventoryQuantity, consumePlayerInventoryItem, normalizeAdminPin, updatePlayerPin, updatePlayerGrade, updatePlayerThemeColor, updatePlayerAvatar, ensurePlayerCosmetics, unlockPlayerCosmetic, calculateDirectGameReward, logAureosTx, resolveAccountPlayer, loadAureosLog, saveAureosLog, buildStudentHistory } = context;
  const adminState = context.adminState;
  const saveAdminConfig = context.saveAdminConfig;

  function matches(req) {
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && (url === '/api/ranking' || url === '/api/ranking/export' ||
      url === '/api/maestro/config' || url === '/api/players' ||
      url.startsWith('/api/players/get-pin') || url === '/api/players/export' ||
      url.startsWith('/api/students/history') || url.startsWith('/api/players/aureos-log'))) return true;
    if (req.method === 'POST' && (url === '/api/connections' || url === '/api/maestro/auth' ||
      url === '/api/maestro/config' || url === '/api/ranking/clear' ||
      url === '/api/ranking/clear-student' || url === '/api/ranking/delete-game' ||
      url === '/api/ranking/import' || url === '/api/ranking/checkpoint' ||
      url === '/api/cmd/all' || url.startsWith('/api/cmd/') ||
      url === '/api/players/register' || url === '/api/players/login' ||
      url === '/api/players/sync' || url === '/api/players/buy' ||
      url === '/api/players/add-aureos' || url === '/api/players/use-power' ||
      url === '/api/players/admin-aureos' || url === '/api/players/admin-power' ||
      url === '/api/players/admin-pin' || url === '/api/players/admin-grade' ||
      url === '/api/players/aureos-log/clear' || url === '/api/players/bulk-aureos' ||
      url === '/api/players/set-color' || url === '/api/players/buy-cosmetic' ||
      url === '/api/players/coinrob' || url === '/api/players/set-avatar')) return true;
    return req.method === 'DELETE' && /^\/api\/players\/[^/]+$/.test(url);
  }

  function handle(req, res) {
    const url = req.url.split('?')[0];
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
        const sessionId=getSessionId(c);
        const session=!isMaestro?findActiveSession(gameSessions,sessionId):null;
        conns.push({
          id:       getConnectionId(c)||0,
          type:     isMaestro?'maestro':'player',
          name:     isMaestro?'Panel Maestro':(c.playerName||'Anónimo'),
          grade:    session?.grade||'',
          ip:       c._ip||'?',
          connectedMs: now-(c._connTime||now),
          msgIn:    c._msgIn||0,
          msgOut:   c._msgOut||0,
          latency:  c._latency,
          playerId: getExternalPlayerId(c), // Alias externo: aqui significa sessionId.
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
        if(username!==adminState.username||password!==adminState.password){ sendJson(res,401,{ok:false}); return; }
      }catch(e){ sendJson(res,401,{ok:false}); return; }
      sendJson(res,200,{ok:true});
    });
    return;
  }

  // ── Obtener configuración del maestro (sin contraseña) ──
  if(req.method==='GET'&&url==='/api/maestro/config'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({username:adminState.username}));
    return;
  }

  // ── Actualizar credenciales del maestro ──
  if(req.method==='POST'&&url==='/api/maestro/config'){
    readBody(req, res, body=>{
      try{
        const {currentPassword,newUsername,newPassword}=JSON.parse(body);
        if(!requireAdmin(req,res,{currentPassword})){ return; }
        if(newUsername) adminState.username=newUsername.trim();
        if(newPassword) adminState.password=newPassword;
        saveAdminConfig();
        L.panel(`Credenciales del maestro actualizadas — usuario: ${adminState.username}`);
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
        const session=findActiveSession(gameSessions,playerId);
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
        gameSessions.listSessions().forEach(s=>{
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
        const _as=gameSessions.listSessions().find(s=>s.name.toLowerCase()===player.name.toLowerCase());
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
        const _ps=gameSessions.listSessions().find(s=>s.name.toLowerCase()===player.name.toLowerCase());
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
          const s=gameSessions.listSessions().find(s=>s.name.toLowerCase()===p.name.toLowerCase());
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
        const attacker=resolveAccountPlayer(players,{accountPlayerId:attackerId,name:attackerName||''});
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


    return false;
  }

  return { handle, matches };
}

module.exports = { createHttpAdminRoutes };
