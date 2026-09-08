'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const projectRoot = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function httpReady(url, timeoutMs = 10000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, response => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error(`Servidor no inició: ${url}`));
      else setTimeout(probe, 50);
    };
    probe();
  });
}

function copyRuntime(tempDir) {
  fs.cpSync(path.join(projectRoot, 'src'), path.join(tempDir, 'src'), { recursive: true });
  for (const file of ['server.js', 'maestro.html', 'math-attack.html', 'ranking.html']) {
    fs.copyFileSync(path.join(projectRoot, file), path.join(tempDir, file));
  }
  fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({
    adminUsername: 'admin', adminPassword: 'integration-secret',
  }));
  fs.writeFileSync(path.join(tempDir, 'players.json'), JSON.stringify([
    { id: 'acct-1', name: 'Ana', grade: '3', aureos: 100, experiencia: 0, gamesPlayed: 0, inventory: {}, dailyStreak: {} },
    { id: 'acct-2', name: 'Beto', grade: '3', aureos: 50, experiencia: 0, gamesPlayed: 0, inventory: {}, dailyStreak: {} },
    { id: 'acct-3', name: 'Carlos', grade: '3', aureos: 20, experiencia: 0, gamesPlayed: 0, inventory: {}, dailyStreak: {} },
  ]));
  fs.writeFileSync(path.join(tempDir, 'ranking.json'), '[]');
  fs.writeFileSync(path.join(tempDir, 'aureosLog.json'), '[]');
  fs.writeFileSync(path.join(tempDir, 'devices.json'), '[]');
}

