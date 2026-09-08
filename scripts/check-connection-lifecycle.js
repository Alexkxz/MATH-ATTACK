'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const { createConnectionLifecycle } = require('../src/server/ws/connectionLifecycle');

class FakeSocket extends EventEmitter {
  constructor() { super(); this.readyState = 1; }
  terminate() { this.terminated = true; }
}

const context = {};
const clients = new Set();
const ws = new FakeSocket();
let nextId = 40;
let logged = '';
let closed = 0;
let errored = 0;
const lifecycle = createConnectionLifecycle({
  wsContext: context,
  WebSocket: { OPEN: 1 },
  nextConnectionId: () => ++nextId,
  getClientCount: () => clients.size,
  logConnection: message => { logged = message; },
});

const url = lifecycle.initialize(ws, {
  url: '/ws?legacy=1',
  headers: {},
  socket: { remoteAddress: '127.0.0.1' },
});
assert.strictEqual(url, '/ws');
assert.strictEqual(ws._wsContext, context);
assert.strictEqual(ws._connId, 41);
assert.ok(logged.includes('Cliente #41'));
assert.strictEqual(typeof ws.listenerCount('pong'), 'number');
assert.strictEqual(ws.listenerCount('pong'), 1);

lifecycle.registerClient(clients, ws);
assert.strictEqual(clients.has(ws), true);
lifecycle.attachCloseAndError(ws, {
  onClose: () => { lifecycle.unregisterClient(clients, ws); closed++; },
  onError: () => { lifecycle.unregisterClient(clients, ws); errored++; },
});
ws.emit('close');
assert.strictEqual(clients.has(ws), false);
assert.strictEqual(closed, 1);
lifecycle.registerClient(clients, ws);
ws.emit('error', new Error('test'));
assert.strictEqual(clients.has(ws), false);
assert.strictEqual(errored, 1);
console.log('OK: ciclo de vida inicializa, asocia contexto y limpia clientes sin listeners duplicados.');
