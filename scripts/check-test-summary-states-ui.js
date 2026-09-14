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
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${base}/api/ranking`)).ok) return { child, base }; } catch (_) {} await wait(100); }
  child.kill('SIGINT'); throw Error('servidor temporal no inicio');
}
async function json(response) { return { status: response.status, body: await response.json() }; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-summary-states-'));
  let server;
  const auth = { 'Content-Type': 'application/json', 'X-Admin-Password': 'admin' };
  try {
    server = await start(dir);
    const create = await json(await fetch(`${server.base}/api/exams`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Regresión de estados', description: 'Historial estable', creator: randomUUID(), configuration: { total: 4, opsConfig: { mult: { tables: [2], qty: 4 } } } }) }));
    assert.equal(create.status, 201); const testId = create.body.test.testId; assert.match(testId, /^[0-9a-f-]{36}$/i);
    const cancelledCreate = await json(await fetch(`${server.base}/api/exams`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Prueba cancelada', creator: randomUUID(), configuration: {} }) }));
    assert.equal(cancelledCreate.status, 201); const cancelledId = cancelledCreate.body.test.testId;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      async function visibleState(expectedId, expectedStatus) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        if (await page.locator('#loginOverlay').isVisible().catch(() => false)) { await page.fill('#loginUser', 'admin'); await page.fill('#loginPass', 'admin'); await page.click('.login-btn'); await page.waitForFunction(() => document.getElementById('loginOverlay')?.classList.contains('hidden')); }
        await page.click('#tab-pruebas'); await page.waitForFunction(() => typeof window.prLoadTestLibrary === 'function'); await page.evaluate(() => window.prLoadTestLibrary());
        await page.waitForFunction(() => document.querySelectorAll('.pr-summary-card').length > 0);
        const cards = page.locator(`.pr-summary-card[data-summary-test-id="${expectedId}"]`); assert.equal(await cards.count(), 1, `la prueba ${expectedId} debe aparecer una sola vez`);
        const cardText = await cards.first().textContent(); assert(cardText.includes(expectedId)); assert(cardText.includes({ draft: 'Borrador', scheduled: 'Programada', active: 'Activa', paused: 'Pausada', closed: 'Cerrada', finished: 'Finalizada', cancelled: 'Cancelada' }[expectedStatus]));
        assert.equal(await page.locator('.pr-summary-card').count() <= 5, true);
        await cards.first().click(); await page.waitForFunction(() => document.getElementById('prTestSummaryModal')?.getAttribute('aria-hidden') === 'false');
        assert.equal(await page.locator('#prSummaryModalContent .pr-test-edit').count(), 0); assert.equal(await page.locator('#prSummaryModalContent .pr-test-create').count(), 0);
      }
      async function transition(url, body, expectedStatus, expectedId = testId) {
        const result = await json(await fetch(`${server.base}${url}`, { method: 'POST', headers: auth, body: JSON.stringify(body) }));
        assert.equal(result.status, 200); assert.equal(result.body.test.status, expectedStatus); assert.equal(result.body.test.testId, expectedId); return result.body.test;
      }
      await page.goto(`${server.base}/maestro`, { waitUntil: 'domcontentloaded' });
      let current = create.body.test;
      await visibleState(testId, 'draft');
      current = await transition(`/api/exams/${testId}/schedule`, { revision: current.revision + 1, startsAt: '2030-01-01T10:00:00.000Z' }, 'scheduled'); await visibleState(testId, 'scheduled');
      current = await transition(`/api/exams/${testId}/state`, { action: 'start', revision: current.revision + 1, force: true }, 'active'); await visibleState(testId, 'active');
      current = await transition(`/api/exams/${testId}/state`, { action: 'pause', revision: current.revision + 1 }, 'paused'); await visibleState(testId, 'paused');
      current = await transition(`/api/exams/${testId}/state`, { action: 'resume', revision: current.revision + 1 }, 'active'); await visibleState(testId, 'active');
      current = await transition(`/api/exams/${testId}/state`, { action: 'close', revision: current.revision + 1 }, 'closed'); await visibleState(testId, 'closed');
      current = await transition(`/api/exams/${testId}/state`, { action: 'finish', revision: current.revision + 1 }, 'finished'); await visibleState(testId, 'finished');
      const cancelled = await transition(`/api/exams/${cancelledId}/state`, { action: 'cancel', revision: cancelledCreate.body.test.revision + 1 }, 'cancelled', cancelledId); assert.equal(cancelled.testId, cancelledId); await visibleState(cancelledId, 'cancelled');
      const list = await json(await fetch(`${server.base}/api/maestro/tests?limit=100&sort=updatedAt&order=desc&pwd=admin`)); assert.equal(list.status, 200); assert.equal(new Set(list.body.tests.map(item => item.testId)).size, list.body.tests.length); assert.equal(list.body.tests.filter(item => item.testId === testId).length, 1); assert.equal(list.body.tests.find(item => item.testId === testId).lastModifiedAt !== undefined, true); assert.deepEqual(errors, []);
      console.log('OK: Resumen conserva una tarjeta por prueba durante todas las transiciones, orden actualizado, límite cinco, modal informativa y estados cancelados.');
    } finally { await browser.close(); }
  } finally { if (server?.child && !server.child.killed) server.child.kill('SIGINT'); await wait(100); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
