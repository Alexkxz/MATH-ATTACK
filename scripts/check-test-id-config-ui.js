'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-test-id-'));
  const store = createTestStore({ baseDir: dir });
  const service = createTestService({ store });
  const creator = '11111111-1111-4111-8111-111111111111';
  const original = service.create({ title: 'Prueba ID', creator });
  assert.match(original.testId, /^[0-9a-f-]{36}$/i);
  const edited = service.update(original.testId, 2, { title: 'Prueba ID editada' });
  assert.equal(edited.testId, original.testId);
  const copy = service.duplicate(original.testId);
  assert.match(copy.test.testId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(copy.test.testId, original.testId);
  const reopened = createTestService({ store }).get(original.testId);
  assert.equal(reopened.testId, original.testId);
  assert.match(fs.readFileSync('ranking.html', 'utf8'), /testId/);

  const source = fs.readFileSync('src/client/maestro/testLibrary.js', 'utf8');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://ids.test/maestro.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main><div id="prTestLibraryFilters"><input id="prTestSearch"><select id="prTestStatus"></select><input id="prTestGroup"><input id="prTestFrom"><input id="prTestTo"></div><span id="prTestLibraryStatus"></span><div id="prSelectedTest"></div><div id="prTestLibraryList"></div><span id="prConfigTestId"></span><button id="prCopyConfigTestId" type="button"></button><button id="prDuplicateFromConfig" type="button"></button><input id="prAttemptTestId"></main>' }));
    await page.goto('http://ids.test/maestro.html', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: `const _adminPass='secret'; function adminUrl(url){return url;} ${source}` });
    await page.evaluate(() => {
      window.__copied = '';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copied = value; } } });
      window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ tests: [{ testId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Nueva', status: 'draft', createdAt: '2026-09-14T12:00:00.000Z', groups: [], assignmentCount: 0, attemptCount: 0 }, { testId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Anterior', status: 'finished', createdAt: '2026-09-13T12:00:00.000Z', groups: [], assignmentCount: 0, attemptCount: 0 }] }) });
    });
    await page.evaluate(() => window.prLoadTestLibrary());
    await page.locator('[data-test-library-card="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] .pr-test-select').click();
    assert.equal(await page.locator('#prConfigTestId').textContent(), 'testId: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(await page.locator('#prAttemptTestId').inputValue(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await page.click('#prCopyConfigTestId');
    assert.equal(await page.evaluate(() => window.__copied), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(await page.locator('#prConfigTestId').textContent(), 'testId: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  } finally { await browser.close(); }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('OK: testId automático, único, estable al editar/reabrir, nuevo al duplicar y copiable desde Configuración.');
})().catch(error => { console.error(error); process.exit(1); });
