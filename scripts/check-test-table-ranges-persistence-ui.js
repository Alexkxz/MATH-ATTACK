'use strict';

const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('maestro.html', 'utf8');

assert(source.includes('mult.matrix=prMatrixSelection(\'mult\')'), 'multiplicación no persiste la matriz');
assert(source.includes('div.matrix=prMatrixSelection(\'div\')'), 'división no persiste la matriz');
assert(source.includes('if(cfg.matrix)prRenderMatrix(op,cfg.matrix)'), 'la carga no rehidrata la matriz guardada');
assert(source.includes('else if(cfg.ranges)prRenderMatrix(op,prMatrixFromRanges(cfg.ranges,cfg.tables))'), 'falta compatibilidad de lectura legacy');
assert(!source.includes('prRenderRanges') && !source.includes('prAddRange'), 'la persistencia no debe depender del editor antiguo');
assert(!source.includes('prRangeTable_mult') && !source.includes('prRangeTable_div'), 'no deben existir controles de rango duplicados');
console.log('check-test-table-ranges-persistence-ui: ok');
