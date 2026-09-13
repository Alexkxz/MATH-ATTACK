'use strict';

const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('maestro.html', 'utf8');

for (const marker of ['prRangeTable_mult', 'prRangeFrom_mult', 'prRangeTo_mult', 'prRangesList_mult', 'prAddRange', 'prEditRange', 'prRemoveRange', 'MathAttackTableRanges.count']) {
  assert(source.includes(marker), `falta integración UI: ${marker}`);
}
assert(source.includes('data-manner="ordered"') && source.includes('data-manner="random"'), 'faltan opciones de orden');
assert(source.includes('prRangeRepeat_mult'), 'falta opción de repetición');
assert(source.includes('opsConfig[op].ranges'), 'el rango no se envía en opsConfig');
assert(source.includes('opsConfig[op].tables=opsConfig[op].ranges.map'), 'tables no se sincroniza con ranges');
assert(source.includes('window.MathAttackTableRanges.validateRange'), 'la UI no usa el validador compartido');
assert(!source.includes('password"') || source.includes('startPrueba'), 'la revisión de UI no debe introducir credenciales');
console.log('check-table-ranges-ui: ok');
