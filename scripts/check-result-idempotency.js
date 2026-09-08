'use strict';

const assert = require('assert');
const { createResultIdempotency } = require('../src/server/ws/resultIdempotency');

const idempotency = createResultIdempotency();
assert.strictEqual(idempotency.hasProcessedResult('game-1'), false);
assert.strictEqual(idempotency.markResultProcessed('game-1'), true);
assert.strictEqual(idempotency.hasProcessedResult('game-1'), true);
assert.strictEqual(idempotency.hasProcessedResult('game-2'), false);
assert.strictEqual(idempotency.hasProcessedResult(undefined), false);

let attempts = 0;
const retryKey = 'retry-1';
function processAfterControlledError() {
  if (idempotency.hasProcessedResult(retryKey)) return false;
  attempts++;
  if (attempts === 1) throw new Error('controlled test failure');
  idempotency.markResultProcessed(retryKey);
  return true;
}
assert.throws(() => processAfterControlledError(), /controlled test failure/);
assert.strictEqual(idempotency.hasProcessedResult(retryKey), false);
assert.strictEqual(processAfterControlledError(), true);
assert.strictEqual(processAfterControlledError(), false);
assert.strictEqual(attempts, 2);
assert.strictEqual(idempotency.clearProcessedResult('retry-1'), true);
assert.strictEqual(idempotency.hasProcessedResult('retry-1'), false);
console.log('OK: idempotencia usa id, permite reintento tras error y no bloquea ids ausentes o distintos.');
