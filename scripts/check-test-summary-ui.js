'use strict';

const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    await page.route('http://summary.test/maestro.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main></main>' }));
    await page.goto('http://summary.test/maestro.html');
    await page.setContent(`<main>
      <nav><button data-pr-section-target="summary">Resumen</button><button data-pr-section-target="programming">Programación</button></nav><p id="prTestSectionStatus"></p>
      <section id="prTestSummary" data-pr-section="summary"><span id="prTestSummaryStatus"></span><div id="prTestSummaryList"></div></section>
      <section class="pr-test-library" data-pr-section="programming assignments"><button class="pr-test-create">Crear prueba</button><div id="prTestLibraryFilters"></div><div id="prSelectedTest"></div><div id="prTestLibraryList"></div></section>
      <input id="prAttemptTestId"><div id="prTestSummaryModal" aria-hidden="true"><div><button id="prSummaryModalClose">Cerrar</button><div id="prSummaryModalContent"></div></div></div>
    </main>`);
    await page.addScriptTag({ content: `const _adminPass='test'; function adminUrl(url){return url;} ${fs.readFileSync('src/client/maestro/testLibrary.js', 'utf8')}` });
    const tests = Array.from({ length: 9 }, (_, index) => ({ testId: `00000000-0000-4000-8000-00000000000${index + 1}`, title: `Prueba ${index + 1}`, status: ['finished', 'active', 'scheduled', 'draft', 'cancelled', 'paused', 'closed', 'active', 'draft'][index], createdAt: `2026-09-${String(14 - index).padStart(2, '0')}T10:00:00.000Z`, updatedAt: `2026-09-${String(14 - index).padStart(2, '0')}T${String(12 - index).padStart(2, '0')}:00:00.000Z`, lastModifiedAt: `2026-09-${String(14 - index).padStart(2, '0')}T${String(12 - index).padStart(2, '0')}:00:00.000Z`, groups: index % 2 ? [`grupo-${index}`] : [], assignmentCount: index % 2 ? 1 : 0, attemptCount: index, questionCount: 10 + index, operations: ['mult'], hasOfficialResults: index === 0, hasRankingPublications: index === 0, rankingPublicationCount: index === 0 ? 1 : 0, stateHistory: [{ action: 'test_created', occurredAt: `2026-09-${String(14 - index).padStart(2, '0')}T10:00:00.000Z` }] }));
    await page.evaluate(value => { window.fetch = async url => { if (url.includes('/assignments')) return new Response(JSON.stringify({ assignments: [{ targetType: 'student', accountPlayerId: '11111111-1111-4111-8111-111111111111' }] }), { status: 200 }); if (url.includes('/official-attempts')) return new Response(JSON.stringify({ officialAttempts: [{ officialAttemptId: '22222222-2222-4222-8222-222222222222' }] }), { status: 200 }); return new Response(JSON.stringify({ tests: value, test: { title: 'Prueba 1', description: 'Descripción segura', configuration: { total: 8, multiplier: 3, opsConfig: { mult: { qty: 4, tables: [2], ranges: [{ table: 2, from: 2, to: 5 }] }, add: { qty: 4, digits: 2, carryMode: 'both' } }, rewards: { aureos: 10, experience: 15 } } } }), { status: 200 }); }; window.prLoadTestLibrary(); }, tests);
    await page.waitForFunction(() => document.querySelectorAll('.pr-summary-card').length === 5);
    assert.equal(await page.locator('.pr-summary-card').count(), 5);
    assert((await page.locator('.pr-summary-card').allTextContents()).some(text => text.includes('Prueba 1')));
    assert.equal(await page.locator('.pr-summary-status-group').count(), 5);
    assert.equal(await page.locator('[data-summary-status="paused"]').count(), 0);
    assert.equal(await page.locator('[data-summary-status="closed"]').count(), 0);
    assert.equal(await page.locator('#prTestSummary .pr-test-create').count(), 0);
    assert((await page.locator('#prTestSummary').textContent()).includes('00000000-0000-4000-8000-000000000001'));
    await page.locator('.pr-summary-card').first().click(); await page.waitForFunction(() => document.getElementById('prTestSummaryModal').getAttribute('aria-hidden') === 'false'); await page.waitForFunction(() => !document.getElementById('prSummaryModalContent').textContent.includes('Cargando detalles'));
    const detail = await page.locator('#prSummaryModalContent').textContent(); assert(detail.includes('Descripción segura')); assert(detail.includes('Multiplicación')); assert(detail.includes('rango')); assert(detail.includes('Áureos')); assert(detail.includes('22222222-2222-4222-8222-222222222222')); assert(!detail.includes('password')); assert(!detail.includes('token'));
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#prTestSummaryModal').getAttribute('aria-hidden'), 'true');
    await page.locator('.pr-summary-card').first().click(); await page.locator('#prTestSummaryModal').click({ position: { x: 2, y: 2 } }); assert.equal(await page.locator('#prTestSummaryModal').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); await page.setViewportSize({ width: 1280, height: 800 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    console.log('OK UI Resumen: cinco recientes, orden, grupos, modal informativa, cierre, responsive y datos seguros');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
