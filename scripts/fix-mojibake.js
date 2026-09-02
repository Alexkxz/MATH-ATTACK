'use strict';

const fs = require('fs');
const path = require('path');

const CP1252_BYTES = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

const SUSPICIOUS = new Set([
  0x00c3, 0x00c2, 0x00e2, 0x00f0, 0x00c5, 0x0192, 0x00a2,
  0x20ac, 0x2122, 0x017e, 0x0178, 0x0153, 0x0161,
]);

function score(text) {
  let result = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (SUSPICIOUS.has(code) || (code >= 0x80 && code < 0xa0)) result++;
  }
  return result;
}

function canEncode(char) {
  const code = char.codePointAt(0);
  return code <= 0xff || CP1252_BYTES.has(code);
}

function decodeOnce(text) {
  const bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (CP1252_BYTES.has(code)) bytes.push(CP1252_BYTES.get(code));
    else return text;
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
    return score(decoded) < score(text) ? decoded : text;
  } catch {
    return text;
  }
}

function repairRun(text) {
  let repaired = text;
  for (let pass = 0; pass < 8; pass++) {
    const next = decodeOnce(repaired);
    if (next === repaired) break;
    repaired = next;
  }
  return repaired;
}

function repairToken(token) {
  let result = '';
  let run = '';

  const flush = () => {
    if (!run) return;
    result += repairRun(run);
    run = '';
  };

  for (const char of token) {
    if (canEncode(char)) run += char;
    else {
      flush();
      result += char;
    }
  }
  flush();
  return result;
}

function repairText(text) {
  let repaired = text;
  for (let pass = 0; pass < 8; pass++) {
    const next = repaired.replace(/\S+/gu, repairToken);
    if (next === repaired) break;
    repaired = next;
  }
  return repaired;
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const verbose = args.includes('--verbose');
const targets = args.filter(arg => !arg.startsWith('--'));

if (!targets.length) {
  console.error('Uso: node scripts/fix-mojibake.js [--write] <archivo> [archivo...]');
  process.exit(2);
}

for (const target of targets) {
  const absolutePath = path.resolve(target);
  const original = fs.readFileSync(absolutePath, 'utf8');
  const repaired = repairText(original);
  const originalLines = original.split(/\r\n|\r|\n/);
  const repairedLines = repaired.split(/\r\n|\r|\n/);
  const changedLines = originalLines.reduce(
    (total, line, index) => total + (line !== repairedLines[index] ? 1 : 0),
    0,
  );

  if (verbose) {
    originalLines.forEach((line, index) => {
      if (line === repairedLines[index]) return;
      console.log(`${index + 1} ANTES:   ${line}`);
      console.log(`${index + 1} DESPUÉS: ${repairedLines[index]}`);
    });
  }
  if (write && repaired !== original) fs.writeFileSync(absolutePath, repaired, 'utf8');
  const action = write ? 'reparada(s)' : 'cambiarían';
  console.log(`${write ? 'REPARADO' : 'REVISADO'}: ${target} — ${changedLines} línea(s) ${action}.`);
}
