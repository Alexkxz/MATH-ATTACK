'use strict';

const assert = require('assert');
const { createPotAwardMessages } = require('../src/server/ws/potAwardMessages');

const players = [{ name: 'Ana', aureos: 10, experiencia: 0 }];
const awarded = new Set();
const saved = [];
const queued = [];
const sent = [];
const logs = [];
const economy = {
  _awardedPotGames: awarded,
  persistence: { loadPlayers: () => players, savePlayers: value => saved.push(value) },
  sendOrQueueMsg: (name, message) => queued.push({ name, message }),
  send: (ws, message) => sent.push({ ws, message }),
};
const messages = createPotAwardMessages({
  wsContext: { economy },
  findPlayerByName: (items, name) => items.find(player => player.name.toLowerCase() === name.toLowerCase()),
  ensurePlayerExperience: player => { player.experiencia = player.experiencia || 0; },
  logAureosTx: (player, amount, reason) => logs.push({ player, amount, reason }),
  L: { game: message => logs.push(message) },
});
const ws = { roomId: 'room-1' };

assert.strictEqual(messages.handlePotAward(ws, { winnerName: 'ana', amount: 7.9, gameId: 'g1', betAmount: 3, losers: ['Beto', 'Ana'] }), true);
assert.strictEqual(players[0].aureos, 17);
assert.strictEqual(saved.length, 1);
assert.deepStrictEqual(queued, [
  { name: 'ana', message: { type: 'pot_result', result: 'win', amount: 7, total: 17 } },
  { name: 'Beto', message: { type: 'pot_result', result: 'lose', amount: 3 } },
]);
assert.deepStrictEqual(sent[0].message, { type: 'pot_award_result', ok: true, winnerName: 'ana', amount: 7, total: 17 });
assert.strictEqual(awarded.has('room-1_g1'), true);

const afterFirst = { aureos: players[0].aureos, saved: saved.length, queued: queued.length, sent: sent.length };
assert.strictEqual(messages.handlePotAward(ws, { winnerName: 'Ana', amount: 7, gameId: 'g1' }), false);
assert.deepStrictEqual({ aureos: players[0].aureos, saved: saved.length, queued: queued.length, sent: sent.length }, afterFirst);

assert.strictEqual(messages.handlePotAward(ws, { winnerName: '', amount: 2, gameId: 'g2' }), false);
assert.strictEqual(messages.handlePotAward(ws, { winnerName: 'Ana', amount: 0, gameId: 'g3' }), false);
assert.strictEqual(messages.handlePotAward(ws, { winnerName: 'Ana', amount: -3, gameId: 'g4' }), false);
assert.strictEqual(players[0].aureos, 17);
assert.strictEqual(messages.handlePotAward(ws, { winnerName: 'Nadie', amount: 4, gameId: 'g5', losers: ['Ana'] }), false);
assert.strictEqual(awarded.has('room-1_g5'), false);
assert.strictEqual(saved.length, 1);
assert.strictEqual(messages.handlePotAward(ws, { winnerName: 'Ana', amount: 4, gameId: 'g5', losers: [] }), true);
assert.strictEqual(awarded.has('room-1_g5'), true);
assert.strictEqual(players[0].aureos, 21);
console.log('OK: pot_award conserva gameKey, deduplicacion, premio, cola, persistencia y respuesta.');
