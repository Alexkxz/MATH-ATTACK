'use strict';

// Focused React division configurator E2E. Server data and student fixture are temporary.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { generateConfiguredQuestions } = require('../src/server/exams/studentTestFlowService');

const ROOT = path.resolve(__dirname, '..');
const PERSISTENT_FILES = new Set(['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json']);
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'evidence', '.runtime', 'temp', 'ranking-ui-build', 'panel del maestro']);
const ADMIN_PASSWORD = 'synthetic-division-ui-admin-45c2';
const STUDENT = { id: '81818181-8181-4818-8818-818181818181', name: 'Alumno ficticio División', pin: '4816', grade: '5A' };
const FILES = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const VIEWPORTS = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashes = () => Object.fromEntries(FILES.map(name => {
  const file = path.join(ROOT, name);
  return [name, fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '<missing>'];
}));
function copyProjectWithoutLocalData(projectCopy) {
  fs.cpSync(ROOT, projectCopy, { recursive: true, filter(source) {
    if (path.resolve(source) === ROOT) return true;
    let stat;
    try { stat = fs.lstatSync(source); } catch (_) { return false; }
    if (stat.isSymbolicLink()) return false;
    const relative = path.relative(ROOT, source);
    const parts = relative.split(path.sep);
    if (parts.some(part => EXCLUDED_DIRS.has(part))) return false;
    const basename = path.basename(source);
    if (PERSISTENT_FILES.has(basename)) return false;
    if (/^\.env(?:\.|$)/i.test(basename)) return false;
    if (/\.log(?:\.|$)/i.test(basename) || /(?:^|[-.])log(?:[-.]|$)/i.test(basename)) return false;
    if (/\.tmp$/i.test(basename)) return false;
    return true;
  } });
  for (const forbidden of ['.git', 'node_modules', 'evidence', '.runtime', ...PERSISTENT_FILES]) {
    assert.equal(fs.existsSync(path.join(projectCopy, forbidden)), false, `project copy must exclude ${forbidden}`);
  }
}
function installWriteTrace(instrumentPath, tracePath) {
  const source = String.raw`'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const traceFile = process.env.MATH_ATTACK_WRITE_TRACE_PATH;
const rawAppendFileSync = fs.appendFileSync.bind(fs);
function safePath(value) {
  if (typeof value === 'string') return value;
  if (value instanceof URL) return fileURLToPath(value);
  return null;
}
function isPersistentJson(value) {
  const file = safePath(value);
  return Boolean(file && /\.json(?:\.|$)/i.test(path.basename(file)));
}
function callerFrame() {
  const own = path.resolve(__filename).toLowerCase();
  return (new Error().stack || '').split('\n').slice(2).map(line => line.trim())
    .find(line => !line.toLowerCase().includes(own) && !line.includes('node:internal')) || 'unknown';
}
function record(operation, from, to) {
  if (!isPersistentJson(from) && !isPersistentJson(to)) return;
  const row = { operation, from: safePath(from), to: safePath(to), caller: callerFrame() };
  rawAppendFileSync(traceFile, JSON.stringify(row) + '\n', { encoding: 'utf8' });
}
for (const name of ['writeFile', 'writeFileSync', 'rename', 'renameSync', 'copyFile', 'copyFileSync']) {
  const original = fs[name];
  fs[name] = function(...args) {
    const twoPaths = name.startsWith('rename') || name.startsWith('copyFile');
    record(name, args[0], twoPaths ? args[1] : null);
    return original.apply(this, args);
  };
}
const promises = fs.promises;
for (const name of ['writeFile', 'rename', 'copyFile']) {
  const original = promises[name].bind(promises);
  promises[name] = function(...args) {
    const twoPaths = name === 'rename' || name === 'copyFile';
    record('promises.' + name, args[0], twoPaths ? args[1] : null);
    return original(...args);
  };
}
`;
  fs.writeFileSync(instrumentPath, source, 'utf8');
  fs.writeFileSync(tracePath, '', 'utf8');
}
function pathInside(directory, candidate) {
  const absolute = path.resolve(candidate);
  const relative = path.relative(path.resolve(directory), absolute);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
const freePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer(); socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(error => error ? reject(error) : resolve(port)); });
});
const removeTemp = dir => {
  const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Unsafe temp cleanup blocked: ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
};
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) { /* already stopped */ }
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    try { child.kill('SIGKILL'); } catch (_) { /* best effort */ }
    await new Promise(resolve => child.once('exit', resolve));
  }
}
async function launch(dataDir, projectCopy, instrumentPath, tracePath) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  for (const file of [dataDir, path.join(dataDir, 'pruebas.json'), path.join(dataDir, 'groups.json'), path.join(dataDir, 'server.log'), tracePath]) {
    const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(file));
    assert(rel && !rel.startsWith('..') && !path.isAbsolute(rel), `server route must be under the OS temp directory: ${file}`);
  }
  // NODE_OPTIONS is parsed by Node itself; forward slashes avoid Windows
  // backslash escaping while the quoted path remains safe if TEMP has spaces.
  const preloadPath = path.resolve(instrumentPath).replace(/\\/g, '/');
  const instrumentOption = `--require="${preloadPath}"`;
  const child = spawn(process.execPath, ['server.js'], { cwd: projectCopy, windowsHide: true, env: {
    ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dataDir,
    MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'),
    MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'),
    MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log'),
    MATH_ATTACK_WRITE_TRACE_PATH: tracePath,
    NODE_OPTIONS: instrumentOption,
    NODE_PATH: process.env.MATH_ATTACK_NODE_MODULES || path.join(ROOT, 'node_modules'),
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base }; } catch (_) { /* starting */ }
    await wait(100);
  }
  await stop(child); throw new Error(`Temporary server failed to start${output ? `: ${output}` : ''}`);
}
function fixture(dir) {
  for (const [name, value] of Object.entries({
    'pruebas.json': { schemaVersion: 1, tests: [], attempts: [], results: [], events: [] },
    'players.json': [{ id: STUDENT.id, accountPlayerId: STUDENT.id, name: STUDENT.name, pin: STUDENT.pin, grade: STUDENT.grade, aureos: 0, experiencia: 0 }],
    'ranking.json': [], 'groups.json': { schemaVersion: 1, groups: [] },
    'config.json': { adminUsername: 'admin', adminPassword: ADMIN_PASSWORD },
    'devices.json': [], 'aureosLog.json': [],
  })) fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
}
function generate(cfg, answerMode = 'write', seed = 0.271) {
  let state = seed;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  return generateConfiguredQuestions({ enabledOperations: ['div'], answerMode, repeat: true, opsConfig: { div: cfg } }, random);
}
function assertDivisionRows(rows, { dividendDigits, divisorDigits, condition, concreteDivisors }) {
  assert(rows.length > 0, 'division generator should return questions');
  for (const q of rows) {
    assert.notEqual(q.b, 0, 'divisor must never be zero');
    assert.equal(String(q.a).length, dividendDigits, 'dividend must use configured digit count');
    if (divisorDigits !== null) assert.equal(String(q.b).length, divisorDigits, 'divisor must use configured digit count');
    if (concreteDivisors) assert(concreteDivisors.includes(q.b), 'specific mode must preserve the selected divisors');
    if (q.answer !== undefined) assert.equal(q.answer, Math.floor(q.a / q.b), 'quotient must match the operands');
    assert.equal(q.remainder, q.a % q.b, 'remainder must match the operands');
    if (condition === 'exact') assert.equal(q.remainder, 0, 'exact mode must produce exact divisions');
    if (condition === 'remainder') assert(q.remainder > 0, 'remainder mode must produce a non-zero remainder');
  }
}
const digitButton = (div, kind, value) => div.locator(`[data-division-digits="${kind}"][data-value="${value}"]`);
const conditionButton = (div, value) => div.locator(`[data-division-condition="${value}"]`);