class Client {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.messages = [];
    this.closed = new Promise(resolve => { this.resolveClosed = resolve; });
    this.opened = new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', raw => {
      try { this.messages.push(JSON.parse(String(raw))); } catch (_) { /* ignore malformed test noise */ }
    });
    this.ws.on('close', this.resolveClosed);
  }

  async open() { await this.opened; }

  send(message) { this.ws.send(JSON.stringify(message)); }

  async next(predicate, timeoutMs = 3000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const index = this.messages.findIndex(predicate);
      if (index >= 0) return this.messages.splice(index, 1)[0];
      await wait(20);
    }
    throw new Error(`Mensaje WebSocket no recibido en ${timeoutMs} ms para ${this.ws.url}; disponibles: ${this.messages.map(message => JSON.stringify(message)).join(' | ') || '(ninguno)'}`);
  }

  async close() {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
    await Promise.race([this.closed, wait(2000)]);
  }
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-ws-'));
  let server;
  let serverOutput = '';
  const clients = [];
  try {
    copyRuntime(tempDir);
    const port = await new Promise((resolve, reject) => {
      const probe = require('node:net').createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const value = probe.address().port;
        probe.close(() => resolve(value));
      });
    });
    server = spawn(process.execPath, ['server.js'], {
      cwd: tempDir,
      env: { ...process.env, PORT: String(port), NODE_PATH: path.join(projectRoot, 'node_modules') },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    server.stdout.on('data', data => { serverOutput += String(data); });
    server.stderr.on('data', data => { serverOutput += String(data); });
    await httpReady(`http://127.0.0.1:${port}/`);

    const playerUrl = `ws://127.0.0.1:${port}/ws`;
    const maestro = new Client(`ws://127.0.0.1:${port}/ws-maestro`);
    const live = new Client(`ws://127.0.0.1:${port}/ws-ranking-live`);
    const ana = new Client(playerUrl);
    const beto = new Client(playerUrl);
    const carlos = new Client(playerUrl);
    clients.push(maestro, live, ana, beto, carlos);
    await Promise.all(clients.map(client => client.open()));

    const panelInitial = await maestro.next(message => message.type === 'panel_state');
    assert.deepEqual(Object.keys(panelInitial).sort(), ['connectedNames', 'examFinished', 'examMode', 'opStats', 'sessions', 'ts', 'type'].sort());
    await live.next(message => message.type === 'live_scores');
    ana.send({ type: 'player_identify', name: 'Ana', grade: '3' });
    ana.send({ type: 'session_update', name: 'Ana', grade: '3', gameMode: 'solo', score: 12, status: 'playing' });
    beto.send({ type: 'player_identify', name: 'Beto', grade: '3' });
    beto.send({ type: 'session_update', name: 'Beto', grade: '3', gameMode: 'solo', score: 5, status: 'playing' });
    carlos.send({ type: 'player_identify', name: 'Carlos', grade: '3' });
    carlos.send({ type: 'session_update', name: 'Carlos', grade: '3', gameMode: 'solo', score: 0, status: 'playing' });
    const liveAna = await live.next(message => message.type === 'live_scores' && message.sessions.some(session => session.name === 'Ana'));
    assert.equal(liveAna.sessions.find(session => session.name === 'Ana').score, 12);
    const firstConnectionEvent = await maestro.next(message => message.type === 'conn_event' && message.evType === 'connect');
    assert.match(firstConnectionEvent.msg, /Panel Maestro/);
    const panelPlaying = await maestro.next(message => message.type === 'panel_state' && message.sessions.some(session => session.name === 'Ana'));
    assert.equal(panelPlaying.sessions.find(session => session.name === 'Ana').name, 'Ana');
    const carlosPanel = await maestro.next(message => message.type === 'panel_state' && message.sessions.some(session => session.name === 'Carlos'));
    const carlosSessionId = carlosPanel.sessions.find(session => session.name === 'Carlos').id;
    assert.ok(carlosSessionId);

    ana.ws.terminate();
    await ana.closed;
    await wait(300);
    const anaReconnected = new Client(playerUrl);
    clients.push(anaReconnected);
    await anaReconnected.open();
    anaReconnected.send({ type: 'player_identify', name: 'Ana', grade: '3' });
    anaReconnected.send({ type: 'session_update', name: 'Ana', grade: '3', gameMode: 'solo', score: 12, status: 'playing' });
    beto.send({ type: 'session_update', name: 'Beto', grade: '3', gameMode: 'solo', score: 6, status: 'playing' });
    const restored = await maestro.next(message => message.type === 'panel_state' && message.sessions.some(session => session.name === 'Ana'));
    assert.equal(restored.sessions.filter(session => session.name === 'Ana').length, 1);

    anaReconnected.send({ type: 'create_room', roomName: 'Integracion', maxPlayers: 2, playerName: 'Ana' });
    const created = await anaReconnected.next(message => message.type === 'room_created');
    assert.match(created.roomId, /^\d{4}$/);
    beto.send({ type: 'join_room', roomId: created.roomId, playerName: 'Beto' });
    const joined = await beto.next(message => message.type === 'joined');
    assert.equal(joined.roomId, created.roomId);
    await anaReconnected.next(message => message.type === 'player_joined');
    anaReconnected.send({ type: 'room_start' });
    assert.equal((await anaReconnected.next(message => message.type === 'room_start')).playerCount, 2);
    await beto.next(message => message.type === 'room_start');

    anaReconnected.send({ type: 'game_msg', data: { type: 'start', cfg: { mpGameMode: 'duel' } } });
    anaReconnected.send({ type: 'game_msg', data: { type: 'steal', powerId: 'steal', targetIdx: 1 } });
    const stealForwarded = await beto.next(message => message.type === 'game_msg' && message.data?.powerId === 'steal');
    assert.equal(stealForwarded.data.targetIdx, 1);
    anaReconnected.send({ type: 'game_msg', data: { type: 'peer_finished' } });

    const checkpoint = { type: 'game_checkpoint', id: 'integration-game', name: 'Ana', accountPlayerId: 'acct-1', grade: '3', score: 100, correct: 5, total: 5, pct: 100, tblResults: { 2: { total: 5 } } };
    anaReconnected.send(checkpoint);
    await wait(100);
    anaReconnected.send({ ...checkpoint, type: 'save_result', gameType: 'timed', difficulty: 'medium', gameMode: 'solo', wrong: 1, timeout: 0 });
    await anaReconnected.next(message => message.type === 'aureos_earned');
    await anaReconnected.next(message => message.type === 'achievements_unlocked');
    anaReconnected.send({ ...checkpoint, type: 'save_result', gameType: 'timed', difficulty: 'medium', gameMode: 'solo', wrong: 1, timeout: 0 });
    await wait(100);

    beto.send({ type: 'pot_deduct', amount: 3, id: 'deduct-integration' });
    assert.equal((await beto.next(message => message.type === 'pot_deduct_result')).ok, true);
    beto.send({ type: 'pot_award', winnerName: 'Ana', amount: 5, gameId: 'pot-integration', betAmount: 3, losers: ['Beto'] });
    assert.equal((await beto.next(message => message.type === 'pot_award_result')).ok, true);
    beto.send({ type: 'pot_draw', gameId: 'draw-integration', betAmount: 2, names: ['Ana', 'Beto'] });
    assert.equal((await beto.next(message => message.type === 'pot_award_result')).draw, true);
    const anaPending = new Client(playerUrl);
    clients.push(anaPending);
    await anaPending.open();
    anaPending.send({ type: 'player_identify', name: 'Ana', grade: '3' });
    assert.equal((await anaPending.next(message => message.type === 'pot_result')).result, 'win');

    beto.send({ type: 'save_result', id: 'bonus-integration', name: 'Beto', accountPlayerId: 'acct-2', gameId: 'bonus-integration', gameMode: 'online', mpGameMode: 'duelo', score: 200, gameType: 'timed', difficulty: 'medium', wrong: 0, timeout: 0, tblResults: { 2: { total: 5 } } });
    await wait(100);
    beto.send({ type: 'mp_winner_bonus', gameId: 'bonus-integration', winners: ['Beto'] });
    await wait(100);
    const betoReconnected = new Client(playerUrl);
    clients.push(betoReconnected);
    await betoReconnected.open();
    betoReconnected.send({ type: 'player_identify', name: 'Beto', grade: '3' });
    await wait(100);
    betoReconnected.send({ type: 'session_update', name: 'Beto', grade: '3', gameMode: 'solo', score: 6, status: 'playing' });
    const betoPanel = await maestro.next(message => message.type === 'panel_state' && message.sessions.some(session => session.name === 'Beto' && session.score === 6));
    const betoSessionId = betoPanel.sessions.find(session => session.name === 'Beto' && session.score === 6).id;
    assert.ok(betoSessionId);

    maestro.send({ type: 'maestro_announcement', text: 'Aviso de integración', password: 'integration-secret' });
    assert.deepEqual(await anaPending.next(message => message.type === 'announcement'), { type: 'announcement', text: 'Aviso de integración' });
    await wait(100);
    carlos.send({ type: 'session_update', name: 'Carlos', grade: '3', gameMode: 'solo', score: 9, status: 'playing' });
    const latestCarlosPanel = await maestro.next(message => message.type === 'panel_state' && message.sessions.some(session => session.name === 'Carlos' && session.score === 9));
    const latestCarlosSessionId = latestCarlosPanel.sessions.find(session => session.name === 'Carlos' && session.score === 9).id;
    assert.ok(latestCarlosSessionId);
    maestro.send({ type: 'kick_player', playerId: latestCarlosSessionId, password: 'integration-secret' });
    assert.equal((await carlos.next(message => message.type === 'kicked')).type, 'kicked');
    await wait(250);

    const persistedPlayers = JSON.parse(fs.readFileSync(path.join(tempDir, 'players.json'), 'utf8'));
    const persistedRanking = JSON.parse(fs.readFileSync(path.join(tempDir, 'ranking.json'), 'utf8'));
    assert.equal(persistedPlayers.find(player => player.id === 'acct-1').name, 'Ana');
    assert.equal(persistedRanking.filter(result => result.id === 'integration-game').length, 1);
    assert.equal(persistedRanking.find(result => result.id === 'integration-game').complete, true);
    console.log('check-websocket-integration: OK');
  } catch (error) {
    const detail = '\nSalida del servidor:\n' + (serverOutput || '(sin salida)');
    throw new Error(`${error.message}${detail}`, { cause: error });
  } finally {
    for (const client of clients) await client.close();
    if (server && !server.killed) {
      server.kill('SIGINT');
      await wait(300);
      if (!server.killed) server.kill();
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`check-websocket-integration: FAIL: ${error.message}`);
  process.exitCode = 1;
});
