'use strict';

const assert = require('node:assert/strict');
const { createPotDrawMessages } = require('../src/server/ws/potDrawMessages');

const players = [
  { name: 'Ana', aureos: 10 },
  { name: 'Beto', aureos: 4 },
  { name: 'Legacy', aureos: 1 },
];
const awarded = new Set();
const saved = [];
const queued = [];
const sent = [];
const transactions = [];

const messages = createPotDrawMessages({
  wsContext: {
    economy: {
      _awardedPotGames: awarded,
      persistence: {
        loadPlayers: () => players,
        savePlayers: value => saved.push(value.map(player => ({ ...player }))),
      },
      sendOrQueueMsg: (name, message) => queued.push({ name, message }),
      send: (ws, message) => sent.push({ ws, message }),
    },
  },
  findPlayerByName: (list, name) => list.find(player => player.name.toLowerCase() === String(name).toLowerCase()),
  ensurePlayerExperience: player => {
    if (typeof player.experiencia !== 'number') player.experiencia = 0;
  },
  logAureosTx: (player, amount, reason) => transactions.push({ name: player.name, amount, reason }),
  L: { game: message => transactions.push({ message }) },
});

const makeWs = roomId => ({ roomId });

assert.equal(messages.handlePotDraw(makeWs('room-1'), {
  gameId: 'g1',
  betAmount: 3.9,
  names: ['Ana', 'Beto'],
}), true);
assert.equal(players[0].aureos, 13);
assert.equal(players[1].aureos, 7);
assert.equal(saved.length, 1);
assert.deepEqual(queued.slice(0, 2), [
  { name: 'Ana', message: { type: 'pot_result', result: 'draw', amount: 3, total: 13 } },
  { name: 'Beto', message: { type: 'pot_result', result: 'draw', amount: 3, total: 7 } },
]);
assert.equal(sent.length, 1);
assert.deepEqual(sent[0].message, { type: 'pot_award_result', ok: true, draw: true });
assert(awarded.has('room-1_g1'));

const counts = { saved: saved.length, queued: queued.length, sent: sent.length };
assert.equal(messages.handlePotDraw(makeWs('room-1'), { gameId: 'g1', betAmount: 3, names: ['Ana'] }), false);
assert.deepEqual({ saved: saved.length, queued: queued.length, sent: sent.length }, counts);
assert.equal(players[0].aureos, 13);

assert.equal(messages.handlePotDraw(makeWs('room-missing'), {
  gameId: 'missing', betAmount: 2, names: ['Ana', 'Nadie'],
}), false);
assert.equal(awarded.has('room-missing_missing'), false);
assert.equal(players[0].aureos, 13);

assert.equal(messages.handlePotDraw(makeWs('room-2'), { betAmount: 2, names: ['Ana'] }), true);
assert(awarded.has('room-2_'));
assert.equal(players[0].aureos, 15);

for (const [roomId, betAmount, names] of [
  ['room-3', undefined, ['Ana']],
  ['room-4', 0, ['Ana']],
  ['room-5', -2, ['Ana']],
  ['room-6', 2, []],
]) {
  assert.equal(messages.handlePotDraw(makeWs(roomId), { gameId: 'g', betAmount, names }), false);
  assert.equal(awarded.has(`${roomId}_g`), false);
}

assert.equal(messages.handlePotDraw(makeWs('room-7'), { gameId: 'g7', betAmount: 2, names: ['Nadie'] }), false);
assert.equal(saved.length, 2);
assert.equal(messages.handlePotDraw(makeWs('room-8'), { gameId: 'g8', betAmount: 2, names: ['Legacy'] }), true);
assert.equal(players[2].aureos, 3);
assert.equal(queued.filter(entry => entry.name === 'Legacy').length, 1);
assert.equal(transactions.filter(entry => entry.reason === 'apuesta_empate').length, 4);
assert.equal(messages.handlePotDraw(makeWs('room-8'), { gameId: 'g8', betAmount: 2, names: ['Legacy'] }), false);
assert.equal(players[2].aureos, 3);

console.log('check-pot-draw-messages: OK');
