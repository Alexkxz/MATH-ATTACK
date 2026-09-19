'use strict';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('src/client/maestro/testLibrary.js', 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://picker.test/maestro.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: `<main><div id="prTestLibraryFilters"><input id="prTestSearch"><select id="prTestStatus"></select><input id="prTestGroup"><input id="prTestFrom"><input id="prTestTo"></div><span id="prTestLibraryStatus"></span><div id="prTestSummaryList"></div><div id="prSelectedTest"></div><input id="prAttemptTestId"><div id="prTestLibraryList"></div><div id="prGroupsStatus"></div><div id="prGroupsList"></div><div id="prSelectedGroup"></div><div id="prGroupMembersList"></div><select id="prGroupStudentGrade"><option value="">Todos</option><option value="5">5°</option><option value="6">6°</option></select><select id="prGroupStudentSelect"></select><select id="prGroupMemberSelect"></select><div id="prAssignmentsStatus"></div><div id="prAssignmentsList"></div><button id="prGroupAddMember"></button><button id="prGroupRemoveMember"></button><button id="prGroupAssign"></button></main>` }));
    await page.goto('http://picker.test/maestro.html', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: `const _adminPass='secret'; function adminUrl(url){return url;} window.prLoadAttempts=()=>{}; ${source}` });
    await page.evaluate(() => {
      if (!window.crypto.randomUUID) Object.defineProperty(window.crypto, 'randomUUID', { value: () => 'event-test', configurable: true });
      let members = ['11111111-1111-4111-8111-111111111111'];
      const students = [
        { id: 'ana-publico', accountPlayerId: members[0], name: 'Ana 5', grade: '5° Grado' },
        { id: 'beto-publico', accountPlayerId: '22222222-2222-4222-8222-222222222222', name: 'Beto 5', grade: '5° Grado' },
        { id: 'carla-publico', accountPlayerId: '33333333-3333-4333-8333-333333333333', name: 'Carla 6', grade: '6° Grado' },
      ];
      const group = () => ({ groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Grupo 5A', grade: '5', schoolYear: '2030', revision: members.length + 1, memberAccountPlayerIds: [...members] });
      window.fetch = async (url, options = {}) => {
        if (url.startsWith('/api/maestro/tests')) return { ok: true, json: async () => ({ tests: [{ testId: 'test-1', title: 'Prueba', status: 'draft', createdAt: '2026-01-01T00:00:00.000Z', groups: [], assignmentCount: 0, attemptCount: 0, hasOfficialResults: false, hasRankingPublications: false }] }) };
        if (url.startsWith('/api/players')) return { ok: true, json: async () => students };
        if (url.includes('/members') && options.method === 'POST') { members.push(JSON.parse(options.body).accountPlayerId); return { ok: true, json: async () => ({ group: group() }) }; }
        if (url.startsWith('/api/maestro/groups')) return { ok: true, json: async () => ({ groups: [group()] }) };
        if (url.includes('/api/exams/test-1/assignments')) return { ok: true, json: async () => ({ assignments: [] }) };
        if (url.includes('/api/exams/test-1') && (!options.method || options.method === 'GET')) return { ok: true, json: async () => ({ test: { testId: 'test-1', title: 'Prueba', status: 'draft', revision: 1, folio: '0001', configuration: {} } }) };
        return { ok: true, json: async () => ({}) };
      };
    });
    await page.evaluate(async () => { await prLoadTestLibrary(); await prLoadGroups(); });
    await page.waitForFunction(() => document.querySelector('.pr-group-select'));
    await page.locator('.pr-group-select').click();
    assert.equal(await page.locator('#prGroupStudentSelect option').count(), 3);
    await page.locator('#prGroupStudentGrade').selectOption('5');
    assert.deepEqual(await page.locator('#prGroupStudentSelect option').allTextContents(), ['Selecciona un alumno registrado', 'Beto 5 · 5° Grado']);
    await page.locator('#prGroupStudentSelect').selectOption('22222222-2222-4222-8222-222222222222');
    await page.locator('#prGroupAddMember').click();
    await page.waitForFunction(() => document.querySelector('#prGroupStudentSelect').disabled);
    assert((await page.locator('#prGroupMemberSelect').allTextContents()).some(text => text.includes('Beto 5')));
    assert((await page.locator('#prGroupMembersList').textContent()).includes('Beto 5'));
    assert((await page.locator('#prGroupMembersList').textContent()).includes('5° Grado'));
    assert.deepEqual(errors, []);
    console.log('OK selector de alumnos: carga, filtro por grado, excluye integrantes, agrega y refresca sin errores.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
