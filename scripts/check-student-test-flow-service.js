'use strict';

const assert = require('assert');
const {
  generateConfiguredQuestions,
  answerQuestion,
  scoreFor,
  publicQuestion
} = require('../src/server/exams/studentTestFlowService');

const ordered = generateConfiguredQuestions({
  opsConfig: {
    mult: {
      tables: [2],
      ranges: [{ table: 2, from: 3, to: 4 }],
      qty: 2,
      manner: 'ordered',
      repeat: false
    }
  }
});
assert.deepStrictEqual(ordered.map(item => [item.a, item.b, item.answer]), [[2, 3, 6], [2, 4, 8]]);

const repeated = generateConfiguredQuestions({
  opsConfig: {
    mult: {
      tables: [2],
      ranges: [{ table: 2, from: 3, to: 4 }],
      qty: 3,
      manner: 'ordered',
      repeat: true
    }
  }
});
assert.deepStrictEqual(repeated.map(item => item.b), [3, 4, 3]);

const seed = () => {
  let value = 7;
  return () => {
    value = (value * 17 + 11) % 101;
    return value / 101;
  };
};
const randomConfig = {
  opsConfig: {
    mult: {
      tables: [3],
      ranges: [{ table: 3, from: 1, to: 4 }],
      manner: 'random'
    }
  }
};
const first = generateConfiguredQuestions(randomConfig, seed());
const second = generateConfiguredQuestions(randomConfig, seed());
assert.deepStrictEqual(first.map(item => [item.a, item.b, item.answer]), second.map(item => [item.a, item.b, item.answer]));

assert.strictEqual(answerQuestion(ordered[0], '6'), true);
assert.strictEqual(answerQuestion(ordered[0], 7), false);
assert.throws(() => answerQuestion(ordered[0], ''), /respuesta invalida/);
assert.strictEqual(scoreFor(2), 2);
assert.strictEqual(scoreFor(2, 5), 10);
assert.deepStrictEqual(publicQuestion(ordered[0]), {
  questionId: ordered[0].questionId,
  op: '\u00d7',
  a: 2,
  b: 3,
  text: '2 \u00d7 3'
});

console.log('OK servicio puro del flujo del alumno: rangos, repeticion, orden, respuestas y puntaje');
