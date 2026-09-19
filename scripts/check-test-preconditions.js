const assert = require('assert');
const { generateConfiguredQuestions } = require('../src/server/exams/studentTestFlowService');
const { validateOpsConfig } = require('../src/client/maestro/tableRanges');

const errors = [];
const check = (name, callback) => {
  try {
    callback();
    console.log(`OK   ${name}`);
  } catch (error) {
    const message = error?.message || String(error);
    errors.push(`${name}: ${message}`);
    console.error(`ERROR ${name}: ${message}`);
  }
};

const validateStartConditions = (configuration = {}) => {
  const opsConfig = configuration.opsConfig;
  if (!opsConfig || typeof opsConfig !== 'object' || !Object.keys(opsConfig).length) {
    throw new Error('debe seleccionarse al menos una operación');
  }
  validateOpsConfig(opsConfig);
  for (const operation of Object.keys(opsConfig)) {
    const config = opsConfig[operation] || {};
    if (['mult', 'div'].includes(operation) && (!Array.isArray(config.tables) || !config.tables.length)) {
      throw new Error(`${operation}: debe seleccionarse al menos una tabla`);
    }
    if (['mult', 'div'].includes(operation) && config.detailMode === true && !Array.isArray(config.matrix)) {
      throw new Error(`${operation}: Más detalle requiere combinaciones seleccionadas`);
    }
    if (['mult', 'div'].includes(operation) && Array.isArray(config.matrix) && !config.matrix.length) {
      throw new Error(`${operation}: Más detalle requiere al menos una combinación`);
    }
  }
  const questions = generateConfiguredQuestions(configuration, () => 0.25);
  if (!questions.length) throw new Error('la configuración no genera reactivos');
  return questions;
};

check('rechaza una prueba sin operaciones', () => {
  assert.throws(() => validateStartConditions({ opsConfig: {} }), /al menos una operación/);
});

check('rechaza multiplicación sin tablas', () => {
  assert.throws(() => validateStartConditions({ opsConfig: { mult: { qty: 4 } } }), /al menos una tabla/);
});

check('rechaza detalle sin combinaciones', () => {
  assert.throws(() => validateStartConditions({ opsConfig: { mult: { tables: [2], qty: 4, detailMode: true, matrix: [] } } }), /al menos una combinación/);
});

check('rechaza combinaciones inválidas', () => {
  assert.throws(() => validateStartConditions({ opsConfig: { mult: { tables: [2], detailMode: true, matrix: ['13x2'] } } }), /matrix/);
});

check('modo rápido genera preguntas por tabla', () => {
  const questions = validateStartConditions({ opsConfig: { mult: { tables: [2, 3], qty: 4, detailMode: false } } });
  assert.strictEqual(questions.length, 8);
  assert(questions.every(question => question.op === '×' && [2, 3].includes(question.a)));
});

check('modo detallado genera únicamente las combinaciones seleccionadas', () => {
  const questions = validateStartConditions({ opsConfig: { mult: { tables: [2, 5], qty: 4, detailMode: true, matrix: ['3x2', '7x5'] } } });
  assert.strictEqual(questions.length, 2);
  assert.deepStrictEqual(questions.map(question => [question.a, question.b]), [[2, 3], [5, 7]]);
});

check('suma y resta cumplen sus configuraciones', () => {
  const questions = validateStartConditions({ opsConfig: {
    add: { qty: 3, digits: 2, carryMode: 'direct' },
    sub: { qty: 2, digits: 2, carryMode: 'both' },
  } });
  assert.strictEqual(questions.length, 5);
  assert.strictEqual(questions.filter(question => question.op === '+').length, 3);
  assert.strictEqual(questions.filter(question => question.op === '−').length, 2);
});

if (errors.length) {
  console.error(`\nFALLÓ el verificador: ${errors.length} condición(es).`);
  process.exit(1);
}
console.log('\nOK: todas las condiciones para generar la prueba se cumplen.');
