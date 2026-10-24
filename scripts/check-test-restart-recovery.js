'use strict';

// Real HTTP/process restart regression with only synthetic data under os.tmpdir().
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { createRoot, createTest, createAssignment, createAttempt, createResult } = require('../src/server/exams/testModel');

const ROOT = path.resolve(__dirname, '..');
const TEST_ADMIN_PASSWORD = 'test-only-admin-password-9f28b3';
const CLOCK_PRELOAD = path.join(os.tmpdir(), `math-attack-fake-clock-${process.pid}.cjs`);
const CREATOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const IDS = {
  active: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  pausedTest: 'abababab-abab-4bab-8bab-abababababab',
  never: '11111111-1111-4111-8111-111111111111',
  advanced: '22222222-2222-4222-8222-222222222222',
  finished: '33333333-3333-4333-8333-333333333333',
  closed: '44444444-4444-4444-8444-444444444444',
  unassigned: '55555555-5555-4555-8555-555555555555',
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const widths = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const freePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const port = socket.address().port;
    socket.close(error => error ? reject(error) : resolve(port));
  });
});
const safeRemoveTemp = dir => {
  const temp = path.resolve(os.tmpdir());
  const target = path.resolve(dir);
  const relative = path.relative(temp, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing unsafe temp cleanup: ${target}`);
  fs.rmSync(target, { recursive: true, force: true });
};

async function launch(dataDir, fakeNow) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${CLOCK_PRELOAD}`.trim(),
      MATH_ATTACK_FAKE_NOW: String(fakeNow),
      MATH_ATTACK_DATA_PATH: dataDir,
      MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'),
      MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'),
      MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let index = 0; index < 80; index += 1) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, output: () => output };
    } catch (_) { /* server still starting */ }
    await wait(100);
  }
  await stop(child, false);
  throw new Error(`Server did not start${output ? `\n${output}` : ''}`);
}

async function stop(child, orderly) {
  if (!child || child.exitCode !== null) return;
  try { child.kill(orderly ? 'SIGINT' : 'SIGKILL'); } catch (_) { /* process may already have exited */ }
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    wait(5000),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    try { child.kill('SIGKILL'); } catch (_) { /* best effort after timeout */ }
    await new Promise(resolve => child.once('exit', resolve));
  }
}

