'use strict';

// End-to-end grade eligibility regression. All writes go to a unique temp
// persistence directory; screenshots use synthetic students only.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { createRoot, createTest, createAssignment, createAttempt } = require('../src/server/exams/testModel');
const { createGroup, createRoot: createGroupRoot } = require('../src/server/groups/groupModel');

const ROOT = path.resolve(__dirname, '..');
const PASSWORD = 'synthetic-grade-eligibility-52d7';
const SINGLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEGACY_ID = 'aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae';
const ALL_ID = 'abababab-abab-4bab-8bab-abababababab';
const EDIT_ID = 'acacacac-acac-4cac-8cac-acacacacacac';
const ACTIVATE_ID = 'adadadad-adad-4dad-8dad-adadadadadad';
const GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEGACY_BAD_ATTEMPT_ID = '99999999-9999-4999-8999-999999999999';
const STUDENTS = {
  five: { id: '11111111-1111-4111-8111-111111111111', name: 'Alumna Ficticia Grado Cinco', pin: '5101', grade: '5\u00b0 Grado A' },
  six: { id: '22222222-2222-4222-8222-222222222222', name: 'Alumno Ficticio Grado Seis Con Nombre Extenso Para Verificar Botones', pin: '6102', grade: '6\u00b0 Grado A' },
  fiveUnassigned: { id: '33333333-3333-4333-8333-333333333333', name: 'Alumno Ficticio Sin Asignar', pin: '5103', grade: '5\u00b0 Grado A' },
  sixSecond: { id: '44444444-4444-4444-8444-444444444444', name: 'Alumna Ficticia Grado Seis', pin: '6104', grade: '6\u00b0 Grado A' },
};
const PERSISTENT = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const VIEWPORTS = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const EVIDENCE_ROOT = path.join(ROOT, 'evidence', 'pruebas-grado-destinatarios');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function hashes() {
  return Object.fromEntries(PERSISTENT.map(name => {
    const filename = path.join(ROOT, name);
    return [name, fs.existsSync(filename) ? crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') : '<missing>'];
  }));
}
function assertHashesSame(before, after) {
  assert.deepEqual(PERSISTENT.filter(name => before[name] !== after[name]), [], 'los siete JSON reales deben conservar su hash');
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
  });
}
function safeRemoveTemp(dir) {
  const base = path.resolve(os.tmpdir()), target = path.resolve(dir), relative = path.relative(base, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing unsafe temporary cleanup: ${target}`);
  fs.rmSync(target, { recursive: true, force: true });
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) {}
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(5000)]);
  if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch (_) {} await new Promise(resolve => child.once('exit', resolve)); }
}
async function launch(dataDir) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: {
    ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dataDir,
    MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'),
    MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'),
    MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log'),
  }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, output: () => output }; } catch (_) {}
    await wait(100);
  }
  await stop(child); throw new Error(`temporary server failed to start${output ? `: ${output}` : ''}`);
}
const api = (base, endpoint, options = {}) => fetch(`${base}${endpoint}`, {
  ...options,
  headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
});
function writeFixtures(dataDir) {
  const root = createRoot();
  const config = {
    version: 1, grade: '', enabledOperations: ['add'], operationOrder: ['add'], order: 'ordered', repeat: false,
    total: 2, answerMode: 'write', allowedAttempts: 2,
    opsConfig: { add: { qty: 2, quantityMode: 'total', digits: 1, simpleDigits: true, carryMode: 'both', manner: 'ordered' } },
  };
  // A clean single-grade test exercises the normal live Verify route.
  root.tests.push(createTest({ testId: SINGLE_ID, title: 'Grado cinco: fixture ficticia', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'active', configuration: { ...config, grade: '5\u00b0 Grado A' } }));
  root.assignments.push(createAssignment({ testId: SINGLE_ID, targetType: 'student', accountPlayerId: STUDENTS.five.id }));
  // This active legacy fixture deliberately contains historical incompatible
  // direct and group assignments; no data is rewritten during recovery.
  root.tests.push(createTest({ testId: LEGACY_ID, title: 'Histórica incompatible: fixture ficticia', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'active', configuration: { ...config, grade: '5\u00b0 Grado A' } }));
  root.assignments.push(createAssignment({ testId: LEGACY_ID, targetType: 'student', accountPlayerId: STUDENTS.five.id }));
  root.assignments.push(createAssignment({ testId: LEGACY_ID, targetType: 'student', accountPlayerId: STUDENTS.six.id }));
  root.assignments.push(createAssignment({ testId: LEGACY_ID, targetType: 'group', groupId: GROUP_ID }));
  root.attempts.push(createAttempt({ attemptId: LEGACY_BAD_ATTEMPT_ID, testId: LEGACY_ID, accountPlayerId: STUDENTS.six.id, status: 'disconnected', origin: 'new', configurationSnapshot: { ...config, grade: '5\u00b0 Grado A' }, progress: { studentSnapshot: { name: STUDENTS.six.name, grade: '5\u00b0 Grado A' }, questions: [{ questionId: '88888888-8888-4888-8888-888888888888', a: 1, b: 1, answer: 2, op: '+' }], answers: [], currentIndex: 0, totalQuestions: 1, correct: 0, incorrect: 0, score: 0 } }));
  root.tests.push(createTest({ testId: ALL_ID, title: 'Todos los grados: fixture ficticia', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'active', configuration: { ...config, grade: '' } }));
  root.assignments.push(createAssignment({ testId: ALL_ID, targetType: 'student', accountPlayerId: STUDENTS.five.id }));
  root.assignments.push(createAssignment({ testId: ALL_ID, targetType: 'student', accountPlayerId: STUDENTS.sixSecond.id }));
  root.assignments.push(createAssignment({ testId: ALL_ID, targetType: 'group', groupId: GROUP_ID }));
  root.tests.push(createTest({ testId: EDIT_ID, title: 'Aviso de grado al editar: fixture ficticia', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'draft', configuration: { ...config, grade: '' } }));
  root.assignments.push(createAssignment({ testId: EDIT_ID, targetType: 'student', accountPlayerId: STUDENTS.five.id }));
  root.assignments.push(createAssignment({ testId: EDIT_ID, targetType: 'student', accountPlayerId: STUDENTS.six.id }));
  root.tests.push(createTest({ testId: ACTIVATE_ID, title: 'Activación incompatible: fixture ficticia', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'draft', configuration: { ...config, grade: '5\u00b0 Grado A' } }));
  root.assignments.push(createAssignment({ testId: ACTIVATE_ID, targetType: 'student', accountPlayerId: STUDENTS.five.id }));
  root.assignments.push(createAssignment({ testId: ACTIVATE_ID, targetType: 'student', accountPlayerId: STUDENTS.six.id }));

  const groupRoot = createGroupRoot();
  groupRoot.groups.push(createGroup({ groupId: GROUP_ID, name: 'Grupo ficticio mixto', grade: '', schoolYear: '2030', memberAccountPlayerIds: [STUDENTS.five.id, STUDENTS.six.id] }));
  const players = Object.values(STUDENTS).map(student => ({ id: student.id, accountPlayerId: student.id, name: student.name, pin: student.pin, grade: student.grade, aureos: 0, experiencia: 0 }));
  const values = {
    'pruebas.json': root, 'players.json': players, 'ranking.json': [], 'groups.json': groupRoot,
    'config.json': { adminUsername: 'admin', adminPassword: PASSWORD }, 'devices.json': [], 'aureosLog.json': [],
  };
  for (const [name, value] of Object.entries(values)) fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value), 'utf8');
}
async function adminPage(browser, base, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(password => { sessionStorage.setItem('maestroAuth', '1'); sessionStorage.setItem('maestroPwd', password); }, PASSWORD);
  await page.goto(`${base}/maestro`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'PRUEBAS' }).click();
  return { context, page, errors };
}
async function studentPage(browser, base, student) {
  const context = await browser.newContext({ viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  const socket = { identified: false, starts: [] };
  page.on('websocket', ws => {
    ws.on('framesent', frame => { try { if (JSON.parse(String(frame.payload)).type === 'player_identify') socket.identified = true; } catch (_) {} });
    ws.on('framereceived', frame => { try { const message = JSON.parse(String(frame.payload)); if (message.type === 'exam_start') socket.starts.push(message); } catch (_) {} });
  });
  await page.goto(`${base}/math-attack.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#loginNameInput').fill(student.name);
  await page.locator('#loginPinDigits .login-pin-digit').first().click();
  await page.keyboard.type(student.pin, { delay: 20 });
  await page.locator('.login-btn-main').click();
  await page.waitForFunction(() => !document.querySelector('#loginScreen')?.classList.contains('active') && document.querySelector('#studentWorkspace'), null, { timeout: 10000 });
  for (let i = 0; i < 50 && !socket.identified; i += 1) await wait(100);
  assert(socket.identified, 'the real student browser must identify over WebSocket');
  return { context, page, socket };
}
async function state(base, testId, action, headers) {
  const response = await api(base, `/api/exams/${testId}`, { headers });
  const data = await response.json();
  assert.equal(response.status, 200, `test ${testId} should be readable`);
  return api(base, `/api/exams/${testId}/state`, { method: 'POST', headers, body: JSON.stringify({ action, revision: data.test.revision + 1, password: PASSWORD }) });
}

(async () => {
  const before = hashes();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-grade-eligibility-'));
  assert(path.relative(ROOT, dataDir).startsWith('..'), 'temporary persistence must be outside project');
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const evidenceDir = path.join(EVIDENCE_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
  if (fs.existsSync(evidenceDir)) throw new Error('Refusing to overwrite prior evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  writeFixtures(dataDir);
  let running, browser, failure;
  const contexts = [];
  try {
    running = await launch(dataDir);
    const auth = await api(running.base, '/api/maestro/auth', { method: 'POST', body: JSON.stringify({ username: 'admin', password: PASSWORD }) });
    assert.equal(auth.status, 200, 'synthetic admin login');
    const cookie = auth.headers.get('set-cookie')?.split(';')[0];
    const adminHeaders = { 'X-Admin-Password': PASSWORD, ...(cookie ? { Cookie: cookie } : {}) };

    // Keep both active tests paused while the synthetic pupils log in, so the
    // next events must be caused by explicit teacher Verify or restart.
    for (const testId of [SINGLE_ID, ALL_ID]) {
      const paused = await state(running.base, testId, 'pause', adminHeaders);
      assert.equal(paused.status, 200, `pause ${testId}`);
    }

    browser = await chromium.launch({ headless: true });
    const five = await studentPage(browser, running.base, STUDENTS.five); contexts.push(five.context);
    const six = await studentPage(browser, running.base, STUDENTS.six); contexts.push(six.context);
    const unassigned = await studentPage(browser, running.base, STUDENTS.fiveUnassigned); contexts.push(unassigned.context);
    const sixSecond = await studentPage(browser, running.base, STUDENTS.sixSecond); contexts.push(sixSecond.context);
    for (const student of [five, six, unassigned, sixSecond]) {
      assert.equal(student.socket.starts.some(message => [SINGLE_ID, ALL_ID].includes(message.config?.testId)), false, 'paused clean fixtures send no early exam_start');
    }
    assert(five.socket.starts.some(message => message.config?.testId === LEGACY_ID), 'active legacy fixture recovers only the compatible assigned pupil at login');
    assert.equal(six.socket.starts.some(message => message.config?.testId === LEGACY_ID), false, 'active legacy fixture does not notify incompatible historical assignee');

    // Direct API writes cannot assign an incompatible pupil or a mixed group
    // to a single-grade test, even though the test uses old seeded assignments.
    const badDirect = await api(running.base, `/api/exams/${ACTIVATE_ID}/assignments`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ assignments: [{ targetType: 'student', accountPlayerId: STUDENTS.six.id }] }) });
    const badDirectBody = await badDirect.json();
    assert(badDirect.status >= 400 && badDirect.status < 500, `direct assignment of incompatible student must be rejected (${badDirect.status})`);
    assert.match(badDirectBody.error || '', /grado|elegible|incompatible/i, 'incompatible student assignment error names the grade constraint');
    const badGroup = await api(running.base, `/api/exams/${ACTIVATE_ID}/assignments`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ assignments: [{ targetType: 'group', groupId: GROUP_ID }] }) });
    const badGroupBody = await badGroup.json();
    assert(badGroup.status >= 400 && badGroup.status < 500, `mixed group must be rejected for specific grade (${badGroup.status})`);
    assert.match(badGroupBody.error || '', /grupo|grado|elegible|incompatible/i, 'mixed group rejection names its incompatible member or grade');
    const editFixture = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8')).tests.find(test => test.testId === EDIT_ID);
    const directConfigChange = await api(running.base, `/api/exams/${EDIT_ID}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ revision: 2, title: editFixture.title, description: '', configuration: { ...editFixture.configuration, grade: '5\u00b0 Grado A' }, assignments: [{ targetType: 'student', accountPlayerId: STUDENTS.five.id }, { targetType: 'student', accountPlayerId: STUDENTS.six.id }] }) });
    assert(directConfigChange.status >= 400 && directConfigChange.status < 500, `direct grade change with incompatible current assignment is rejected atomically (${directConfigChange.status})`);
    const badActivation = await api(running.base, `/api/exams/${ACTIVATE_ID}/state`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'start', revision: 2, password: PASSWORD }) });
    assert(badActivation.status >= 400 && badActivation.status < 500, `activation rejects a pre-existing incompatible assignment (${badActivation.status})`);
    const activationStillDraft = await api(running.base, `/api/exams/${ACTIVATE_ID}`, { headers: adminHeaders }).then(response => response.json());
    assert.equal(activationStillDraft.test.status, 'draft', 'failed activation leaves test state unchanged');

    // The React recipient editor must keep the old incompatible assignment
    // selected, explain the conflict and block save until explicit removal.
    const admin = await adminPage(browser, running.base, VIEWPORTS[3]); contexts.push(admin.context);
    const { page, errors } = admin;
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    const editCard = page.locator('article').filter({ hasText: 'Aviso de grado al editar: fixture ficticia' }).first();
    await editCard.getByRole('button', { name: 'Abrir' }).click();
    const recipients = page.locator('details').filter({ has: page.getByText(/^Destinatarios/) });
    await recipients.waitFor({ state: 'visible' });
    if (!(await recipients.evaluate(node => node.open))) await recipients.locator('summary').click();
    const configuredGrade = page.locator('label').filter({ hasText: /^Grado/ }).locator('select').first();
    await configuredGrade.selectOption('5\u00b0 Grado A');
    const warning = page.locator('[data-grade-eligibility-warning]');
    await warning.waitFor({ state: 'visible' });
    assert.match(await warning.innerText(), /Todos los grados/i, 'warning should explain how to include multiple grades');
    const grid = recipients.locator('[data-recipient-grid]');
    const incompatible = grid.locator('[data-recipient-incompatible]');
    assert(await incompatible.count() >= 1, 'incompatible assignment should be identified in the grid');
    assert.equal(await incompatible.first().getAttribute('aria-disabled'), 'true', 'incompatible button is accessibly blocked');
    assert.equal(await incompatible.first().getAttribute('aria-pressed'), 'true', 'incompatible assignment remains selected until explicit removal');
    const priorIncompatiblePressed = await incompatible.first().getAttribute('aria-pressed');
    assert(await incompatible.first().isDisabled(), 'incompatible recipient is disabled to accessible interactions');
    assert.equal(await page.locator('[data-selected-incompatible-count]').count(), 1, 'selected incompatible count should be visible');
    const save = page.locator('[data-save-draft]');
    assert(await save.isDisabled(), 'save is blocked while selected incompatible recipients remain');
    const selectVisible = recipients.getByRole('button', { name: /Seleccionar elegibles visibles/i });
    const invertVisible = recipients.getByRole('button', { name: /Invertir elegibles visibles/i });
    await selectVisible.click();
    await invertVisible.click();
    assert.equal(await grid.locator('[data-recipient-incompatible]').first().getAttribute('aria-disabled'), 'true', 'bulk actions leave incompatible recipient blocked');
    assert.equal(await grid.locator('[data-recipient-incompatible][aria-pressed="true"]').count(), 1, 'bulk actions do not silently remove an incompatible existing assignment');
    const eligibleKeyboard = grid.locator('[data-recipient-eligible="true"]').filter({ hasText: STUDENTS.five.name }).first();
    assert.equal(await eligibleKeyboard.getAttribute('aria-pressed'), 'false', 'selected state after bulk inversion leaves the target eligible button ready for keyboard test');
    await recipients.getByRole('searchbox', { name: /Buscar alumno por nombre/i }).focus();
    for (let i = 0; i < 12 && !(await eligibleKeyboard.evaluate(node => document.activeElement === node)); i += 1) await page.keyboard.press('Tab');
    assert(await eligibleKeyboard.evaluate(node => document.activeElement === node), 'Tab reaches an eligible recipient button');
    assert(await eligibleKeyboard.evaluate(node => node.matches(':focus-visible')), 'eligible recipient displays keyboard focus');
    await page.keyboard.press('Space');
    assert.equal(await eligibleKeyboard.getAttribute('aria-pressed'), 'true', 'Space selects eligible recipient');
    await page.keyboard.press('Enter');
    assert.equal(await eligibleKeyboard.getAttribute('aria-pressed'), 'false', 'Enter deselects eligible recipient');
    await incompatible.first().focus().catch(() => {});
    if (await incompatible.first().evaluate(node => document.activeElement === node)) {
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
    }
    assert.equal(await incompatible.first().getAttribute('aria-pressed'), priorIncompatiblePressed, 'keyboard cannot toggle incompatible selection');
    await eligibleKeyboard.click();
    assert.equal(await eligibleKeyboard.getAttribute('aria-pressed'), 'true', 'a compatible assignment remains selectable alongside the conflict');

    // Capture the warning first at all requested widths, then let the teacher
    // explicitly remove the incompatible student and save.
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await warning.scrollIntoViewIfNeeded();
      await page.waitForTimeout(50);
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert(metrics.document <= viewport.width, `grade warning view overflows at ${viewport.width}px: ${JSON.stringify(metrics)}`);
      await page.screenshot({ path: path.join(evidenceDir, `grade-warning-${viewport.width}x${viewport.height}.png`), fullPage: false });
    }
    await page.locator('[data-remove-incompatible]').click();
    assert.equal(await grid.locator('[data-recipient-incompatible][aria-pressed="true"]').count(), 0, 'explicit removal clears incompatible selection only');
    assert(!(await save.isDisabled()), 'save becomes available after explicit removal');
    assert.equal(await page.locator('[data-grade-eligibility-warning]').count(), 0, 'incompatibility warning clears after explicit removal');
    await save.click();
    await page.waitForTimeout(300);
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    assert(!saved.assignments.some(item => item.testId === EDIT_ID && item.targetType === 'student' && item.accountPlayerId === STUDENTS.six.id), 'incompatible assignment is removed only after explicit user action');
    assert(saved.assignments.some(item => item.testId === EDIT_ID && item.targetType === 'student' && item.accountPlayerId === STUDENTS.five.id), 'compatible assignment remains selected and saved');
    assert(errors.length === 0, `React page errors: ${errors.join(' | ')}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    await page.locator('article').filter({ hasText: 'Aviso de grado al editar: fixture ficticia' }).getByRole('button', { name: 'Abrir' }).click();
    const reopenedGrid = page.locator('[data-recipient-grid]');
    assert.equal(await reopenedGrid.locator('[data-recipient-eligible="true"]').filter({ hasText: STUDENTS.five.name }).getAttribute('aria-pressed'), 'true', 'compatible assignment survives reload');
    assert.equal(await reopenedGrid.locator('[data-recipient-incompatible="true"]').filter({ hasText: STUDENTS.six.name }).getAttribute('aria-pressed'), 'false', 'explicitly removed incompatible assignment stays removed after reload');

    // Direct student catalog/attempt checks: assignment and configured grade
    // are both required; an eligible but unassigned pupil remains excluded.
    const catalog = async student => student.page.evaluate(async () => { const response = await fetch('/api/student/tests', { credentials: 'same-origin' }); return { status: response.status, body: await response.json() }; });
    for (const student of [five, six, unassigned, sixSecond]) assert.equal((await catalog(student)).status, 200, 'student catalog request succeeds');

    // Resume the two tests after login and exercise the real React Verify UI.
    for (const testId of [SINGLE_ID, ALL_ID]) {
      const resumed = await state(running.base, testId, 'resume', adminHeaders);
      assert.equal(resumed.status, 200, `resume ${testId}`);
    }
    const catalogIds = async student => student.page.evaluate(async () => { const response = await fetch('/api/student/tests', { credentials: 'same-origin' }); const body = await response.json(); return { status: response.status, ids: (body.tests || []).map(row => row.test?.testId).filter(Boolean) }; });
    const catalogFive = await catalogIds(five);
    const catalogSix = await catalogIds(six);
    const catalogUnassigned = await catalogIds(unassigned);
    const catalogSixSecond = await catalogIds(sixSecond);
    assert(catalogFive.ids.includes(SINGLE_ID) && catalogFive.ids.includes(ALL_ID) && catalogFive.ids.includes(LEGACY_ID), 'eligible assigned grade-five student sees each applicable test');
    assert(!catalogSix.ids.includes(SINGLE_ID) && !catalogSix.ids.includes(LEGACY_ID) && catalogSix.ids.includes(ALL_ID), 'grade-six student sees only the all-grades test');
    assert(!catalogUnassigned.ids.includes(SINGLE_ID) && !catalogUnassigned.ids.includes(ALL_ID) && !catalogUnassigned.ids.includes(LEGACY_ID), 'compatible non-assignee sees no test');
    assert(catalogSixSecond.ids.includes(ALL_ID) && !catalogSixSecond.ids.includes(SINGLE_ID) && !catalogSixSecond.ids.includes(LEGACY_ID), 'all-grades catalog uses registered grade and assignment');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    const singleCard = page.locator('article').filter({ hasText: 'Grado cinco: fixture ficticia' }).first();
    await singleCard.getByRole('button', { name: /Verificar/i }).click();
    await page.getByText(/Detalle por alumno/i).waitFor({ state: 'visible' });
    for (let i = 0; i < 40 && five.socket.starts.length === 0; i += 1) await wait(100);
    assert.equal(five.socket.starts.filter(message => message.config?.testId === SINGLE_ID).length, 1, 'assigned compatible pupil receives live exam_start from React Verify');
    assert.equal(six.socket.starts.filter(message => message.config?.testId === SINGLE_ID).length, 0, 'incompatible historical assignment receives no live notice');
    assert.equal(unassigned.socket.starts.filter(message => message.config?.testId === SINGLE_ID).length, 0, 'compatible but unassigned pupil receives no live notice');
    const legacyCard = page.locator('article').filter({ hasText: 'Histórica incompatible: fixture ficticia' }).first();
    await legacyCard.getByRole('button', { name: /Verificar/i }).click();
    await page.getByText(/incompatible|no elegible/i).first().waitFor({ state: 'visible' });
    const verifyResponse = await page.evaluate(async testId => { const response = await fetch(`/api/maestro/tests/${testId}/verify-pending`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: sessionStorage.getItem('maestroPwd') }) }); return { status: response.status, body: await response.json() }; }, LEGACY_ID);
    // Repeated verify is idempotent for notices and categorizes the legacy mismatch.
    assert.equal(verifyResponse.status, 200);
    assert(Number(verifyResponse.body.summary?.ineligible) >= 1, `verification should report incompatible assigned pupil: ${JSON.stringify(verifyResponse.body.summary)}`);
    assert(verifyResponse.body.students.some(item => item.status === 'ineligible'), 'verification report contains explicit ineligible row');
    assert.equal(five.socket.starts.filter(message => message.config?.testId === LEGACY_ID).length, 1, 'verify/recovery does not duplicate the eligible legacy notice');
    assert.equal(six.socket.starts.filter(message => message.config?.testId === LEGACY_ID).length, 0, 'repeated verification keeps incompatible pupil excluded');

    const allCard = page.locator('article').filter({ hasText: 'Todos los grados: fixture ficticia' }).first();
    await allCard.getByRole('button', { name: /Verificar/i }).click();
    for (let i = 0; i < 40 && (sixSecond.socket.starts.length === 0 || !five.socket.starts.some(message => message.config?.testId === ALL_ID)); i += 1) await wait(100);
    assert.equal(five.socket.starts.filter(message => message.config?.testId === ALL_ID).length, 1, 'all-grades test notifies assigned grade-five pupil');
    assert.equal(sixSecond.socket.starts.filter(message => message.config?.testId === ALL_ID).length, 1, 'all-grades test notifies assigned grade-six pupil');
    assert.equal(unassigned.socket.starts.filter(message => message.config?.testId === ALL_ID).length, 0, 'all-grades does not assign everyone automatically');

    // An incompatible direct attempt request is rejected despite a crafted
    // historical assignment; a compatible non-assignee is denied as well.
    const attemptResult = async (student, testId = SINGLE_ID) => student.page.evaluate(async id => { const response = await fetch(`/api/student/tests/${id}/attempts`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade: '5\u00b0 Grado A', accountPlayerId: '11111111-1111-4111-8111-111111111111' }) }); return { status: response.status, body: await response.json() }; }, testId);
    const oldAttemptRead = await six.page.evaluate(async ({ testId, attemptId }) => { const response = await fetch(`/api/student/tests/${testId}/attempts/${attemptId}`, { credentials: 'same-origin' }); return { status: response.status, body: await response.json() }; }, { testId: LEGACY_ID, attemptId: LEGACY_BAD_ATTEMPT_ID });
    assert(oldAttemptRead.status >= 400, `ineligible student cannot continue a historical attempt: ${JSON.stringify(oldAttemptRead)}`);
    const oldAttemptStart = await six.page.evaluate(async ({ testId, attemptId }) => { const response = await fetch(`/api/student/tests/${testId}/attempts/${attemptId}/start`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return { status: response.status, body: await response.json() }; }, { testId: LEGACY_ID, attemptId: LEGACY_BAD_ATTEMPT_ID });
    assert(oldAttemptStart.status >= 400, `ineligible student cannot restart a historical attempt: ${JSON.stringify(oldAttemptStart)}`);
    assert.match(oldAttemptStart.body.error || '', /grado|elegible|asignad/i, 'continuation rejection states grade eligibility');
    const forbiddenSix = await attemptResult(six, LEGACY_ID);
    assert(forbiddenSix.status >= 400, `server rejects incompatible student direct attempt: ${JSON.stringify(forbiddenSix)}`);
    assert.match(forbiddenSix.body.error || '', /grado|asignad|elegible/i, 'incompatible direct rejection explains eligibility');
    const unassignedResult = await attemptResult(unassigned);
    assert(unassignedResult.status >= 400, `compatible but unassigned pupil cannot start: ${JSON.stringify(unassignedResult)}`);
    const eligibleAttempt = await attemptResult(five);
    assert.equal(eligibleAttempt.status, 201, `compatible assigned pupil may start: ${JSON.stringify(eligibleAttempt)}`);
    const eligibleAttemptId = eligibleAttempt.body.attempt?.attemptId;
    assert(eligibleAttemptId, 'eligible attempt returns its stable attempt id');
    const allAttempt = await attemptResult(sixSecond, ALL_ID);
    assert.equal(allAttempt.status, 201, `assigned grade-six pupil may start when test grade is all: ${JSON.stringify(allAttempt)}`);

    // User-facing incoming notice at all requested reference sizes.
    await five.page.locator('#examBannerStep1').waitFor({ state: 'visible', timeout: 5000 });
    for (const viewport of VIEWPORTS) {
      await five.page.setViewportSize(viewport);
      await five.page.locator('#examBannerStep1').scrollIntoViewIfNeeded();
      const metrics = await five.page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, banner: document.querySelector('#examBannerStep1')?.getBoundingClientRect().width }));
      assert(metrics.document <= viewport.width, `student banner overflows at ${viewport.width}px: ${JSON.stringify(metrics)}`);
      await five.page.screenshot({ path: path.join(evidenceDir, `student-notice-${viewport.width}x${viewport.height}.png`), fullPage: false });
    }

    // Stop/restart the real server against the same temporary store. A fresh
    // student login must recover availability using the registered grades;
    // the historical incompatible group/direct assignment stays blocked.
    const beforeRestartRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    const eligibleSnapshotBefore = beforeRestartRoot.attempts.find(attempt => attempt.attemptId === eligibleAttemptId).configurationSnapshot;
    const legacySnapshotBefore = beforeRestartRoot.attempts.find(attempt => attempt.attemptId === LEGACY_BAD_ATTEMPT_ID).configurationSnapshot;
    for (const context of contexts) await context.close().catch(() => {});
    contexts.length = 0;
    await stop(running.child);
    running = await launch(dataDir);
    const recoveredFive = await studentPage(browser, running.base, STUDENTS.five); contexts.push(recoveredFive.context);
    const recoveredSix = await studentPage(browser, running.base, STUDENTS.six); contexts.push(recoveredSix.context);
    for (let i = 0; i < 50 && (!recoveredFive.socket.starts.some(message => message.config?.testId === SINGLE_ID) || !recoveredSix.socket.starts.some(message => message.config?.testId === ALL_ID)); i += 1) await wait(100);
    assert(recoveredFive.socket.starts.some(message => message.config?.testId === SINGLE_ID), 'restart recovery makes the compatible assigned test available');
    assert(recoveredSix.socket.starts.some(message => message.config?.testId === ALL_ID), 'restart recovery still offers the separately assigned all-grades test');
    assert(!recoveredSix.socket.starts.some(message => message.config?.testId === SINGLE_ID) && !recoveredSix.socket.starts.some(message => message.config?.testId === LEGACY_ID), 'restart recovery does not make incompatible assignments available');
    await recoveredFive.page.locator('#examBannerStep1').waitFor({ state: 'visible', timeout: 5000 });
    await recoveredSix.page.locator('#examBannerStep1').waitFor({ state: 'visible', timeout: 5000 });
    const afterRestartRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    assert.deepEqual(afterRestartRoot.attempts.find(attempt => attempt.attemptId === eligibleAttemptId).configurationSnapshot, eligibleSnapshotBefore, 'restart preserves eligible attempt configuration snapshot');
    assert.deepEqual(afterRestartRoot.attempts.find(attempt => attempt.attemptId === LEGACY_BAD_ATTEMPT_ID).configurationSnapshot, legacySnapshotBefore, 'restart preserves incompatible historical snapshot');
    assert(afterRestartRoot.attempts.some(attempt => attempt.attemptId === LEGACY_BAD_ATTEMPT_ID), 'incompatible historical attempt remains stored');

    console.log(`OK: grade eligibility e2e, API/direct access, React warning/removal, live Verify, multi-grade assignments, responsive captures. Evidence: ${evidenceDir}`);
  } catch (error) { failure = error; }
  finally {
    for (const context of contexts) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (running) await stop(running.child);
    assertHashesSame(before, hashes());
    safeRemoveTemp(dataDir);
  }
  if (failure) throw failure;
})().catch(error => { console.error(error); process.exitCode = 1; });
