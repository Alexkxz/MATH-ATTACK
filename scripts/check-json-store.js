'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJsonStore } = require('../src/data/jsonStore');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForFileJson(file, expected, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (JSON.stringify(actual) === JSON.stringify(expected)) return;
    } catch (e) {}
    await wait(50);
  }
  throw new Error(`No se persistio el contenido esperado en ${path.basename(file)}`);
}

async function waitForFileJsonMatching(file, predicate, label, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (predicate(actual)) return actual;
    } catch (e) {}
    await wait(50);
  }
  throw new Error(`No se persistio el contenido esperado: ${label}`);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-jsonstore-'));
  const errors = [];
  const logger = {
    err: (...args) => errors.push(args.join(' ')),
    game: () => {},
  };

  try {
    fs.writeFileSync(path.join(tempDir, 'ranking.json'), JSON.stringify([{ id: 'r1', score: 10 }]), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'players.json'), JSON.stringify([{ id: 'p1', name: 'Ana', aureosLog: [{ old: true }] }]), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'aureosLog.json'), JSON.stringify([{ delta: 5 }]), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ adminUsername: 'maestro' }), 'utf8');

    const store = createJsonStore({ baseDir: tempDir, logger });

    const ranking = store.loadRanking();
    if (ranking.length !== 1 || ranking[0].score !== 10) throw new Error('loadRanking no leyo JSON valido');

    const players = store.loadPlayers();
    if (players.length !== 1 || players[0].aureosLog !== undefined) {
      throw new Error('loadPlayers no limpio el campo legado aureosLog');
    }

    const config = store.loadConfig();
    if (config.adminUsername !== 'maestro') throw new Error('loadConfig no leyo config.json');

    store.saveRanking([{ id: 'r2', score: 20 }]);
    await waitForFileJson(store.files.ranking, [{ id: 'r2', score: 20 }]);

    store.savePlayers([{ id: 'p2', name: 'Luis' }]);
    store.savePlayers([{ id: 'p3', name: 'Mia' }]);
    await waitForFileJson(store.files.players, [{ id: 'p3', name: 'Mia' }]);

    store.saveAureosLog([{ playerId: 'p3', delta: 7 }]);
    await waitForFileJson(store.files.aureosLog, [{ playerId: 'p3', delta: 7 }]);

    store.logAureosTx({ id: 'p3', name: 'Mia', grade: '3', aureos: 15 }, 4, 'prueba');
    const log = await waitForFileJsonMatching(
      store.files.aureosLog,
      entries => Array.isArray(entries) && entries.some(entry => entry.reason === 'prueba' && entry.delta === 4 && entry.balance === 15),
      'transaccion de aureos'
    );
    if (!log.some(entry => entry.reason === 'prueba' && entry.delta === 4 && entry.balance === 15)) {
      throw new Error('logAureosTx no persistio la transaccion');
    }

    const flushDir = path.join(tempDir, 'flush');
    fs.mkdirSync(flushDir);
    const flushStore = createJsonStore({ baseDir: flushDir, logger });
    flushStore.saveRanking([{ id: 'sync', score: 99 }]);
    flushStore.flushSync();
    await waitForFileJson(flushStore.files.ranking, [{ id: 'sync', score: 99 }]);

    const missingStore = createJsonStore({ baseDir: path.join(tempDir, 'missing'), logger });
    if (missingStore.loadRanking().length !== 0) throw new Error('archivo inexistente de ranking no devolvio []');
    if (Object.keys(missingStore.loadConfig()).length !== 0) throw new Error('config inexistente no devolvio {}');

    const invalidDir = path.join(tempDir, 'invalid');
    fs.mkdirSync(invalidDir);
    fs.writeFileSync(path.join(invalidDir, 'ranking.json'), '{no-json', 'utf8');
    fs.writeFileSync(path.join(invalidDir, 'players.json'), '{"bad":true}', 'utf8');
    fs.writeFileSync(path.join(invalidDir, 'aureosLog.json'), '{no-json', 'utf8');
    const invalidStore = createJsonStore({ baseDir: invalidDir, logger });
    if (invalidStore.loadRanking().length !== 0) throw new Error('ranking invalido no devolvio []');
    if (invalidStore.loadPlayers().length !== 0) throw new Error('players no arreglo estructura no-array a []');
    if (invalidStore.loadAureosLog().length !== 0) throw new Error('aureosLog invalido no devolvio []');

    console.log('OK: jsonStore lee, escribe, encola escrituras, maneja faltantes/invalidos y flushSync en temporales.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('ERROR:', error.message || error);
  process.exit(1);
});
