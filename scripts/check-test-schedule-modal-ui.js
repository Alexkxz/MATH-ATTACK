'use strict';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('src/client/maestro/testLibrary.js', 'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://calendar.test/maestro.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main><div id="prTestLibraryFilters"><input id="prTestSearch"><select id="prTestStatus"></select><input id="prTestGroup"><input id="prTestFrom"><input id="prTestTo"></div><span id="prTestLibraryStatus"></span><div id="prTestSummaryList"></div><div id="prSelectedTest"></div><div id="prTestLibraryList"></div><input id="prAttemptTestId"><div id="prScheduleModal" class="pr-summary-modal"><p id="prScheduleModalTest"></p><button id="prScheduleModalClose"></button><button id="prScheduleCancel"></button><button id="prScheduleSave"></button><input id="prScheduleStart" type="datetime-local"><input id="prScheduleClose" type="datetime-local"><p id="prScheduleStatus"></p></div></main>' }));
    await page.goto('http://calendar.test/maestro.html', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: `const _adminPass='secret'; function adminUrl(url){return url;} ${source}` });
    await page.evaluate(() => { window.__schedule = null; window.fetch = async (url, options = {}) => { if (url.endsWith('/schedule')) { window.__schedule = JSON.parse(options.body); return { ok: true, json: async () => ({ ok: true, test: { testId: '11111111-1111-4111-8111-111111111111', folio: '0001', title: 'Programable', status: 'scheduled', revision: 2, startsAt: window.__schedule.startsAt, closesAt: window.__schedule.closesAt, groups: [], assignmentCount: 0, attemptCount: 0, hasOfficialResults: false, hasRankingPublications: false } }) }; } return { ok: true, json: async () => ({ tests: [{ testId: '11111111-1111-4111-8111-111111111111', folio: '0001', title: 'Programable', status: 'draft', revision: 1, createdAt: '2026-01-01T00:00:00.000Z', groups: [], assignmentCount: 0, attemptCount: 0, hasOfficialResults: false, hasRankingPublications: false }] }) }; }; });
    await page.evaluate(() => prLoadTestLibrary()); await page.waitForFunction(() => document.querySelector('.pr-test-schedule'));
    await page.locator('.pr-test-schedule').click();
    assert.equal(await page.locator('#prScheduleModal').getAttribute('aria-hidden'), 'false');
    await page.locator('#prScheduleStart').fill('2026-09-20T10:30'); await page.locator('#prScheduleClose').fill('2026-09-20T11:30'); await page.locator('#prScheduleSave').click();
    await page.waitForFunction(() => window.__schedule);
    const schedule = await page.evaluate(() => window.__schedule);
    assert.equal(schedule.revision, 2); assert.equal(schedule.startsAt, '2026-09-20T16:30:00.000Z'); assert.equal(schedule.closesAt, '2026-09-20T17:30:00.000Z');
    console.log('OK calendario de programación: abre ventana, valida fechas y envía inicio/cierre en ISO.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
