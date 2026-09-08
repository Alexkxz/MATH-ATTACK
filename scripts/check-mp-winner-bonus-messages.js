'use strict';

const assert = require('node:assert/strict');
const { createMpWinnerBonusMessages } = require('../src/server/ws/mpWinnerBonusMessages');

const players = [
  { name: 'Ana', aureos: 10, experiencia: 20 },
  { name: 'Legacy', aureos: 4 },
];
const earned = new Map();
const awarded = new Set();
const saved = [];
const notifications = [];
const logs = [];

const messages = createMpWinnerBonusMessages({
  wsContext: {
    economy: {
      _mpEarnedByGame: earned,
      _awardedBonusGames: awarded,
      persistence: {
        loadPlayers: () => players,
        savePlayers: value => saved.push(value.map(player => ({ ...player }))),
      },
      sendOrQueueMsg: (name, message) => notifications.push({ name, message }),
    },
  },
  findPlayerByName: (list, name) => list.find(player => player.name.toLowerCase() === String(name).toLowerCase()),
  ensurePlayerExperience: player => {
    if (typeof player.experiencia !== 'number') player.experiencia = 0;
    return player.experiencia;
  },
  logAureosTx: (player, amount, reason) => logs.push({ name: player.name, amount, reason }),
  L: { game: message => logs.push({ message }) },
});

const ws = roomId => ({ roomId });
const earnedKey = (roomId, gameId, name) => `${roomId}_${gameId}_${name.toLowerCase()}`;

earned.set(earnedKey('room-1', 'game-1', 'Ana'), 5);
assert.equal(messages.handleMpWinnerBonus(ws('room-1'), {
  gameId: 'game-1',
  winners: ['Ana'],
}), true);
assert.equal(players[0].aureos, 15);
assert.equal(players[0].experiencia, 25);
assert.equal(earned.has(earnedKey('room-1', 'game-1', 'Ana')), false);
assert.deepEqual(notifications[0], {
  name: 'Ana',
  message: { type: 'coin_bonus', amount: 5, total: 15, experiencia: 25, experience: 25 },
});
assert.equal(saved.length, 1);
assert.deepEqual(logs[0], { name: 'Ana', amount: 5, reason: 'bono_ganador_mp' });
assert(awarded.has('room-1_game-1_bonus'));

const counts = { saved: saved.length, notifications: notifications.length, logs: logs.length };
assert.equal(messages.handleMpWinnerBonus(ws('room-1'), { gameId: 'game-1', winners: ['Ana'] }), false);
assert.deepEqual({ saved: saved.length, notifications: notifications.length, logs: logs.length }, counts);
assert.equal(players[0].aureos, 15);

assert.equal(messages.handleMpWinnerBonus(ws('room-2'), { gameId: 'game-2', winners: [] }), false);
assert.equal(messages.handleMpWinnerBonus(ws('room-3'), { winners: ['Ana'] }), false);
assert.equal(messages.handleMpWinnerBonus(ws('room-4'), { gameId: 'game-4', winners: ['Ana'] }), false);

earned.set(earnedKey('room-5', 'game-5', 'Ana'), 3);
earned.set(earnedKey('room-5', 'game-5', 'Missing'), 8);
assert.equal(messages.handleMpWinnerBonus(ws('room-5'), {
  gameId: 'game-5',
  winners: ['Ana', 'Missing'],
}), false);
assert.equal(players[0].aureos, 15);
assert.equal(earned.has(earnedKey('room-5', 'game-5', 'Ana')), true);
assert.equal(earned.has(earnedKey('room-5', 'game-5', 'Missing')), true);

earned.set(earnedKey('room-6', 'game-6', 'Legacy'), 2);
assert.equal(messages.handleMpWinnerBonus(ws('room-6'), {
  gameId: 'game-6',
  winners: ['LEGACY'],
}), true);
assert.equal(players[1].aureos, 6);
assert.equal(players[1].experiencia, 2);
assert.equal(earned.has(earnedKey('room-6', 'game-6', 'Legacy')), false);
assert.equal(notifications.filter(entry => entry.message.type === 'coin_bonus').length, 2);
assert.equal(logs.filter(entry => entry.reason === 'bono_ganador_mp').length, 2);

earned.set(earnedKey('room-7', 'game-7', 'Ana'), 4);
assert.equal(messages.handleMpWinnerBonus(ws('room-7'), { gameId: 'game-7', winners: ['NoExiste'] }), false);
assert.equal(earned.has(earnedKey('room-7', 'game-7', 'Ana')), true);
assert.equal(saved.length, 2);

console.log('check-mp-winner-bonus-messages: OK');
