'use strict';

// Real React maestro -> real student browser -> isolated server lifecycle.
// All application JSON files and screenshots use synthetic/temporary data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { createRoot, createTest, createAssignment } = require('../src/server/exams/testModel');

const ROOT = path.resolve(__dirname, '..');
const ADMIN = 'pruebas7-live-fake-admin';
const TEST_ID = '75757575-7575-4575-8575-757575757575';
const STUDENT_A = { id: '76767676-7676-4676-8676-767676767676', name: 'Alumna ficticia con prueba en curso', pin: '7631', grade: '5° Grado A' };
const STUDENT_B = { id: '77777777-7777-4777-8777-777777777777', name: 'Alumno ficticio intento pendiente', pin: '7732', grade: '5° Grado A' };
const PERSISTENT = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const VIEWPORTS = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashFiles = () => Object.fromEntries(PERSISTENT.map(name => { const file = path.join(ROOT, name); return [name, fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '<missing>']; }));
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); }); });
const safeRemove = directory => { const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(directory)); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error(`No se elimina fuera de Temp: ${directory}`); fs.rmSync(directory, { recursive: true, force: true }); };
async function launch(dataDir, requestedPort) {
  const port = requestedPort || await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dataDir, MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'),
    MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'), MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log'),
  } });
  let output = ''; child.stdout.on('data', value => { output += value.toString(); }); child.stderr.on('data', value => { output += value.toString(); });
  for (let i = 0; i < 100; i += 1) { if (child.exitCode !== null) break; try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, port, output: () => output }; } catch (_) {} await wait(100); }
  await stop(child); throw Error(`No inició el servidor aislado${output ? `: ${output}` : ''}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) {}
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(5000)]);
  if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch (_) {} await new Promise(resolve => child.once('exit', resolve)); }
}
function writeFixture(dataDir) {
  const root = createRoot();
  const configuration = { version: 1, title: 'PRUEBAS.7 E2E', grade: '5° Grado A', enabledOperations: ['add'], operationOrder: ['add'], order: 'ordered', repeat: false, total: 2, answerMode: 'write', allowedAttempts: 1, timeLimit: 0, timePerQuestion: 120, opsConfig: { add: { qty: 2, quantityMode: 'total', digits: 1, simpleDigits: true, carryMode: 'both', manner: 'ordered' } } };
  const test = createTest({ testId: TEST_ID, folio: '0077', title: 'Programada ficticia: cerrar sin detener', creator: '78787878-7878-4878-8878-787878787878', status: 'draft', configuration });
  root.tests.push(test);
  root.assignments.push(createAssignment({ testId: TEST_ID, targetType: 'student', accountPlayerId: STUDENT_A.id }), createAssignment({ testId: TEST_ID, targetType: 'student', accountPlayerId: STUDENT_B.id }));
  const data = {
    'pruebas.json': root, 'players.json': [STUDENT_A, STUDENT_B].map(student => ({ ...student, accountPlayerId: student.id, aureos: 0, experiencia: 0 })),
    'ranking.json': [], 'groups.json': { schemaVersion: 1, groups: [] }, 'config.json': { adminUsername: 'admin', adminPassword: ADMIN }, 'devices.json': [], 'aureosLog.json': [],
  };
  for (const [name, value] of Object.entries(data)) fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value), 'utf8');
}
function mexicoLocal(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
async function studentBrowser(browser, base, student, viewport, runDir) {
  const context = await browser.newContext({ viewport, timezoneId: 'America/Los_Angeles' }), page = await context.newPage();
  const starts = [], received = [], sent = [];
  page.on('websocket', socket => { socket.on('framesent', frame => { try { sent.push(JSON.parse(String(frame.payload))); } catch (_) {} }); socket.on('framereceived', frame => { try { const message = JSON.parse(String(frame.payload)); received.push(message); if (message.type === 'exam_start' && message.config?.testId === TEST_ID) starts.push(message); } catch (_) {} }); });
  await page.goto(`${base}/math-attack.html`, { waitUntil: 'domcontentloaded' });
  if (await page.locator('#loginScreen').evaluate(node => node.classList.contains('active'))) {
    await page.locator('#loginNameInput').fill(student.name); await page.locator('#loginPinDigits .login-pin-digit').first().click(); await page.keyboard.type(student.pin, { delay: 20 }); await page.locator('.login-btn-main').click();
  }
  await page.waitForFunction(() => !document.querySelector('#loginScreen')?.classList.contains('active') && !!document.querySelector('#studentWorkspace'), null, { timeout: 10000 });
  const cookies = await context.cookies(base), cookie = cookies.map(item => `${item.name}=${item.value}`).join('; ');
  return { context, page, cookie, starts, received, sent };
}

(async () => {
  const before = hashFiles(), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-pruebas7-live-'));
  const evidenceRoot = path.join(ROOT, 'evidence', 'pruebas7-live-e2e'); fs.mkdirSync(evidenceRoot, { recursive: true });
  const runDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/g, '-')); if (fs.existsSync(runDir)) throw Error(`No se sobrescribe evidencia: ${runDir}`); fs.mkdirSync(runDir);
  writeFixture(dataDir);
  let running, browser, teacherContext, studentContextA, studentContextB;
  try {
    running = await launch(dataDir); browser = await chromium.launch({ headless: true });
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN };
    const adminAuth = await fetch(`${running.base}/api/maestro/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: ADMIN }) });
    assert.equal(adminAuth.status, 200, 'fictitious master authentication succeeds');
    const now = Date.now(), openInstant = new Date(now - 60_000), closeInstant = new Date(now + 10 * 60_000);
    openInstant.setSeconds(0, 0); closeInstant.setSeconds(0, 0);
    const startsAt = openInstant.toISOString(), closesAt = closeInstant.toISOString();
    const cfg = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    const test = cfg.tests[0];
    const patch = await fetch(`${running.base}/api/exams/${TEST_ID}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ revision: test.revision + 1, title: test.title, description: test.description, configuration: test.configuration, assignments: cfg.assignments }) });
    assert.equal(patch.status, 200, `test configuration and fictional assignments saved: ${await patch.clone().text()}`);

    teacherContext = await browser.newContext({ viewport: VIEWPORTS[3], timezoneId: 'Pacific/Auckland' });
    const teacher = await teacherContext.newPage(); teacher.on('pageerror', error => { throw error; });
    await teacher.addInitScript(password => { sessionStorage.setItem('maestroAuth', '1'); sessionStorage.setItem('maestroPwd', password); }, ADMIN);
    await teacher.goto(`${running.base}/maestro`, { waitUntil: 'domcontentloaded' }); await teacher.getByRole('button', { name: 'PRUEBAS' }).click();
    const card = teacher.locator('article').filter({ hasText: 'Programada ficticia: cerrar sin detener' }); await card.waitFor({ state: 'visible' });
    await card.locator('[data-testid="schedule-open"]').click();
    await teacher.locator('[data-testid="schedule-starts-at"]').fill(mexicoLocal(openInstant));
    await teacher.locator('[data-testid="schedule-closes-at"]').fill(mexicoLocal(closeInstant));
    await teacher.locator('[data-testid="schedule-submit"]').click();
    await teacher.getByRole('status').filter({ hasText: /Programada|programada/i }).waitFor({ state: 'visible' });
    for (let attempt = 0; attempt < 30; attempt += 1) { const current = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8')).tests.find(row => row.testId === TEST_ID); if (current.status === 'active') break; await wait(100); }
    const opened = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8')).tests.find(row => row.testId === TEST_ID);
    assert.equal(opened.status, 'active', 'past scheduled start is opened by persistent evaluator');
    assert.equal(opened.startsAt, startsAt, 'React Mexico City wall clock saved as exact UTC instant');
    assert.equal(opened.closesAt, closesAt, 'React Mexico City close wall clock saved as exact UTC instant');
    const runtimeStatus = await fetch(`${running.base}/api/exam/status`).then(response => response.json());
    assert(runtimeStatus.examModes?.some(mode => mode.testId === TEST_ID), `scheduled test must be synchronized into WebSocket state: ${JSON.stringify(runtimeStatus.examModes?.map(mode => ({ testId: mode.testId, audience: mode.audienceAccountPlayerIds })))}`);

    const studentA = await studentBrowser(browser, running.base, STUDENT_A, VIEWPORTS[0], runDir); studentContextA = studentA.context;
    await studentA.page.locator('.workspace-nav-item').filter({ hasText: 'Pruebas' }).click();
    const studentCard = studentA.page.locator('#studentAssignedTests article').filter({ hasText: 'Programada ficticia: cerrar sin detener' }); await studentCard.waitFor({ state: 'visible' });
    await studentCard.getByRole('button', { name: 'Comenzar' }).click();
    await studentA.page.locator('#writeInput').waitFor({ state: 'visible' });
    for (let attempt = 0; attempt < 30 && !studentA.starts.length; attempt += 1) await wait(100);
    assert(studentA.starts.some(message => message.config?.testId === TEST_ID), `real student WebSocket receives active test after schedule opens; sent=${JSON.stringify(studentA.sent)} received=${JSON.stringify(studentA.received)}`);
    let catalogA = await fetch(`${running.base}/api/student/tests`, { headers: { Cookie: studentA.cookie } }).then(response => response.json());
    let rowA = catalogA.tests.find(row => row.test.testId === TEST_ID); assert(rowA?.attempt?.attemptId, 'student has a durable attempt');
    const attemptId = rowA.attempt.attemptId;
    let snapshot = await fetch(`${running.base}/api/student/tests/${TEST_ID}/attempts/${attemptId}`, { headers: { Cookie: studentA.cookie } }).then(response => response.json());
    const questions = snapshot.attempt.progress.questions; assert.equal(questions.length, 2);
    assert.equal((await studentA.page.locator('#questionText').textContent()).trim(), questions[0].text, `first real exercise must match saved question: ${JSON.stringify(questions)}`);
    const visibleAnswer = async () => { const text = (await studentA.page.locator('#questionText').textContent()).trim(); const match = text.match(/(-?\d+)\s*([+\-\u2212\u00d7\u00f7])\s*(-?\d+)/); assert(match, `expected a readable numeric exercise, got ${text}`); const [, left, op, right] = match; return op === '+' ? Number(left) + Number(right) : op === String.fromCodePoint(0x00d7) ? Number(left) * Number(right) : op === String.fromCodePoint(0x00f7) ? Number(left) / Number(right) : Number(left) - Number(right); };
    await studentA.page.locator('#writeInput').fill(String(await visibleAnswer())); await studentA.page.locator('#writeSubmit').click();
    let afterFirst;
    for (let attempt = 0; attempt < 60; attempt += 1) { afterFirst = await fetch(`${running.base}/api/student/tests/${TEST_ID}/attempts/${attemptId}`, { headers: { Cookie: studentA.cookie } }).then(response => response.json()); if (afterFirst.attempt?.progress?.currentIndex === 1 && afterFirst.attempt?.progress?.answers?.some(answer => answer.questionId === questions[0].questionId)) break; await wait(100); }

    assert.deepEqual(afterFirst.attempt.progress.questions.map(question => question.questionId), questions.map(question => question.questionId), 'the started attempt keeps its exact question set while it is in progress');
    assert.equal(afterFirst.attempt.progress.answers.find(answer => answer.questionId === questions[0].questionId)?.corrected, true, `the first response is persisted with its correct evaluation before closing: ${JSON.stringify(afterFirst.attempt.progress.answers)}`);

    const studentBAuth = await fetch(`${running.base}/api/student/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: STUDENT_B.name, pin: STUDENT_B.pin }) });
    assert.equal(studentBAuth.status, 200); const studentBCookie = studentBAuth.headers.get('set-cookie').split(';')[0];
    const pendingResponse = await fetch(`${running.base}/api/student/tests/${TEST_ID}/attempts`, { method: 'POST', headers: { Cookie: studentBCookie } }); assert.equal(pendingResponse.status, 201);
    const pending = (await pendingResponse.json()).attempt; assert.equal(pending.status, 'pending');

    teacher.once('dialog', dialog => { assert(dialog.message().includes('podrán terminar y recuperarse')); void dialog.accept(); });
    await card.locator('[data-testid="manual-close"]').click();
    await teacher.getByRole('status').filter({ hasText: /Cerrada a nuevos inicios/i }).waitFor({ state: 'visible' });
    const closed = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8')).tests.find(row => row.testId === TEST_ID); assert.equal(closed.status, 'closed');
    const pendingStart = await fetch(`${running.base}/api/student/tests/${TEST_ID}/attempts/${pending.attemptId}/start`, { method: 'POST', headers: { Cookie: studentBCookie } }); assert(pendingStart.status >= 400, 'pending attempt cannot start after availability closes');
    const catalogClosed = await fetch(`${running.base}/api/student/tests`, { headers: { Cookie: studentA.cookie } }).then(response => response.json()); rowA = catalogClosed.tests.find(row => row.test.testId === TEST_ID); assert.equal(rowA.availability, 'in_progress'); assert.equal(rowA.attempt.attemptId, attemptId);

    await teacher.setViewportSize(VIEWPORTS[3]); await card.screenshot({ path: path.join(runDir, 'maestro-cerrada-a-nuevos-inicios-1366x768.png') });
    await studentA.page.setViewportSize(VIEWPORTS[0]); await studentA.page.screenshot({ path: path.join(runDir, 'alumna-intento-en-curso-360x800.png') });
    const serverPort = running.port; await stop(running.child); running = await launch(dataDir, serverPort);
    const recoveredAuth = await fetch(`${running.base}/api/student/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: STUDENT_A.name, pin: STUDENT_A.pin }) });
    assert.equal(recoveredAuth.status, 200, 'student can authenticate again after service restart');
    const [cookiePair] = recoveredAuth.headers.get('set-cookie').split(';'); studentA.cookie = cookiePair;
    const [cookieName, ...cookieValue] = cookiePair.split('='); await studentA.context.clearCookies();
    await studentA.context.addCookies([{ name: cookieName, value: cookieValue.join('='), url: running.base }]);
    await studentA.page.reload({ waitUntil: 'domcontentloaded' });
    if (await studentA.page.locator('#loginScreen').count() && await studentA.page.locator('#loginScreen').evaluate(node => node.classList.contains('active'))) {
      await studentA.page.locator('#loginNameInput').fill(STUDENT_A.name); await studentA.page.locator('#loginPinDigits .login-pin-digit').first().click(); await studentA.page.keyboard.type(STUDENT_A.pin, { delay: 20 }); await studentA.page.locator('.login-btn-main').click();
    }
    await studentA.page.waitForFunction(() => !document.querySelector('#loginScreen')?.classList.contains('active') && !!document.querySelector('#studentWorkspace'), null, { timeout: 10000 });
    await studentA.page.locator('.workspace-nav-item').filter({ hasText: 'Pruebas' }).click();
    const continueCard = studentA.page.locator('#studentAssignedTests article').filter({ hasText: 'Programada ficticia: cerrar sin detener' });
    await continueCard.getByRole('button', { name: 'Continuar' }).waitFor({ state: 'visible' });
    await continueCard.getByRole('button', { name: 'Continuar' }).click(); await studentA.page.locator('#writeInput').waitFor({ state: 'visible' });
    assert.equal((await studentA.page.locator('#questionText').textContent()).trim(), questions[1].text, 'continuation displays the next question from the same saved attempt');
    await studentA.page.locator('#writeInput').fill(String(await visibleAnswer())); await studentA.page.locator('#writeSubmit').click();
    let finalAttempt;
    for (let attempt = 0; attempt < 50; attempt += 1) { snapshot = await fetch(`${running.base}/api/student/tests/${TEST_ID}/attempts/${attemptId}`, { headers: { Cookie: studentA.cookie } }).then(response => response.json()); if (snapshot.attempt?.status === 'finished') { finalAttempt = snapshot.attempt; break; } await wait(100); }
    assert(finalAttempt, `same in-progress attempt can finish through the real student UI after close and server restart; last=${JSON.stringify(snapshot.attempt&&{status:snapshot.attempt.status,index:snapshot.attempt.progress?.currentIndex,answers:snapshot.attempt.progress?.answers})}; feedback=${await studentA.page.locator('#feedbackEl').textContent().catch(()=> '')}`);
    assert.equal(finalAttempt.attemptId, attemptId); assert.equal(finalAttempt.progress.answers.length, 2); assert.equal(finalAttempt.progress.correct, 2, 'the real student UI completes both configured sums correctly after recovery');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8')).tests.find(row => row.testId === TEST_ID).status, 'closed', 'finishing does not reopen new starts');
    console.log(`OK PRUEBAS.7 maestro React -> alumno real: zona Ciudad de México, apertura programada, aviso WebSocket, pendiente bloqueado al cierre, intento activo recuperado tras reinicio y finalizado; evidencias: ${runDir}`);
  } finally {
    if (studentContextA) await studentContextA.close(); if (studentContextB) await studentContextB.close(); if (teacherContext) await teacherContext.close(); if (browser) await browser.close(); if (running) await stop(running.child);
    const after = hashFiles(); const changed = PERSISTENT.filter(name => before[name] !== after[name]); assert.deepEqual(changed, [], `JSON reales no deben cambiar: ${changed.join(', ')}`);
    safeRemove(dataDir);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
