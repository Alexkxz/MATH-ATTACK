'use strict';

// Dedicated regression for React's multiplication manner control. All server
// persistence is redirected to a disposable directory under the OS temp path.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { createRoot } = require('../src/server/exams/testModel');
const { generateConfiguredQuestions } = require('../src/server/exams/studentTestFlowService');

const ROOT = path.resolve(__dirname, '..');
const PASSWORD = 'synthetic-manner-regression-9c31';
const STUDENT_ID = '4a454d55-3eb3-4fb4-8c4e-e663c263ad83';
const STUDENT_NAME = 'Manner Test Student';
const PERSISTENT = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashes = () => Object.fromEntries(PERSISTENT.map(name => {
  const file = path.join(ROOT, name);
  return [name, fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '<missing>'];
}));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
});
const removeTemp = dir => {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing unsafe temp cleanup: ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
};
const stop = async child => {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) {}
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(4000)]);
  if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch (_) {} await new Promise(resolve => child.once('exit', resolve)); }
};
async function launch(dataDir) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dataDir, MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'), MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'), MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log') }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let index = 0; index < 100; index += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, output: () => output }; } catch (_) {}
    await wait(100);
  }
  await stop(child); throw new Error(`Temporary server did not start${output ? `: ${output}` : ''}`);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
}
function randomOrder(config, canonical) {
  for (let seed = 1; seed <= 64; seed += 1) {
    const questions = generateConfiguredQuestions(config, seededRandom(seed));
    const order = questions.map(question => [question.baseFactor, question.baseTable]);
    if (JSON.stringify(order) !== JSON.stringify(canonical)) return { questions, seed };
  }
  assert.fail('deterministic seeds 1..64 did not demonstrate an ordering permutation');
}
async function studentLogin(page, base) {
  await page.goto(`${base}/math-attack.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#loginNameInput').fill(STUDENT_NAME);
  await page.locator('#loginPinDigits .login-pin-digit').evaluateAll((inputs, pin) => inputs.forEach((input, index) => { input.value = pin[index]; input.dispatchEvent(new Event('input', { bubbles: true })); }), '7319');
  await page.locator('.login-btn-main').click();
  await page.waitForSelector('#step1Screen.active', { timeout: 10000 });
}
function assertOrderRules() {
  const base = { enabledOperations: ['mult'], order: 'ordered', repeat: false };
  const quickConfig = manner => ({ ...base, opsConfig: { mult: { mode: 'quick', tables: [2], quickTables: [2], range: { from: 2, to: 5 }, perTableQty: 4, expansionLimit: 1, manner } } });
  const quick = manner => generateConfiguredQuestions(quickConfig(manner), seededRandom(1));
  assert.deepStrictEqual(quick('ordered').map(question => [question.baseTable, question.baseFactor]), [[2, 2], [2, 3], [2, 4], [2, 5]], 'quick ordered mode must follow base factors');
  const quickCanonical = [[2, 2], [3, 2], [4, 2], [5, 2]]; // [baseFactor, baseTable].
  const quickRandomResult = randomOrder(quickConfig('random'), quickCanonical);
  const quickRandom = quickRandomResult.questions.map(question => [question.baseFactor, question.baseTable]);
  assert.deepStrictEqual([...quickRandom].sort((a, b) => a[0] - b[0]), quickCanonical, 'random manner must preserve the selected quick base questions');

  const exactConfig = manner => ({ ...base, opsConfig: { mult: { mode: 'exact', tables: [2, 5], matrix: ['4x2', '2x5', '3x5'], expansionLimit: 100, manner } } });
  const expectedExact = [[4, 2], [2, 5], [3, 5]]; // [baseFactor, baseTable], sorted by table then factor.
  const exact = manner => generateConfiguredQuestions(exactConfig(manner), seededRandom(1));
  assert.deepStrictEqual(exact('ordered').map(question => [question.baseFactor, question.baseTable]), expectedExact, 'exact ordered mode must sort by base table then factor');
  const exactRandomResult = randomOrder(exactConfig('random'), expectedExact);
  const exactRandom = exactRandomResult.questions.map(question => [question.baseFactor, question.baseTable]);
  assert.deepStrictEqual([...exactRandom].sort((a, b) => a[1] - b[1] || a[0] - b[0]), expectedExact, 'random exact mode must preserve selected base cells');

  const expanded = generateConfiguredQuestions({ ...base, opsConfig: { mult: { mode: 'exact', tables: [2], matrix: ['2x2', '4x2'], expansionLimit: 100, manner: 'ordered' } } }, seededRandom(1));
  assert.deepStrictEqual(expanded.map(question => [question.baseFactor, question.baseTable]), [[2, 2], [4, 2]], 'expansion must not change ordered base-cell criterion');
  const globalConfig = { ...base, order: 'random', opsConfig: { mult: { mode: 'exact', tables: [2], matrix: ['2x2', '3x2', '4x2'], expansionLimit: 1, manner: 'ordered' } } };
  const globalCanonical = [[2, 2], [3, 2], [4, 2]];
  const globalMix = randomOrder(globalConfig, globalCanonical).questions.map(question => [question.baseFactor, question.baseTable]);
  assert.deepStrictEqual([...globalMix].sort((a, b) => a[0] - b[0]), globalCanonical, 'global mixing must preserve the selected base questions');
}

(async () => {
  const before = hashes();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-manner-e2e-'));
  assert(path.relative(ROOT, dataDir).startsWith('..'), 'temporary persistence must stay outside project');
  const root = createRoot();
  for (const [name, value] of Object.entries({ 'pruebas.json': root, 'players.json': [{ id: STUDENT_ID, name: STUDENT_NAME, pin: '7319', grade: '5A', aureos: 0, experiencia: 0 }], 'ranking.json': [], 'groups.json': { schemaVersion: 1, groups: [] }, 'config.json': { adminUsername: 'admin', adminPassword: PASSWORD }, 'devices.json': [], 'aureosLog.json': [] })) fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value), 'utf8');
  let running, browser, context, failure;
  try {
    running = await launch(dataDir);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    await page.addInitScript(password => { sessionStorage.setItem('maestroAuth', '1'); sessionStorage.setItem('maestroPwd', password); }, PASSWORD);
    await page.goto(`${running.base}/maestro`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.getByRole('button', { name: /Nueva prueba/ }).click();
    const mult = page.locator('[data-operation="mult"]');
    if (await mult.getAttribute('aria-pressed') !== 'true') await mult.click();
    const editor = page.locator('[data-operation-config="mult"]');
    await editor.waitFor({ state: 'visible' });
    await page.locator('input[maxlength="200"]').first().fill('Manner regression fixture');
    const grade = page.locator('label').filter({ hasText: /^Grado/ }).locator('select').first();
    if (await grade.count()) await grade.selectOption('5A');
    // Stable selector: the button's accessible name also includes its grade
    // after the recipient card gained a name-plus-grade layout.
    const recipient = page.locator('[data-recipient-grid] [data-recipient-student][data-recipient-eligible="true"]');
    await recipient.waitFor({ state: 'visible' });
    await recipient.click();
    assert.strictEqual(await recipient.getAttribute('aria-pressed'), 'true', 'fictitious student must be assigned through React');
    await page.locator('label').filter({ hasText: /^Presentaci/ }).locator('select').selectOption('ordered');
    const ordered = editor.getByRole('button', { name: 'En orden', exact: true });
    const shuffled = editor.getByRole('button', { name: 'En desorden', exact: true });
    assert(!(await ordered.isDisabled()) && !(await shuffled.isDisabled()), 'both manner options must be enabled when presentation is by operation blocks');

    // Rapid mode: drive the actual accessible buttons and verify React state.
    const quickTables = editor.locator('button[aria-pressed]').filter({ hasText: /^T(?:0|[1-9]|1[0-2])$/ });
    for (let table = 0; table <= 12; table += 1) {
      const button = quickTables.nth(table), shouldSelect = table === 2;
      if ((await button.getAttribute('aria-pressed') === 'true') !== shouldSelect) await button.click();
    }
    await editor.locator('label').filter({ hasText: 'Desde' }).locator('select').first().selectOption('2');
    await editor.locator('label').filter({ hasText: 'Hasta' }).locator('select').first().selectOption('5');
    await editor.locator('label').filter({ hasText: 'Preguntas por tabla' }).locator('input').fill('4');
    assert.strictEqual(await ordered.getAttribute('aria-pressed'), 'true', 'ordered should show selected state');
    await shuffled.click();
    assert.strictEqual(await shuffled.getAttribute('aria-pressed'), 'true', 'random should show selected state after click');
    assert.strictEqual(await ordered.getAttribute('aria-pressed'), 'false', 'manner options must be mutually exclusive');
    await page.getByRole('button', { name: /Guardar borrador/ }).click();
    await page.getByText(/Configuraci.*y asignaciones guardadas/).waitFor({ state: 'visible' });
    let savedRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    const saved = savedRoot.tests.find(test => test.title === 'Manner regression fixture');
    assert(saved, 'quick draft must be present in temporary persistence');
    assert.strictEqual(saved.configuration.order, 'ordered', 'block presentation must persist');
    assert.strictEqual(saved.configuration.opsConfig.mult.manner, 'random', 'quick random manner must persist');
    const quickCanonical = [[2, 2], [3, 2], [4, 2], [5, 2]];
    const quickGenerated = randomOrder(saved.configuration, quickCanonical).questions;
    assert.strictEqual(quickGenerated.length, 4, 'saved quick mode must generate its four selected base questions');

    // Save the other manner, reload, then reopen the draft to prove hydration.
    await ordered.click();
    assert.strictEqual(await ordered.getAttribute('aria-pressed'), 'true');
    await shuffled.click();
    assert.strictEqual(await shuffled.getAttribute('aria-pressed'), 'true');
    await editor.getByRole('checkbox', { name: /M.s detalle/ }).check();
    await editor.getByRole('button', { name: 'Limpiar todo' }).click();
    for (const cell of ['2 por 5: excluida', '3 por 5: excluida', '4 por 2: excluida']) await editor.getByRole('button', { name: cell, exact: true }).click();
    assert.strictEqual(await editor.getByText('3 preguntas', { exact: true }).count(), 1);
    await shuffled.click();
    await page.getByRole('button', { name: /Guardar borrador/ }).click();
    await page.getByText(/Configuraci.*y asignaciones guardadas/).waitFor({ state: 'visible' });
    savedRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    const savedExact = savedRoot.tests.find(test => test.title === 'Manner regression fixture');
    assert.strictEqual(savedExact.configuration.opsConfig.mult.mode, 'exact');
    assert.strictEqual(savedExact.configuration.opsConfig.mult.manner, 'random', 'exact random manner must persist');
    const exactGenerated = randomOrder(savedExact.configuration, [[4, 2], [2, 5], [3, 5]]).questions;
    assert.strictEqual(exactGenerated.length, 3, 'saved exact mode must generate its three selected cells');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.getByRole('button', { name: 'Historial' }).click();
    await page.locator('article').filter({ hasText: 'Manner regression fixture' }).getByRole('button', { name: 'Abrir' }).click();
    const reopened = page.locator('[data-operation-config="mult"]');
    assert.strictEqual(await reopened.getByRole('button', { name: 'En desorden', exact: true }).getAttribute('aria-pressed'), 'true', 'reopened exact mode must hydrate random manner');
    await page.locator('label').filter({ hasText: /^Presentaci/ }).locator('select').selectOption('random');
    assert(await page.getByText(/mezcla global de todas las operaciones prevalece/i).isVisible(), 'global mixing should explain that it takes precedence');
    const globalMessage = page.getByText(/mezcla global de todas las operaciones prevalece/i);
    await globalMessage.waitFor({ state: 'visible' });
    await page.locator('label').filter({ hasText: /^Presentaci/ }).locator('select').selectOption('ordered');
    assert.strictEqual(await reopened.getByRole('button', { name: 'En desorden', exact: true }).getAttribute('aria-pressed'), 'true', 'manner preference should remain after toggling global order');

    // Start a real assigned attempt through the React maestro and the signed-in
    // fictitious student's browser session; inspect the server-owned questions.
    await reopened.getByRole('button', { name: 'En orden', exact: true }).click();
    assert.strictEqual(await reopened.getByRole('button', { name: 'En orden', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: /Guardar e iniciar/ }).click();
    await page.getByText('Prueba iniciada en el juego.').waitFor({ state: 'visible', timeout: 15000 });
    savedRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    const activeTest = savedRoot.tests.find(test => test.title === 'Manner regression fixture');
    assert(activeTest && activeTest.status === 'active', 'React start must activate the test in temporary storage');
    assert(savedRoot.assignments.some(item => item.testId === activeTest.testId && item.targetType === 'student' && item.accountPlayerId === STUDENT_ID), 'React save must preserve the fictitious student assignment');
    const studentPage = await context.newPage();
    await studentLogin(studentPage, running.base);
    const attemptResponse = await studentPage.evaluate(async testId => {
      const response = await fetch(`/api/student/tests/${encodeURIComponent(testId)}/attempts`, { method: 'POST', credentials: 'same-origin' });
      return { status: response.status, body: await response.json() };
    }, activeTest.testId);
    assert.strictEqual(attemptResponse.status, 201, `student browser must create an assigned attempt: ${JSON.stringify(attemptResponse.body)}`);
    const studentState = await studentPage.evaluate(async () => { const response = await fetch('/api/student/tests', { credentials: 'same-origin' }); return response.json(); });
    const attempt = studentState.tests.find(row => row.test.testId === activeTest.testId)?.attempt;
    assert(attempt?.progress?.questions, 'server must expose the started attempt questions');
    assert.deepStrictEqual(attempt.progress.questions.map(question => [question.a, question.b]), [[2, 4], [5, 2], [5, 3]], 'started exact attempt must follow ordered base cells');
    assert.strictEqual(attempt.progress.questions.length, 3, 'attempt must contain one question per exact selected cell');
    await studentPage.close();

    assertOrderRules();
    const changed = Object.keys(before).filter(name => before[name] !== hashes()[name]);
    assert.deepStrictEqual(changed, [], `real project persistence changed: ${changed.join(', ')}`);
    console.log('OK: React Manera enabled and interactive with block order; quick/exact save, reload and generation; global mixing notice; deterministic order, expansion and global precedence. Project JSON hashes unchanged.');
  } catch (error) { failure = error; }
  finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (running) await stop(running.child);
    removeTemp(dataDir);
  }
  const changed = Object.keys(before).filter(name => before[name] !== hashes()[name]);
  if (changed.length && !failure) failure = new Error(`Real project persistence changed: ${changed.join(', ')}`);
  if (failure) throw failure;
})().catch(error => { console.error(error); process.exitCode = 1; });
