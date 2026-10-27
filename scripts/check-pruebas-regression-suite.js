'use strict';

// Reproducible, serialized regression suite for Modo Pruebas.
// It runs a working-tree copy under os.tmpdir(), with synthetic root stores.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PERSISTENT = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'evidence', '.runtime', 'temp', 'ranking-ui-build', 'panel del maestro']);
const FAKE_PLAYER = { id: 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', accountPlayerId: 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', name: 'Alumna ficticia regresión', pin: '2468', grade: '5A', aureos: 0, experiencia: 0 };
const CHECKS = [
  ['configuración matemática', 'check-math-test-configurations.js'],
  ['modos de multiplicación', 'check-test-multiplication-modes.js'],
  ['generación por operación', 'check-student-test-operation-generation.js'],
  ['matriz dirigida de generadores', 'check-test-math-regression.js'],
  ['contrato de identidad alumno', 'check-student-auth-contract.js'],
  ['adaptador de identidad histórica', 'check-legacy-identity-adapter.js'],
  ['configurador React de multiplicación', 'check-test-multiplication-react-ui.js'],
  ['configuradores React de suma y resta', 'check-test-add-sub-ui.js'],
  ['configurador React de división', 'check-test-division-react-ui.js'],
  ['recorrido React maestro–alumno', 'check-pruebas-react-student-e2e.js'],
  ['recuperación tras reinicio', 'check-test-restart-recovery.js'],
  ['Verificar en vivo', 'check-test-verify-live-e2e.js'],
  ['latido WebSocket de prueba', 'check-exam-websocket-heartbeat.js'],
  ['servicio de checkpoints', 'check-test-checkpoints-service.js'],
  ['regresión de checkpoints', 'check-test-checkpoint-regression.js'],
  ['endpoints de checkpoint', 'check-test-checkpoint-endpoints.js'],
  ['checkpoints generales', 'check-checkpoints.js'],
  ['checkpoint y guardado de resultado', 'check-checkpoint-save-result-flow.js'],
  ['recuperación de prueba alumno', 'check-student-test-recovery.js'],
  ['endpoints de checkpoint con alumno ficticio', 'check-test-checkpoint-endpoints.js'],
  ['endpoints de configuración de prueba', 'check-test-endpoints.js'],
  ['sesión HTTP de alumno', 'check-student-http-session.js'],
  ['intentos desde endpoints', 'check-test-attempts.js'],
  ['intentos, asignaciones y reinicio', 'check-test-attempts-regression.js'],
  ['acciones de intento', 'check-test-attempt-actions.js'],
  ['regresión de acciones de intento', 'check-test-attempt-actions-regression.js'],
  ['máquina de estados pausados', 'check-test-state-machine-paused.js'],
  ['pruebas simultáneas', 'check-simultaneous-exams.js'],
  ['elegibilidad por grado', 'check-test-grade-eligibility-e2e.js'],
  ['servicio de asignaciones de grupo', 'check-group-assignment.js'],
  ['destinatarios en vivo', 'check-test-audience-live.js'],
  ['supervisión HTTP', 'check-test-supervision-endpoints.js'],
  ['supervisión en vivo', 'check-test-supervision-live.js'],
  ['intentos y servicio oficial', 'check-official-attempt-service.js'],
  ['endpoints de intentos oficiales', 'check-official-attempt-endpoints.js'],
  ['contrato de recompensas', 'check-test-official-reward-contract.js'],
  ['servicio de recompensas', 'check-official-reward-service.js'],
  ['recuperación de recompensas', 'check-official-reward-recovery.js'],
  ['endpoints de recompensas', 'check-official-reward-endpoints.js'],
  ['PRUEBAS.7 ciclo temporal, archivo y borradores', 'check-pruebas7-regression.js'],
  ['PRUEBAS.7 interfaz React y navegador', 'check-pruebas7-react-ui.js'],
  ['PRUEBAS.7 recorrido maestro-alumno real', 'check-pruebas7-live-e2e.js'],
  ['cierre del último intento', 'check-test-last-attempt-closure.js'],
  ['flujo integral de prueba y liquidación', 'check-test-end-to-end.js'],
  ['acciones UI de intentos oficiales', 'check-official-attempt-ui.js'],
  ['acciones UI de recompensas', 'check-official-reward-ui.js'],
];

function hashPersistentFiles() {
  return Object.fromEntries(PERSISTENT.map(name => {
    const file = path.join(ROOT, name);
    return [name, fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '<missing>'];
  }));
}

function writeSyntheticStores(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const stores = {
    'pruebas.json': { schemaVersion: 1, tests: [], assignments: [], attempts: [], checkpoints: [], results: [], events: [], rewardEvents: [], rankingPublications: [] },
    'players.json': [FAKE_PLAYER],
    'ranking.json': [],
    'groups.json': { schemaVersion: 1, groups: [], events: [] },
    'config.json': { adminUsername: 'admin', adminPassword: 'admin' },
    'devices.json': [],
    'aureosLog.json': [],
  };
  for (const [name, value] of Object.entries(stores)) fs.writeFileSync(path.join(directory, name), JSON.stringify(value), 'utf8');
}

