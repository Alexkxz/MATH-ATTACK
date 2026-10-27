'use strict';

// Real Chromium against the built React /maestro app. API fixtures are fake;
// the local server uses an isolated temporary data directory for static/app
// hosting and WebSocket startup. This is a UI contract test, not backend E2E.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_PASSWORD = 'fake-pruebas7-admin-password';
const VIEWPORTS = [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 },
  { width: 1366, height: 768 }, { width: 1920, height: 1080 },
];
const uuid = {
  draft: '71717171-7171-4171-8171-717171717171',
  delete: '72727272-7272-4272-8272-727272727272',
  finished: '73737373-7373-4373-8373-737373737373',
};
const quickConfig = {
  version: 1, title: 'Prueba programable con título deliberadamente largo para validar ajuste de texto',
  description: '', grade: '5', total: 10, order: 'ordered', repeat: false, enabledOperations: ['mult'],
  operationOrder: ['mult'], answerMode: 'write', allowedAttempts: 1, timeLimit: 0, timePerQuestion: 30,
  opsConfig: { mult: { mode: 'quick', perTableQty: 10, tables: [3], quickTables: [3], range: { from: 1, to: 10 }, matrix: ['1x3', '2x3', '3x3', '4x3', '5x3', '6x3', '7x3', '8x3', '9x3', '10x3'], matrixCustomized: false, expansionLimit: 1, manner: 'ordered' } },
};
const tests = [
  { testId: uuid.draft, folio: '0081', title: quickConfig.title, description: '', status: 'draft', revision: 1, createdAt: '2030-01-01T10:00:00.000Z', updatedAt: '2030-01-01T10:00:00.000Z', startsAt: null, closesAt: null, archivedAt: null, attemptCount: 0, canDeleteDraft: true, questionCount: 10, assignmentCount: 1, configuration: quickConfig },
  { testId: uuid.delete, folio: '0082', title: 'Borrador para eliminar', description: '', status: 'draft', revision: 1, createdAt: '2030-01-02T10:00:00.000Z', updatedAt: '2030-01-02T10:00:00.000Z', archivedAt: null, attemptCount: 0, canDeleteDraft: true, questionCount: 0, assignmentCount: 0, configuration: {} },
  { testId: uuid.finished, folio: '0083', title: 'Prueba finalizada ficticia', description: '', status: 'finished', revision: 4, createdAt: '2030-01-03T10:00:00.000Z', updatedAt: '2030-01-03T10:00:00.000Z', archivedAt: null, attemptCount: 1, questionCount: 10, assignmentCount: 1, configuration: quickConfig },
];
const calls = [];
const studentId = '74747474-7474-4474-8474-747474747474';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
  });
}
async function startServer(dataDir) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dataDir,
    MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'), MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'),
    MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log'),
  } });
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, output: () => output }; } catch (_) {}
    await wait(100);
  }
  await stopServer(child); throw new Error(`No inició el servidor aislado${output ? `: ${output}` : ''}`);
}
async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) {}
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(4000)]);
  if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch (_) {} await new Promise(resolve => child.once('exit', resolve)); }
}
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-pruebas7-react-data-'));
  const evidenceBase = path.join(ROOT, 'evidence', 'pruebas7-react-ui');
  fs.mkdirSync(evidenceBase, { recursive: true });
  const runDir = path.join(evidenceBase, new Date().toISOString().replace(/[:.]/g, '-'));
  if (fs.existsSync(runDir)) throw new Error(`No se sobrescribe evidencia existente: ${runDir}`);
  fs.mkdirSync(runDir, { recursive: true });
  calls.length = 0;
  let server, browser;
  try {
    server = await startServer(dataDir);
    const backendDraftResponse = await fetch(`${server.base}/api/exams`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': 'admin' }, body: JSON.stringify({ title: 'Borrador API ficticio', configuration: {} }) });
    assert.equal(backendDraftResponse.status, 201, 'isolated server creates the draft fixture');
    const backendDraft = (await backendDraftResponse.json()).test;
    const unauthorizedDelete = await fetch(`${server.base}/api/exams/${backendDraft.testId}/draft`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: backendDraft.revision + 1 }) });
    assert.equal(unauthorizedDelete.status, 401, 'draft deletion endpoint requires administrator authentication');
    const stillPresent = await fetch(`${server.base}/api/exams/${backendDraft.testId}`, { headers: { 'X-Admin-Password': 'admin' } });
    assert.equal(stillPresent.status, 200, 'unauthorized request leaves the draft intact');
    const authorizedDelete = await fetch(`${server.base}/api/exams/${backendDraft.testId}/draft`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': 'admin' }, body: JSON.stringify({ revision: backendDraft.revision + 1 }) });
    assert.equal(authorizedDelete.status, 200, 'authorized empty draft can be deleted');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Pacific/Auckland' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(password => { sessionStorage.setItem('maestroAuth', '1'); sessionStorage.setItem('maestroPwd', password); }, ADMIN_PASSWORD);
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), pathname = url.pathname, method = request.method();
      let body = {};
      try { body = request.postDataJSON() || {}; } catch (_) {}
      calls.push({ pathname, method, body });
      const list = tests.map(test => ({ ...test }));
      if (pathname === '/api/players' && method === 'GET') return json(route, []);
      if (pathname === '/api/players/aureos-log' && method === 'GET') return json(route, []);
      if (pathname === '/api/connections') return json(route, { connections: [], log: [] });
      if (pathname === '/api/achievements') return json(route, []);
      if (pathname === '/api/maestro/tests') return json(route, { tests: list });
      const details = pathname.match(/^\/api\/exams\/([^/]+)$/);
      if (details && method === 'GET') return json(route, { test: { ...tests.find(row => row.testId === details[1]) } });
      const assignments = pathname.match(/^\/api\/exams\/([^/]+)\/assignments$/);
      if (assignments && method === 'GET') return json(route, { assignments: [{ testId: assignments[1], targetType: 'student', accountPlayerId: studentId }] });
      const schedule = pathname.match(/^\/api\/exams\/([^/]+)\/schedule$/);
      if (schedule && method === 'POST') {
        const test = tests.find(row => row.testId === schedule[1]); Object.assign(test, body, { status: 'scheduled', revision: body.revision, updatedAt: new Date().toISOString() });
        return json(route, { ok: true, test: { ...test } });
      }
      const state = pathname.match(/^\/api\/exams\/([^/]+)\/state$/);
      if (state && method === 'POST') {
        const test = tests.find(row => row.testId === state[1]);
        const states = { start: 'active', close: 'closed', unschedule: 'draft', pause: 'paused', resume: 'active' };
        test.status = states[body.action] || test.status; test.revision = body.revision;
        if (body.action === 'unschedule') { test.startsAt = null; test.closesAt = null; }
        if (body.action === 'start' && body.force) test.availabilityOverride = 'open';
        if (body.action === 'close') test.availabilityOverride = 'closed';
        return json(route, { ok: true, test: { ...test } });
      }
      const archive = pathname.match(/^\/api\/exams\/([^/]+)$/);
      if (archive && method === 'DELETE') {
        const test = tests.find(row => row.testId === archive[1]); test.archivedAt = new Date().toISOString(); test.revision = body.revision;
        return json(route, { ok: true, test: { ...test } });
      }
      const restore = pathname.match(/^\/api\/exams\/([^/]+)\/restore$/);
      if (restore && method === 'POST') {
        const test = tests.find(row => row.testId === restore[1]); test.archivedAt = null; test.revision = body.revision;
        return json(route, { ok: true, test: { ...test } });
      }
      const remove = pathname.match(/^\/api\/exams\/([^/]+)\/draft$/);
      if (remove && method === 'DELETE') {
        const index = tests.findIndex(row => row.testId === remove[1]);
        if (index >= 0) tests.splice(index, 1);
        return json(route, { ok: true, deleted: true });
      }
      return json(route, { ok: true, tests: [], assignments: [], connections: [], log: [], achievements: [] });
    });

    await page.goto(`${server.base}/maestro`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.locator(`[data-testid="schedule-open"]`).first().waitFor({ state: 'visible' });
    const draftCard = page.locator('article').filter({ hasText: quickConfig.title });
    const archiveFilter = page.locator('[data-testid="archived-filter"]');

    // Library fits each agreed viewport without horizontal page overflow.
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await draftCard.scrollIntoViewIfNeeded();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `history page overflow at ${viewport.width}x${viewport.height}`);
      await page.screenshot({ path: path.join(runDir, `history-${viewport.width}x${viewport.height}.png`) });
    }

    // Schedule modal: keyboard focus, explicit timezone, validation, conversion
    // from America/Mexico_City wall time despite a different browser timezone.
    const scheduleButton = page.locator(`[data-testid="schedule-open"]`).first();
    await page.setViewportSize({ width: 390, height: 844 });
    await scheduleButton.focus(); await page.keyboard.press('Enter');
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    try { await dialog.waitFor({ state: 'visible', timeout: 5000 }); }
    catch (error) { throw Error(`El control de programación no abrió el diálogo. Errores React: ${pageErrors.join(' | ')||'(ninguno)'}. Alertas: ${JSON.stringify(await page.locator('[role="alert"]').allTextContents())}. API: ${JSON.stringify(calls.slice(-6))}`); }
    assert((await dialog.textContent()).includes('Programación de prueba'));
    const openAt = page.locator('[data-testid="schedule-starts-at"]');
    const closeAt = page.locator('[data-testid="schedule-closes-at"]');
    const submit = page.locator('[data-testid="schedule-submit"]');
    assert((await dialog.textContent()).includes('America/Mexico_City'), 'dialog explains fixed timezone');
    assert.equal(await openAt.evaluate(node => document.activeElement === node), true, 'dialog focuses the opening field');
    await page.evaluate(() => { window.__pruebas7Keys = []; document.addEventListener('keydown', event => window.__pruebas7Keys.push({ key: event.key, target: event.target?.getAttribute?.('data-testid') || event.target?.getAttribute?.('aria-label'), prevented: event.defaultPrevented }), true); });
    await page.getByRole('button', { name: 'Cerrar programación' }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await openAt.evaluate(node => document.activeElement === node), true, 'Tab reaches opening field');
    for (let index = 0; index < 10 && !await closeAt.evaluate(node => document.activeElement === node); index += 1) await page.keyboard.press('Tab');
    assert.equal(await closeAt.evaluate(node => document.activeElement === node), true, `Tab reaches closing field (focused ${await page.evaluate(() => (document.activeElement && document.activeElement.outerHTML.slice(0,160)) || 'none')}; keys ${JSON.stringify(await page.evaluate(() => window.__pruebas7Keys))})`);
    const focusStyle = await closeAt.evaluate(node => { const style = getComputedStyle(node); return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`; });
    assert(/(2px|ring|rgb\()/.test(focusStyle), `focused date control should show focus: ${focusStyle}`);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `schedule modal overflow at ${viewport.width}x${viewport.height}`);
      await page.screenshot({ path: path.join(runDir, `schedule-modal-${viewport.width}x${viewport.height}.png`) });
    }
    await openAt.fill('2030-01-15T11:00'); await closeAt.fill('2030-01-15T10:00'); await submit.click();
    await page.getByRole('alert').filter({ hasText: /posterior|despu[eé]s/i }).waitFor({ state: 'visible' });
    assert.equal(calls.filter(row => row.pathname.endsWith('/schedule')).length, 0, 'invalid close-before-open is not submitted');
    await openAt.fill('2030-01-15T10:00'); await closeAt.fill('2030-01-15T11:00'); await submit.click();
    await page.getByRole('status').filter({ hasText: /Programada/i }).waitFor({ state: 'visible' });
    const scheduleCall = calls.find(row => row.pathname.endsWith('/schedule'));
    assert.equal(scheduleCall.body.startsAt, '2030-01-15T16:00:00.000Z');
    assert.equal(scheduleCall.body.closesAt, '2030-01-15T17:00:00.000Z');
    assert.equal(tests.find(row => row.testId === uuid.draft).status, 'scheduled');
    await page.screenshot({ path: path.join(runDir, 'scheduled-card-390x844.png') });

    // Manual actions retain explicit confirmation copy and route to state API.
    page.once('dialog', async dialogEvent => { assert(dialogEvent.message().includes('prevalecerá sobre el horario')); await dialogEvent.accept(); });
    await page.locator('[data-testid="manual-open"]').first().click();
    await page.getByRole('status').filter({ hasText: /abierta manualmente/i }).waitFor({ state: 'visible' });
    assert(calls.some(row => row.pathname.endsWith('/state') && row.body.action === 'start' && row.body.force === true));
    page.once('dialog', async dialogEvent => { assert(/podr[aá]n terminar y recuperarse/i.test(dialogEvent.message())); await dialogEvent.accept(); });
    await page.locator('[data-testid="manual-close"]').first().click();
    await page.getByRole('status').filter({ hasText: /Cerrada a nuevos inicios/i }).waitFor({ state: 'visible' });
    assert(calls.some(row => row.pathname.endsWith('/state') && row.body.action === 'close'));

    // Archive filter and restore keep the test finished.
    const finishedCard = page.locator('article').filter({ hasText: 'Prueba finalizada ficticia' });
    page.once('dialog', async dialogEvent => {
      assert(dialogEvent.message().includes('Prueba finalizada ficticia'));
      assert(dialogEvent.message().includes('0083'));
      assert(dialogEvent.message().includes('conservarán'));
      await dialogEvent.accept();
    });
    await finishedCard.locator('[data-testid="archive-test"]').click();
    await page.getByRole('status').filter({ hasText: /archivada/i }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('article').filter({ hasText: 'Prueba finalizada ficticia' }).count(), 0, 'archived test is hidden by default');
    await archiveFilter.click();
    const archivedCard = page.locator('article').filter({ hasText: 'Prueba finalizada ficticia' });
    await archivedCard.waitFor({ state: 'visible' });
    await archivedCard.locator('[data-testid="restore-test"]').click();
    await page.getByRole('status').filter({ hasText: /contin[uú]a finalizada/i }).waitFor({ state: 'visible' });
    assert.equal(tests.find(row => row.testId === uuid.finished).status, 'finished', 'restore cannot reactivate');
    await page.locator('[data-testid="history-filter"]').click();
    await page.locator('article').filter({ hasText: 'Prueba finalizada ficticia' }).waitFor({ state: 'visible' });

    // Draft deletion names the target and states that the action is permanent.
    const deleteCard = page.locator('article').filter({ hasText: 'Borrador para eliminar' });
    page.once('dialog', async dialogEvent => {
      assert(dialogEvent.message().includes('Borrador para eliminar'));
      assert(dialogEvent.message().includes('0082'));
      assert(/permanente/i.test(dialogEvent.message()));
      await dialogEvent.accept();
    });
    await deleteCard.locator('[data-testid="delete-draft"]').click();
    await page.getByRole('status').filter({ hasText: /eliminado definitivamente/i }).waitFor({ state: 'visible' });
    assert.equal(tests.some(row => row.testId === uuid.delete), false);

    console.log(`OK PRUEBAS.7 React UI: zona horaria, conversión ISO y validación, foco/teclado, archivo/filtro/restauración, borrador y manuales; capturas: ${runDir}`);
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server.child);
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dataDir));
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
