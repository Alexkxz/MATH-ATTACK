'use strict';

const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('maestro.html', 'utf8');

for (const marker of ['Array.from({length:13}', 'data-matrix-row', 'data-matrix-col', 'prMatrixToggleCell', 'prMatrixToggleRow', 'prMatrixToggleColumn', 'prMatrixSet', 'prMatrixSelection']) {
  assert(source.includes(marker), `falta integración UI de matriz: ${marker}`);
}
for (const marker of ['prRangeTable_mult', 'prRangeFrom_mult', 'prRangeTo_mult', 'prRangesList_mult', 'prAddRange', 'prEditRange', 'prRemoveRange']) {
  assert(!source.includes(marker), `sigue visible la lógica antigua de rangos: ${marker}`);
}
assert(source.includes('data-manner="ordered"') && source.includes('data-manner="random"'), 'faltan opciones de orden');
assert(source.includes('prMatrixSet(op,sel)'), 'faltan controles globales de selección');
assert(source.includes('mult.matrix=prMatrixSelection'), 'la matriz de multiplicación no es fuente de verdad');
assert(source.includes('div.matrix=prMatrixSelection'), 'la matriz de división no es fuente de verdad');
assert(!source.includes('prTablesGrid_add') && !source.includes('prTablesGrid_sub'), 'la matriz no debe existir para suma ni resta');
console.log('check-table-ranges-ui: ok');
