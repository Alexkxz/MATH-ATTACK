const assert = require('assert');
const { examGradeMatches } = require('../src/server/exams/gradeMatch');

assert.strictEqual(examGradeMatches('', '1° Grado'), true, 'grado vacío debe significar todos');
assert.strictEqual(examGradeMatches('5° Grado', '5° Grado'), true);
assert.strictEqual(examGradeMatches('5° Grado', '5A'), true);
assert.strictEqual(examGradeMatches('5° Grado', '5B'), true);
assert.strictEqual(examGradeMatches('5° Grado', '4° Grado'), false);
assert.strictEqual(examGradeMatches('5° Grado', ''), false);
console.log('OK filtro de grado: solo coincide el grado seleccionado y vacío significa todos.');