function fixture(dataDir, baseNow) {
  const root = createRoot();
  const configuration = {
    version: 1, grade: '5A', multiplier: 2, total: 2, allowedAttempts: 2,
    timeLimit: 120, timePerQuestion: 30,
    opsConfig: { mult: { qty: 2, tables: [2], ranges: [{ table: 2, from: 3, to: 4 }] } },
  };
  const active = createTest({ testId: IDS.active, title: 'Reinicio activo ficticio', creator: CREATOR, status: 'active', configuration });
  const pausedTest = createTest({ testId: IDS.pausedTest, title: 'Prueba pausada ficticia', creator: CREATOR, status: 'paused', configuration });
  root.tests.push(active, pausedTest);
  for (const accountPlayerId of [IDS.never, IDS.advanced, IDS.finished, IDS.closed]) {
    root.assignments.push(createAssignment({ testId: IDS.active, targetType: 'student', accountPlayerId }));
  }
  root.assignments.push(createAssignment({ testId: IDS.pausedTest, targetType: 'student', accountPlayerId: IDS.never }));
  const questions = [
    { questionId: '66666666-6666-4666-8666-666666666666', a: 2, b: 3, answer: 6, op: '×', status: 'correct' },
    { questionId: '77777777-7777-4777-8777-777777777777', a: 2, b: 4, answer: 8, op: '×', status: 'pending' },
  ];
  const attempt = createAttempt({
    attemptId: '88888888-8888-4888-8888-888888888888', testId: IDS.active,
    accountPlayerId: IDS.advanced, status: 'in_progress', origin: 'new',
    configurationSnapshot: configuration, startedAt: new Date(baseNow - 60000).toISOString(),
    progress: {
      studentSnapshot: { name: 'Avance Ficticio', grade: '5A' }, questions,
      answers: [{ questionId: questions[0].questionId, answer: 6, corrected: true }],
      currentIndex: 1, totalQuestions: 2, correct: 1, incorrect: 0, score: 2,
      timeLeft: 23, questionElapsedMs: 7200, globalRemainingMs: 83000,
      timeSavedAt: new Date(baseNow).toISOString(),
    },
  });
  const finished = createAttempt({ testId: IDS.active, accountPlayerId: IDS.finished, status: 'finished', origin: 'new', configurationSnapshot: configuration, finishedAt: new Date(baseNow - 10000).toISOString(), progress: { studentSnapshot: { name: 'Termino Ficticio', grade: '5A' }, totalQuestions: 2, currentIndex: 2, answers: [{ questionId: questions[0].questionId, corrected: true }, { questionId: questions[1].questionId, corrected: false }], correct: 1, incorrect: 1 } });
  const paused = createAttempt({ testId: IDS.active, accountPlayerId: IDS.closed, status: 'paused', origin: 'teacher', configurationSnapshot: configuration, progress: { studentSnapshot: { name: 'Pausado Ficticio', grade: '5A' }, currentIndex: 0, questions, answers: [], timeLeft: 45, questionElapsedMs: 1200, globalRemainingMs: 90000, timeSavedAt: new Date(baseNow).toISOString() } });
  root.attempts.push(attempt, finished, paused);
  root.results.push(createResult({ testId: IDS.active, attemptId: finished.attemptId, accountPlayerId: IDS.finished, score: 2, correct: 1, incorrect: 1, total: 2, complete: true }));
  root.rewardSettlements = [{ testId: IDS.active, accountPlayerId: IDS.closed, status: 'pending', attemptId: paused.attemptId }];
  for (const [file, data] of Object.entries({
    'pruebas.json': root,
    'players.json': [
      [IDS.never, 'Sin comenzar'], [IDS.advanced, 'Avance Ficticio'], [IDS.finished, 'Termino Ficticio'],
      [IDS.closed, 'Pausado Ficticio'], [IDS.unassigned, 'No asignado'],
    ].map(([id, name], index) => ({ id, name, pin: String(4100 + index), grade: '5A', aureos: 0, experiencia: 0 })),
    'groups.json': { schemaVersion: 1, groups: [] },
    'config.json': { adminUsername: 'admin', adminPassword: TEST_ADMIN_PASSWORD },
    'ranking.json': [], 'aureosLog.json': [], 'devices.json': [],
  })) fs.writeFileSync(path.join(dataDir, file), JSON.stringify(data), 'utf8');
  return { root, attemptId: attempt.attemptId, questions };
}