function copyProject(destination) {
  fs.cpSync(ROOT, destination, { recursive: true, filter(source) {
    if (path.resolve(source) === ROOT) return true;
    let stat;
    try { stat = fs.lstatSync(source); } catch (_) { return false; }
    if (stat.isSymbolicLink()) return false;
    const relative = path.relative(ROOT, source);
    if (relative.split(path.sep).some(part => EXCLUDED_DIRS.has(part))) return false;
    const basename = path.basename(source);
    if (PERSISTENT.includes(basename) && path.dirname(path.resolve(source)) === ROOT) return false;
    if (/^\.env(?:\.|$)/i.test(basename) || /\.log(?:\.|$)/i.test(basename) || /\.tmp$/i.test(basename)) return false;
    return true;
  } });
  assert.equal(fs.existsSync(path.join(destination, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(destination, '.git')), false);
  for (const name of PERSISTENT) assert.equal(fs.existsSync(path.join(destination, name)), false, `real ${name} must not enter test copy`);
}

function copyEvidence(projectCopy, runId) {
  const target = path.join(ROOT, 'evidence', 'pruebas-regression', runId);
  const sources = [
    ['project', path.join(projectCopy, 'evidence')],
    ['external', path.join(path.dirname(projectCopy), 'evidence')],
  ].filter(([, source]) => fs.existsSync(source));
  if (!sources.length) return null;
  fs.mkdirSync(target, { recursive: true });
  for (const [name, source] of sources) fs.cpSync(source, path.join(target, name), { recursive: true });
  return target;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function assertTempPath(directory) {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(directory));
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `test workspace must remain under OS temp: ${directory}`);
}

async function main() {
  const before = hashPersistentFiles();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-pruebas-regression-'));
  assertTempPath(tempRoot);
  assert(!pathInside(ROOT, tempRoot), 'test workspace must be outside repository');
  const projectCopy = path.join(tempRoot, 'project');
  const dataDir = path.join(tempRoot, 'data');
  const results = [];
  let evidencePath = null;
  try {
    copyProject(projectCopy);
    writeSyntheticStores(projectCopy);
    writeSyntheticStores(dataDir);
    for (const [label, script] of CHECKS) {
      const absoluteScript = path.join(projectCopy, 'scripts', script);
      if (!fs.existsSync(absoluteScript)) {
        results.push({ label, script, status: 'OMITIDO', detail: 'script no encontrado en el árbol de trabajo' });
        continue;
      }
      // Reset synthetic project-level stores before each check so checks are independent.
      writeSyntheticStores(projectCopy);
      writeSyntheticStores(dataDir);
      const evidenceDir = path.join(tempRoot, 'evidence', `${String(CHECKS.findIndex(row => row[1] === script)).padStart(2, '0')}-${path.basename(script, '.js')}`);
      const env = {
        ...process.env,
        PORT: String(await freePort()),
        NODE_PATH: [path.join(ROOT, 'node_modules'), process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter),
        MATH_ATTACK_NODE_MODULES: path.join(ROOT, 'node_modules'),
        MATH_ATTACK_DATA_PATH: dataDir,
        MATH_ATTACK_TESTS_PATH: path.join(projectCopy, 'pruebas.json'),
        MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'),
        MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log'),
        MATH_ATTACK_UI_EVIDENCE_DIR: evidenceDir,
      };
      const started = Date.now();
      const run = spawnSync(process.execPath, [absoluteScript], { cwd: projectCopy, env, encoding: 'utf8', timeout: 240000, maxBuffer: 12 * 1024 * 1024, windowsHide: true });
      const output = `${run.stdout || ''}${run.stderr || ''}`.trim();
      const status = run.error ? 'FALLÓ' : run.status === 0 ? 'APROBADO' : 'FALLÓ';
      const result = { label, script, status, seconds: Math.round((Date.now() - started) / 100) / 10, detail: run.error ? run.error.message : output };
      results.push(result);
      console.log(`${status}: ${label}${result.seconds ? ` (${result.seconds}s)` : ''}`);
      if (status === 'FALLÓ' && output) console.log(output.split(/\r?\n/).slice(-12).join('\n'));
    }
    evidencePath = copyEvidence(projectCopy, runId);
  } finally {
    const after = hashPersistentFiles();
    const changed = PERSISTENT.filter(name => before[name] !== after[name]);
    if (changed.length) console.warn(`Los hashes del proyecto variaron durante la ejecución; posible escritura concurrente no atribuida: ${changed.join(', ')}`);
    else console.log('JSON persistentes del proyecto: hashes sin cambios.');
    if (evidencePath) console.log(`Evidencias ficticias copiadas a: ${evidencePath}`);
    const failures = results.filter(row => row.status === 'FALLÓ');
    const omitted = results.filter(row => row.status === 'OMITIDO');
    console.log(`Resumen: ${results.length - failures.length - omitted.length} aprobados, ${failures.length} fallidos, ${omitted.length} omitidos de ${CHECKS.length}.`);
    console.log('Copia temporal eliminada tras completar la batería; el registro detallado permanece en la salida del comando.');
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(tempRoot));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe temp cleanup blocked: ${tempRoot}`);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    if (failures.length || omitted.length) process.exitCode = 1;
  }
}

function pathInside(directory, candidate) {
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
