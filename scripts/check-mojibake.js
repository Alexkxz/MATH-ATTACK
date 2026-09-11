'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');

const decoder = new TextDecoder('utf-8', { fatal: true });
const suspicious = /[ÃÂâð�]/;
const targets = [
  'maestro.html',
  ...fs.readdirSync(path.join('src', 'client', 'maestro'))
    .filter(name => name.endsWith('.js') && name !== 'textHelpers.js')
    .map(name => path.join('src', 'client', 'maestro', name)),
];

let failed = false;
for (const target of targets) {
  const bytes = fs.readFileSync(target);
  let text;
  try {
    text = decoder.decode(bytes);
  } catch (error) {
    console.error(`ERROR: ${target} no es UTF-8 válido: ${error.message}`);
    failed = true;
    continue;
  }
  if (text.includes('\uFFFD')) {
    console.error(`ERROR: ${target} contiene U+FFFD.`);
    failed = true;
  }
  const inspected = target === 'maestro.html'
    ? text.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    : text;
  const line = inspected.split(/\r\n|\r|\n/).findIndex(value => suspicious.test(value));
  if (line !== -1) {
    console.error(`ERROR: ${target}:${line + 1} conserva mojibake visible o ejecutable.`);
    failed = true;
  }
}

if (!failed) console.log('OK: maestro y módulos frontend no contienen mojibake visible o ejecutable.');
process.exitCode = failed ? 1 : 0;
