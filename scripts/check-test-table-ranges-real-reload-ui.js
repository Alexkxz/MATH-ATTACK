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
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json') }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i += 1) { try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base }; } catch (_) {} await wait(100); }
  child.kill('SIGINT'); throw new Error('servidor temporal no inició');
}
async function readJson(response) { return { status: response.status, body: await response.json() }; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-table-ranges-reload-'));
  let server;
  const auth = { 'X-Admin-Password': 'admin', 'Content-Type': 'application/json' };
  try {
    server = await start(dir);
    const created = await readJson(await fetch(`${server.base}/api/exams`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Rangos con recarga', creator: randomUUID(), configuration: { grade: '5A', customField: 'preserve-me' } }) }));
    assert.strictEqual(created.status, 201); const testId = created.body.test.testId;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
      const bodies = [];
      page.on('request', request => { if (request.method() === 'PATCH') bodies.push(request.postDataJSON()); });
      async function openDetailStep() { const step = page.getByRole('button', { name: /3\.\s*Detalle/ }); await step.waitFor({ state: 'visible' }); await step.click(); await page.locator('[data-pr-builder-panel="3"]').waitFor({ state: 'visible' }); await page.locator('#prRangeTable_mult').waitFor({ state: 'visible' }); }
      async function openAndSelect() {
        await page.goto(`${server.base}/maestro`, { waitUntil: 'domcontentloaded' });
        if (await page.locator('#loginOverlay').isVisible().catch(() => false)) { await page.fill('#loginUser', 'admin'); await page.fill('#loginPass', 'admin'); await page.click('.login-btn'); await page.waitForFunction(() => document.getElementById('loginOverlay')?.classList.contains('hidden')); }
        await page.click('#tab-pruebas'); await page.click('[data-pr-section-target="programming"]'); await page.waitForFunction(() => typeof window.prLoadTestLibrary === 'function'); await page.evaluate(() => window.prLoadTestLibrary());
        await page.waitForSelector(`[data-test-library-card="${testId}"]`); await page.locator(`[data-test-library-card="${testId}"] .pr-test-select`).click(); await page.locator('[data-pr-section-target="programming"]').click(); await openDetailStep();
        await page.waitForFunction(id => document.getElementById('prAttemptTestId')?.value === id, testId);
        await page.waitForFunction(() => document.querySelector('#prRangesPreview_mult')?.textContent.includes('Sin rangos personalizados'));
      }
      await openAndSelect();
      await page.selectOption('#prRangeTable_mult', '8'); await page.fill('#prRangeFrom_mult', '1'); await page.fill('#prRangeTo_mult', '5'); await page.getByRole('button', { name: 'Agregar tabla' }).click();
      assert.equal(await page.locator('.pr-range-chip').count(), 1); assert((await page.locator('#prRangesPreview_mult').textContent()).includes('5 ejercicios'));
      await page.evaluate(() => { window.prompt = () => 'Rangos guardados'; }); const patchResponsePromise = page.waitForResponse(response => response.url().includes(`/api/exams/${testId}`) && response.request().method() === 'PATCH'); await page.locator(`[data-test-library-card="${testId}"] .pr-test-edit`).click(); const patchResponse = await patchResponsePromise; const patchBody = await patchResponse.json(); assert.equal(patchResponse.status(), 200); assert(patchBody.test?.configuration);
      await page.waitForFunction(() => document.querySelector('#prRangesPreview_mult')?.textContent.includes('Tabla 8'));
      assert.equal(bodies.length, 1); assert.deepStrictEqual(bodies[0].configuration.opsConfig.mult.ranges, [{ table: 8, from: 1, to: 5 }]); assert.equal(bodies[0].configuration.customField, 'preserve-me');
      const persisted = await readJson(await fetch(`${server.base}/api/exams/${testId}`, { headers: { 'X-Admin-Password': 'admin' } })); assert.deepStrictEqual(persisted.body.test.configuration.opsConfig.mult.ranges, [{ table: 8, from: 1, to: 5 }]);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.click('#tab-pruebas'); await page.click('[data-pr-section-target="programming"]'); await page.evaluate(() => window.prLoadTestLibrary()); await page.waitForSelector(`[data-test-library-card="${testId}"]`); await page.locator(`[data-test-library-card="${testId}"] .pr-test-select`).click(); await openDetailStep(); await page.waitForFunction(() => document.querySelector('#prRangesPreview_mult')?.textContent.includes('Tabla 8')); assert.equal(await page.locator('.pr-range-chip').count(), 1);
      await page.locator('[aria-label="Editar tabla 8"]').click(); await page.fill('#prRangeFrom_mult', '1'); await page.fill('#prRangeTo_mult', '6'); await page.getByRole('button', { name: 'Agregar tabla' }).click(); await page.evaluate(() => { window.prompt = () => 'Rangos editados'; }); const editResponsePromise = page.waitForResponse(response => response.url().includes(`/api/exams/${testId}`) && response.request().method() === 'PATCH'); await page.locator(`[data-test-library-card="${testId}"] .pr-test-edit`).click(); assert.equal((await editResponsePromise).status(), 200);
      await page.waitForFunction(() => document.querySelector('#prRangesPreview_mult')?.textContent.includes('6 ejercicios')); await page.reload({ waitUntil: 'domcontentloaded' }); await page.click('#tab-pruebas'); await page.click('[data-pr-section-target="programming"]'); await page.evaluate(() => window.prLoadTestLibrary()); await page.waitForSelector(`[data-test-library-card="${testId}"]`); const configurationBeforeDelete = page.waitForResponse(response => response.url().includes(`/api/exams/${testId}`) && response.request().method() === 'GET'); await page.locator(`[data-test-library-card="${testId}"] .pr-test-select`).click(); await configurationBeforeDelete; await openDetailStep(); await page.waitForFunction(() => document.querySelector('#prRangesPreview_mult')?.textContent.includes('6 ejercicios')); assert.equal(await page.locator('.pr-range-chip').count(), 1);
      assert.deepStrictEqual((await readJson(await fetch(`${server.base}/api/exams/${testId}`, { headers: { 'X-Admin-Password': 'admin' } }))).body.test.configuration.opsConfig.mult.ranges, [{ table: 8, from: 1, to: 6 }]);
      const beforeDelete = (await readJson(await fetch(`${server.base}/api/exams/${testId}`, { headers: { 'X-Admin-Password': 'admin' } }))).body.test; const beforeDeleteEvents = JSON.parse(fs.readFileSync(path.join(dir, 'pruebas.json'), 'utf8')).events.length; assert.deepStrictEqual(beforeDelete.configuration.opsConfig.mult.ranges, [{ table: 8, from: 1, to: 6 }]); await page.locator('[aria-label="Eliminar tabla 8"]').click(); assert.equal(await page.locator('.pr-range-chip').count(), 0); await page.evaluate(() => { window.prompt = () => 'Rangos eliminados'; }); const deleteResponsePromise = page.waitForResponse(response => response.url().includes(`/api/exams/${testId}`) && response.request().method() === 'PATCH'); await page.locator(`[data-test-library-card="${testId}"] .pr-test-edit`).click(); const deleteResponse = await deleteResponsePromise; assert.equal(deleteResponse.status(), 200); const deleteBody = await deleteResponse.json(); assert.equal(deleteBody.test?.configuration?.opsConfig?.mult?.ranges, undefined); const afterDelete = (await readJson(await fetch(`${server.base}/api/exams/${testId}`, { headers: { 'X-Admin-Password': 'admin' } }))).body.test; assert.equal(afterDelete.configuration.customField, 'preserve-me'); assert.equal(afterDelete.configuration.opsConfig?.mult?.ranges, undefined); assert(afterDelete.revision > beforeDelete.revision); const afterDeleteEvents = JSON.parse(fs.readFileSync(path.join(dir, 'pruebas.json'), 'utf8')).events.length; assert(afterDeleteEvents > beforeDeleteEvents); await page.reload({ waitUntil: 'domcontentloaded' }); await page.click('#tab-pruebas'); await page.click('[data-pr-section-target="programming"]'); await page.evaluate(() => window.prLoadTestLibrary()); await page.waitForSelector(`[data-test-library-card="${testId}"]`); await page.locator(`[data-test-library-card="${testId}"] .pr-test-select`).click(); await openDetailStep(); await page.waitForFunction(() => document.querySelector('#prRangesPreview_mult')?.textContent.includes('Sin rangos personalizados')); assert.equal(await page.locator('.pr-range-chip').count(), 0); assert.deepStrictEqual(pageErrors, []); console.log('check-test-table-ranges-real-reload-ui: ok');
    } finally { await browser.close(); }
  } finally { if (server?.child) server.child.kill('SIGINT'); await wait(100); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
