'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');
const { generateConfiguredQuestions } = require('../src/server/exams/studentTestFlowService');
const { validateMatrix } = require('../src/client/maestro/tableRanges');

const html = fs.readFileSync('maestro.html', 'utf8');
assert.match(html, /Array\.from\(\{length:13\}/, 'falta la matriz 13x13');
assert.match(html, /data-row=\"\$\{row\}\" data-col=\"\$\{col\}\"/, 'faltan filas y columnas de la matriz');
assert.match(html, /Seleccionar todo/);
assert.match(html, /Limpiar todo/);
assert.match(html, /pr-matrix-swatch included/);
assert.match(html, /pr-matrix-swatch excluded/);
assert.match(html, /mult\.matrix=prMatrixSelection\('mult'\)/);
assert.match(html, /div\.matrix=prMatrixSelection\('div'\)/);
assert.match(html, /data-matrix-row="\$\{row\}"/);
assert.match(html, /data-matrix-col="\$\{col\}"/);
assert.match(html, /prMatrixToggleRow/);
assert.match(html, /prMatrixToggleColumn/);
assert.match(html, /dataset\.state=state/);
assert(!html.includes('prRangeTable_mult'), 'no debe existir el selector de rangos antiguo');
assert(!html.includes('prRangeFrom_mult'), 'no debe existir el rango minimo antiguo');
assert(!html.includes('prRangeTo_mult'), 'no debe existir el rango maximo antiguo');
assert(!html.includes('prRangeTable_div'), 'no debe existir el selector de division antiguo');
assert(!html.includes('function prAddRange'), 'no debe existir la logica de rangos antigua');
assert(!html.includes('function prRenderRanges'), 'no debe existir el render antiguo de rangos');
assert.match(html, /id="prBuilderNext"[^>]*>Continuar/);
assert.match(html, /id="prBuilderPrevious"[^>]*>Regresar/);
assert.match(html, /id="prStartConfiguredTest"/);
assert.match(html, /previous\.hidden=_prBuilderStep===1/);
assert.match(html, /next\.hidden=_prBuilderStep===5/);
assert.match(html, /start\.hidden=_prBuilderStep!==5/);
assert(!html.includes('prTablesGrid_add'), 'la matriz no debe existir para suma');
assert(!html.includes('prTablesGrid_sub'), 'la matriz no debe existir para resta');
assert.match(fs.readFileSync('src/client/maestro/pruebas.css', 'utf8'), /\.pr-matrix-wrap[^\n]*overflow-x:auto/);

const cells = ['0x0', '0x12', '12x0', '12x12'];
assert.doesNotThrow(() => validateMatrix(cells));
assert.throws(() => validateMatrix(['13x1']), /matrix/);
assert.throws(() => validateMatrix(['1x1', '1x1']), /matrix/);
const questions = generateConfiguredQuestions({ opsConfig: { mult: { matrix: ['2x8', '5x8', '7x3'], manner: 'ordered' } } }, () => 0.1);
assert.deepStrictEqual(questions.map(question => [question.a, question.b]), [[8, 2], [8, 5], [3, 7]], 'solo las celdas verdes deben generar preguntas');
assert.deepStrictEqual(generateConfiguredQuestions({ opsConfig: { mult: { matrix: [] } } }, () => 0.1), [], 'una matriz vacía debe excluir todas las combinaciones');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-config-grid-'));
try {
  const store = createTestStore({ baseDir: dir });
  const service = createTestService({ store });
  const creator = '11111111-1111-4111-8111-111111111111';
  const matrix = ['1x2', '3x2', '12x12'];
  const test = service.create({ title: 'Matriz', creator, configuration: { opsConfig: { mult: { qty: 2, matrix, tables: [2, 12] } } } });
  const saved = service.update(test.testId, 2, { configuration: { opsConfig: { mult: { matrix } } } });
  const reopened = createTestService({ store }).get(test.testId);
  assert.deepStrictEqual(reopened.configuration.opsConfig.mult.matrix, matrix);
  assert.equal(saved.testId, test.testId);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('OK: Configuración conserva matriz 13x13, selección independiente, persistencia y responsive.');
