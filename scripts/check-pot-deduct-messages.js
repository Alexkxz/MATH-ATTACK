'use strict';

const assert = require('assert');
const { createPotDeductMessages } = require('../src/server/ws/potDeductMessages');
const { createEconomicIdempotency } = require('../src/server/ws/economicIdempotency');

const players = [{ name: 'Ana', aureos: 20, experiencia: 0 }];
const saved = [];
const transactions = [];
const sent = [];
const logs = [];
const economy = {
  idempotency: createEconomicIdempotency(),
  persistence: { loadPlayers: () => players, savePlayers: value => saved.push(value) },
  send: (ws, message) => sent.push({ ws, message }),
};
const ws = { playerName: 'Ana' };
const messages = createPotDeductMessages({
  wsContext: { economy },
  findPlayerByName: (items, name) => items.find(player => player.name.toLowerCase() === name.toLowerCase()),
  ensurePlayerExperience: player => { player.experiencia = player.experiencia || 0; },
  logAureosTx: (player, amount, reason) => transactions.push({ player, amount, reason }),
  L: { game: message => logs.push(message) },
});

assert.strictEqual(messages.handlePotDeduct(ws, { type: 'pot_deduct', amount: 3.9 }), true);
assert.strictEqual(players[0].aureos, 17);
assert.deepStrictEqual(transactions[0], { player: players[0], amount: -3, reason: 'apuesta_jugada' });
assert.deepStrictEqual(sent[0].message, { type: 'pot_deduct_result', ok: true, aureos: 17, amount: 3 });
assert.strictEqual(saved.length, 1);

const unchanged = players[0].aureos;
assert.strictEqual(messages.handlePotDeduct(ws, { amount: 0 }), false);
assert.strictEqual(messages.handlePotDeduct(ws, { amount: undefined }), false);
assert.strictEqual(messages.handlePotDeduct({ playerName: '' }, { amount: 2 }), false);
assert.strictEqual(players[0].aureos, unchanged);

assert.strictEqual(messages.handlePotDeduct(ws, { amount: -4 }), true);
assert.strictEqual(players[0].aureos, unchanged);
assert.deepStrictEqual(sent[1].message, { type: 'pot_deduct_result', ok: true, aureos: 17, amount: 0 });
assert.strictEqual(saved.length, 2);

assert.strictEqual(messages.handlePotDeduct(ws, { amount: 100 }), true);
assert.deepStrictEqual(sent[2].message, { type: 'pot_deduct_result', ok: false, error: 'Áureos insuficientes', aureos: 17 });
assert.strictEqual(saved.length, 2);

assert.strictEqual(messages.handlePotDeduct({ playerName: 'Nadie' }, { amount: 2 }), true);
assert.deepStrictEqual(sent[3].message, { type: 'pot_deduct_result', ok: false, error: 'Jugador no encontrado' });
assert.strictEqual(messages.handlePotDeduct(ws, { amount: 2 }), true);
assert.strictEqual(players[0].aureos, 15);
assert.strictEqual(saved.length, 3);
assert.strictEqual(transactions.length, 3);
assert.strictEqual(messages.handlePotDeduct(ws, { amount: 2, id: 'deduct-1' }), true);
assert.strictEqual(messages.handlePotDeduct(ws, { amount: 2, id: 'deduct-1' }), false);
assert.strictEqual(messages.handlePotDeduct(ws, { amount: 2, id: 'deduct-2' }), true);
assert.strictEqual(players[0].aureos, 11);
assert.strictEqual(saved.length, 5);
console.log('OK: pot_deduct conserva validaciones, calculo, saldo, persistencia, logs y respuestas.');
