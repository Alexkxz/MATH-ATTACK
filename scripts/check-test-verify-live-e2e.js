'use strict';

// End-to-end verification announcement test. All server persistence is isolated
// in a unique OS temp directory; browser screens and project-data hashes are local.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { createRoot, createTest, createAssignment, createAttempt, createResult } = require('../src/server/exams/testModel');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_ROOT = path.join(ROOT, 'evidence', 'pruebas5-live');
const ADMIN_PASSWORD = 'synthetic-live-test-admin-5f4f';
const TEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAUSED_ID = 'abababab-abab-4bab-8bab-abababababab';
const IDS = { never: '11111111-1111-4111-8111-111111111111', advanced: '22222222-2222-4222-8222-222222222222', finished: '33333333-3333-4333-8333-333333333333', unassigned: '44444444-4444-4444-8444-444444444444' };
const HASH_FILES = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const VIEWPORTS = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashProjectData = () => Object.fromEntries(HASH_FILES.map(name => {
  const file = path.join(ROOT, name);
  return [name, fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase() : '<MISSING>'];
}));
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); }); });
const safeRemoveTemp = dir => {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing unsafe temp cleanup: ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
};
async function launch(dataDir) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
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
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, output: () => output }; } catch (_) { /* starting */ }
    await wait(100);
  }
  await stop(child);
  throw new Error(`Server failed to start${output ? `: ${output}` : ''}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) { /* exited already */ }
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    try { child.kill('SIGKILL'); } catch (_) { /* best effort */ }
    await new Promise(resolve => child.once('exit', resolve));
  }
}
const call = (base, url, options = {}, cookie = '') => fetch(`${base}${url}`, {
  ...options,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) },
});
function fixture(dir) {
  const root = createRoot();
  const cfg = { version: 1, grade: '', multiplier: 2, total: 3, allowedAttempts: 2, timeLimit: 300, timePerQuestion: 120, answerMode: 'write', opsConfig: { mult: { qty: 3, tables: [2], ranges: [{ table: 2, from: 3, to: 5 }] } } };
  const active = createTest({ testId: TEST_ID, title: 'Prueba ficticia con título largo para comprobar la invitación del alumno', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'active', configuration: cfg });
  const paused = createTest({ testId: PAUSED_ID, title: 'Pausa docente ficticia', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'paused', configuration: cfg });
  root.tests.push(active, paused);
  for (const id of [IDS.never, IDS.advanced, IDS.finished]) root.assignments.push(createAssignment({ testId: TEST_ID, targetType: 'student', accountPlayerId: id }));
  root.assignments.push(createAssignment({ testId: PAUSED_ID, targetType: 'student', accountPlayerId: IDS.never }));
  const questions = [
    { questionId: '66666666-6666-4666-8666-666666666666', a: 2, b: 3, table: 2, answer: 6, op: '×', status: 'correct' },
    { questionId: '77777777-7777-4777-8777-777777777777', a: 2, b: 4, table: 2, answer: 8, op: '×', status: 'pending' },
    { questionId: '88888888-8888-4888-8888-888888888888', a: 2, b: 5, table: 2, answer: 10, op: '×', status: 'pending' },
  ];
  const advancedName = 'Avance Ficticio con Nombre Compuesto Largo para Revisar el Ajuste';
  const advancing = createAttempt({ attemptId: '99999999-9999-4999-8999-999999999999', testId: TEST_ID, accountPlayerId: IDS.advanced, status: 'in_progress', origin: 'new', configurationSnapshot: cfg, startedAt: new Date('2026-01-01T12:00:00.000Z').toISOString(), progress: { studentSnapshot: { name: advancedName, grade: '5A' }, questions, answers: [{ questionId: questions[0].questionId, answer: 6, corrected: true }], currentIndex: 1, totalQuestions: 3, correct: 1, incorrect: 0, score: 2, timeLeft: 90, questionElapsedMs: 7200, globalRemainingMs: 240000, timeSavedAt: new Date('2026-01-01T12:00:00.000Z').toISOString() } });
  const completed = createAttempt({ testId: TEST_ID, accountPlayerId: IDS.finished, status: 'finished', origin: 'new', configurationSnapshot: cfg, finishedAt: new Date().toISOString(), progress: { studentSnapshot: { name: 'Terminó Ficticio', grade: '5A' }, totalQuestions: 3, currentIndex: 3, correct: 3, incorrect: 0 } });
  root.attempts.push(advancing, completed);
  root.results.push(createResult({ testId: TEST_ID, attemptId: completed.attemptId, accountPlayerId: IDS.finished, score: 6, correct: 3, incorrect: 0, total: 3, complete: true }));
  const names = [[IDS.never, 'Sin comenzar Ficticio'], [IDS.advanced, advancedName], [IDS.finished, 'Terminó Ficticio'], [IDS.unassigned, 'No asignado Ficticio']];
  for (const [name, data] of Object.entries({
    'pruebas.json': root,
    'players.json': names.map(([id, playerName], index) => ({ id, name: playerName, pin: String(5100 + index), grade: '5A', aureos: 0, experiencia: 0 })),
    'ranking.json': [], 'groups.json': { schemaVersion: 1, groups: [] }, 'config.json': { adminUsername: 'admin', adminPassword: ADMIN_PASSWORD },
    'devices.json': [], 'aureosLog.json': [],
  })) fs.writeFileSync(path.join(dir, name), JSON.stringify(data), 'utf8');
  return { questions, attemptId: advancing.attemptId, advancedName };
}

async function openStudent(browser, base, id, name, pin) {
  const context = await browser.newContext({ viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  const socketState = { identified: false, examStarts: [], sessionUpdates: [] };
  page.on('websocket', socket => {
    socket.on('framesent', frame => {
      try {
        const message = JSON.parse(String(frame.payload));
        if (message.type === 'player_identify') socketState.identified = true;
        if (message.type === 'session_update') socketState.sessionUpdates.push({ isExam: message.isExam === true, timeLeft: Number(message.timeLeft) || 0, questionElapsedMs: Number(message.questionElapsedMs) || 0, qIndex: Number(message.qIndex) || 0, examStartedAt: Number(message.examStartedAt) || 0 });
      } catch (_) { /* non-JSON frame */ }
    });
    socket.on('framereceived', frame => {
      try { const message = JSON.parse(String(frame.payload)); if (message.type === 'exam_start') socketState.examStarts.push(message); } catch (_) { /* non-JSON frame */ }
    });
  });
  await page.goto(`${base}/math-attack.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#loginNameInput').fill(name);
  await page.locator('#loginPinDigits .login-pin-digit').first().click();
  await page.keyboard.type(pin, { delay: 30 });
  await page.locator('.login-btn-main').click();
  await page.waitForFunction(() => !document.querySelector('#loginScreen')?.classList.contains('active') && document.querySelector('#studentWorkspace'), null, { timeout: 10000 });
  for (let i = 0; i < 50 && !socketState.identified; i += 1) await wait(100);
  assert(socketState.identified, 'real student browser must send player_identify over WebSocket');
  return { context, page, socketState };
}

