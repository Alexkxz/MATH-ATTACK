'use strict';

const assert = require('assert');
const { generateConfiguredQuestions } = require('../src/server/exams/studentTestFlowService');
const { validateOpsConfig } = require('../src/client/maestro/tableRanges');

const multiplication = generateConfiguredQuestions({ opsConfig: { mult: { tables: [4], ranges: [{ table: 4, from: 2, to: 3 }], manner: 'ordered' } } });
assert.deepStrictEqual(multiplication.map(q => [q.a, q.b, q.answer]), [[4, 2, 8], [4, 3, 12]]);

const division = generateConfiguredQuestions({ opsConfig: { div: { tables: [3], ranges: [{ table: 3, from: 2, to: 4 }], manner: 'ordered' } } });
assert.deepStrictEqual(division.map(q => [q.a, q.b, q.answer]), [[6, 3, 2], [9, 3, 3], [12, 3, 4]]);

const addition = generateConfiguredQuestions({ opsConfig: { add: { qty: 4, digits: 2, carryMode: 'direct' } } }, () => 0);
assert(addition.every(q => q.a >= 10 && q.a <= 99 && q.b >= 10 && q.b <= 99));
assert(addition.every(q => String(q.a).split('').every((digit, index) => Number(digit) + Number(String(q.b)[index]) <= 9)));

const subtraction = generateConfiguredQuestions({ opsConfig: { sub: { qty: 4, digits: 2, carryMode: 'direct' } } }, () => 0);
assert(subtraction.every(q => q.a >= q.b));
assert(subtraction.every(q => String(q.a).split('').every((digit, index) => Number(digit) >= Number(String(q.b).padStart(2, '0')[index]))));

const both = generateConfiguredQuestions({ opsConfig: { add: { qty: 8, digits: 2, carryMode: 'both' } } });
assert.strictEqual(both.length, 8);
const carries = generateConfiguredQuestions({ opsConfig: { add: { qty: 4, digits: 2, carryMode: 'carry' } } });
assert(carries.every(q => Number(String(q.a)[0]) + Number(String(q.b)[0]) >= 10 || Number(String(q.a)[1]) + Number(String(q.b)[1]) >= 10));
const borrows = generateConfiguredQuestions({ opsConfig: { sub: { qty: 4, digits: 2, carryMode: 'carry' } } });
assert(borrows.every(q => Number(String(q.a)[1]) < Number(String(q.b)[1]) || Number(String(q.a)[0]) < Number(String(q.b)[0])));
assert.throws(() => validateOpsConfig({ add: { digits: 5 } }), /invalid add digits/);
assert.throws(() => validateOpsConfig({ sub: { carryMode: 'unknown' } }), /invalid sub carry mode/);
assert.doesNotThrow(() => validateOpsConfig({ div: { tables: [3], ranges: [{ table: 3, from: 2, to: 4 }], digits: 4 } }));

console.log('OK generacion por operacion: multiplicacion, division, suma y resta');
