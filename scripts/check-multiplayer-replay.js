'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const { spawn } = require('node:child_process');
const { startTestServer } = require('./server-test-utils');

const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function copyRuntime(dir){
  fs.cpSync(path.join(root,'src'),path.join(dir,'src'),{recursive:true});
  for(const file of ['server.js','maestro.html','math-attack.html','ranking.html']) fs.copyFileSync(path.join(root,file),path.join(dir,file));
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({adminUsername:'admin',adminPassword:'replay-test'}));
  fs.writeFileSync(path.join(dir,'players.json'),'[]');
  fs.writeFileSync(path.join(dir,'ranking.json'),'[]');
  fs.writeFileSync(path.join(dir,'aureosLog.json'),'[]');
  fs.writeFileSync(path.join(dir,'devices.json'),'[]');
}

class Client{
  constructor(url){
    this.ws=new WebSocket(url); this.messages=[];
    this.opened=new Promise((resolve,reject)=>{this.ws.once('open',resolve);this.ws.once('error',reject);});
    this.closed=new Promise(resolve=>this.ws.once('close',resolve));
    this.ws.on('message',raw=>{try{this.messages.push(JSON.parse(String(raw)));}catch(_){}});
  }
  async open(){await this.opened;}
  send(message){this.ws.send(JSON.stringify(message));}
  async next(predicate,timeout=3000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      const index=this.messages.findIndex(predicate);
      if(index>=0)return this.messages.splice(index,1)[0];
      await wait(20);
    }
    throw new Error(`Mensaje no recibido; disponibles: ${this.messages.map(m=>JSON.stringify(m)).join(' | ')||'(ninguno)'}`);
  }
  async close(){if(this.ws.readyState===WebSocket.OPEN)this.ws.close();await Promise.race([this.closed,wait(1000)]);}
}

async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'math-attack-replay-'));
  const previousCwd=process.cwd();
  const clients=[];
  let runtime;
  try{
    copyRuntime(temp);
    process.chdir(temp);
    process.env.NODE_PATH=path.join(root,'node_modules');
    require('node:module').Module._initPaths();
    runtime=await startTestServer({waitPath:'/'});
    const url=`ws://localhost:${runtime.port}/ws`;
    const ana=new Client(url), beto=new Client(url), carlos=new Client(url);
    clients.push(ana,beto,carlos);
    await Promise.all(clients.map(client=>client.open()));
    ana.send({type:'create_room',roomName:'Revancha',maxPlayers:3,playerName:'Ana'});
    const created=await ana.next(message=>message.type==='room_created');
    beto.send({type:'join_room',roomId:created.roomId,playerName:'Beto'});
    await beto.next(message=>message.type==='joined');
    carlos.send({type:'join_room',roomId:created.roomId,playerName:'Carlos'});
    await carlos.next(message=>message.type==='joined');
    await ana.next(message=>message.type==='player_joined');
    await ana.next(message=>message.type==='player_joined');
    ana.send({type:'room_start'});
    await ana.next(message=>message.type==='room_start');
    await beto.next(message=>message.type==='room_start');
    await carlos.next(message=>message.type==='room_start');
    const start={type:'game_msg',data:{type:'start',cfg:{mpGameMode:'rounds'}}};
    ana.send(start);
    await wait(50);
    ana.send({type:'game_msg',data:{type:'want_replay'}});
    beto.send({type:'game_msg',data:{type:'want_replay'}});
    const anaReady=await ana.next(message=>message.type==='replay_ready');
    const betoReady=await beto.next(message=>message.type==='replay_ready');
    assert.equal(anaReady.playerCount,2);
    assert.deepEqual(anaReady.playerList.map(player=>player.name),['Ana','Beto']);
    assert.equal(betoReady.playerCount,2);
    assert.equal((await carlos.next(message=>message.type==='replay_excluded')).reason,'not_confirmed');
    console.log('[PASS] Quórum: anfitrión + 1 jugador inicia revancha con 2 participantes y excluye al no confirmado.');

    await Promise.all(clients.map(client=>client.close()));
    const soloHost=new Client(url), soloGuest=new Client(url); clients.push(soloHost,soloGuest);
    await Promise.all([soloHost.open(),soloGuest.open()]);
    soloHost.send({type:'create_room',roomName:'Salida',maxPlayers:2,playerName:'Host'});
    const second=await soloHost.next(message=>message.type==='room_created');
    soloGuest.send({type:'join_room',roomId:second.roomId,playerName:'Guest'});
    await soloGuest.next(message=>message.type==='joined');
    await soloHost.next(message=>message.type==='player_joined');
    soloHost.send({type:'room_start'});
    await soloHost.next(message=>message.type==='room_start');
    await soloGuest.next(message=>message.type==='room_start');
    soloHost.send(start);
    await wait(50);
    soloGuest.send({type:'game_msg',data:{type:'want_replay'}});
    await wait(500);
    assert.equal(soloHost.messages.some(message=>message.type==='replay_ready'),false);
    console.log('[PASS] Regla del anfitrión: un voto aislado del invitado no inicia la revancha.');
    soloGuest.send({type:'game_msg',data:{type:'leave_results'}});
    assert.equal((await soloHost.next(message=>message.type==='return_to_lobby')).reason,'not_enough_players');
    console.log('[PASS] Salida con 2 jugadores: al quedar uno solo, el anfitrión vuelve al listado de salas.');

    soloHost.send({type:'list_rooms'});
    const rooms=await soloHost.next(message=>message.type==='rooms_list');
    assert.equal(rooms.rooms.some(room=>room.id===second.roomId),false);
    console.log('[PASS] Sala cancelada: la sala anterior ya no aparece disponible.');
    console.log('\nResultado: APROBADO — protocolo de revancha y salida validado.');
  }catch(error){
    console.error(`\nResultado: FALLÓ — ${error.message}`);
    process.exitCode=1;
  }finally{
    await Promise.all(clients.map(client=>client.close().catch(()=>{})));
    if(runtime?.server)runtime.server.kill('SIGINT');
    process.chdir(previousCwd);
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