(async () => {
  const before = hashes();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-division-run-'));
  assert(path.relative(ROOT, tempRoot).startsWith('..'), 'temporary project copy and fixtures must stay outside the workspace');
  const projectCopy = path.join(tempRoot, 'project');
  const dataDir = path.join(tempRoot, 'data');
  const instrumentPath = path.join(dataDir, 'trace-writes.cjs');
  const tracePath = path.join(dataDir, 'json-write-trace.ndjson');
  let runDir;
  let running, browser, studentContext, completed = false;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    copyProjectWithoutLocalData(projectCopy);
    installWriteTrace(instrumentPath, tracePath);
    fixture(dataDir);
    const evidenceRoot = path.join(ROOT, 'evidence', 'pruebas-division-react');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    runDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(runDir, { recursive: false });
    running = await launch(dataDir, projectCopy, instrumentPath, tracePath);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(password => { sessionStorage.setItem('maestroAuth', '1'); sessionStorage.setItem('maestroPwd', password); }, ADMIN_PASSWORD);
    await page.goto(`${running.base}/maestro`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.getByRole('button', { name: /Nueva prueba/ }).click();
    const operation = page.locator('[data-operation="div"]');
    await operation.click();
    const div = page.locator('[data-operation-config="div"]');
    const qty = div.getByLabel('Cantidad de preguntas');
    await qty.fill('6');

    // Concrete divisors, including an additional divisor, must survive modality changes.
    const divisorMode = div.locator('[data-division-mode]');
    await divisorMode.selectOption('specific');
    const concrete = div.locator('fieldset').filter({ hasText: 'Divisores concretos' });
    for (const label of await concrete.locator('label').all()) {
      const text = (await label.innerText()).trim();
      const value = Number(text);
      const input = label.locator('input[type="checkbox"]');
      if (!Number.isInteger(value)) continue;
      const shouldBeSelected = [3, 7].includes(value);
      if ((await input.isChecked()) !== shouldBeSelected) await input.click();
    }
    await concrete.getByPlaceholder('Ej. 15, 24').fill('13');
    await digitButton(div, 'dividend', 3).click();
    const advanced = div.locator('[data-division-advanced]');
    await advanced.locator('summary').click();
    await conditionButton(div, 'exact').click();
    assert.equal(await digitButton(div, 'dividend', 3).getAttribute('aria-pressed'), 'true');
    const exactSpecific = generate({ qty: 6, divisorMode: 'specific', divisors: [3, 7, 13], dividendDigits: 3, remainderMode: 'exact' });
    assertDivisionRows(exactSpecific, { dividendDigits: 3, divisorDigits: null, condition: 'exact', concreteDivisors: [3, 7, 13] });
    await div.screenshot({ path: path.join(runDir, 'divisor-specific-390x844.png') });

    // Switch to digit-based divisors, then back, without losing custom selections.
    await divisorMode.selectOption('digits');
    await digitButton(div, 'divisor', 2).click();
    assert.equal(await digitButton(div, 'divisor', 2).getAttribute('aria-pressed'), 'true');
    const exactByDigits = generate({ qty: 6, divisorMode: 'digits', divisorDigits: 2, dividendDigits: 3, remainderMode: 'exact' });
    assertDivisionRows(exactByDigits, { dividendDigits: 3, divisorDigits: 2, condition: 'exact' });
    await divisorMode.selectOption('specific');
    assert(await concrete.locator('input[type="checkbox"]').count() >= 12, 'specific divisor choices should remain present');
    for (const value of [3, 7]) assert(await concrete.locator('label').filter({ hasText: new RegExp(`^\\s*${value}\\s*$`) }).locator('input').isChecked(), `specific divisor ${value} must remain selected`);
    assert.equal(await concrete.getByPlaceholder('Ej. 15, 24').inputValue(), '13', 'additional divisor must survive switching modes');
    await divisorMode.selectOption('digits');

    // Keyboard activation and visible focus on the divisor-digit buttons.
    const keyboardDigit = digitButton(div, 'divisor', 3);
    await keyboardDigit.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert(await keyboardDigit.evaluate(element => element.matches(':focus-visible')), 'digit button should expose keyboard focus');
    await page.keyboard.press('Space');
    assert.equal(await keyboardDigit.getAttribute('aria-pressed'), 'true', 'digit choice should respond to Space');
    await keyboardDigit.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(runDir, 'division-keyboard-focus-390x844.png'), fullPage: false });
    await digitButton(div, 'divisor', 2).click();

    // Conditions are held inside Advanced and expose incompatibilities without rewriting answer mode.
    await conditionButton(div, 'remainder').click();
    assert.equal(await conditionButton(div, 'remainder').getAttribute('aria-pressed'), 'true');
    assert(await div.locator('[data-division-summary]').innerText().then(text => /residuo/i.test(text)), 'active condition should appear in the division summary');
    await advanced.locator('summary').click();
    assert.equal(await conditionButton(div, 'remainder').getAttribute('aria-pressed'), 'true', 'folding Advanced should preserve the selected condition');
    await advanced.locator('summary').click();
    await div.locator('[data-division-condition="mixed"]').click();
    assert.equal(await conditionButton(div, 'mixed').getAttribute('aria-pressed'), 'true');
    await conditionButton(div, 'remainder').click();

    const application = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Aplicación' }) });
    await application.locator('summary').click();
    const answerMode = application.locator('label').filter({ hasText: 'Forma de respuesta' }).locator('select');
    await answerMode.selectOption('options');
    const incompatible = page.getByRole('alert').filter({ hasText: /opciones.*solo admiten divisiones exactas/i });
    assert.equal(await incompatible.count(), 1, 'options plus remainder should show an incompatibility message');
    assert.equal(await answerMode.inputValue(), 'options', 'validation must not change answer mode automatically');
    await incompatible.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(runDir, 'validation-options-390x844.png'), fullPage: false });
    await answerMode.selectOption('voice');
    const voiceIncompatible = page.getByRole('alert').filter({ hasText: /voz.*no admite divisiones con residuo/i });
    assert.equal(await voiceIncompatible.count(), 1, 'voice plus remainder should show an incompatibility message');
    assert.equal(await answerMode.inputValue(), 'voice', 'voice selection must remain unchanged while incompatible');
    await voiceIncompatible.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(runDir, 'validation-voice-390x844.png'), fullPage: false });
    await answerMode.selectOption('write');
    assert.equal(await page.getByRole('alert').filter({ hasText: /no admite divisiones con residuo|solo admiten divisiones exactas/i }).count(), 0, 'written answers should allow remainder mode');

    // Capture both closed/open Advanced states and each reference viewport.
    await page.screenshot({ path: path.join(runDir, 'advanced-open-390x844.png'), fullPage: false });
    await advanced.locator('summary').click();
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport); await div.scrollIntoViewIfNeeded(); await page.waitForTimeout(80);
      const geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
      assert(geometry.documentWidth <= geometry.width, `page overflow at ${viewport.width}: ${JSON.stringify(geometry)}`);
      await page.screenshot({ path: path.join(runDir, `division-${viewport.width}x${viewport.height}.png`), fullPage: false });
    }

    // Turning division off and on must retain the active mode and selections.
    await operation.click();
    assert.equal(await page.locator('[data-operation-config="div"]').count(), 0, 'disabled division should hide its section');
    await operation.click();
    const restoredDiv = page.locator('[data-operation-config="div"]');
    assert.equal(await restoredDiv.locator('[data-division-mode]').inputValue(), 'digits');
    assert.equal(await digitButton(restoredDiv, 'divisor', 2).getAttribute('aria-pressed'), 'true');
    assert.equal(await conditionButton(restoredDiv, 'remainder').getAttribute('aria-pressed'), 'true');

    await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    const savedCard = page.locator('article').filter({ hasText: /6 preguntas\s*·\s*0 asignaciones/ });
    await savedCard.getByRole('button', { name: 'Abrir' }).click();
    const store = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    assert.equal(store.tests.length, 1, 'the single temporary draft should be stored');
    const savedTest = store.tests[0], cfg = savedTest.configuration.opsConfig.div;
    assert.deepEqual({ mode: cfg.divisorMode, dividend: cfg.dividendDigits, divisor: cfg.divisorDigits, condition: cfg.remainderMode, answerMode: savedTest.configuration.answerMode }, { mode: 'digits', dividend: 3, divisor: 2, condition: 'remainder', answerMode: 'write' });
    const reopenedDiv = page.locator('[data-operation-config="div"]');
    assert.equal(await reopenedDiv.locator('[data-division-mode]').inputValue(), 'digits');
    assert.equal(await digitButton(reopenedDiv, 'dividend', 3).getAttribute('aria-pressed'), 'true');
    assert.equal(await digitButton(reopenedDiv, 'divisor', 2).getAttribute('aria-pressed'), 'true');
    assert.equal(await conditionButton(reopenedDiv, 'remainder').getAttribute('aria-pressed'), 'true');

    // Assign and start with a fake student, then inspect the live attempt's immutable snapshot/questions.
    const recipientsSection = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Destinatarios' }) });
    if (!(await recipientsSection.evaluate(element => element.open))) await recipientsSection.locator('summary').click();
    const recipient = page.locator('[data-recipient-student]').filter({ hasText: STUDENT.name });
    assert.equal(await recipient.count(), 1, 'temporary student should appear in React recipients');
    await recipient.click();
    assert.equal(await recipient.getAttribute('aria-pressed'), 'true');
    studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`${running.base}/math-attack.html`, { waitUntil: 'domcontentloaded' });
    await studentPage.locator('#loginNameInput').fill(STUDENT.name);
    await studentPage.locator('#loginPinDigits .login-pin-digit').evaluateAll((inputs, pin) => inputs.forEach((input, index) => { input.value = pin[index]; input.dispatchEvent(new Event('input', { bubbles: true })); }), STUDENT.pin);
    await studentPage.locator('.login-btn-main').click();
    await studentPage.waitForSelector('#step1Screen.active', { timeout: 10000 });
    await page.locator('[data-save-start]').click();
    await page.getByText('Prueba iniciada en el juego.').waitFor({ timeout: 15000 });
    await studentPage.waitForSelector('#examBannerStep1 .exam-apply-btn', { timeout: 15000 });
    await studentPage.locator('#examBannerStep1 .exam-apply-btn').click();
    await studentPage.waitForSelector('#gameScreen.active', { timeout: 15000 });
    const catalog = await studentPage.evaluate(async () => { const response = await fetch('/api/student/tests', { credentials: 'same-origin' }); return { status: response.status, body: await response.json() }; });
    assert.equal(catalog.status, 200);
    const row = catalog.body.tests.find(item => item.test.testId === savedTest.testId);
    assert(row?.attempt, 'real student entry should create a live attempt');
    assert.deepEqual({ mode: row.attempt.configurationSnapshot.opsConfig.div.divisorMode, dividend: row.attempt.configurationSnapshot.opsConfig.div.dividendDigits, divisor: row.attempt.configurationSnapshot.opsConfig.div.divisorDigits, condition: row.attempt.configurationSnapshot.opsConfig.div.remainderMode }, { mode: 'digits', dividend: 3, divisor: 2, condition: 'remainder' }, 'attempt snapshot should match reopened configuration');
    const questions = row.attempt.progress.questions;
    assert.equal(questions.length, 6, 'live attempt should contain configured question count');
    assert(questions.every(question => question.answer === undefined), 'student catalog should not expose answer keys');
    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    const internalAttempt = persisted.attempts.find(attempt => attempt.testId === savedTest.testId && attempt.accountPlayerId === STUDENT.id);
    assert(internalAttempt?.progress?.questions, 'temporary persistence should retain server-side generated questions');
    assertDivisionRows(internalAttempt.progress.questions, { dividendDigits: 3, divisorDigits: 2, condition: 'remainder' });
    completed = true;
  } finally {
    if (studentContext) await studentContext.close();
    if (browser) await browser.close();
    if (running) await stop(running.child);
    try {
      const traceRows = fs.existsSync(tracePath) ? fs.readFileSync(tracePath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [];
      const escapedRows = traceRows.filter(row => [row.from, row.to].filter(Boolean).some(file => !pathInside(dataDir, path.isAbsolute(file) ? file : path.resolve(projectCopy, file))));
      assert.equal(escapedRows.length, 0, `server JSON persistence escaped its temp data directory: ${JSON.stringify(escapedRows)}`);
      const after = hashes();
      const changedFiles = FILES.filter(name => before[name] !== after[name]);
      if (changedFiles.length) console.warn(`Workspace JSON changed during the run (concurrency/unattributed): ${changedFiles.join(', ')}`);
      else console.log('Workspace persistent JSON hashes: unchanged');
      console.log(`Temporary server JSON write trace (paths and caller only): ${JSON.stringify(traceRows)}`);
      if (completed) console.log(`OK: React division both divisor modes, condition buttons, validation, save/reopen and synthetic live attempt. Evidence: ${runDir}`);
    } finally {
      removeTemp(tempRoot);
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
