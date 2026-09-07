'use strict';

const assert = require('assert');
const {
  PLAYER_LEVELS,
  GAME_EXPERIENCE_MULT,
  getPlayerExperience,
  ensurePlayerExperience,
  getPlayerLevel,
} = require('../src/game/playerLevels');

assert.strictEqual(PLAYER_LEVELS.length, 11, 'debe conservar los 11 niveles');
assert.deepStrictEqual(
  PLAYER_LEVELS.map(({ level, name, minExperience }) => [level, name, minExperience]),
  [
    [0, 'Novato', 0], [1, 'Explorador', 100], [2, 'Estudioso', 250],
    [3, 'Calculador', 500], [4, 'Resolvedor', 1000], [5, 'Matematico', 1600],
    [6, 'Analitico', 2400], [7, 'Estratega', 3600], [8, 'Genio', 5200],
    [9, 'Sabio', 7500], [10, 'Gran Maestro', 10000],
  ],
  'las definiciones de niveles cambiaron',
);
assert.strictEqual(GAME_EXPERIENCE_MULT, 3, 'el multiplicador de experiencia cambió');

const levelCases = [
  [-50, 0], [0, 0], [99, 0], [100, 1], [249, 1], [250, 2],
  [9999, 9], [10000, 10], [999999, 10],
];
for (const [experience, expectedLevel] of levelCases) {
  assert.strictEqual(getPlayerLevel(experience).level, expectedLevel, `nivel incorrecto para ${experience} XP`);
}

assert.strictEqual(getPlayerExperience({ experiencia: 12.6, aureos: 999 }), 13, 'experiencia debe tener prioridad y redondearse');
assert.strictEqual(getPlayerExperience({ experience: 20 }), 20, 'debe conservar el alias experience');
assert.strictEqual(getPlayerExperience({ xp: 30 }), 30, 'debe conservar el alias xp');
assert.strictEqual(getPlayerExperience({ aureos: 40 }), 40, 'debe conservar el fallback legado a Áureos');
assert.strictEqual(getPlayerExperience({ experiencia: -10 }), 0, 'la experiencia mínima debe ser cero');

const legacyPlayer = { aureos: 75 };
assert.strictEqual(ensurePlayerExperience(legacyPlayer), 75, 'debe recuperar experiencia legada');
assert.strictEqual(legacyPlayer.experiencia, 75, 'debe normalizar experiencia en el jugador');

console.log('OK: niveles, límites, normalización de experiencia y multiplicador conservan el comportamiento existente.');
