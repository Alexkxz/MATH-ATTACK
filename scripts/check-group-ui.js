'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { getFreePort } = require('./server-test-utils');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start(dir) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json'), MATH_ATTACK_GROUPS_PATH: path.join(dir, 'groups.json') } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${base}/api/ranking`)).ok) return { child, base }; } catch (_) {} await wait(100); }
  child.kill('SIGINT'); throw Error('servidor temporal no inicio');
}
async function json(response) { return { status: response.status, body: await response.json() }; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-group-ui-'));
  const accountPlayerId = randomUUID();
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify([{ id: accountPlayerId, name: 'Ana', pin: '1234', grade: '5A' }]), 'utf8');
  let server;
  try {
    server = await start(dir);
    const auth = { 'Content-Type': 'application/json', 'X-Admin-Password': 'admin' };
    const created = await json(await fetch(`${server.base}/api/exams`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Prueba grupos UI', creator: randomUUID(), configuration: { grade: '5A' } }) }));
    assert.equal(created.status, 201); const testId = created.body.test.testId;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); const errors = []; const requestBodies = [];
      page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.method() !== 'GET' && request.postData() && (/\/api\/maestro\/groups|\/assignments/.test(request.url()))) requestBodies.push(request.postData()); });
      async function loadPage() {
        await page.goto(`${server.base}/maestro`, { waitUntil: 'domcontentloaded' });
        if (await page.locator('#loginOverlay').isVisible().catch(() => false)) { await page.fill('#loginUser', 'admin'); await page.fill('#loginPass', 'admin'); await page.click('.login-btn'); await page.waitForFunction(() => document.getElementById('loginOverlay')?.classList.contains('hidden')); }
        await page.click('#tab-pruebas'); await page.locator('[data-pr-section-target="programming"]').click(); await page.locator('#prConfig').waitFor({ state: 'visible' }); await page.waitForFunction(() => typeof window.prLoadTestLibrary === 'function'); await page.evaluate(() => window.prLoadTestLibrary()); await page.waitForFunction(() => !document.querySelector('#prTestLibraryList')?.textContent.includes('Cargando biblioteca')); await page.waitForSelector(`[data-test-library-card="${testId}"]`); await page.locator(`[data-test-library-card="${testId}"] .pr-test-select`).click(); await page.locator('[data-pr-section-target="assignments"]').click(); await page.evaluate(() => window.prLoadGroups()); await page.waitForSelector('#prGroupsList');
      }
      await loadPage();
      await page.fill('#prGroupName', 'Grupo UI'); await page.fill('#prGroupGrade', '5'); await page.fill('#prGroupYear', '2030'); await page.click('#prGroupCreate'); await page.waitForFunction(() => document.querySelectorAll('#prGroupsList [data-group-id]').length === 1); assert((await page.locator('#prGroupsList').textContent()).includes('Grupo UI')); assert((await page.locator('#prGroupsList').textContent()).match(/[0-9a-f-]{36}/i));
      await page.locator('#prGroupsList .pr-group-select').click(); await page.fill('#prGroupAccountPlayerId', accountPlayerId); await page.click('#prGroupAddMember'); await page.waitForFunction(id => document.querySelector('#prGroupMembersList')?.textContent.includes(id), accountPlayerId); assert((await page.locator('#prSelectedGroup').textContent()).includes('groupId:'));
      const assignmentResponse = page.waitForResponse(response => response.url().includes(`/api/exams/${testId}/assignments`) && response.request().method() === 'PUT');
      await page.click('#prGroupAssign'); const assignmentResult = await assignmentResponse; assert.equal(assignmentResult.status(), 200); await page.waitForFunction(() => document.querySelector('#prTestLibraryStatus')?.textContent.includes('prueba(s) disponibles'));
      let assignments = await json(await fetch(`${server.base}/api/exams/${testId}/assignments`, { headers: { 'X-Admin-Password': 'admin' } })); assert.equal(assignments.status, 200); assert.equal(assignments.body.assignments.length, 1); assert.equal(assignments.body.assignments[0].accountPlayerId, accountPlayerId); assert.equal(assignments.body.assignments[0].targetType, 'student');
      await loadPage(); await page.locator('#prGroupsList .pr-group-select').click(); await page.waitForFunction(id => document.querySelector('#prGroupMembersList')?.textContent.includes(id), accountPlayerId); assignments = await json(await fetch(`${server.base}/api/exams/${testId}/assignments`, { headers: { 'X-Admin-Password': 'admin' } })); assert.equal(assignments.body.assignments.length, 1); assert(!requestBodies.some(body => /password|pwd|token|cookie|session/i.test(body))); assert.deepEqual(errors, []);
      console.log('OK: UI de grupos crea, selecciona, persiste miembros, asigna por grupo, recarga sin duplicados y conserva testId/accountPlayerId.');
    } finally { await browser.close(); }
  } finally { if (server?.child && !server.child.killed) server.child.kill('SIGINT'); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
