'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise(resolve => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
});

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-operations-ui-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(), windowsHide: true, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json') },
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (let index = 0; index < 50; index += 1) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/exam/status`)).ok) break; } catch (_) {}
      await wait(100);
    }
    await page.goto(`http://127.0.0.1:${port}/maestro`, { waitUntil: 'domcontentloaded' });
    await page.fill('#loginUser', 'admin');
    await page.fill('#loginPass', 'admin');
    await page.click('.login-btn');
    await page.waitForSelector('#tab-pruebas', { timeout: 5000 });
    await page.click('#tab-pruebas');
    await page.click('[data-pr-section-target="programming"]');

    assert.strictEqual(await page.locator('#prMultiplier').count(), 0, 'el multiplicador no debe aparecer');
    assert.strictEqual(await page.locator('.pr-test-library').isVisible(), false, 'la biblioteca no debe aparecer en configuración');
    assert.strictEqual(await page.locator('#prOpSection_mult').count(), 1, 'multiplicación debe desplegarse inicialmente');
    assert.strictEqual(await page.locator('#prOpSection_add').count(), 0, 'suma debe estar plegada');
    const multButton = page.locator('label:has(#prOpMult)');
    const addButton = page.locator('label:has(#prOpAdd)');
    assert(Number(await multButton.evaluate(element => getComputedStyle(element).opacity)) > .9);
    assert(Number(await addButton.evaluate(element => getComputedStyle(element).opacity)) < .5);

    await addButton.click();
    assert.strictEqual(await page.locator('#prOpSection_add').count(), 1, 'suma debe desplegarse al seleccionarla');
    assert((await page.locator('#prCarryGrid_add').textContent()).includes('Sencillas'));
    assert((await page.locator('#prCarryGrid_add').textContent()).includes('Llevadas'));
    assert(Number(await addButton.evaluate(element => getComputedStyle(element).opacity)) > .9);

    await addButton.click();
    assert.strictEqual(await page.locator('#prOpSection_add').count(), 0, 'suma debe ocultarse al deseleccionarla');
    assert(Number(await addButton.evaluate(element => getComputedStyle(element).opacity)) < .5);

    await page.locator('#prDetail_mult').check();
    assert.strictEqual(await page.locator('#prMatrixDetail_mult').isVisible(), true, 'la matriz debe aparecer con mas detalle');
    assert.strictEqual(await page.locator('#prQuickTables_mult').isVisible(), false, 'el selector rapido debe ocultarse con mas detalle');
    assert.strictEqual(await page.locator('#prQtyRow_mult').isVisible(), false, 'preguntas por tabla debe ocultarse con mas detalle');
    assert.strictEqual(await page.locator('#prQty_mult').isDisabled(), true, 'preguntas por tabla debe deshabilitarse con mas detalle');
    assert((await page.locator('#prMatrixDetail_mult').textContent()).includes('1 pregunta por cada casilla seleccionada'), 'el modo detallado debe indicar una pregunta por casilla');
    assert.deepStrictEqual(errors, []);
    console.log('OK UI del maestro: operaciones activas/apagadas, configuracion dinamica y modo detallado.');
  } finally {
    await browser.close();
    child.kill('SIGINT');
    await wait(150);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
