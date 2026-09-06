const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(BASE_URL + '/api/ranking');
      if (res.ok) return;
    } catch (e) {}
    await wait(250);
  }
  throw new Error('No se pudo iniciar el servidor local');
}

function getAdminPassword() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
    return config.adminPassword || 'admin';
  } catch (e) {
    return 'admin';
  }
}

async function request(pathname, options = {}) {
  return fetch(BASE_URL + pathname, options);
}

async function expectStatus(label, pathname, expected, options = {}) {
  const res = await request(pathname, options);
  if (res.status !== expected) {
    throw new Error(`${label}: esperaba ${expected}, recibio ${res.status}`);
  }
  console.log(`OK: ${label} -> ${expected}`);
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let serverOutput = '';
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

  try {
    await waitForServer();
    const password = getAdminPassword();
    const jsonHeaders = { 'Content-Type': 'application/json' };

    await expectStatus('ranking publico', '/api/ranking', 200);
    await expectStatus('estado examen publico para alumnos', '/api/exam/status', 200);
    await expectStatus('logros publicos para alumnos', '/api/achievements', 200);

    await expectStatus('alumnos sin auth bloqueado', '/api/players', 401);
    await expectStatus('export alumnos sin auth bloqueado', '/api/players/export', 401);
    await expectStatus('pin alumno sin auth bloqueado', '/api/players/get-pin?id=__no_existe__', 401);
    await expectStatus('historial alumno sin auth bloqueado', '/api/students/history?name=Prueba', 401);
    await expectStatus('log aureos sin auth bloqueado', '/api/players/aureos-log', 401);
    await expectStatus('ranking export sin auth bloqueado', '/api/ranking/export', 401);
    await expectStatus('delete ranking sin auth bloqueado', '/api/ranking/delete-game', 401, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ id: '__no_existe__' }),
    });
    await expectStatus('cmd all sin auth bloqueado', '/api/cmd/all', 401, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ action: 'pause' }),
    });
    await expectStatus('cmd jugador sin auth bloqueado', '/api/cmd/pause', 401, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ action: 'pause', playerId: '__no_existe__' }),
    });
    await expectStatus('exam start sin auth bloqueado', '/api/exam/start', 401, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ grade: '', tables: [], timeLimit: 0 }),
    });
    await expectStatus('exam stop sin auth bloqueado', '/api/exam/stop', 401, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });
    await expectStatus('credenciales admin password incorrecta bloqueado', '/api/maestro/auth', 401, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ username: 'admin', password: '__incorrecta__' }),
    });
    await expectStatus('alumnos password incorrecta bloqueado', '/api/players?pwd=__incorrecta__', 401);

    await expectStatus('alumnos con auth permitido', '/api/players?pwd=' + encodeURIComponent(password), 200);
    await expectStatus('delete ranking con auth valida datos sin id', '/api/ranking/delete-game', 400, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ password }),
    });
  } catch (err) {
    if (serverOutput.trim()) console.error(serverOutput.trim());
    throw err;
  } finally {
    server.kill('SIGINT');
  }
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
