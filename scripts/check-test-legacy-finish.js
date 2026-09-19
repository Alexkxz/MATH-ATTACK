'use strict';
const assert = require('assert');
const { createRoot } = require('../src/server/exams/testModel');
const { createTestService } = require('../src/server/exams/testService');

const root = createRoot();
const store = { load: () => root, save: () => {} };
const service = createTestService({ store });
const test = service.create({ configuration: {} });
const closed = service.finishLegacy(test.testId, test.revision + 1, 'Aplicación anterior al flujo versionado');
assert.equal(closed.status, 'finished');
assert.equal(root.events.at(-1).metadata.legacyRecovery, true);
assert.throws(() => service.finishLegacy(test.testId, closed.revision + 1, 'otra razón'), /solo se pueden cerrar/);
console.log('OK cierre histórico: draft→finished con razón y auditoría.');
