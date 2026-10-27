'use strict';

// End-to-end regression for the React addition/subtraction editor.
// All server state lives in a fresh OS temp directory; project JSON files are read-only.
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
const PASSWORD = 'synthetic-add-sub-admin-41e6';
const STUDENT = { id: '88888888-8888-4888-8888-888888888888', name: 'Alumno ficticio Suma Resta', pin: '1234', grade: '5A' };
const FILES = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const VIEWPORTS = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashes = () => Object.fromEntries(FILES.map(name => {
  const file = path.join(ROOT, name);
  return [name, fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '<missing>'];
}));
const freePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer(); socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(error => error ? reject(error) : resolve(port)); });
});
const removeTemp = dir => {
  const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Unsafe temp cleanup blocked: ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
};
async function launch(dataDir) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, windowsHide: true, env: {
    ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dataDir,
    MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'),
    MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'),
    MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log'),
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, output: () => output }; } catch (_) {}
    await wait(100);
  }
  await stop(child); throw new Error(`Temporary server failed to start${output ? `: ${output}` : ''}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) {}
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(5000)]);
  if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch (_) {} await new Promise(resolve => child.once('exit', resolve)); }
}
function fixture(dir) {
  for (const [name, value] of Object.entries({
    'pruebas.json': { schemaVersion: 1, tests: [], attempts: [], results: [], events: [] },
    'players.json': [{ id: STUDENT.id, accountPlayerId: STUDENT.id, name: STUDENT.name, pin: STUDENT.pin, grade: STUDENT.grade, aureos: 0, experiencia: 0 }],
    'ranking.json': [], 'groups.json': { schemaVersion: 1, groups: [] },
    'config.json': { adminUsername: 'admin', adminPassword: PASSWORD }, 'devices.json': [], 'aureosLog.json': [],
  })) fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
}
const digits = value => String(value).length;
function hasAdditionCarry(a, b) {
  while (a || b) { if (a % 10 + b % 10 >= 10) return true; a = Math.floor(a / 10); b = Math.floor(b / 10); }
  return false;
}
function hasSubtractionBorrow(a, b) {
  let borrow = 0, found = false;
  while (a || b) { const x = a % 10 - borrow, y = b % 10; if (x < y) { borrow = 1; found = true; } else borrow = 0; a = Math.floor(a / 10); b = Math.floor(b / 10); }
  return found;
}
function generated(cfg, op, seed = 0.371) {
  let state = seed;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  return generateConfiguredQuestions({ enabledOperations: [op], opsConfig: { [op]: cfg }, repeat: true }, random);
}
function assertArithmeticQuestions(rows, op, aDigits, bDigits, kind) {
  assert(rows.length > 0, `${op} generator should return questions`);
  for (const q of rows) {
    assert.equal(digits(q.a), aDigits, `${op} first operand should have ${aDigits} digits`);
    assert.equal(digits(q.b), bDigits, `${op} second operand should have ${bDigits} digits`);
    if (op === 'add') {
      assert(Number.isInteger(q.a + q.b), 'addition operands should produce an integer result');
      if (q.answer !== undefined) assert.equal(q.answer, q.a + q.b, 'addition answer should equal operands');
      if (kind === 'carry') assert(hasAdditionCarry(q.a, q.b), 'carry mode should produce at least one carry per question');
      if (kind === 'direct') assert(!hasAdditionCarry(q.a, q.b), 'direct addition should not carry');
    } else {
      assert(q.a >= q.b, 'subtraction should remain non-negative');
      assert(q.a - q.b >= 0, 'subtraction operands should produce a non-negative result');
      if (q.answer !== undefined) assert.equal(q.answer, q.a - q.b, 'subtraction answer should equal operands');
      if (kind === 'borrow') assert(hasSubtractionBorrow(q.a, q.b), 'borrow mode should borrow in each question');
      if (kind === 'direct') assert(!hasSubtractionBorrow(q.a, q.b), 'direct subtraction should not borrow');
    }
  }
}
const selectedDigit = (section, group, value) => section.locator(`[data-addsub-digits="${group}"][data-value="${value}"]`);
const selectedKind = (section, op, value) => section.locator(`[data-addsub-kind="${op}"][data-value="${value}"]`);

(async () => {
  const before = hashes();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-add-sub-ui-'));
  assert(path.relative(ROOT, dataDir).startsWith('..'), 'fixture must live outside project');
  fixture(dataDir);
  const evidenceRoot = path.join(ROOT, 'evidence', 'pruebas-add-sub');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const runDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(runDir, { recursive: false });
  let running, browser, studentContext;
  try {
    running = await launch(dataDir);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(password => { sessionStorage.setItem('maestroAuth', '1'); sessionStorage.setItem('maestroPwd', password); }, PASSWORD);
    await page.goto(`${running.base}/maestro`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.getByRole('button', { name: /Nueva prueba/ }).click();
    const addOp = page.locator('[data-operation="add"]'), subOp = page.locator('[data-operation="sub"]');
    await addOp.click(); await subOp.click();
    const add = page.locator('[data-operation-config="add"]'), sub = page.locator('[data-operation-config="sub"]');

    // Simple mode: same digits for both operands and explicit operation-kind buttons.
    await selectedDigit(add, 'add-simple', 2).click();
    await selectedKind(add, 'add', 'carry').click();
    await selectedDigit(sub, 'sub-simple', 2).click();
    await selectedKind(sub, 'sub', 'borrow').click();
    const keyboardDigit = selectedDigit(add, 'add-simple', 3);
    await keyboardDigit.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert(await keyboardDigit.evaluate(element => element.matches(':focus-visible')), 'digit button should have visible keyboard focus');
    await page.keyboard.press('Space');
    assert.equal(await keyboardDigit.getAttribute('aria-pressed'), 'true', 'digit button should respond to keyboard activation');
    await keyboardDigit.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(runDir, 'keyboard-focus-390x844.png'), fullPage: false });
    assert.equal(await selectedDigit(add, 'add-simple', 3).getAttribute('aria-pressed'), 'true');
    assert.equal(await selectedKind(add, 'add', 'carry').getAttribute('aria-pressed'), 'true');

    // Advanced mode persists independently and can be collapsed/reopened.
    await add.locator('[data-addsub-advanced="add"] summary').click();
    await add.locator('[data-addsub-simple="add"]').click();
    await selectedDigit(add, 'add-a', 3).click(); await selectedDigit(add, 'add-b', 2).click();
    await sub.locator('[data-addsub-advanced="sub"] summary').click();
    await sub.locator('[data-addsub-simple="sub"]').click();
    await selectedDigit(sub, 'sub-a', 3).click(); await selectedDigit(sub, 'sub-b', 2).click();
    await add.screenshot({ path: path.join(runDir, 'advanced-open-add-390x844.png') });
    await sub.screenshot({ path: path.join(runDir, 'advanced-open-sub-390x844.png') });
    await add.locator('[data-addsub-advanced="add"] summary').click();
    await sub.locator('[data-addsub-advanced="sub"] summary').click();
    assert.equal(await selectedDigit(add, 'add-a', 3).getAttribute('aria-pressed'), 'true', 'folding advanced settings should preserve independent digits');
    assert.equal(await selectedDigit(sub, 'sub-b', 2).getAttribute('aria-pressed'), 'true', 'folding advanced settings should preserve independent digits');

    // Capture each required viewport and assert page-level width remains contained.
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport); await add.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
      const geometry = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, width: innerWidth }));
      assert(geometry.page <= geometry.width, `unexpected page horizontal overflow at ${viewport.width}: ${JSON.stringify(geometry)}`);
      await page.screenshot({ path: path.join(runDir, `add-sub-${viewport.width}x${viewport.height}.png`), fullPage: false });
    }

    await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    const savedCard = page.locator('article').filter({ hasText: /20 preguntas\s*·\s*0 asignaciones/ });
    await savedCard.getByRole('button', { name: 'Abrir' }).click();
    const savedText = fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8');
    const parsed = JSON.parse(savedText), savedTest = parsed.tests[0];
    assert(savedTest && parsed.tests.length === 1, 'the sole saved draft should exist in the isolated store');
    const addCfg = savedTest.configuration.opsConfig.add, subCfg = savedTest.configuration.opsConfig.sub;
    assert.deepEqual({ simple: addCfg.simpleDigits, a: addCfg.digitsA, b: addCfg.digitsB, mode: addCfg.carryMode }, { simple: false, a: 3, b: 2, mode: 'carry' });
    assert.deepEqual({ simple: subCfg.simpleDigits, a: subCfg.digitsA, b: subCfg.digitsB, mode: subCfg.borrowMode }, { simple: false, a: 3, b: 2, mode: 'borrow' });
    assert.equal(await selectedDigit(page.locator('[data-operation-config="add"]'), 'add-a', 3).getAttribute('aria-pressed'), 'true', 'reopened UI should restore advanced add digits');
    assert.equal(await selectedKind(page.locator('[data-operation-config="sub"]'), 'sub', 'borrow').getAttribute('aria-pressed'), 'true', 'reopened UI should restore subtraction mode');
    assert.equal(savedTest.configuration.total, 20, 'question total should combine ten addition and ten subtraction questions');

    // Turning an operation off hides its section; turning it back on preserves advanced values.
    const addOperationButton = page.locator('[data-operation="add"]');
    await addOperationButton.click();
    assert.equal(await page.locator('[data-operation-config="add"]').count(), 0, 'disabled addition should hide its configuration');
    await addOperationButton.click();
    const reactivatedAdd = page.locator('[data-operation-config="add"]');
    assert.equal(await selectedDigit(reactivatedAdd, 'add-a', 3).getAttribute('aria-pressed'), 'true', 'reactivation should retain first independent digit count');
    assert.equal(await selectedDigit(reactivatedAdd, 'add-b', 2).getAttribute('aria-pressed'), 'true', 'reactivation should retain second independent digit count');
    assert.equal(await selectedKind(reactivatedAdd, 'add', 'carry').getAttribute('aria-pressed'), 'true', 'reactivation should retain carry mode');

    // The incompatible one-digit borrow is visible and blocks starting without changing persisted data.
    await sub.locator('[data-addsub-advanced="sub"] summary').click();
    await selectedDigit(sub, 'sub-a', 1).click(); await selectedDigit(sub, 'sub-b', 1).click();
    const validation = page.getByRole('alert').filter({ hasText: 'No hay una resta no negativa de una cifra que requiera préstamo.' });
    assert.equal(await validation.count(), 1, 'the impossible subtraction configuration should be explained in the summary');
    assert.equal(await page.locator('[data-save-start]').isDisabled(), true, 'an incompatible configuration must block starting');
    await validation.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(runDir, 'validation-error-390x844.png'), fullPage: false });
    await selectedDigit(sub, 'sub-a', 3).click(); await selectedDigit(sub, 'sub-b', 2).click();
    assert.equal(await page.locator('[data-save-start]').isDisabled(), false, 'restoring a valid borrow configuration should allow starting');

    // Generation assertions use the exact persisted configuration, not just button state.
    assertArithmeticQuestions(generated(addCfg, 'add'), 'add', 3, 2, 'carry');
    assertArithmeticQuestions(generated(subCfg, 'sub'), 'sub', 3, 2, 'borrow');
    const directAdd = generated({ qty: 12, simpleDigits: true, digits: 2, carryMode: 'direct' }, 'add');
    const directSub = generated({ qty: 12, simpleDigits: true, digits: 2, borrowMode: 'direct' }, 'sub');
    assertArithmeticQuestions(directAdd, 'add', 2, 2, 'direct');
    assertArithmeticQuestions(directSub, 'sub', 2, 2, 'direct');

    // Reuse the temporary student fixture to start the real exam and inspect its server attempt snapshot.
    const recipient = page.locator('[data-recipient-student]').filter({ hasText: STUDENT.name });
    assert.equal(await recipient.count(), 1, 'temporary student should appear in React recipients');
    await recipient.click();
    assert.equal(await recipient.getAttribute('aria-pressed'), 'true', 'synthetic student should be assigned');
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
    const live = await studentPage.evaluate(async () => { const response = await fetch('/api/student/tests', { credentials: 'same-origin' }); return { status: response.status, data: await response.json() }; });
    assert.equal(live.status, 200, 'synthetic student catalogue should return successfully');
    const started = live.data.tests.find(row => row.test.testId === savedTest.testId);
    assert(started?.attempt, 'student should enter the started test and create a real attempt');
    assert.deepEqual({ simple: started.attempt.configurationSnapshot.opsConfig.add.simpleDigits, a: started.attempt.configurationSnapshot.opsConfig.add.digitsA, b: started.attempt.configurationSnapshot.opsConfig.add.digitsB, mode: started.attempt.configurationSnapshot.opsConfig.add.carryMode }, { simple: false, a: 3, b: 2, mode: 'carry' }, 'attempt snapshot should use the saved add configuration');
    assert.deepEqual({ simple: started.attempt.configurationSnapshot.opsConfig.sub.simpleDigits, a: started.attempt.configurationSnapshot.opsConfig.sub.digitsA, b: started.attempt.configurationSnapshot.opsConfig.sub.digitsB, mode: started.attempt.configurationSnapshot.opsConfig.sub.borrowMode }, { simple: false, a: 3, b: 2, mode: 'borrow' }, 'attempt snapshot should use the saved subtraction configuration');
    const actualQuestions = started.attempt.progress.questions;
    assert.equal(actualQuestions.length, 20, 'live attempt should contain the configured question total');
    assertArithmeticQuestions(actualQuestions.filter(question => question.op === '+'), 'add', 3, 2, 'carry');
    assertArithmeticQuestions(actualQuestions.filter(question => question.op === '−'), 'sub', 3, 2, 'borrow');
    assert.deepEqual(hashes(), before, 'project persistent JSON hashes must remain unchanged');
    console.log(`OK: suma/resta React save-reopen, desactivar/reactivar, generación y intento real del alumno con preguntas acordes. Evidencia: ${runDir}`);
  } finally {
    if (studentContext) await studentContext.close();
    if (browser) await browser.close();
    if (running) await stop(running.child);
    removeTemp(dataDir);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
