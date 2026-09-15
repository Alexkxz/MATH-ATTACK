'use strict';

const { randomUUID } = require('crypto');
const { multipliersForTable } = require('../../client/maestro/tableRanges');

const clone = value => JSON.parse(JSON.stringify(value));
const OP_SYMBOLS = { mult: '×', add: '+', sub: '−', div: '÷' };

function integer(value, fallback) { return Number.isInteger(value) ? value : fallback; }
function randomInt(random, min, max) { return min + Math.floor(random() * (max - min + 1)); }
function arithmeticPair(digits, mode, operation, random) {
  const min = digits === 1 ? 1 : 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  const carries = mode === 'carry' || mode === 'both';
  const wantsCarry = mode === 'carry';
  const hasCarry = (a, b) => { let carry = false; let x = a; let y = b; while (x || y) { if ((x % 10) + (y % 10) >= 10) carry = true; x = Math.floor(x / 10); y = Math.floor(y / 10); } return carry; };
  const hasBorrow = (a, b) => { let borrow = false; let x = a; let y = b; while (x || y) { const xd = x % 10 - (borrow ? 1 : 0); const yd = y % 10; if (xd < yd) borrow = true; else borrow = false; x = Math.floor(x / 10); y = Math.floor(y / 10); } return borrow; };
  for (let attempt = 0; attempt < 500; attempt += 1) {
    let a = randomInt(random, min, max); let b = randomInt(random, min, max);
    if (operation === 'sub' && a < b) [a, b] = [b, a];
    const feature = operation === 'add' ? hasCarry(a, b) : hasBorrow(a, b);
    if (mode === 'both' || feature === wantsCarry || (mode === 'direct' && !feature)) return [a, b];
  }
  if (operation === 'add') return wantsCarry ? [max, min] : [min, min];
  if (wantsCarry && digits > 1) return [2 * 10 ** (digits - 1), 10 ** (digits - 1) + 1];
  return [max, 10 ** (digits - 1)];
}
function shuffle(items, random) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function generateConfiguredQuestions(configuration = {}, random = Math.random) {
  const questions = [];
  const opsConfig = configuration.opsConfig && typeof configuration.opsConfig === 'object' ? configuration.opsConfig : null;
  const operations = opsConfig ? Object.entries(opsConfig) : [[configuration.op || 'mult', configuration]];
  for (const [operation, raw] of operations) {
    const config = raw && typeof raw === 'object' ? raw : {};
    const operationStart = questions.length;
    const op = OP_SYMBOLS[operation] || OP_SYMBOLS.mult;
    if (op === '×' || op === '÷') {
      const tables = Array.isArray(config.tables) && config.tables.length ? config.tables : (Array.isArray(configuration.tables) && configuration.tables.length ? configuration.tables : [1]);
      const qty = Math.max(1, integer(config.qty, integer(configuration.total, 1)));
      if (Array.isArray(config.matrix)) {
        const selected = [...new Set(config.matrix.map(value => String(value).split('x').map(Number)).filter(([factor, table]) => Number.isInteger(factor) && Number.isInteger(table) && factor >= 0 && factor <= 12 && table >= 0 && table <= 12 && (operation !== 'div' || table > 0)))];
        for (const [factor, table] of selected) {
          const a = operation === 'div' ? table * factor : table;
          const b = operation === 'div' ? table : factor;
          questions.push({ questionId: randomUUID(), op, a, b, answer: operation === 'div' ? factor : a * b });
        }
        if (config.manner === 'random') questions.splice(operationStart, questions.length - operationStart, ...shuffle(questions.slice(operationStart), random));
        continue;
      }
      // El contrato de rangos usa el valor que acompaña a la tabla: en
      // multiplicación es el factor permitido y en división es el cociente
      // (factor) permitido para construir `dividendo ÷ divisor`. Estos rangos
      // no son límites arbitrarios del dividendo ni del divisor.
      for (const table of tables) {
        const matrixValues = Array.isArray(config.matrix) ? config.matrix.map(value => String(value).split('x').map(Number)).filter(([row, col]) => col === table && row > 0).map(([row]) => row) : null;
        const values = matrixValues !== null ? matrixValues : ((op === '×' || op === '÷') && Array.isArray(config.ranges) ? multipliersForTable(config, table, random) : null);
        const factors = values || Array.from({ length: qty }, () => randomInt(random, 1, 12));
        for (const factor of factors) {
          const a = op === '÷' ? table * factor : table;
          const b = op === '÷' ? table : factor;
          questions.push({ questionId: randomUUID(), op, a, b, answer: op === '×' ? a * b : (op === '÷' ? factor : a * b) });
        }
      }
      if (config.manner === 'random') {
        questions.splice(operationStart, questions.length - operationStart, ...shuffle(questions.slice(operationStart), random));
      }
    } else {
      const qty = Math.max(1, integer(config.qty, integer(configuration.total, 1)));
      for (let index = 0; index < qty; index += 1) {
        const digits = Math.min(4, Math.max(1, integer(config.digits, 1)));
        const [a, b] = arithmeticPair(digits, config.carryMode || 'both', operation === 'add' ? 'add' : 'sub', random);
        questions.push({ questionId: randomUUID(), op, a, b, answer: op === '+' ? a + b : a - b });
      }
      if (config.manner === 'random') {
        questions.splice(operationStart, questions.length - operationStart, ...shuffle(questions.slice(operationStart), random));
      }
    }
  }
  return questions;
}

function publicQuestion(question) { return { questionId: question.questionId, op: question.op, a: question.a, b: question.b, text: `${question.a} ${question.op} ${question.b}` }; }
function publicQuestions(questions) { return (questions || []).map(publicQuestion); }
function scoreFor(correct, multiplier = 1) { return Math.max(0, correct) * Math.max(1, integer(multiplier, 1)); }

function answerQuestion(question, answer) {
  const numeric = typeof answer === 'number' ? answer : (typeof answer === 'string' && answer.trim() !== '' ? Number(answer) : NaN);
  if (!Number.isFinite(numeric)) throw Error('respuesta invalida');
  return numeric === question.answer;
}

module.exports = { generateConfiguredQuestions, publicQuestion, publicQuestions, answerQuestion, scoreFor, clone, shuffle };
