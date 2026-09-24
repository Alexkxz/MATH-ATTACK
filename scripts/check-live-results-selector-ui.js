'use strict';

const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<select id="prLiveTestSelect"></select><span id="prLiveResultsStatus"></span><div id="prLiveResultsCards"></div>');
    await page.evaluate(() => {
      Object.defineProperty(window, 'sessionStorage', { value: { getItem: () => '', setItem: () => {}, removeItem: () => {} } });
      window.adminUrl = value => value;
      window.__liveResultFetches = [];
      const tests = [
        { testId: 'test-previo', folio: '0006', title: 'Prueba previa', status: 'active' },
        { testId: 'test-ultima', folio: '0007', title: 'Prueba actual', status: 'active' }
      ];
      window.fetch = async url => {
        window.__liveResultFetches.push(String(url));
        if (String(url).startsWith('/api/exams?')) return new Response(JSON.stringify({ tests }), { status: 200 });
        if (String(url) === '/api/exam/status') return new Response(JSON.stringify({ examModes: tests }), { status: 200 });
        if (String(url).includes('/attempts')) return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
        const test = tests.find(item => String(url).endsWith(`/api/exams/${item.testId}`));
        return new Response(JSON.stringify(test ? { test } : {}), { status: test ? 200 : 404 });
      };
    });
    await page.evaluate(source => { (0, eval)(source); }, fs.readFileSync('src/client/maestro/liveTestResults.js', 'utf8'));
    assert.equal(await page.evaluate(() => typeof window.prLiveResultsRefresh), 'function', 'el script de resultados debe cargar');
    await page.evaluate(() => window.dispatchEvent(new Event('load')));
    await page.waitForTimeout(50);

    const options = await page.locator('#prLiveTestSelect option').allTextContents();
    assert.equal(options.length, 3, `debe mostrar ambas pruebas y la opción inicial (estado: ${await page.locator('#prLiveResultsStatus').textContent()}, fetches: ${JSON.stringify(await page.evaluate(() => window.__liveResultFetches))})`);
    assert.equal(await page.locator('#prLiveTestSelect option[value="test-previo"]').count(), 1);
    assert.equal(await page.locator('#prLiveTestSelect option[value="test-ultima"]').count(), 1);

    await page.selectOption('#prLiveTestSelect', 'test-previo');
    await page.waitForTimeout(20);
    assert.equal(await page.locator('#prLiveTestSelect').inputValue(), 'test-previo');
    const fetches = await page.evaluate(() => window.__liveResultFetches);
    assert(fetches.some(url => url.includes('/api/maestro/tests/test-previo/attempts')), 'debe cargar resultados de la prueba previa');
    console.log('OK resultados live: dos pruebas activas visibles y seleccionables');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