async function login(base, name, pin) {
  const response = await fetch(`${base}/api/student/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pin }) });
  assert.strictEqual(response.status, 200, `fake student login failed for ${name}`);
  return response.headers.get('set-cookie').split(';')[0];
}
const call = (base, url, options = {}, cookie = '') => fetch(`${base}${url}`, {
  ...options,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) },
});

async function verifyPanelVisuals(base) {
  const evidenceDir = path.resolve(process.env.MATH_ATTACK_UI_EVIDENCE_DIR || path.join(os.tmpdir(), `math-attack-pruebas5-visual-${process.pid}`));
  const relative = path.relative(ROOT, evidenceDir);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Visual evidence directory must be outside the project.');
  if (fs.existsSync(evidenceDir)) throw new Error(`Visual evidence directory already exists; refusing to overwrite: ${evidenceDir}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let scenario = 'pending';
  let requestCount = 0;
  const reports = {
    pending: { ok: true, summary: { assigned: 42, finished: 0, pending: 42, open: 18, notStarted: 24, closed: 0, alreadyAvailable: 0, restored: 18, offline: 24, paused: 0, unrecovered: 0 }, students: Array.from({ length: 42 }, (_, i) => ({ displayName: `Alumno ficticio ${String(i + 1).padStart(2, '0')} con nombre compuesto para validar el ajuste adaptable`, status: i < 18 ? 'restored' : 'offline', detail: i < 18 ? 'Disponibilidad restablecida; se intentó enviar el aviso.' : 'Quedará disponible la próxima vez que el alumno entre.' })) },
    none: { ok: true, summary: { assigned: 42, finished: 40, pending: 0, open: 0, notStarted: 0, closed: 2, alreadyAvailable: 0, restored: 0, offline: 0, paused: 0, unrecovered: 0 }, students: [] },
    paused: { ok: true, summary: { assigned: 1, finished: 0, pending: 1, open: 1, notStarted: 0, closed: 0, alreadyAvailable: 0, restored: 0, offline: 0, paused: 1, unrecovered: 0 }, students: [{ displayName: 'Alumno con prueba pausada ficticia', status: 'paused', detail: 'La prueba sigue pausada por el maestro.' }] },
  };
  try {
    const page = await browser.newPage({ viewport: widths[0] });
    await page.route('**/verify-pending', async route => {
      requestCount += 1;
      if (scenario === 'error') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Fallo ficticio del servidor' }) });
        return;
      }
      await wait(scenario === 'pending' ? 350 : 40);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reports[scenario]) });
    });
    await page.goto(`${base}/maestro`, { waitUntil: 'networkidle' });
    await page.locator('input[type="text"]').first().fill('admin');
    await page.locator('input[type="password"]').first().fill(TEST_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.waitForTimeout(3600); // let the normal login toast clear before capturing the report
    const verifyButton = page.getByRole('button', { name: /Verificar|Verificando/ }).first();
    await verifyButton.waitFor({ state: 'visible' });
    const expectedText = { pending: 'Detalle por alumno (42)', none: 'No hay alumnos pendientes', paused: 'Pausados por el docente: 1', error: 'No se pudo completar la verificación' };
    for (const viewport of widths) {
      await page.setViewportSize(viewport);
      for (const name of ['pending', 'none', 'paused', 'error']) {
        scenario = name;
        if (name === 'pending') requestCount = 0;
        const pendingRequest = name === 'pending' ? page.waitForRequest(request => request.url().includes('/verify-pending'), { timeout: 5000 }) : null;
        await verifyButton.click();
        if (name === 'pending') {
          await pendingRequest;
          try {
            await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.getAttribute('aria-busy') === 'true' && button.disabled), null, { timeout: 3000 });
          } catch (_) {
            const diagnostic = await page.locator('button').allTextContents();
            throw new Error(`verification pending state was not exposed; requests=${requestCount}; buttons=${JSON.stringify(diagnostic.slice(-12))}`);
          }
          assert(await verifyButton.isDisabled(), 'verify button must be disabled while the request is pending');
        }
        await page.getByText(expectedText[name], { exact: false }).waitFor({ state: 'visible', timeout: 10000 });
        if (name === 'pending') {
          assert.strictEqual(requestCount, 1, 'double activation must not issue duplicate verify requests');
          await page.getByText('Detalle por alumno (42)', { exact: false }).click();
          await page.getByText('Alumno ficticio 42 con nombre compuesto para validar el ajuste adaptable', { exact: true }).waitFor({ state: 'visible' });
          const listScroll = await page.locator('article').filter({ hasText: 'Reinicio activo ficticio' }).locator('details ul').evaluate(element => ({ height: element.clientHeight, contentHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }));
          assert(listScroll.contentHeight > listScroll.height && ['auto', 'scroll'].includes(listScroll.overflowY), 'long pending roster should scroll within its own list');
        }
        if (name === 'paused') {
          await page.getByText('Detalle por alumno (1)', { exact: false }).click();
          await page.getByText('Pausado por el docente', { exact: true }).waitFor({ state: 'visible' });
        }
        const metrics = await page.evaluate(() => ({
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        }));
        assert(metrics.documentWidth <= metrics.viewport, `${name} at ${viewport.width}px causes document horizontal overflow (${metrics.documentWidth}px)`);
        const buttonBox = await verifyButton.boundingBox();
        assert(buttonBox && buttonBox.height >= 40, `verify action is too small for touch at ${viewport.width}px`);
        const file = path.join(evidenceDir, `${name}-${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path: file, fullPage: true });
        if (name === 'pending') {
          await verifyButton.focus();
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          assert(await verifyButton.evaluate(element => element.matches(':focus-visible')), `verify button lacks keyboard-visible focus at ${viewport.width}px`);
        }
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'PRUEBAS' }).click();
        await page.getByRole('button', { name: /Verificar|Verificando/ }).first().waitFor({ state: 'visible' });
      }
    }
    console.log(`OK: panel React Playwright 5 tamaños × 4 estados, overflow táctil/teclado; evidencia ficticia externa: ${evidenceDir}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-test-restart-'));
  const relative = path.relative(ROOT, dir);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Temporary data unexpectedly resides inside the project.');
  const baseNow = Date.UTC(2026, 0, 2, 12, 0, 0);
  fs.writeFileSync(CLOCK_PRELOAD, [
    "'use strict';",
    'const NativeDate = Date;',
    'const fixed = () => Number(process.env.MATH_ATTACK_FAKE_NOW);',
    'global.Date = class TestDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed()])); } static now() { return fixed(); } };',
  ].join('\n'));
  const state = fixture(dir, baseNow);
  let running;
  try {
    running = await launch(dir, baseNow);
    // First session confirms the active assignment and a pending student before restart.
    const neverCookie = await login(running.base, 'Sin comenzar', '4100');
    let catalog = await call(running.base, '/api/student/tests', {}, neverCookie).then(response => response.json());
    assert(catalog.tests.some(row => row.test.testId === IDS.active && row.availability === 'available'), 'assigned student should see active test before restart');
    const created = await call(running.base, `/api/student/tests/${IDS.active}/attempts`, { method: 'POST', body: '{}' }, neverCookie);
    assert.strictEqual(created.status, 201, 'starting an attempt after restart should remain possible');
    const newAttemptId = (await created.json()).attempt.attemptId;
    const repeated = await call(running.base, `/api/student/tests/${IDS.active}/attempts`, { method: 'POST', body: '{}' }, neverCookie);
    assert.strictEqual((await repeated.json()).attempt.attemptId, newAttemptId, 'repeated create must return same open attempt, not duplicate');
    await stop(running.child, true);

    // Orderly shutdown, then 72 hours off: persisted timers must not consume downtime.
    running = await launch(dir, baseNow + 72 * 60 * 60 * 1000);
    const advancedCookie2 = await login(running.base, 'Avance Ficticio', '4101');
    catalog = await call(running.base, '/api/student/tests', {}, advancedCookie2).then(response => response.json());
    let resumedRow = catalog.tests.find(row => row.test.testId === IDS.active);
    assert(resumedRow, 'partially completed active test should survive orderly process restart in student catalogue');
    assert.strictEqual(resumedRow.attempt.attemptId, state.attemptId, 'must preserve the same attempt');
    await stop(running.child, false);
    running = await launch(dir, baseNow + 144 * 60 * 60 * 1000);
    const advancedCookie = await login(running.base, 'Avance Ficticio', '4101');
    catalog = await call(running.base, '/api/student/tests', {}, advancedCookie).then(response => response.json());
    resumedRow = catalog.tests.find(row => row.test.testId === IDS.active);
    assert(resumedRow, 'partially completed active test should survive abrupt process restart in student catalogue');
    assert.strictEqual(resumedRow.attempt.attemptId, state.attemptId, 'must preserve the same attempt after crash');
    const readAttempt = await call(running.base, `/api/student/tests/${IDS.active}/attempts/${state.attemptId}`, {}, advancedCookie);
    assert.strictEqual(readAttempt.status, 200);
    const recovered = (await readAttempt.json()).attempt;
    assert.strictEqual(recovered.progress.currentIndex, 1);
    assert.deepStrictEqual(recovered.progress.answers, [{ questionId: state.questions[0].questionId, answer: 6, corrected: true }]);
    assert.deepStrictEqual(recovered.progress.questions.map(q => q.questionId), state.questions.map(q => q.questionId), 'question order and identity must be stable');
    assert.deepStrictEqual(recovered.progress.answers.map(answer => [answer.questionId, answer.corrected]), [[state.questions[0].questionId, true]], 'answer bar correctness state must be stable');
    assert.strictEqual(recovered.progress.timeLeft, 23, 'server downtime must not subtract from question timer');
    assert.strictEqual(recovered.progress.questionElapsedMs, 7200, 'server downtime must not advance question elapsed time');
    assert.strictEqual(recovered.progress.globalRemainingMs, 83000, 'server downtime must not subtract from global timer');

    // Verification is admin-only, repeatable, and must not mutate completed/closed records.
    const query = `?pwd=${encodeURIComponent(TEST_ADMIN_PASSWORD)}`;
    const noAuth = await call(running.base, `/api/maestro/tests/${IDS.active}/verify-pending`, { method: 'POST' });
    assert.strictEqual(noAuth.status, 401, 'verification must require administrator authorization');
    const verifyUrl = `/api/maestro/tests/${IDS.active}/verify-pending${query}`;
    const firstVerify = await call(running.base, verifyUrl, { method: 'POST', body: '{}' });
    assert.strictEqual(firstVerify.status, 200, `verification route must work: ${firstVerify.status}`);
    const first = await firstVerify.json();
    assert(first.ok && first.summary && Array.isArray(first.students), 'verification result contract is incomplete');
    assert.strictEqual(first.summary.assigned, 4, 'verifier must only count current explicit assignments');
    assert.strictEqual(first.summary.finished, 1, 'finished attempt remains excluded even with another allowed attempt');
    assert.strictEqual(first.summary.closed, 1, 'settlement-closed participation remains excluded');
    assert.strictEqual(first.summary.pending, 2, 'only the no-start and in-progress students are pending');
    const second = await call(running.base, verifyUrl, { method: 'POST', body: '{}' }).then(response => response.json());
    assert.deepStrictEqual(second.summary, first.summary, 'repeated verification should be idempotent');
    const finishedAfter = JSON.parse(fs.readFileSync(path.join(dir, 'pruebas.json'), 'utf8'));
    assert.strictEqual(finishedAfter.attempts.length, 4, 'verification must not create attempts');
    assert.strictEqual(finishedAfter.attempts.filter(row => row.accountPlayerId === IDS.finished && row.status === 'finished').length, 1, 'verification must not duplicate or alter the finished attempt');
    assert.strictEqual(finishedAfter.results.filter(row => row.accountPlayerId === IDS.finished).length, 1, 'verification must not duplicate finished results');
    assert.strictEqual(finishedAfter.rewardSettlements.filter(row => row.accountPlayerId === IDS.closed && row.status === 'pending').length, 1, 'verification must not reopen a settlement-closed participation');
    assert.strictEqual(finishedAfter.tests.find(row => row.testId === IDS.pausedTest).status, 'paused', 'verification must not resume a paused test');

    const unassignedCookie = await login(running.base, 'No asignado', '4104');
    const rejected = await call(running.base, `/api/student/tests/${IDS.active}/attempts`, { method: 'POST', body: '{}' }, unassignedCookie);
    assert.strictEqual(rejected.status, 403, 'verification must not grant access to unassigned students');
    await verifyPanelVisuals(running.base);
    console.log('OK: reinicios reales ordenado y abrupto, recuperación automática de catálogo/progreso, 144h de apagado simuladas con reloj controlado, timers, idempotencia, autorización y exclusiones con persistencia temporal.');
  } finally {
    await stop(running?.child, true);
    safeRemoveTemp(dir);
    try { fs.rmSync(CLOCK_PRELOAD, { force: true }); } catch (_) { /* best-effort temp-only cleanup */ }
  }
})().catch(error => { console.error(error); process.exit(1); });
