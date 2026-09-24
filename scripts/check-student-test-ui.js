'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { createRoot, createTest, createAssignment } = require('../src/server/exams/testModel');

const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-student-ui-'));
  const testId = '77777777-7777-4777-8777-777777777777';
  const studentId = '88888888-8888-4888-8888-888888888888';
  const root = createRoot();
  const test = createTest({ testId, creator: '99999999-9999-4999-8999-999999999999', status: 'active', title: 'Prueba UI', configuration: { version: 1, multiplier: 2, total: 65, opsConfig: { mult: { tables: [1, 2, 3, 4, 5, 6], qty: 4, detailMode: true } } } });
  root.tests.push(test); root.assignments.push(createAssignment({ testId, targetType: 'student', accountPlayerId: studentId }));
  fs.writeFileSync(path.join(dir, 'pruebas.json'), JSON.stringify(root), 'utf8');
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify([{ id: studentId, name: 'Alumno UI', pin: '1234', grade: '5A' }]), 'utf8');
  fs.writeFileSync(path.join(dir, 'groups.json'), JSON.stringify({ schemaVersion: 1, groups: [] }), 'utf8');
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json'), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_GROUPS_PATH: path.join(dir, 'groups.json') }, stdio: 'ignore', windowsHide: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (let index = 0; index < 40; index += 1) { try { if ((await fetch(`http://127.0.0.1:${port}/api/exam/status`)).ok) break; } catch (_) {} await wait(100); }
    await page.goto(`http://127.0.0.1:${port}/math-attack.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('#loginNameInput', 'Alumno UI');
    await page.locator('#loginPinDigits .login-pin-digit').evaluateAll((inputs, pin) => inputs.forEach((input, index) => { input.value = pin[index]; input.dispatchEvent(new Event('input', { bubbles: true })); }), '1234');
    await page.click('.login-btn-main');
    await page.waitForSelector('#step1Screen.active', { timeout: 5000 });
    await page.getByRole('button', { name: 'Pruebas' }).click();
    assert.strictEqual(await page.locator('#studentTestEntry').count(), 0, 'la entrada manual por folio no debe existir');
    const matrix = Array.from({ length: 65 }, (_, index) => `${(index % 12) + 1}x${Math.floor(index / 12) + 1}`);
    await page.evaluate(value => window.handleExamStart({ testId: '77777777-7777-4777-8777-777777777777', startedAt: Date.now(), total: 65, op: 'mult', grade: '5A', timeLimit: 60, timePerQuestion: 10, opsConfig: { mult: { tables: [1, 2, 3, 4, 5, 6], qty: 4, detailMode: true, matrix: value } } }), matrix);
    await page.waitForSelector('#examBannerStep1 .exam-apply-btn', { timeout: 5000 });
    assert.strictEqual(await page.locator('#examBannerStep1').isVisible(), true, 'la prueba automática debe aparecer');
    assert((await page.locator('#examBannerStep1Info').textContent()).includes('65 preguntas'));
    await page.click('#examBannerStep1 .exam-apply-btn');
    await page.waitForFunction(() => document.getElementById('progressEl')?.textContent === '1/65', null, { timeout: 10000 });
    assert.strictEqual(await page.locator('#gameScreen').evaluate(element => element.classList.contains('active')), true);
    await page.evaluate(() => window.showResults());
    await page.waitForSelector('#resultsScreen.active', { timeout: 5000 });
    assert.deepStrictEqual(errors, []);
    console.log('OK UI Playwright: no existe entrada manual por folio y la prueba llega automáticamente al alumno.');
  } finally {
    await browser.close(); child.kill('SIGINT'); await wait(150); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
