'use strict';
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('src/client/maestro/testLibrary.js', 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://audience.test/maestro.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: `<select id="prGrade"><option value="5° Grado">5° Grado</option><option value="6° Grado">6° Grado</option></select><select id="prAudienceMode"><option value="all">Todos</option><option value="group">Grupo</option><option value="custom">Personalizado</option></select><select id="prAudienceGroup"></select><div id="prAudienceStatus"></div><div id="prAudienceStudentsGrid"></div><div id="prGroupsList"></div><div id="prSelectedGroup"></div><div id="prGroupMembersList"></div><select id="prGroupStudentGrade"></select><select id="prGroupStudentSelect"></select><select id="prGroupMemberSelect"></select><div id="prGroupsStatus"></div><div id="prAssignmentsList"></div><div id="prAssignmentsStatus"></div>` }));
    await page.goto('http://audience.test/maestro.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { sessionStorage.setItem('maestroSelectedTestId', 'test-1'); window.crypto.randomUUID ||= (() => 'event-test'); });
    await page.addScriptTag({ content: `const _adminPass='secret'; function adminUrl(url){return url;} ${source}` });
    let savedAssignments = null;
    await page.evaluate(() => {
      window.fetch = async (url, options = {}) => {
        if (url.startsWith('/api/maestro/groups')) return { ok: true, json: async () => ({ groups: [{ groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Grupo 5A', grade: '5', revision: 1, memberAccountPlayerIds: ['11111111-1111-4111-8111-111111111111'] }, { groupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Grupo vacío', grade: '5', revision: 1, memberAccountPlayerIds: [] }] }) };
        if (url.startsWith('/api/players')) return { ok: true, json: async () => [{ id: 'ana-publico', accountPlayerId: '11111111-1111-4111-8111-111111111111', name: 'Ana', grade: '5° Grado' }, { id: 'beto-publico', accountPlayerId: '22222222-2222-4222-8222-222222222222', name: 'Beto', grade: '5° Grado' }, { id: 'carla-publico', accountPlayerId: '33333333-3333-4333-8333-333333333333', name: 'Carla', grade: '6° Grado' }] };
        if (url.includes('/assignments') && options.method === 'PUT') { window.__saved = JSON.parse(options.body).assignments; return { ok: true, json: async () => ({ assignments: window.__saved }) }; }
        if (url.includes('/assignments')) return { ok: true, json: async () => ({ assignments: [] }) };
        return { ok: true, json: async () => ({}) };
      };
    });
    await page.evaluate(() => {
      const grid = document.getElementById('prAudienceStudentsGrid');
      const all = document.createElement('button'); all.id = 'prAudienceSelectAll'; document.body.appendChild(all);
      const invert = document.createElement('button'); invert.id = 'prAudienceInvert'; document.body.appendChild(invert);
    });
    await page.evaluate(async () => { await prLoadAudience(); });
    await page.evaluate(async () => { await prSaveAudienceAssignments(); });
    savedAssignments = await page.evaluate(() => window.__saved);
    assert.deepEqual(savedAssignments, [{ targetType: 'student', accountPlayerId: '11111111-1111-4111-8111-111111111111' }, { targetType: 'student', accountPlayerId: '22222222-2222-4222-8222-222222222222' }]);
    await page.locator('#prAudienceMode').selectOption('custom');
    const emptySelectionError = await page.evaluate(async () => { try { await prSaveAudienceAssignments(); return ''; } catch (error) { return error.message; } });
    assert.equal(emptySelectionError, 'No hay alumnos seleccionados para la prueba');
    const cards = page.locator('[data-audience-student]');
    assert.equal(await cards.count(), 2);
    await cards.filter({ hasText: 'Beto' }).click();
    assert.equal(await page.locator('[data-audience-student].selected').count(), 1);
    await page.evaluate(async () => { await prSaveAudienceAssignments(); });
    savedAssignments = await page.evaluate(() => window.__saved);
    assert.deepEqual(savedAssignments, [{ targetType: 'student', accountPlayerId: '22222222-2222-4222-8222-222222222222' }]);
    await page.locator('#prAudienceSelectAll').click();
    await page.evaluate(async () => { await prSaveAudienceAssignments(); });
    savedAssignments = await page.evaluate(() => window.__saved);
    assert.deepEqual(savedAssignments, [{ targetType: 'student', accountPlayerId: '11111111-1111-4111-8111-111111111111' }, { targetType: 'student', accountPlayerId: '22222222-2222-4222-8222-222222222222' }]);
    await page.locator('#prAudienceInvert').click();
    const emptyGroupError = await page.evaluate(async () => { try { await prSaveAudienceAssignments(); return ''; } catch (error) { return error.message; } });
    assert.equal(emptyGroupError, 'No hay alumnos seleccionados para la prueba');
    console.log('OK asignación en configuración: filtro por grado, selección personalizada iluminada y grupo completo guardado.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
