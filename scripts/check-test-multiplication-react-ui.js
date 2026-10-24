'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { createRoot, createTest } = require('../src/server/exams/testModel');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_ROOT = path.join(ROOT, 'evidence', 'pruebas6-multiplication');
const ADMIN_PASSWORD = 'synthetic-pruebas6-admin-7cb1';
const PROJECT_FILES = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const VIEWPORTS = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const OPERATION_CLASSIC = {
  mult: { border: 'rgba(248, 113, 113, 0.58)', background: 'rgba(248, 113, 113, 0.13)', glow: 'rgba(248, 113, 113, 0.3)' },
  add: { border: 'rgba(34, 197, 94, 0.55)', background: 'rgba(34, 197, 94, 0.13)', glow: 'rgba(34, 197, 94, 0.28)' },
  sub: { border: 'rgba(250, 204, 21, 0.55)', background: 'rgba(250, 204, 21, 0.12)', glow: 'rgba(250, 204, 21, 0.25)' },
  div: { border: 'rgba(59, 130, 246, 0.58)', background: 'rgba(59, 130, 246, 0.13)', glow: 'rgba(59, 130, 246, 0.3)' },
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashProjectData = () => Object.fromEntries(PROJECT_FILES.map(name => {
  const file = path.join(ROOT, name);
  return [name, fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase() : '<MISSING>'];
}));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
});
const safeRemoveTemp = dir => {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing unsafe temp cleanup: ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
};
const fixture = dir => {
  const root = createRoot();
  root.tests.push(createTest({ testId: 'abababab-abab-4bab-8bab-abababababab', title: 'Legacy exact config', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', configuration: { total: 10, order: 'ordered', repeat: false, enabledOperations: ['mult'], opsConfig: { mult: { qty: 10, quantityMode: 'total', tables: [3, 5], ranges: [{ table: 3, from: 1, to: 12 }, { table: 5, from: 1, to: 12 }], matrix: ['4x3', '8x5', '3x5'], expansionLimit: 1 } } } }));
  root.tests.push(createTest({ testId: 'bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc', title: 'Legacy range config', creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', configuration: { total: 10, order: 'ordered', repeat: false, enabledOperations: ['mult'], opsConfig: { mult: { qty: 10, quantityMode: 'total', tables: [3, 5], ranges: [{ table: 3, from: 2, to: 5 }, { table: 5, from: 7, to: 9 }], expansionLimit: 1 } } } }));
  for (const [name, value] of Object.entries({
    'pruebas.json': root, 'players.json': [], 'ranking.json': [], 'groups.json': { schemaVersion: 1, groups: [] },
    'config.json': { adminUsername: 'admin', adminPassword: ADMIN_PASSWORD }, 'devices.json': [], 'aureosLog.json': [],
  })) fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
};
async function launch(dataDir) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dataDir, MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'), MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'), MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log') }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let i = 0; i < 100; i += 1) { if (child.exitCode !== null) break; try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, output: () => output }; } catch (_) {} await wait(100); }
  await stop(child); throw new Error(`Server failed to start${output ? `: ${output}` : ''}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) {}
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(5000)]);
  if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch (_) {} await new Promise(resolve => child.once('exit', resolve)); }
}

(async () => {
  const before = hashProjectData(), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-pruebas6-react-data-'));
  assert(path.relative(ROOT, dataDir).startsWith('..'), 'test fixture must stay outside repository');
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const runDir = path.join(EVIDENCE_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
  if (fs.existsSync(runDir)) throw new Error(`Refusing to overwrite evidence folder ${runDir}`);
  fs.mkdirSync(runDir, { recursive: true });
  fixture(dataDir);
  let running, browser, context, runFailure;
  try {
    running = await launch(dataDir); browser = await chromium.launch({ headless: true }); context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(password => { sessionStorage.setItem('maestroAuth', '1'); sessionStorage.setItem('maestroPwd', password); }, ADMIN_PASSWORD);
    await page.goto(`${running.base}/maestro`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();

    const legacyBefore = fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8');
    await page.locator('article').filter({ hasText: 'Legacy exact config' }).getByRole('button', { name: 'Abrir' }).click();
    await page.getByText(/Conversi.*necesaria para editar esta multiplicaci/).waitFor({ state: 'visible' });
    assert.strictEqual(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'), legacyBefore, 'opening old config must not rewrite persistent test data');
    await page.getByRole('button', { name: /Guardar borrador/ }).click();
    await page.getByRole('alert').filter({ hasText: 'contrato anterior' }).last().waitFor({ state: 'visible' });
    assert.strictEqual(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'), legacyBefore, 'save must require an explicit conversion');
    await page.getByRole('button', { name: /Confirmar modo exacto/ }).click();
    await page.locator('[data-operation-config="mult"]').getByText('3 preguntas', { exact: true }).waitFor({ state: 'visible' });

    await page.getByRole('button', { name: 'Historial' }).click();
    await page.locator('article').filter({ hasText: 'Legacy range config' }).getByRole('button', { name: 'Abrir' }).click();
    await page.getByText(/Conversi.*necesaria para editar esta multiplicaci/).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Confirmar modo r.pido/ }).click();
    await page.locator('[data-operation-config="mult"]').getByText(/= 10 preguntas/).waitFor({ state: 'visible' });

    await page.getByRole('button', { name: /Nueva prueba/ }).click();
    const operationButtons = page.locator('[data-operation]');
    await operationButtons.first().waitFor({ state: 'visible' });
    assert.strictEqual(await operationButtons.count(), 4, 'operation selector should contain four stable controls');
    for (let index = 0; index < await operationButtons.count(); index += 1) if (await operationButtons.nth(index).getAttribute('aria-pressed') === 'true') { await operationButtons.nth(index).click(); await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false', `[data-operation="${await operationButtons.nth(index).getAttribute('data-operation')}"]`); }
    assert.strictEqual(await page.locator('[data-operation-config]').count(), 0, 'no operation should show a configuration when all are disabled');
    const selector = page.locator('[aria-label="Selector de operaciones"]');
    await page.mouse.move(0, 0);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport); await selector.scrollIntoViewIfNeeded(); await page.waitForTimeout(80);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'empty selector state must not overflow the page');
      if (viewport.width <= 390) assert(await selector.evaluate(node => node.scrollWidth > node.clientWidth), 'narrow phones should scroll within the operation selector');
      await page.screenshot({ path: path.join(runDir, 'operations-none-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const hoverOff = page.locator('[data-operation="add"]'); await hoverOff.hover(); await page.waitForTimeout(220);
    const hoverOffStyle = await hoverOff.evaluate(node => { const css = getComputedStyle(node); return { filter: css.filter, translate: css.translate }; });
    assert(hoverOffStyle.filter.includes('grayscale(0.85)') && hoverOffStyle.translate.includes('-2px'), `unselected hover should preserve its muted filter and lift 2px like classic: ${JSON.stringify(hoverOffStyle)}`);
    await page.screenshot({ path: path.join(runDir, 'operations-hover-unselected-390x844.png'), fullPage: false });
    await page.mouse.move(0, 0);
    for (const [key, expected] of Object.entries(OPERATION_CLASSIC)) {
      const style = await page.locator(`[data-operation="${key}"]`).evaluate(node => {
        const css = getComputedStyle(node);
        return { border: css.borderTopColor, background: css.backgroundColor, shadow: css.boxShadow, opacity: css.opacity, filter: css.filter, family: css.fontFamily, size: css.fontSize, radius: css.borderRadius, pressed: node.getAttribute('aria-pressed') };
      });
      assert.strictEqual(style.pressed, 'false', `${key} must be unselected in the none state`);
      assert.strictEqual(style.border, expected.border, `${key} unselected border should match classic`);
      assert.strictEqual(style.background, expected.background, `${key} unselected background should match classic`);
      assert.strictEqual(style.opacity, '0.32', `${key} unselected opacity should match classic`);
      assert(style.filter.includes('grayscale(0.85)') && style.filter.includes('saturate(0.35)'), `${key} unselected filter should match classic: ${style.filter}`);
      const transparentShadow = style.shadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/g, '').replace(/[,\s]/g, '');
      assert(!style.shadow.includes(expected.glow) && transparentShadow === '', `${key} unselected should not glow: ${style.shadow}`);
      assert.strictEqual(style.size, '12px', `${key} should use the classic 12px type size`);
      assert.strictEqual(style.radius, '4px', `${key} should use the classic 4px corners`);
      assert(style.family.includes('Press Start 2P'), `${key} should use classic display typography: ${style.family}`);
    }
    const multiply = page.locator('[data-operation="mult"]');
    await multiply.focus(); await page.keyboard.press('Space');
    await page.waitForTimeout(240);
    assert.strictEqual(await multiply.getAttribute('aria-pressed'), 'true', 'keyboard should activate multiplication');
    const selectedMultStyle = await multiply.evaluate(node => { const css = getComputedStyle(node); return { border: css.borderTopColor, background: css.backgroundColor, shadow: css.boxShadow, opacity: css.opacity, filter: css.filter, transform: css.transform, outline: css.outlineColor, outlineWidth: css.outlineWidth }; });
    assert.strictEqual(selectedMultStyle.border, OPERATION_CLASSIC.mult.border, 'selected multiplication border should retain its classic operation color');
    assert.strictEqual(selectedMultStyle.background, OPERATION_CLASSIC.mult.background, 'selected multiplication background should retain its classic operation color');
    assert(selectedMultStyle.shadow.includes(OPERATION_CLASSIC.mult.glow), `selected multiplication should use its classic red glow: ${selectedMultStyle.shadow}`);
    assert.strictEqual(selectedMultStyle.opacity, '1');
    assert(selectedMultStyle.filter.includes('saturate(1.25)'), `selected operation should retain classic saturation: ${selectedMultStyle.filter}`);
    assert(selectedMultStyle.outlineWidth === '2px' && selectedMultStyle.outline.includes('103, 232, 249'), `keyboard focus should be cyan and visible: ${JSON.stringify(selectedMultStyle)}`);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport); await selector.scrollIntoViewIfNeeded(); await page.waitForTimeout(240);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'one-operation page must not overflow: ' + viewport.width);
      await page.screenshot({ path: path.join(runDir, 'operations-one-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }
    await page.setViewportSize({ width: 390, height: 844 }); await multiply.hover(); await page.waitForTimeout(220);
    const hoverOnStyle = await multiply.evaluate(node => { const css = getComputedStyle(node); return { filter: css.filter, translate: css.translate }; });
    assert(hoverOnStyle.filter.includes('saturate(1.25)') && !hoverOnStyle.filter.includes('brightness') && hoverOnStyle.translate.includes('-1px'), `selected hover should retain the selected classic state: ${JSON.stringify(hoverOnStyle)}`);
    await page.screenshot({ path: path.join(runDir, 'operations-hover-selected-390x844.png'), fullPage: false });
    await page.mouse.move(0, 0);
    const section = page.locator('[data-operation-config="mult"]');
    const detailMode = section.locator('input[type=checkbox]').first();
    const quickTableButtons = section.locator('button[aria-pressed]').filter({ hasText: /^T(?:0|[1-9]|1[0-2])$/ });
    assert.strictEqual(await quickTableButtons.count(), 13, 'quick mode should expose tables zero through twelve');
    for (let table = 0; table <= 12; table += 1) {
      const button = quickTableButtons.nth(table);
      const selected = await button.getAttribute('aria-pressed') === 'true';
      if (selected !== [3, 5].includes(table)) { await button.click(); await page.waitForTimeout(0); }
    }
    await section.locator('label').filter({ hasText: 'Desde' }).locator('select').first().selectOption('4'); await section.locator('label').filter({ hasText: 'Hasta' }).locator('select').first().selectOption('7');
    await section.locator('label').filter({ hasText: 'Preguntas por tabla' }).locator('input').fill('4');
    await page.getByText(/8 multiplicaciones/).waitFor({ state: 'visible' });
    const tableZero = quickTableButtons.filter({ hasText: /^T0$/ });
    await tableZero.click();
    await section.locator('label').filter({ hasText: 'Desde' }).locator('select').first().selectOption('0');
    await page.getByText(/12 multiplicaciones/).waitFor({ state: 'visible' });
    assert.strictEqual(await tableZero.getAttribute('aria-pressed'), 'true', 'quick mode must include table zero');
    assert.strictEqual(await section.locator('label').filter({ hasText: 'Desde' }).locator('select').first().inputValue(), '0', 'quick mode must accept factor zero');
    await tableZero.click();
    await section.locator('label').filter({ hasText: 'Desde' }).locator('select').first().selectOption('4');
    await page.getByText(/8 multiplicaciones/).waitFor({ state: 'visible' });
    assert.strictEqual(await page.getByRole('checkbox', { name: /Permitir ejercicios repetidos/ }).isChecked(), false, 'new tests must not enable repeats by default');
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport); await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(pageWidth <= viewport.width, 'React quick viewport horizontal overflow: ' + JSON.stringify({ viewport, pageWidth }));
      await page.screenshot({ path: path.join(runDir, 'react-quick-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }

    const add = page.locator('[data-operation="add"]'); await add.click();
    const addConfig = page.locator('[data-operation-config="add"]');
    await addConfig.getByRole('spinbutton').fill('7');
    await add.click(); assert.strictEqual(await page.locator('[data-operation-config="add"]').count(), 0, 'deactivation should hide its configuration');
    await add.click(); assert.strictEqual(await page.locator('[data-operation-config="add"] input[type="number"]').inputValue(), '7', 'reactivation should preserve operation settings');
    await page.locator('[data-operation="sub"]').click(); await page.locator('[data-operation="div"]').click();
    assert.deepStrictEqual(await page.locator('[data-operation-config]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-operation-config'))), ['mult', 'add', 'sub', 'div'], 'operation configurations must stay in canonical visual order');
    assert.strictEqual(await page.getByText('Preguntas activas: 35 / 100').count(), 1, 'counts should add 8 multiplication questions and the configured quantities of other operations');
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport); await selector.scrollIntoViewIfNeeded(); await page.waitForTimeout(80);
      const geometry = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, width: innerWidth, tops: [...document.querySelectorAll('[data-operation-config]')].map(node => node.getBoundingClientRect().top), selectorClient: document.querySelector('[aria-label="Selector de operaciones"]').clientWidth, selectorScroll: document.querySelector('[aria-label="Selector de operaciones"]').scrollWidth }));
      assert(geometry.page <= geometry.width, 'four-operation page must not overflow: ' + JSON.stringify(geometry));
      assert(geometry.tops.every((top, index) => index === 0 || top > geometry.tops[index - 1]), 'configurations must stack vertically: ' + JSON.stringify(geometry));
      await page.screenshot({ path: path.join(runDir, 'operations-all-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }

    await page.locator('label').filter({ hasText: /^Presentaci/ }).locator('select').selectOption('ordered');
    await section.getByRole('button', { name: 'En desorden', exact: true }).click();
    await detailMode.check();
    await page.getByRole('button', { name: '4 por 3: incluida', exact: true }).click();
    await section.getByText('7 preguntas', { exact: true }).waitFor({ state: 'visible' });
    assert(await section.getByRole('button', { name: /Tabla 3: parcial/ }).isVisible(), 'column status must announce partial selection');
    assert(await section.getByRole('button', { name: /Factor 4: parcial/ }).isVisible(), 'row status must announce partial selection');
    await detailMode.uncheck();
    await page.getByText(/8 multiplicaciones/).waitFor({ state: 'visible' });
    assert.strictEqual(await section.getByRole('button', { name: 'T3', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.strictEqual(await section.locator('label').filter({ hasText: 'Desde' }).locator('select').first().inputValue(), '4');
    assert.strictEqual(await section.locator('label').filter({ hasText: 'Hasta' }).locator('select').first().inputValue(), '7');
    assert.strictEqual(await section.locator('label').filter({ hasText: 'Preguntas por tabla' }).locator('input').inputValue(), '4');
    await detailMode.check();
    await section.getByText('7 preguntas', { exact: true }).waitFor({ state: 'visible' });
    const matrixRegion = page.getByRole('region', { name: 'Matriz desplazable de tablas y factores' });
    await page.setViewportSize(VIEWPORTS[0]);
    await matrixRegion.evaluate(node => { node.scrollLeft = 0; });
    const smallScroll = await matrixRegion.evaluate(node => ({ client: node.clientWidth, scroll: node.scrollWidth }));
    console.log('React exact 360x800 matrix viewport: ' + JSON.stringify(smallScroll));
    console.log('React exact 360 page width: ' + await page.evaluate(() => document.documentElement.scrollWidth));
    const selectAll = section.getByRole('button', { name: 'Seleccionar todo' }); await selectAll.focus(); await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, visible: document.activeElement?.matches(':focus-visible'), outline: getComputedStyle(document.activeElement).outlineStyle }));
    assert(focus.tag === 'BUTTON' && focus.visible && focus.outline !== 'none', 'keyboard focus must be visible on controls');
    assert(!(await section.getByRole('button', { name: '0 por 1: excluida', exact: true }).isDisabled()), 'factor-zero cells must be selectable');
    await section.getByRole('button', { name: /Factor 4: parcial/ }).click();
    await section.getByRole('button', { name: /Factor 4: incluida/ }).waitFor({ state: 'visible' });
    await section.getByText('19 preguntas', { exact: true }).waitFor({ state: 'visible' });
    await section.getByRole('button', { name: /Tabla 5: parcial/ }).click();
    await section.getByRole('button', { name: /Tabla 5: incluida/ }).waitFor({ state: 'visible' });
    await section.getByText('28 preguntas', { exact: true }).waitFor({ state: 'visible' });
    await section.getByRole('button', { name: 'Seleccionar todo' }).click();
    await page.getByText('169 preguntas', { exact: true }).waitFor({ state: 'visible' });
    assert(await page.getByRole('button', { name: /Guardar e iniciar/ }).isDisabled(), 'the full matrix must report and block over the 100-question limit');
    await section.getByRole('button', { name: 'Limpiar todo' }).click();
    await section.getByText('0 preguntas', { exact: true }).waitFor({ state: 'visible' });
    await page.locator('label').filter({ hasText: /^Presentaci/ }).locator('select').selectOption('random');
    const orderedManner = section.getByRole('button', { name: 'En orden', exact: true });
    const randomManner = section.getByRole('button', { name: 'En desorden', exact: true });
    assert(!(await orderedManner.isDisabled()) && !(await randomManner.isDisabled()), 'internal order buttons must remain selectable while global mixing is active');
    await randomManner.click();
    assert.strictEqual(await randomManner.getAttribute('aria-pressed'), 'true', 'random manner should be selectable during global mixing');
    assert.strictEqual(await orderedManner.getAttribute('aria-pressed'), 'false', 'selecting random should clear ordered manner');
    await orderedManner.click();
    assert.strictEqual(await orderedManner.getAttribute('aria-pressed'), 'true', 'ordered manner should be selectable during global mixing');
    assert.strictEqual(await randomManner.getAttribute('aria-pressed'), 'false', 'selecting ordered should clear random manner');
    assert(await page.getByText(/mezcla global de todas las operaciones prevalece/i).isVisible(), 'global-order limitation must be explained');
    await randomManner.click();
    assert.strictEqual(await randomManner.getAttribute('aria-pressed'), 'true', 'random manner should remain selectable while global mixing is active');
    await section.getByRole('button', { name: 'Limpiar todo' }).click();
    await section.getByRole('button', { name: '0 por 5: excluida', exact: true }).click();
    await section.getByRole('button', { name: '5 por 0: excluida', exact: true }).click();
    await section.getByRole('button', { name: '0 por 0: excluida', exact: true }).click();
    await section.getByText('3 preguntas', { exact: true }).waitFor({ state: 'visible' });
    for (const label of ['0 por 5: incluida', '5 por 0: incluida', '0 por 0: incluida']) assert.strictEqual(await section.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true', `${label} should be selected`);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport); await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
      await matrixRegion.evaluate(node => { node.scrollLeft = 0; });
      const metrics = await page.evaluate(() => { const region = document.querySelector('[aria-label=\"Matriz desplazable de tablas y factores\"]'); return { width: innerWidth, page: document.documentElement.scrollWidth, summaryTop: document.querySelector('aside')?.getBoundingClientRect().top, matrixClient: region?.clientWidth, matrixScroll: region?.scrollWidth }; });

      assert(metrics.page <= metrics.width, 'React exact page horizontal overflow: ' + JSON.stringify(metrics));
      if (viewport.width <= 768) assert(metrics.matrixScroll > metrics.matrixClient, 'React exact matrix should use its own horizontal scroll at constrained widths: ' + JSON.stringify(metrics));
      console.log('React exact ' + viewport.width + 'x' + viewport.height + ': ' + JSON.stringify(metrics));
      await page.screenshot({ path: path.join(runDir, `react-exact-${viewport.width}x${viewport.height}.png`), fullPage: false });
    }

    await page.locator('input[maxlength="200"]').first().fill('Zero matrix fixture');
    await page.getByRole('button', { name: /Guardar borrador/ }).click();
    await page.getByText(/Configuración y asignaciones guardadas/).waitFor({ state: 'visible' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.getByRole('button', { name: 'Historial' }).click();
    await page.locator('article').filter({ hasText: 'Zero matrix fixture' }).getByRole('button', { name: 'Abrir' }).click();
    const reloadedMult = page.locator('[data-operation-config="mult"]');
    assert.strictEqual(await reloadedMult.getByRole('button', { name: 'En desorden', exact: true }).getAttribute('aria-pressed'), 'true', 'manner selection should survive save/reload under global mixing');
    await page.locator('label').filter({ hasText: /^Presentaci/ }).locator('select').selectOption('ordered');
    assert.strictEqual(await reloadedMult.getByRole('button', { name: 'En desorden', exact: true }).getAttribute('aria-pressed'), 'true', 'saved manner should be ready when global mixing is turned off');
    assert(await reloadedMult.locator('input[type="checkbox"]').first().isChecked(), 'exact mode should survive save/reload');
    for (const label of ['0 por 5: incluida', '5 por 0: incluida', '0 por 0: incluida']) assert.strictEqual(await reloadedMult.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true', `${label} should survive save/reload`);


    const classicFixtureBefore = fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8');
    const classic = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await classic.addInitScript(password => { sessionStorage.setItem('maestroAuth', '1'); sessionStorage.setItem('maestroPwd', password); }, ADMIN_PASSWORD);
    await classic.goto(running.base + '/maestro-clasico?tab=pruebas', { waitUntil: 'domcontentloaded' });
    await classic.locator('#tab-pruebas').click();
    await classic.locator('[data-pr-section-target="programming"]').click();
    const classicOp = classic.locator('#prOpSection_mult');
    await classicOp.waitFor({ state: 'visible' });
    const classicGrid = classic.locator('.pr-ops-grid');
    const classicOperationIds = { mult: 'prOpMult', add: 'prOpAdd', sub: 'prOpSub', div: 'prOpDiv' };
    const setClassicOperation = async (key, checked) => {
      const input = classic.locator('#' + classicOperationIds[key]);
      if (await input.isChecked() !== checked) await input.locator('xpath=..').click();
      assert.strictEqual(await input.isChecked(), checked, `classic ${key} state should change`);
    };
    assert.strictEqual(await classicGrid.locator('.pr-op-chk').count(), 4, 'classic selector should expose all four operations');
    for (const key of Object.keys(classicOperationIds)) await setClassicOperation(key, false);
    await classic.mouse.move(0, 0);
    for (const viewport of VIEWPORTS) {
      await classic.setViewportSize(viewport); await classicGrid.scrollIntoViewIfNeeded(); await classic.waitForTimeout(100);
      if (!await classic.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) console.log(`Classic selector baseline page overflow recorded at ${viewport.width} (legacy layout).`);
      await classic.screenshot({ path: path.join(runDir, 'classic-operations-none-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }
    await classic.setViewportSize({ width: 390, height: 844 });
    const classicAddLabel = classic.locator('#prOpAdd').locator('xpath=..'); await classicAddLabel.hover(); await classic.waitForTimeout(220);
    const classicHoverStyle = await classicAddLabel.evaluate(node => { const css = getComputedStyle(node); return { filter: css.filter, y: new DOMMatrixReadOnly(css.transform).m42 }; });
    assert(classicHoverStyle.filter.includes('grayscale(0.85)') && classicHoverStyle.y <= -1.9, `classic unselected hover should retain muted filter and lift: ${JSON.stringify(classicHoverStyle)}`);
    await classic.screenshot({ path: path.join(runDir, 'classic-operations-hover-390x844.png'), fullPage: false });
    await classic.mouse.move(0, 0);
    await setClassicOperation('mult', true);
    await classic.waitForTimeout(240);
    const classicMultStyles = await classic.locator('#prOpMult').locator('xpath=..').evaluate(node => { const css = getComputedStyle(node); return { border: css.borderTopColor, background: css.backgroundColor, shadow: css.boxShadow, opacity: css.opacity, font: css.fontFamily, size: css.fontSize, radius: css.borderRadius }; });
    assert.strictEqual(classicMultStyles.border, OPERATION_CLASSIC.mult.border);
    assert.strictEqual(classicMultStyles.background, OPERATION_CLASSIC.mult.background);
    assert(classicMultStyles.shadow.includes(OPERATION_CLASSIC.mult.glow), `classic selected multiplication should glow: ${classicMultStyles.shadow}`);
    assert.strictEqual(classicMultStyles.opacity, '1');
    assert(classicMultStyles.font.includes('Press Start 2P') && classicMultStyles.size === '12px' && classicMultStyles.radius === '4px', `classic operation typography and corners should be measured: ${JSON.stringify(classicMultStyles)}`);
    const classicMultLabel = classic.locator('#prOpMult').locator('xpath=..'); await classicMultLabel.hover(); await classic.waitForTimeout(220);
    const classicSelectedHover = await classicMultLabel.evaluate(node => { const css = getComputedStyle(node); return { filter: css.filter, y: new DOMMatrixReadOnly(css.transform).m42 }; });
    assert(classicSelectedHover.filter.includes('saturate(1.25)') && classicSelectedHover.y <= -0.9 && classicSelectedHover.y >= -1.1, `classic selected hover should preserve its selected state: ${JSON.stringify(classicSelectedHover)}`);
    await classic.screenshot({ path: path.join(runDir, 'classic-operations-hover-selected-390x844.png'), fullPage: false });
    await classic.mouse.move(0, 0);
    for (const viewport of VIEWPORTS) {
      await classic.setViewportSize(viewport); await classicGrid.scrollIntoViewIfNeeded(); await classic.waitForTimeout(100);
      if (!await classic.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) console.log(`Classic selector single-operation page overflow recorded at ${viewport.width} (legacy layout).`);
      await classic.screenshot({ path: path.join(runDir, 'classic-operations-one-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }
    for (const key of ['add', 'sub', 'div']) await setClassicOperation(key, true);
    for (const viewport of VIEWPORTS) {
      await classic.setViewportSize(viewport); await classicGrid.scrollIntoViewIfNeeded(); await classic.waitForTimeout(100);
      if (!await classic.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) console.log(`Classic selector four-operation page overflow recorded at ${viewport.width} (legacy layout).`);
      await classic.screenshot({ path: path.join(runDir, 'classic-operations-all-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }
    await classic.locator('#prDetail_mult').uncheck();
    await classic.locator('#prQuickTables_mult [data-quick-table="3"]').waitFor({ state: 'visible' });
    for (let table = 1; table <= 12; table += 1) {
      const button = classic.locator('#prQuickTables_mult [data-quick-table="' + table + '"]');
      const selected = await button.getAttribute('aria-pressed') === 'true';
      if (selected !== [3, 5].includes(table)) await button.click();
    }
    await classic.locator('#prRangeFrom_mult').fill('4');
    await classic.locator('#prRangeTo_mult').fill('7');
    await classic.locator('#prQty_mult').fill('4');
    for (const viewport of VIEWPORTS) {
      await classic.setViewportSize(viewport); await classicOp.scrollIntoViewIfNeeded(); await classic.waitForTimeout(100);
      const metrics = await classic.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].map(el => ({ tag: el.tagName, id: el.id, cls: typeof el.className === 'string' ? el.className.slice(0, 70) : '', right: Math.round(el.getBoundingClientRect().right) })).filter(item => item.right > innerWidth + 1).slice(0, 5) }));
      if (metrics.page > metrics.width) console.log('Classic quick legacy overflow (recorded): ' + JSON.stringify(metrics));
      await classic.screenshot({ path: path.join(runDir, 'classic-quick-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }
    await classic.locator('#prDetail_mult').check();
    await classic.locator('#prMatrixDetail_mult .pr-tbl-mini-actions button:nth-child(2)').click();
    for (const pair of [[4, 3], [8, 5], [3, 7]]) await classic.locator('#prTablesGrid_mult [data-row="' + pair[0] + '"][data-col="' + pair[1] + '"]').click();
    for (const viewport of VIEWPORTS) {
      await classic.setViewportSize(viewport); await classicOp.scrollIntoViewIfNeeded(); await classic.waitForTimeout(100);
      const metrics = await classic.evaluate(() => { const region = document.querySelector('#prMatrixDetail_mult .pr-matrix-wrap'); return { width: innerWidth, page: document.documentElement.scrollWidth, matrixClient: region?.clientWidth, matrixScroll: region?.scrollWidth }; });
      if (metrics.page > metrics.width) console.log('Classic exact legacy overflow (recorded): ' + JSON.stringify(metrics));
      if (metrics.matrixClient > metrics.width) console.log('Classic exact matrix exceeds viewport (recorded): ' + JSON.stringify(metrics));
      await classic.screenshot({ path: path.join(runDir, 'classic-exact-' + viewport.width + 'x' + viewport.height + '.png'), fullPage: false });
    }
    assert.strictEqual(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'), classicFixtureBefore, 'classic comparison must not rewrite fixture data');
    console.log(`OK: React configurator controls, calculations, explicit legacy conversion, matrix actions, global order, keyboard focus and five viewports. Evidence: ${runDir}`);
  } catch (error) {
    runFailure = error;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (running) await stop(running.child);
    safeRemoveTemp(dataDir);
    const after = hashProjectData();
    const changed = PROJECT_FILES.filter(name => before[name] !== after[name]);
    if (changed.length) console.error(`Project persistent-file hash audit changed during isolated run: ${changed.join(', ')}`);
    else console.log(`Persistent-file hash audit: unchanged (${PROJECT_FILES.length} files).`);
    if (!runFailure && changed.length) runFailure = new Error(`Project persistent files changed during isolated run: ${changed.join(', ')}`);
  }
  if (runFailure) throw runFailure;
})().catch(error => { console.error(error); process.exit(1); });
