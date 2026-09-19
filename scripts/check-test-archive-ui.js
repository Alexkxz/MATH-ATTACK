'use strict';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('src/client/maestro/testLibrary.js', 'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://archive.test/maestro.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main><div id="prTestLibraryFilters"><input id="prTestSearch"><select id="prTestStatus"></select><input id="prTestGroup"><input id="prTestFrom"><input id="prTestTo"></div><span id="prTestLibraryStatus"></span><div id="prTestSummaryList"></div><div id="prSelectedTest"></div><div id="prTestLibraryList"></div><input id="prAttemptTestId"></main>' }));
    await page.goto('http://archive.test/maestro.html', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: `const _adminPass='secret'; function adminUrl(url){return url;} ${source}` });
    await page.evaluate(() => { window.confirm = () => true; window.__deleted = null; window.fetch = async (url, options = {}) => { if (options.method === 'DELETE') { window.__deleted = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ ok: true }) }; } return { ok: true, json: async () => ({ tests: [{ testId: '11111111-1111-4111-8111-111111111111', folio: '0001', title: 'Finalizada', status: 'finished', revision: 4, createdAt: '2026-01-01T00:00:00.000Z', groups: [], assignmentCount: 0, attemptCount: 1, hasOfficialResults: true, hasRankingPublications: false }, { testId: '22222222-2222-4222-8222-222222222222', folio: '0002', title: 'Activa', status: 'active', revision: 2, createdAt: '2026-01-02T00:00:00.000Z', groups: [], assignmentCount: 0, attemptCount: 0, hasOfficialResults: false, hasRankingPublications: false }] }) }; }; });
    await page.evaluate(() => prLoadTestLibrary());
    await page.waitForFunction(() => document.querySelector('.pr-test-archive'));
    assert.equal(await page.locator('.pr-test-archive').count(), 1);
    await page.locator('.pr-test-archive').click();
    await page.waitForFunction(() => window.__deleted);
    const deleted = await page.evaluate(() => window.__deleted);
    assert(deleted.url.endsWith('/api/exams/11111111-1111-4111-8111-111111111111'));
    assert.equal(deleted.body.revision, 5);
    console.log('OK eliminar de biblioteca: solo aparece en finalizadas, pide confirmación y archiva conservando historial.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
