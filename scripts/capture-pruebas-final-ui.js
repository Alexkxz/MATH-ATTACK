'use strict';
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  fs.mkdirSync('artifacts', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:8080/maestro', { waitUntil: 'networkidle', timeout: 30000 });
    if (await page.locator('#loginOverlay').isVisible().catch(() => false)) {
      await page.locator('#loginUser').fill('admin');
      await page.locator('#loginPass').fill('admin');
      await page.locator('.login-btn').click();
      await page.locator('#loginOverlay.hidden').waitFor({ state: 'attached', timeout: 10000 });
    }
    await page.getByRole('button', { name: /Pruebas/ }).click();
    await page.locator('#panel-pruebas').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-pr-section-target="assignments"]').click();
    await page.screenshot({ path: 'artifacts/pruebas-asignaciones-final.png', fullPage: true });
    console.log('OK captura: artifacts/pruebas-asignaciones-final.png');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
