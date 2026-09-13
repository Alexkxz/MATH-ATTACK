'use strict';

const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

const maestro = fs.readFileSync('maestro.html', 'utf8');
const rangeStart = maestro.indexOf('const _PR_OP_NAME=');
const rangeEnd = maestro.indexOf('function prFmtDuration', rangeStart);
assert(rangeStart >= 0 && rangeEnd > rangeStart, 'no se encontró el bloque real de rangos');
const rangeSource = maestro.slice(rangeStart, rangeEnd);
const librarySource = fs.readFileSync('src/client/maestro/testLibrary.js', 'utf8');
const helperSource = fs.readFileSync('src/client/maestro/tableRanges.js', 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const html = '<main><div id="prTestLibraryFilters"><input id="prTestSearch"><select id="prTestStatus"></select><input id="prTestGroup"><input id="prTestFrom"><input id="prTestTo"></div><span id="prTestLibraryStatus"></span><div id="prSelectedTest"></div><div id="prTestLibraryList"></div><input id="prAttemptTestId"><div id="prOpSections"></div><div id="prSummary"></div></main>';
    await page.route('http://ranges.test/maestro.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await page.goto('http://ranges.test/maestro.html', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: helperSource });
    await page.addScriptTag({ content: `const _adminPass='secret'; function adminUrl(url){return url;} function showMsg(message){window.__message=message;} window.prLoadAttempts=()=>{}; window.prUpdateSummary=()=>{}; ${rangeSource}` });
    await page.evaluate(() => { document.getElementById('prOpSections').innerHTML = _prOpSectionHTML('mult'); prRenderRanges(); });
    await page.addScriptTag({ content: librarySource });
    assert.deepEqual(errors, [], `la interfaz de rangos debe cargar sin pageerror: ${errors.join('; ')}`);
    const state = { configuration: { grade: '5A', opsConfig: { mult: { tables: [8], ranges: [{ table: 8, from: 1, to: 5 }], manner: 'ordered' } } }, revision: 1 };
    await page.evaluate(current => {
      window.__state = current;
      window.__calls = [];
      window.fetch = async (url, options = {}) => {
        const body = options.body ? JSON.parse(options.body) : null;
        window.__calls.push({ url, method: options.method || 'GET', body, headers: options.headers || {} });
        if (url.includes('/api/exams/') && options.method === 'PATCH') { window.__state.configuration = body.configuration; window.__state.revision = body.revision; return { ok: true, status: 200, json: async () => ({ ok: true, test: { testId: 'test-ranges', title: 'Rangos', revision: window.__state.revision, configuration: window.__state.configuration } }) }; }
        if (url.includes('/api/exams/')) return { ok: true, status: 200, json: async () => ({ ok: true, test: { testId: 'test-ranges', title: 'Rangos', revision: window.__state.revision, configuration: window.__state.configuration } }) };
        return { ok: true, status: 200, json: async () => ({ tests: [{ testId: 'test-ranges', title: 'Rangos', status: 'draft', revision: window.__state.revision, groups: [], assignmentCount: 0, attemptCount: 0, hasOfficialResults: false, hasRankingPublications: false }] }) };
      };
    }, state);
    await page.evaluate(() => prLoadTestLibrary());
    await page.waitForFunction(() => document.querySelector('[data-test-library-card]'));
    await page.locator('.pr-test-select').click();
    await page.waitForFunction(() => document.querySelector('#prRangesPreview_mult')?.textContent.includes('Tabla 8'));
    assert((await page.locator('#prRangesPreview_mult').textContent()).includes('5 ejercicios'));
    await page.locator('#prRangeTable_mult').selectOption('9'); await page.locator('#prRangeFrom_mult').fill('4'); await page.locator('#prRangeTo_mult').fill('9'); await page.locator('button', { hasText: 'Agregar tabla' }).click();
    assert.equal(await page.locator('.pr-range-chip').count(), 2);
    await page.evaluate(() => { window.prompt = () => 'Rangos editados'; });
    await page.locator('.pr-test-edit').click();
    await page.waitForFunction(() => document.querySelector('#prTestLibraryStatus')?.textContent.includes('prueba(s) disponibles'));
    const patchCall = await page.evaluate(() => window.__calls.find(call => call.method === 'PATCH'));
    assert(patchCall && patchCall.body.configuration.opsConfig.mult.ranges.some(range => range.table === 8 && range.from === 1 && range.to === 5));
    assert.equal(patchCall.body.configuration.grade, '5A'); assert.equal(patchCall.body.password, undefined); assert.equal(patchCall.headers['X-Admin-Password'], 'secret');
    await page.evaluate(() => { window.prLoadTestConfiguration({ grade: '5A', opsConfig: { mult: { tables: [8], ranges: [{ table: 8, from: 2, to: 2 }], manner: 'ordered' } } }); });
    assert.equal(await page.locator('.pr-range-chip').count(), 1); assert((await page.locator('#prRangesPreview_mult').textContent()).includes('1 ejercicios'));
    assert.deepEqual(errors, []); console.log('check-test-table-ranges-persistence-ui: ok');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
