'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ids = { group: '11111111-1111-4111-8111-111111111111', one: '22222222-2222-4222-8222-222222222222', two: '33333333-3333-4333-8333-333333333333' };
const event = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });

async function start(dir, port) {
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json'), MATH_ATTACK_GROUPS_PATH: path.join(dir, 'groups.json') } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${base}/api/ranking`)).ok) return { child, base }; } catch (_) {} await wait(100); }
  child.kill('SIGINT'); throw Error('servidor de grupos no inicio');
}

const call = (base, url, options = {}) => fetch(base + url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-group-http-'));
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify([{ id: ids.one, name: 'Ana', pin: '1234', grade: '5A' }, { id: ids.two, name: 'Beto', pin: '5678', grade: '5A' }]), 'utf8');
  let server;
  try {
    server = await start(dir, await freePort());
    const auth = { 'X-Admin-Password': 'admin' };
    assert.equal((await call(server.base, '/api/maestro/groups')).status, 401);
    const created = await call(server.base, '/api/maestro/groups', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Grupo 5A', grade: '5', schoolYear: '2030', eventId: event(1) }) });
    assert.equal(created.status, 201); const createdBody = await created.json(); assert(createdBody.group.groupId);
    assert(!JSON.stringify(createdBody).match(/password|pwd|token|cookie|session/i));
    const groupId = createdBody.group.groupId;
    const repeated = await call(server.base, '/api/maestro/groups', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Grupo 5A', grade: '5', schoolYear: '2030', eventId: event(1) }) });
    assert.equal((await repeated.json()).duplicate, true);
    assert.equal((await call(server.base, '/api/maestro/groups', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Otro', grade: '6', schoolYear: '2030', eventId: event(1) }) })).status, 409);
    assert.equal((await call(server.base, `/api/maestro/groups/${groupId}`, { headers: auth })).status, 200);
    const add = await call(server.base, `/api/maestro/groups/${groupId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ accountPlayerId: ids.one, revision: 2, eventId: event(2) }) });
    assert.equal(add.status, 200); assert.deepEqual((await add.json()).group.memberAccountPlayerIds, [ids.one]);
    assert.equal((await call(server.base, `/api/maestro/groups/${groupId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ accountPlayerId: ids.one, revision: 2, eventId: event(2) }) })).status, 200);
    assert.equal((await call(server.base, `/api/maestro/groups/${groupId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ accountPlayerId: ids.two, revision: 3, eventId: event(2) }) })).status, 409);
    assert.equal((await call(server.base, `/api/maestro/groups/${groupId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ accountPlayerId: '55555555-5555-4555-8555-555555555555', revision: 3, eventId: event(3) }) })).status, 404);
    const updated = await call(server.base, `/api/maestro/groups/${groupId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ name: 'Grupo 5A editado', revision: 3, eventId: event(4) }) });
    assert.equal(updated.status, 200); assert.equal((await updated.json()).group.name, 'Grupo 5A editado');
    const removed = await call(server.base, `/api/maestro/groups/${groupId}/members/${ids.one}`, { method: 'DELETE', headers: auth, body: JSON.stringify({ revision: 4, eventId: event(5) }) });
    assert.equal(removed.status, 200); assert.deepEqual((await removed.json()).group.memberAccountPlayerIds, []);
    const studentAuth = await call(server.base, '/api/student/auth', { method: 'POST', body: JSON.stringify({ name: 'Ana', pin: '1234' }) });
    assert.equal(studentAuth.status, 200); assert.equal((await call(server.base, '/api/maestro/groups', { headers: { Cookie: studentAuth.headers.get('set-cookie') } })).status, 401);
    server.child.kill('SIGINT'); await wait(150); server = await start(dir, await freePort());
    const recovered = await (await call(server.base, '/api/maestro/groups', { headers: auth })).json();
    assert.equal(recovered.groups.length, 1); assert.equal(recovered.groups[0].name, 'Grupo 5A editado'); assert.equal(recovered.groups[0].memberAccountPlayerIds.length, 0);
    assert(!JSON.stringify(recovered).match(/password|pwd|token|cookie|session/i));
    console.log('OK: endpoints de grupos autentican, validan miembros, conservan idempotencia, auditoria, revisiones, rechazo de alumnos y persistencia temporal.');
  } finally { if (server?.child && !server.child.killed) server.child.kill('SIGINT'); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
