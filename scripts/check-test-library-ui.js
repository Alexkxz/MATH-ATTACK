'use strict';

const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('src/client/maestro/testLibrary.js', 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('http://library.test/maestro.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main data-page="maestro.html"><div id="prTestLibraryFilters"><input id="prTestSearch"><select id="prTestStatus"></select><input id="prTestGroup"><input id="prTestFrom"><input id="prTestTo"></div><span id="prTestLibraryStatus"></span><div id="prSelectedTest"></div><div id="prTestLibraryList"></div><input id="prAttemptTestId"></main>' }));
    await page.goto('http://library.test/maestro.html', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: `const _adminPass='secret'; function adminUrl(url){return url;} window.prLoadAttempts=()=>{window.__attemptLoads=(window.__attemptLoads||0)+1;}; ${source}` });
    assert.equal(await page.getAttribute('[data-page]', 'data-page'), 'maestro.html');
    assert.deepEqual(pageErrors, [], `la página debe cargar sin pageerror: ${pageErrors.join('; ')}`);
    await page.evaluate(() => { window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ tests: [{ testId: 'test-1', title: 'Prueba activa', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', scheduledAt: null, closesAt: null, groups: ['5A'], assignmentCount: 2, attemptCount: 2, hasOfficialResults: true, hasRankingPublications: false }, { testId: 'test-2', title: 'Prueba cerrada', status: 'finished', createdAt: '2025-12-01T00:00:00.000Z', groups: [], assignmentCount: 0, attemptCount: 0, hasOfficialResults: false, hasRankingPublications: false }, { testId: 'test-3', title: 'Borrador nuevo', status: 'draft', createdAt: '2025-11-01T00:00:00.000Z', groups: [], assignmentCount: 0, attemptCount: 0, hasOfficialResults: false, hasRankingPublications: false }] }) }); });
    await page.evaluate(() => prLoadTestLibrary());
    await page.waitForFunction(() => document.querySelectorAll('.pr-test-card').length === 3);
    assert.equal(await page.locator('.pr-test-card').count(), 3);
    assert.equal(await page.locator('.pr-test-schedule').count(), 1);
    assert.equal(await page.locator('.pr-test-assign').count(), 2);
    assert((await page.locator('.pr-test-card').first().textContent()).includes('test-1'));
    await page.locator('.pr-test-select').first().click();
    assert.equal(await page.locator('#prAttemptTestId').inputValue(), 'test-1');
    assert.equal(await page.evaluate(() => window.__attemptLoads), 1);
    assert((await page.locator('#prSelectedTest').textContent()).includes('Prueba activa'));
    await page.locator('#prTestSearch').fill('cerrada');
    assert.equal(await page.locator('.pr-test-card').count(), 1);
    assert((await page.locator('.pr-test-card').textContent()).includes('test-2'));
    const html = await page.locator('body').innerHTML();
    assert(!html.match(/password|token|cookie/i));
    console.log('OK: biblioteca UI filtra, muestra testId/estado, selecciona prueba, conserva respaldo manual y carga intentos una vez.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
