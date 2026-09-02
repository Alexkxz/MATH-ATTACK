'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Uso: node scripts/check-utf8.js <archivo> [archivo...]');
  process.exit(2);
}

const decoder = new TextDecoder('utf-8', { fatal: true });
let hasErrors = false;

for (const target of targets) {
  const absolutePath = path.resolve(target);
  const displayPath = path.relative(process.cwd(), absolutePath) || target;

  try {
    const bytes = fs.readFileSync(absolutePath);
    const text = decoder.decode(bytes);
    const replacementIndex = text.indexOf('\uFFFD');

    if (replacementIndex !== -1) {
      const line = text.slice(0, replacementIndex).split(/\r\n|\r|\n/).length;
      console.error(`ERROR: ${displayPath} contiene el carácter de reemplazo U+FFFD en la línea ${line}.`);
      hasErrors = true;
      continue;
    }

    console.log(`OK: ${displayPath} es UTF-8 válido y no contiene U+FFFD.`);
  } catch (error) {
    console.error(`ERROR: ${displayPath}: ${error.message}`);
    hasErrors = true;
  }
}

process.exitCode = hasErrors ? 1 : 0;
