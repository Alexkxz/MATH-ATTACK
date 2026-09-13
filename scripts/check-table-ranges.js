'use strict';

const assert = require('assert');
const { validateMultiplierConfig, multipliersForTable, count } = require('../src/client/maestro/tableRanges');

function expectError(fn, text) {
  assert.throws(fn, error => error instanceof Error && error.message.includes(text));
}

const config = { tables: [8], ranges: [{ table: 8, from: 1, to: 5 }], manner: 'ordered' };
assert.deepStrictEqual(multipliersForTable(config, 8), [1, 2, 3, 4, 5]);
assert.strictEqual(count(config), 5);
assert(multipliersForTable(config, 8).every(value => value >= 1 && value <= 5));
assert.deepStrictEqual(multipliersForTable({ ...config, manner: 'random' }, 8, () => 0.1).sort((a, b) => a - b), [1, 2, 3, 4, 5]);

const several = { tables: [6, 8, 9], ranges: [{ table: 6, from: 1, to: 10 }, { table: 8, from: 1, to: 5 }, { table: 9, from: 4, to: 9 }] };
assert.strictEqual(count(several), 21);
assert.deepStrictEqual(multipliersForTable(several, 9), [4, 5, 6, 7, 8, 9]);
expectError(() => validateMultiplierConfig({ ranges: [{ table: 8, from: 5, to: 1 }] }), 'from');
expectError(() => validateMultiplierConfig({ ranges: [{ table: 8, from: 1.5, to: 5 }] }), 'from');
expectError(() => validateMultiplierConfig({ ranges: [{ table: 8, from: -1, to: 5 }] }), 'range out of bounds');
expectError(() => validateMultiplierConfig({ ranges: [{ table: 8, from: 1, to: 5 }, { table: 8, from: 6, to: 7 }] }), 'duplicate table');
expectError(() => validateMultiplierConfig({ tables: [8], ranges: [{ table: 9, from: 1, to: 5 }] }), 'tables and ranges do not match');
assert.deepStrictEqual(multipliersForTable({ tables: [8], qty: 4 }, 8), null);
assert.deepStrictEqual(multipliersForTable({ ...config, repeat: true, qty: 7 }, 8), [1, 2, 3, 4, 5, 1, 2]);
console.log('check-table-ranges: ok');
