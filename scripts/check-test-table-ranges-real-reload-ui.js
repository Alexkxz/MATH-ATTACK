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
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json') } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i += 1) { try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base }; } catch (_) {} await wait(100); }
  child.kill('SIGINT'); throw new Error('servidor temporal no inició');
}
async function readJson(response) { return { status: response.status, body: await response.json() }; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-matrix-reload-'));
  let server;
  const auth = { 'X-Admin-Password': 'admin', 'Content-Type': 'application/json' };
  try {
    server = await start(dir);
    const created = await readJson(await fetch(`${server.base}/api/exams`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Matriz con recarga', creator: randomUUID(), configuration: { grade: '5A', customField: 'preserve-me' } }) }));
    assert.strictEqual(created.status, 201); const testId = created.body.test.testId;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(`${server.base}/maestro`, { waitUntil: 'domcontentloaded' });
      if (await page.locator('#loginOverlay').isVisible().catch(() => false)) { await page.fill('#loginUser', 'admin'); await page.fill('#loginPass', 'admin'); await page.locator('.login-btn').click({ force: true }); await page.waitForFunction(() => document.getElementById('loginOverlay')?.classList.contains('hidden'), null, { timeout: 5000 }); }
      await page.click('#tab-pruebas'); await page.click('[data-pr-section-target="programming"]'); await page.evaluate(() => window.prLoadTestLibrary());
      await page.waitForSelector(`[data-test-library-card="${testId}"]`); await page.locator(`[data-test-library-card="${testId}"] .pr-test-select`).click(); await page.getByRole('button', { name: /3\.\s*Detalle/ }).click(); await page.locator('[data-pr-builder-panel="3"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#prTablesGrid_mult .em-tbl-btn').count(), 169); assert.equal(await page.locator('#prTablesGrid_mult [data-row="0"]').count(), 13); assert.equal(await page.locator('#prTablesGrid_mult [data-col="12"]').count(), 13);
      await page.locator('#prOpSection_mult').getByRole('button', { name: 'Limpiar todo' }).click(); await page.locator('#prTablesGrid_mult [data-row="2"][data-col="8"]').click();
      assert.equal(await page.locator('#prTablesGrid_mult [data-row="2"][data-col="8"]').evaluate(el => el.classList.contains('sel')), true); assert.equal(await page.locator('#prTablesGrid_mult [data-matrix-row="2"]').getAttribute('data-state'), 'parcial'); assert.equal(await page.locator('#prTablesGrid_mult [data-matrix-col="8"]').getAttribute('data-state'), 'parcial');
      await page.getByRole('button', { name: '5. Vista previa' }).click(); const patchResponsePromise = page.waitForResponse(response => response.url().includes('/api/exams/') && response.request().method() === 'PATCH'); await page.locator('#prSaveConfig').click(); const patchResponse = await patchResponsePromise; assert.equal(patchResponse.status(), 200);
      const patchBody = await patchResponse.json(); assert.deepStrictEqual(patchBody.test.configuration.opsConfig.mult.matrix, ['2x8']); assert.equal(patchBody.test.configuration.opsConfig.mult.ranges, undefined); assert.equal(patchBody.test.configuration.customField, 'preserve-me');
      const persisted = await readJson(await fetch(`${server.base}/api/exams/${testId}`, { headers: { 'X-Admin-Password': 'admin' } })); assert.deepStrictEqual(persisted.body.test.configuration.opsConfig.mult.matrix, ['2x8']);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.click('#tab-pruebas'); await page.click('[data-pr-section-target="programming"]'); await page.evaluate(() => window.prLoadTestLibrary()); await page.waitForSelector(`[data-test-library-card="${testId}"]`); await page.locator(`[data-test-library-card="${testId}"] .pr-test-select`).click(); await page.getByRole('button', { name: /3\.\s*Detalle/ }).click(); await page.locator('[data-pr-builder-panel="3"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#prTablesGrid_mult [data-row="2"][data-col="8"]').evaluate(el => el.classList.contains('sel')), true); assert.equal(await page.locator('#prRangeTable_mult').count(), 0); assert.equal(await page.locator('#prRangeFrom_mult').count(), 0); assert.equal(await page.locator('#prRangeTo_mult').count(), 0); assert.deepStrictEqual(pageErrors, []);
      console.log('check-test-table-ranges-real-reload-ui: ok');
    } finally { await browser.close(); }
  } finally { if (server?.child) server.child.kill('SIGINT'); await wait(100); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