async function teacherPanel(browser, base) {
  const context = await browser.newContext({ viewport: VIEWPORTS[3] });
  const page = await context.newPage();
  page.__verifyResponses = [];
  page.on('response', async response => {
    if (!response.url().includes('/verify-pending')) return;
    try { page.__verifyResponses.push({ status: response.status(), body: await response.json() }); } catch (_) { /* response may have already been consumed */ }
  });
  await page.goto(`${base}/maestro`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="text"]').first().fill('admin');
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.getByRole('button', { name: 'PRUEBAS' }).click();
  const card = page.locator('article').filter({ hasText: 'Prueba ficticia con título largo para comprobar la invitación del alumno' }).first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  return { context, page, card };
}

async function setState(base, testId, action, revision, cookie) {
  const current = await call(base, `/api/exams/${testId}?pwd=${encodeURIComponent(ADMIN_PASSWORD)}`).then(response => response.json());
  const response = await call(base, `/api/exams/${testId}/state`, { method: 'POST', body: JSON.stringify({ action, revision: Number(current.test?.revision || revision || 1) + 1, password: ADMIN_PASSWORD }) }, cookie);
  const payload = await response.json();
  assert.strictEqual(response.status, 200, `teacher state action ${action} failed (${response.status}): ${payload.error || ''}`);
  return payload;
}

