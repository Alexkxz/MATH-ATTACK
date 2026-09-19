const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-folio-'));
try {
  const service = createTestService({ store: createTestStore({ baseDir: dir }) });
  const first = service.create({ description: 'Primera' });
  const second = service.create({ description: 'Segunda' });
  const copy = service.duplicate(first.testId).test;
  assert.strictEqual(first.folio, '0001');
  assert.strictEqual(second.folio, '0002');
  assert.strictEqual(copy.folio, '0003');
  assert.strictEqual(first.title, '0001');
  const finished = service.finishLegacy(second.testId, second.revision + 1, 'prueba de reutilización');
  service.archive(finished.testId, finished.revision + 1);
  const recycled = service.create({ description: 'Folio reutilizado' });
  assert.strictEqual(recycled.folio, '0002', 'el folio archivado debe volver a estar disponible');
  assert.notStrictEqual(first.testId, '0001', 'el UUID interno se conserva como testId técnico');
  assert.strictEqual(service.list({}).every(test => /^\d{4}$/.test(test.folio)), true);
  console.log('OK folios consecutivos: 0001, 0002, 0003; testId interno preservado.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
