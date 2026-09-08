'use strict';

const assert = require('node:assert/strict');
const { createStealPower } = require('../src/server/ws/stealPower');

const sent = [];
const logs = [];
const send = (ws, message) => sent.push({ ws, message });
const steal = createStealPower({ send, L: { game: message => logs.push(message) } });
const attacker = { name: 'Ana', idx: 0, ws: { id: 'ana' } };
const target = { name: 'Beto', idx: 1, ws: { id: 'beto' } };
const peer = { name: 'Carla', idx: 2, ws: { id: 'carla' } };
const room = { players: [attacker, target, peer] };
const ws = attacker.ws;
ws.roomId = 'room-1';
const message = data => ({ data });

const targeted = { type: 'power_use', powerId: 'steal', targetIdx: 1, amount: 4 };
assert.equal(steal.handleStealPower(ws, room, message(targeted)), true);
assert.deepEqual(sent, [{ ws: target.ws, message: { type: 'game_msg', data: targeted } }]);

sent.length = 0;
assert.equal(steal.handleStealPower(ws, room, message({ type: 'power_use', powerId: 'steal' })), true);
assert.equal(sent.length, 0);
assert.equal(logs.length, 1);
assert.match(logs[0], /Poder "steal" sin targetIdx/);

sent.length = 0;
assert.equal(steal.handleStealPower(ws, room, message({ type: 'power_use', powerId: 'steal', targetIdx: 99 })), true);
assert.equal(sent.length, 0);

sent.length = 0;
assert.equal(steal.handleStealPower(ws, room, message({ type: 'power_use', powerId: 'steal', targetIdx: 0 })), true);
assert.equal(sent.length, 0);

sent.length = 0;
const area = { type: 'power_use', powerId: 'steal', area: true };
assert.equal(steal.handleStealPower(ws, room, message(area)), true);
assert.deepEqual(sent.map(item => item.ws), [target.ws, peer.ws]);
assert(sent.every(item => item.message.type === 'game_msg' && item.message.data === area));

sent.length = 0;
assert.equal(steal.handleStealPower(ws, room, message({ type: 'power_use', powerId: 'drainlife', targetIdx: 2 })), false);
assert.equal(sent.length, 0);
assert.equal(steal.handleStealPower(ws, room, message({ type: 'power_use', powerId: 'shield', area: true })), false);
assert.equal(steal.handleStealPower(ws, room, message({ type: 'start', cfg: { mpGameMode: 'duel' } }),), false);
assert.equal(steal.handleStealPower(ws, room, message({ type: 'peer_finished' })), false);

const fourPlayerRoom = { players: [attacker, target, peer, { name: 'Diego', idx: 3, ws: { id: 'diego' } }] };
sent.length = 0;
assert.equal(steal.handleStealPower(ws, fourPlayerRoom, message({ type: 'power_use', powerId: 'steal', targetIdx: 3 })), true);
assert.equal(sent.length, 1);
assert.equal(sent[0].ws.id, 'diego');

console.log('check-steal-power: OK');