(async () => {
  const before = hashProjectData();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-pruebas5-live-data-'));
  assert(path.relative(path.resolve(os.tmpdir()), dataDir) && path.relative(ROOT, dataDir).startsWith('..'), 'fixtures must be outside the repository');
  if (!fs.existsSync(EVIDENCE_ROOT)) fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const runDir = path.join(EVIDENCE_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
  if (fs.existsSync(runDir)) throw new Error(`Refusing to overwrite evidence folder ${runDir}`);
  fs.mkdirSync(runDir, { recursive: true });
  const fixtureState = fixture(dataDir);
  let running;
  let browser;
  const contexts = [];
  try {
    running = await launch(dataDir);
    const initialCookie = `maestroPwd=${encodeURIComponent(ADMIN_PASSWORD)}`;
    const auth = await call(running.base, '/api/maestro/auth', { method: 'POST', body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }) });
    assert.strictEqual(auth.status, 200, 'synthetic maestro auth must succeed');
    const adminCookie = auth.headers.get('set-cookie')?.split(';')[0] || initialCookie;

    // Pause the active test immediately after reboot. This holds back automatic
    // login notification so the real React Verify action exercises its live send.
    await setState(running.base, TEST_ID, 'pause', 1, adminCookie);
    browser = await chromium.launch({ headless: true });
    const never = await openStudent(browser, running.base, IDS.never, 'Sin comenzar Ficticio', '5100'); contexts.push(never.context);
    const advanced = await openStudent(browser, running.base, IDS.advanced, 'Avance Ficticio con Nombre Compuesto Largo para Revisar el Ajuste', '5101'); contexts.push(advanced.context);
    const finished = await openStudent(browser, running.base, IDS.finished, 'Terminó Ficticio', '5102'); contexts.push(finished.context);
    const unassigned = await openStudent(browser, running.base, IDS.unassigned, 'No asignado Ficticio', '5103'); contexts.push(unassigned.context);
    for (const { page } of [never, advanced, finished, unassigned]) {
      await page.waitForFunction(() => document.querySelector('#loginScreen')?.classList.contains('hidden') || document.querySelector('#loginScreen')?.style.display === 'none', null, { timeout: 3000 }).catch(() => {});
    }
    assert(!(await never.page.locator('#examBannerStep1').isVisible()), 'paused active test must not invite students before teacher resumes it');

    await setState(running.base, TEST_ID, 'resume', 2, adminCookie);
    const teacher = await teacherPanel(browser, running.base); contexts.push(teacher.context);
    await teacher.card.getByRole('button', { name: /verificar/i }).click();
    await teacher.page.getByText('Detalle por alumno (2)', { exact: false }).waitFor({ state: 'visible' });
    await teacher.page.waitForTimeout(200);
    assert(teacher.page.__verifyResponses[0]?.body?.summary?.notificationAttempts > 0, `server did not attempt live send: ${JSON.stringify(teacher.page.__verifyResponses[0])}`);
    assert(never.socketState.examStarts.length > 0 && advanced.socketState.examStarts.length > 0, `live WS frame missing: never=${never.socketState.examStarts.length}; advanced=${advanced.socketState.examStarts.length}; report=${JSON.stringify(teacher.page.__verifyResponses[0])}`);
    for (const student of [never, advanced]) {
      try { await student.page.locator('#examBannerStep1').waitFor({ state: 'visible', timeout: 4000 }); }
      catch (_) {
        const state = await student.page.evaluate(() => ({ body: document.body.className, workspace: document.querySelector('#studentWorkspace')?.className, login: document.querySelector('#loginScreen')?.className, banner: { display: getComputedStyle(document.querySelector('#examBannerStep1')).display, text: document.querySelector('#examBannerStep1').innerText }, toast: { className: document.querySelector('#powerToast')?.className, text: document.querySelector('#powerToast')?.innerText }, localPlayer: localStorage.getItem('mathattack_player') }));
        await student.page.screenshot({ path: path.join(runDir, 'diagnostic-banner-hidden.png'), fullPage: true });
        throw new Error(`exam_start frame was received but student interface did not reveal its banner: ${JSON.stringify(state)}`);
      }
    }
    assert(!(await finished.page.locator('#examBannerStep1').isVisible()), 'completed student must not receive a repeat invitation');
    assert(!(await unassigned.page.locator('#examBannerStep1').isVisible()), 'unassigned student must not receive access');

    assert(never.socketState.examStarts.length >= 1 && advanced.socketState.examStarts.length >= 1, 'Playwright must observe actual exam_start WebSocket frames');
    assert.strictEqual(finished.socketState.examStarts.length, 0, 'finished student must receive no exam_start event');
    assert.strictEqual(unassigned.socketState.examStarts.length, 0, 'unassigned student must receive no exam_start event');

    for (const viewport of VIEWPORTS) {
      await teacher.page.setViewportSize(viewport);
      const metrics = await teacher.page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
      assert(metrics.documentWidth <= metrics.width, `teacher verification report overflows at ${viewport.width}`);
      await teacher.page.screenshot({ path: path.join(runDir, `verify-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }

    // Browser received the server frame via its application handler; record a
    // test-only observer next time is too late, so visible app state is the proof.
    // Repeated real React activation must not send again or create extra attempts.
    await teacher.card.getByRole('button', { name: /verificar/i }).click();
    await teacher.page.getByText('Detalle por alumno (2)', { exact: false }).waitFor({ state: 'visible' });
    for (const student of [never, advanced]) {
      assert.strictEqual(student.socketState.examStarts.length, 1, 'repeated verification must not duplicate websocket notice');
    }

    // Verification of the active test must not alter an independently paused
    // teacher test, and login while that test is paused must have sent no event.
    const pauseState = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8')).tests.find(test => test.testId === PAUSED_ID).status;
    assert.strictEqual(pauseState, 'paused', 'verification must preserve teacher pause');

    // Capture the genuine incoming banner at the five reference sizes before
    // entering the attempt. It persists after the short toast has disappeared.
    for (const viewport of VIEWPORTS) {
      await advanced.page.setViewportSize(viewport);
      const metrics = await advanced.page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
      assert(metrics.documentWidth <= metrics.width, `notice screen overflows at ${viewport.width}`);
      await advanced.page.screenshot({ path: path.join(runDir, `notice-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
    const noticeButton = advanced.page.locator('#examBannerStep1 .exam-apply-btn');
    await advanced.page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 40; i += 1) {
      if (await noticeButton.evaluate(element => document.activeElement === element)) break;
      await advanced.page.keyboard.press('Tab');
    }
    assert(await noticeButton.evaluate(element => element.matches(':focus-visible')), 'student notice entry must show keyboard focus');
    assert((await noticeButton.boundingBox())?.height >= 40, 'student entry button must be touch friendly');

    // Enter from the actual student banner and continue the exact same attempt.
    await never.page.locator('#examBannerStep1 .exam-apply-btn').click();
    await never.page.waitForFunction(() => document.querySelector('#gameScreen')?.classList.contains('active'), null, { timeout: 10000 });
    let saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    assert.strictEqual(saved.attempts.filter(attempt => attempt.testId === TEST_ID && attempt.accountPlayerId === IDS.never && !['deleted', 'restarted'].includes(attempt.status)).length, 1, 'no-start student should create one attempt on entry');
    const neverAttemptId = saved.attempts.find(attempt => attempt.testId === TEST_ID && attempt.accountPlayerId === IDS.never).attemptId;

    const beforeEntry = await advanced.page.evaluate(async ({ testId, attemptId }) => {
      const response = await fetch(`/api/student/tests/${testId}/attempts/${attemptId}`, { credentials: 'same-origin' });
      const body = await response.json();
      return { status: response.status, attempt: body.attempt };
    }, { testId: TEST_ID, attemptId: fixtureState.attemptId });
    assert.strictEqual(beforeEntry.status, 200, 'pre-entry resume API should return the existing attempt');
    assert.strictEqual(beforeEntry.attempt.progress.timeLeft, 90, `server should retain durable question timer before entry: ${JSON.stringify(beforeEntry.attempt.progress)}`);
    await advanced.page.locator('#examBannerStep1 .exam-apply-btn').click();
    await advanced.page.waitForFunction(() => document.querySelector('#gameScreen')?.classList.contains('active'), null, { timeout: 10000 });
    await wait(1200); // allow the real application to finish countdown/initGame and checkpoint its first resumed tick
    const afterEntry = await advanced.page.evaluate(async ({ testId, attemptId }) => {
      const response = await fetch(`/api/student/tests/${testId}/attempts/${attemptId}`, { credentials: 'same-origin' });
      const body = await response.json();
      return { status: response.status, attempt: body.attempt };
    }, { testId: TEST_ID, attemptId: fixtureState.attemptId });
    const timerDom = await advanced.page.evaluate(() => ({ barWidth: document.querySelector('#timerBar')?.style.width || '', barClass: document.querySelector('#timerBar')?.className || '', question: document.querySelector('#questionText')?.innerText || '', gameActive: document.querySelector('#gameScreen')?.classList.contains('active') }));
    await wait(2300); // allow one normal 2s progress report after initGame restores the timer
    saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    const continued = saved.attempts.find(attempt => attempt.testId === TEST_ID && attempt.accountPlayerId === IDS.advanced);
    assert.strictEqual(continued.attemptId, fixtureState.attemptId, 'advanced student must continue the same attempt');
    assert.deepStrictEqual(continued.progress.questions.map(question => question.questionId), fixtureState.questions.map(question => question.questionId));
    assert.deepStrictEqual(continued.progress.answers, [{ questionId: fixtureState.questions[0].questionId, answer: 6, corrected: true }]);
    const timerPreserved = continued.progress.timeLeft > 0 && continued.progress.timeLeft <= 90;
    const examZeroFrames = advanced.socketState.sessionUpdates.filter(update => update.isExam && update.timeLeft === 0);
    console.log(`Resume timer observation: before=${beforeEntry.attempt.progress.timeLeft}/${beforeEntry.attempt.progress.questionElapsedMs}/${beforeEntry.attempt.progress.globalRemainingMs}; after=${continued.progress.timeLeft}/${continued.progress.questionElapsedMs}/${continued.progress.globalRemainingMs}; api@1.2s=${JSON.stringify({ timeLeft: afterEntry.attempt?.progress?.timeLeft, timeSavedAt: afterEntry.attempt?.progress?.timeSavedAt })}; dom=${JSON.stringify(timerDom)}; outgoing=${JSON.stringify(advanced.socketState.sessionUpdates)}`);
    assert(continued.progress.questionElapsedMs >= 7200 && continued.progress.questionElapsedMs < 15000, `question clock changed unexpectedly: ${continued.progress.questionElapsedMs}`);
    assert(continued.progress.globalRemainingMs > 0 && continued.progress.globalRemainingMs <= 240000);
    assert.deepStrictEqual(continued.progress.questions.map(question => question.status), ['correct', 'pending', 'pending']);

    await advanced.page.setViewportSize(VIEWPORTS[0]);
    const nameDetails = advanced.page.getByRole('button', { name: 'Consultar nombre completo' });
    await nameDetails.click();
    const nameDialog = advanced.page.locator('#gamePlayerNameDialog');
    await nameDialog.waitFor({ state: 'visible' });
    assert((await nameDialog.innerText()).includes(fixtureState.advancedName), 'long student name must remain available in its accessible dialog');
    const dialogBox = await nameDialog.boundingBox();
    assert(dialogBox && dialogBox.x >= 0 && dialogBox.y >= 0 && dialogBox.x + dialogBox.width <= 360 && dialogBox.y + dialogBox.height <= 800, 'long-name dialog must fit the narrow viewport');
    await advanced.page.screenshot({ path: path.join(runDir, 'name-dialog-360x800.png'), fullPage: true });
    await advanced.page.keyboard.press('Escape');
    await nameDialog.waitFor({ state: 'hidden' });

    // The write-answer layout exposes the existing answer strip. Capture the
    // actual recovered question state across the five requested viewports.
    for (const viewport of VIEWPORTS) {
      await advanced.page.setViewportSize(viewport);
      await advanced.page.screenshot({ path: path.join(runDir, `continued-${viewport.width}x${viewport.height}.png`), fullPage: true });
      const metrics = await advanced.page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
      assert(metrics.documentWidth <= metrics.width, `recovered student screen overflows at ${viewport.width}`);
    }
    const focusButton = advanced.page.locator('#gameScreen button:visible').first();
    if (await focusButton.count()) {
      await focusButton.focus();
      assert(await focusButton.evaluate(element => element.matches(':focus-visible')), 'student attempt controls should show keyboard focus');
    }

    // Auto recovery, separate from Verify: restart the process, open a new browser
    // for the same in-progress account, and observe an automatic notice on login.
    await stop(running.child); running = null;
    running = await launch(dataDir);
    const automatic = await openStudent(browser, running.base, IDS.advanced, 'Avance Ficticio con Nombre Compuesto Largo para Revisar el Ajuste', '5101'); contexts.push(automatic.context);
    await automatic.page.waitForFunction(() => document.querySelector('#examBannerStep1') && document.querySelector('#examBannerStep1').offsetWidth > 0, null, { timeout: 10000 });
    await automatic.page.locator('#examBannerStep1 .exam-apply-btn').click();
    await automatic.page.waitForFunction(() => document.querySelector('#gameScreen')?.classList.contains('active'), null, { timeout: 10000 });
    const studentCookie = (await automatic.context.cookies()).find(item => item.name === 'math_attack_student_session')?.value;
    assert(studentCookie, 'browser authentication cookie must exist only in the synthetic profile');
    const catalog = await call(running.base, '/api/student/tests', {}, `math_attack_student_session=${encodeURIComponent(studentCookie)}`);
    assert.strictEqual(catalog.status, 200, 'synthetic student catalog must remain accessible after restart');
    assert.strictEqual(automatic.socketState.examStarts.length, 1, 'late authenticated student must receive automatic exam_start without Verify');
    const postAuto = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    assert.strictEqual(postAuto.attempts.find(attempt => attempt.testId === TEST_ID && attempt.accountPlayerId === IDS.advanced).attemptId, fixtureState.attemptId, 'automatic recovery must preserve the same attempt');
    assert.strictEqual(postAuto.attempts.filter(attempt => attempt.testId === TEST_ID && attempt.accountPlayerId === IDS.never && !['deleted', 'restarted'].includes(attempt.status)).length, 1, 'repeated verification must not duplicate the no-start attempt');

    assert(timerPreserved, 'continuing the same attempt must preserve its persisted question timer');
    assert.strictEqual(examZeroFrames.length, 0, 'do not report an exam checkpoint with an uninitialized zero question timer while restoring');

    console.log(`OK: React maestro real → WebSocket → math-attack.html alumno, restart/verify/reconnect, attempt continuation, exclusions, pause and five viewports. Evidencias: ${runDir}`);
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => {})));
    await browser?.close().catch(() => {});
    await stop(running?.child);
    safeRemoveTemp(dataDir);
    const after = hashProjectData();
    const changed = HASH_FILES.filter(name => before[name] !== after[name]);
    console.log(`Persistent-file hash audit: ${changed.length ? `CHANGED ${changed.join(', ')}` : 'unchanged'}; ${JSON.stringify(after)}`);
    assert.deepStrictEqual(after, before, 'real project persistent-data hashes changed during isolated E2E');
  }
})().catch(error => { console.error(error); process.exit(1); });
