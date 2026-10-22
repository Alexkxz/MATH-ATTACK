'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const builtHtml = path.join(root, 'src', 'client', 'maestro', 'ui-build', 'index.html');
const servedHtml = path.join(root, 'maestro.html');

if (!fs.existsSync(builtHtml)) {
  throw new Error('No existe el HTML compilado de React; ejecuta primero el build de maestro.');
}

const html = fs.readFileSync(builtHtml, 'utf8').trimEnd() + '\n';
fs.writeFileSync(servedHtml, html, 'utf8');
process.stdout.write('maestro.html actualizado desde ui-build/index.html\n');
