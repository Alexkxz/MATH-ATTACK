'use strict';

// Isolated Playwright coverage for the React test-recipient grid.
// All server data is placed in a unique OS temp directory; evidence is local.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { createRoot, createTest, createAssignment } = require('../src/server/exams/testModel');
const { createGroup } = require('../src/server/groups/groupModel');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_ROOT = path.join(ROOT, 'evidence', 'pruebas-destinatarios-grid');
const ADMIN_PASSWORD = 'synthetic-recipient-grid-test-8c21';
const TEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT_JSON = ['pruebas.json', 'players.json', 'ranking.json', 'groups.json', 'config.json', 'devices.json', 'aureosLog.json'];
const VIEWPORTS = [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 },
  { width: 1366, height: 768 }, { width: 1920, height: 1080 },
];
const CLASSIC_STYLES = {
  unselected: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderColor: 'rgba(148, 163, 184, 0.3)' },
  selected: { backgroundColor: 'rgba(6, 95, 70, 0.48)', borderColor: 'rgb(52, 211, 153)', boxShadow: 'rgba(52, 211, 153, 0.35) 0px 0px 14px 0px' },
  hoverBorder: 'rgb(103, 232, 249)',
};
function colorChannels(value) {
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? [...hex[1]].map(channel => channel + channel).join('') : hex[1];
    return [0, 2, 4].map(index => Number.parseInt(raw.slice(index, index + 2), 16)).concat(1);
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const channels = rgb[1].split(/[\s,\/]+/).filter(Boolean).map(channel => channel.endsWith('%') ? Number.parseFloat(channel) * 2.55 : Number.parseFloat(channel));
    if (channels.length === 3) channels.push(1);
    return channels;
  }
  const oklch = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/i);
  const oklab = value.match(/oklab\(\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+))?/i);
  if (!oklch && !oklab) return null;
  const L = Number((oklch || oklab)[1]);
  const a = oklab ? Number(oklab[2]) : Number(oklch[2]) * Math.cos(Number(oklch[3]) * Math.PI / 180);
  const b = oklab ? Number(oklab[3]) : Number(oklch[2]) * Math.sin(Number(oklch[3]) * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const linear = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const channels = linear.map(channel => {
    const srgb = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, 255 * srgb));
  });
  channels.push(Number((oklch || oklab)[4] || 1));
  return channels;
}
function assertColor(actual, expected, message) {
  const actualChannels = colorChannels(actual);
  const expectedChannels = colorChannels(expected);
  assert(actualChannels && expectedChannels && actualChannels.length === expectedChannels.length && actualChannels.every((channel, index) => Math.abs(channel - expectedChannels[index]) <= 1.1), `${message}: ${actual} != ${expected}`);
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function hashProjectData() {
  return Object.fromEntries(PROJECT_JSON.map(name => {
    const file = path.join(ROOT, name);
    return [name, fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '<MISSING>'];
  }));
}

function assertProjectHashesUnchanged(before, after) {
  const changed = PROJECT_JSON.filter(name => before[name] !== after[name]);
  assert.deepStrictEqual(changed, [], `project persistence changed during isolated UI test: ${changed.join(', ')}`);
}

function safeRemoveTemp(dir) {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(dir);
  const relative = path.relative(tempRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Refusing unsafe temp cleanup');
  fs.rmSync(resolved, { recursive: true, force: true });
}

function uuidFor(index) {
  return `${String(index).padStart(8, '0')}-1111-4111-8111-${String(index).padStart(12, '0')}`;
}

function fixture(dataDir) {
  const root = createRoot();
  const test = createTest({
    testId: TEST_ID,
    title: 'Prueba ficticia: asignaciones históricas',
    creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    configuration: {
      enabledOperations: ['add'], operationOrder: ['add'], order: 'random', repeat: false,
      opsConfig: { add: { qty: 10, quantityMode: 'total', digits: 1, simpleDigits: true, carryMode: 'both', manner: 'random' } },
    },
  });
  root.tests.push(test);
  root.assignments.push(createAssignment({ testId: TEST_ID, targetType: 'student', accountPlayerId: uuidFor(1) }));
  root.assignments.push(createAssignment({ testId: TEST_ID, targetType: 'group', groupId: GROUP_ID, startsAt: '2030-01-02T09:00:00.000Z', closesAt: '2030-01-05T17:00:00.000Z' }));
  const longName = 'Alumna de prueba con un nombre deliberadamente extenso para comprobar varias líneas en el botón';
  const players = Array.from({ length: 15 }, (_, index) => ({
    id: uuidFor(index + 1),
    accountPlayerId: uuidFor(index + 1),
    name: index === 0 ? longName : `Alumno ficticio ${String(index + 1).padStart(2, '0')}`,
    grade: index < 5 ? '5° Grado A' : index < 10 ? '6° Grado A' : '7° Grado A',
    pin: `fake-${index + 100}`,
  }));
  const values = {
    'pruebas.json': root,
    'players.json': players,
    'ranking.json': [],
    'groups.json': { schemaVersion: 1, groups: [createGroup({ groupId: GROUP_ID, name: 'Grupo ficticio', grade: '', schoolYear: '2030', memberAccountPlayerIds: players.map(player => player.accountPlayerId) })], events: [] },
    'config.json': { adminUsername: 'admin', adminPassword: ADMIN_PASSWORD },
    'devices.json': [],
    'aureosLog.json': [],
  };
  for (const [name, value] of Object.entries(values)) fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value), 'utf8');
  return { longName, players };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGINT'); } catch (_) { /* already exited */ }
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    try { child.kill('SIGKILL'); } catch (_) { /* best effort */ }
    await new Promise(resolve => child.once('exit', resolve));
  }
}

async function launch(dataDir) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      MATH_ATTACK_DATA_PATH: dataDir,
      MATH_ATTACK_TESTS_PATH: path.join(dataDir, 'pruebas.json'),
      MATH_ATTACK_GROUPS_PATH: path.join(dataDir, 'groups.json'),
      MATH_ATTACK_LOG_PATH: path.join(dataDir, 'server.log'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base, output: () => output }; } catch (_) { /* starting */ }
    await wait(100);
  }
  await stop(child);
  throw new Error(`React test server failed to start${output ? `: ${output}` : ''}`);
}

(async () => {
  const projectBefore = hashProjectData();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-recipients-grid-'));
  const relativeDataDir = path.relative(ROOT, dataDir);
  assert(relativeDataDir.startsWith('..') || path.isAbsolute(relativeDataDir), 'fixture must be outside the project');
  const { longName } = fixture(dataDir);
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const runDir = path.join(EVIDENCE_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
  if (fs.existsSync(runDir)) throw new Error('Refusing to overwrite prior evidence');
  fs.mkdirSync(runDir, { recursive: true });

  let running;
  let browser;
  try {
    running = await launch(dataDir);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(password => {
      sessionStorage.setItem('maestroAuth', '1');
      sessionStorage.setItem('maestroPwd', password);
    }, ADMIN_PASSWORD);
    await page.goto(`${running.base}/maestro`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.getByRole('button', { name: 'Historial' }).click();
    await page.locator('article').filter({ hasText: 'Prueba ficticia: asignaciones históricas' }).getByRole('button', { name: 'Abrir' }).click();

    const recipients = page.locator('details').filter({ has: page.getByText(/^Destinatarios/) });
    await recipients.waitFor({ state: 'visible' });
    const summary = recipients.locator('summary');
    if (!(await recipients.evaluate(node => node.open))) await summary.click();
    const grid = recipients.locator('[data-recipient-grid][role="group"][aria-label="Alumnos destinatarios"]');
    await grid.waitFor({ state: 'visible' });
    const search = recipients.getByRole('searchbox', { name: /Buscar alumno por nombre/i });
    const studentButton = name => grid.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });

    const styleOf = async locator => locator.evaluate(node => {
      const style = getComputedStyle(node);
      return { backgroundColor: style.backgroundColor, borderColor: style.borderTopColor, boxShadow: style.boxShadow };
    });
    const textColor = async locator => locator.evaluate(node => getComputedStyle(node).color);
    const selectedButton = studentButton('Alumna de prueba');
    const unselectedButton = studentButton('Alumno ficticio 02');
    const initialSelectedStyle = await styleOf(selectedButton);
    assertColor(initialSelectedStyle.backgroundColor, CLASSIC_STYLES.selected.backgroundColor, 'selected background should match classic');
    assertColor(initialSelectedStyle.borderColor, CLASSIC_STYLES.selected.borderColor, 'selected border should match classic');
    assert(initialSelectedStyle.boxShadow.includes('rgba(52, 211, 153, 0.35) 0px 0px 14px 0px'), `selected card should have the classic soft emerald glow: ${initialSelectedStyle.boxShadow}`);
    const initialUnselectedStyle = await styleOf(unselectedButton);
    assertColor(initialUnselectedStyle.backgroundColor, CLASSIC_STYLES.unselected.backgroundColor, 'unselected background should match classic dark slate');
    assertColor(initialUnselectedStyle.borderColor, CLASSIC_STYLES.unselected.borderColor, 'unselected border should match classic blue gray');
    assert.strictEqual(initialUnselectedStyle.boxShadow, 'none', 'unselected card should not glow');
    const selectedSpans = selectedButton.locator(':scope > span');
    const unselectedSpans = unselectedButton.locator(':scope > span');
    assertColor(await textColor(selectedSpans.nth(0)), '#6ee7b7', 'selected checkmark should be pale emerald');
    assertColor(await textColor(selectedSpans.nth(1)), '#f1f5f9', 'selected name should remain bright and legible');
    assertColor(await textColor(selectedSpans.nth(2)), '#a7f3d0', 'selected grade should be secondary emerald');
    assertColor(await textColor(unselectedSpans.nth(1)), '#f1f5f9', 'unselected name should remain bright and legible');
    assertColor(await textColor(unselectedSpans.nth(2)), '#b8c6d8', 'unselected grade should be secondary blue-gray');
    await unselectedButton.hover();
    assertColor((await styleOf(unselectedButton)).borderColor, CLASSIC_STYLES.hoverBorder, 'hover should use the classic cyan highlight');
    await unselectedButton.evaluate(node => node.blur());
    await page.keyboard.press('Tab');
    await unselectedButton.focus();
    const focusStyle = await unselectedButton.evaluate(node => ({
      outlineStyle: getComputedStyle(node).outlineStyle,
      outlineWidth: getComputedStyle(node).outlineWidth,
      outlineColor: getComputedStyle(node).outlineColor,
      focusVisible: node.matches(':focus-visible'),
    }));
    assert(focusStyle.focusVisible && focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) >= 2, `keyboard focus should remain visible: ${JSON.stringify(focusStyle)}`);

    const longButton = studentButton('Alumna de prueba');
    assert.strictEqual(await longButton.getAttribute('aria-pressed'), 'true', 'fixture initial student assignment should load');
    await longButton.click();
    assert.strictEqual(await longButton.getAttribute('aria-pressed'), 'false', 'individual button click should deselect');
    await longButton.click();
    assert.strictEqual(await longButton.getAttribute('aria-pressed'), 'true', 'individual button click should select again');

    // The test's configured grade is deliberately different from the independent recipient filter.
    const configuredGrade = page.locator('label').filter({ hasText: /^Grado/ }).locator('select');
    const grade5 = await configuredGrade.locator('option').evaluateAll(options => options.find(option => option.textContent.includes('5'))?.value);
    const configOptions = await configuredGrade.locator('option').allTextContents();
    assert(grade5, `test configuration grade options should be available: ${JSON.stringify(configOptions)}`);
    await configuredGrade.selectOption(grade5);
    const grade = recipients.locator('[data-recipient-grade-filter]');
    await grade.waitFor({ state: 'visible' });
    assert.strictEqual(await grade.getAttribute('aria-label'), 'Filtrar destinatarios por grado');
    const recipientGradeOptions = await grade.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent.trim() })));
    assert.deepStrictEqual(recipientGradeOptions.map(option => option.label), ['Todos los grados', '5° Grado A', '6° Grado A', '7° Grado A'], 'recipient grades should be unique and include all fixture grades');
    assert.strictEqual(await grid.getByRole('button').count(), 15, 'the independent recipient filter must not hide other grades when test grade 5° Grado A is configured');
    // UI filtering is independent; server exam start still intersects configured test grade and assigned IDs.
    await configuredGrade.selectOption('');
    await grade.selectOption('5° Grado A');
    assert.strictEqual(await grid.getByRole('button').count(), 5, 'recipient grade filter should show only five fictional grade-five students');
    const selectVisible = recipients.locator('[data-recipient-select-visible]');
    const invertVisible = recipients.locator('[data-recipient-invert-visible]');
    await selectVisible.click();
    assert.strictEqual(await grid.getByRole('button', { pressed: true }).count(), 5, 'select visible should affect all five filtered students');
    await grade.selectOption('6° Grado A');
    assert.strictEqual(await grid.getByRole('button').count(), 5, 'changing recipient grade should update visible students');
    assert(await recipients.getByText(/fuera del filtro/i).isVisible(), 'selections outside the filter must be reported');
    await search.fill('Alumno ficticio 08');
    assert.strictEqual(await grid.getByRole('button').count(), 1, 'name search should filter the current grade');
    assert.strictEqual(await grid.getByRole('button', { pressed: true }).count(), 0, 'hidden selections must not be presented as visible selections');
    await invertVisible.click();
    assert.strictEqual(await grid.getByRole('button', { pressed: true }).count(), 1, 'invert visible should only affect the matching student');
    assert(await recipients.getByText(/fuera del filtro/i).isVisible(), 'other assigned students must remain selected outside the search filter');
    await search.fill('');
    await grade.selectOption('5° Grado A');
    assert.strictEqual(await grid.getByRole('button', { pressed: true }).count(), 5, 'filter changes must preserve assigned students');
    await grade.selectOption('7° Grado A');
    assert.strictEqual(await grid.getByRole('button').count(), 5, 'third grade should be available in the independent filter');
    await grade.selectOption('');
    assert.strictEqual(await grid.getByRole('button', { pressed: true }).count(), 6, 'all grades should reveal retained assignments across grades');

    const keyboardTarget = studentButton('Alumno ficticio 12');
    await keyboardTarget.focus();
    await page.keyboard.press('Space');
    assert.strictEqual(await keyboardTarget.getAttribute('aria-pressed'), 'true', 'Space should toggle a focused recipient button on');
    const focusState = await keyboardTarget.evaluate(node => ({ visible: node.matches(':focus-visible'), outline: getComputedStyle(node).outlineStyle, shadow: getComputedStyle(node).boxShadow }));
    assert(focusState.visible && (focusState.outline !== 'none' || focusState.shadow !== 'none'), 'keyboard focus should have a visible indicator');
    await page.keyboard.press('Space');
    assert.strictEqual(await keyboardTarget.getAttribute('aria-pressed'), 'false', 'Space should toggle a focused recipient button off');

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await recipients.scrollIntoViewIfNeeded();
      await grid.evaluate(node => { node.scrollTop = 0; node.scrollLeft = 0; });
      await page.waitForTimeout(60);
      const metrics = await page.evaluate(() => {
        const container = document.querySelector('[data-recipient-grid][role="group"][aria-label="Alumnos destinatarios"]');
        if (!container) return null;
        const buttons = [...container.querySelectorAll('button')];
        const style = getComputedStyle(container);
        const bounds = container.getBoundingClientRect();
        const heights = buttons.map(button => button.getBoundingClientRect().height);
        return {
          viewport: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          columns: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
          gridWidth: bounds.width,
          gridScrollWidth: container.scrollWidth,
          minButtonHeight: Math.min(...heights),
          buttons: buttons.length,
          longNameHeight: buttons[0]?.getBoundingClientRect().height,
          longNameScrollHeight: buttons[0]?.scrollHeight,
        };
      });
      assert(metrics, `recipient grid missing at ${viewport.width}px`);
      assert(metrics.pageWidth <= viewport.width, `page should not overflow at ${viewport.width}px: ${JSON.stringify(metrics)}`);
      assert(metrics.minButtonHeight >= 44, `recipient buttons should have comfortable touch targets: ${JSON.stringify(metrics)}`);
      const buttonText = await grid.getByRole('button').first().innerText();
      assert(/\n.*Grado/.test(buttonText), `each recipient button should show name then grade on separate lines: ${JSON.stringify(buttonText)}`);
      if (viewport.width <= 390) assert.strictEqual(metrics.columns, 2, `phone should have two columns: ${JSON.stringify(metrics)}`);
      if (viewport.width >= 1366) assert.strictEqual(metrics.columns, 8, `desktop should have eight columns: ${JSON.stringify(metrics)}`);
      if (viewport.width === 768) assert(metrics.columns >= 3 && metrics.columns < 8, `tablet should adapt progressively: ${JSON.stringify(metrics)}`);
      await page.screenshot({ path: path.join(runDir, `recipients-${viewport.width}x${viewport.height}.png`), fullPage: false });

      // Capture a small visual-state set at every required viewport. Existing
      // assignments provide the selected card; the second card remains eligible.
      const reactSelected = studentButton('Alumna de prueba');
      const reactUnselected = studentButton('Alumno ficticio 15');
      assert.strictEqual(await reactUnselected.getAttribute('aria-pressed'), 'false', `viewport unselected sample should stay unassigned at ${viewport.width}px`);
      const selectedStyle = await styleOf(reactSelected);
      assertColor(selectedStyle.backgroundColor, CLASSIC_STYLES.selected.backgroundColor, `selected background at ${viewport.width}px`);
      assertColor(selectedStyle.borderColor, CLASSIC_STYLES.selected.borderColor, `selected border at ${viewport.width}px`);
      assert(selectedStyle.boxShadow.includes('rgba(52, 211, 153, 0.35) 0px 0px 14px 0px'), `selected glow at ${viewport.width}px`);
      const unselectedStyle = await styleOf(reactUnselected);
      assertColor(unselectedStyle.backgroundColor, CLASSIC_STYLES.unselected.backgroundColor, `unselected background at ${viewport.width}px`);
      assertColor(unselectedStyle.borderColor, CLASSIC_STYLES.unselected.borderColor, `unselected border at ${viewport.width}px`);
      assert.strictEqual(unselectedStyle.boxShadow, 'none', `unselected glow at ${viewport.width}px`);
      await reactUnselected.hover();
      assertColor((await styleOf(reactUnselected)).borderColor, CLASSIC_STYLES.hoverBorder, `hover style at ${viewport.width}px`);
      await reactUnselected.evaluate(node => node.blur());
      await page.screenshot({ path: path.join(runDir, `react-hover-${viewport.width}x${viewport.height}.png`), fullPage: false });
      await reactSelected.focus();
      const viewportFocus = await reactSelected.evaluate(node => ({ visible: node.matches(':focus-visible'), outline: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth }));
      assert(viewportFocus.visible && viewportFocus.outline !== 'none' && parseFloat(viewportFocus.width) >= 2, `focus indicator at ${viewport.width}px: ${JSON.stringify(viewportFocus)}`);
      await page.screenshot({ path: path.join(runDir, `react-focus-${viewport.width}x${viewport.height}.png`), fullPage: false });
      console.log(`recipient grid ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)}`);
    }

    // Incompatible visual state: use the registered grade from the fixture and
    // assert that the card is amber, explanatory, and still aria-disabled.
    await configuredGrade.selectOption(grade5);
    const incompatible = studentButton('Alumno ficticio 08');
    assert.strictEqual(await incompatible.getAttribute('aria-disabled'), 'true', 'incompatible card must expose aria-disabled');
    assert.strictEqual(await incompatible.getAttribute('data-recipient-incompatible'), 'true');
    const incompatibleDescriptionId = await incompatible.getAttribute('aria-describedby');
    assert(incompatibleDescriptionId, 'incompatible card should reference an accessible explanation');
    assert(/No elegible/.test(await page.locator(`#${incompatibleDescriptionId}`).innerText()), 'incompatible card should describe the restriction accessibly');
    const incompatibleStyle = await styleOf(incompatible);
    const incompatibleBackground = colorChannels(incompatibleStyle.backgroundColor);
    assert(incompatibleBackground && Math.max(...incompatibleBackground.slice(0, 3)) < 70, `incompatible card should retain a dark surface: ${incompatibleStyle.backgroundColor}`);
    const incompatibleBorder = colorChannels(incompatibleStyle.borderColor);
    assert(incompatibleBorder && incompatibleBorder[0] > 200 && incompatibleBorder[1] > 150 && incompatibleBorder[2] < 130, `incompatible card should have an amber border: ${incompatibleStyle.borderColor}`);
    await incompatible.scrollIntoViewIfNeeded();
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await recipients.scrollIntoViewIfNeeded();
      await incompatible.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(runDir, `react-incompatible-${viewport.width}x${viewport.height}.png`), fullPage: false });
    }
    await configuredGrade.selectOption('');

    // Compare against the locally served classic implementation when the route
    // can open the same fictitious draft; never fake a classic card in React.
    let classicComparison = false;
    try {
      const classicPage = await context.newPage();
      await classicPage.addInitScript(password => {
        sessionStorage.setItem('maestroAuth', '1');
        sessionStorage.setItem('maestroPwd', password);
      }, ADMIN_PASSWORD);
      await classicPage.goto(`${running.base}/maestro-clasico?tab=pruebas`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await classicPage.locator('#tab-pruebas').click({ timeout: 5000 });
      const classicCard = classicPage.locator('#prTestLibraryList .pr-test-card').filter({ hasText: 'Prueba ficticia: asignaciones históricas' });
      await classicCard.waitFor({ state: 'visible', timeout: 7000 });
      await classicCard.getByRole('button', { name: /Seleccionar prueba/ }).click({ timeout: 5000 });
      const classicGrid = classicPage.locator('#prAudienceStudentsGrid');
      await classicGrid.waitFor({ state: 'visible', timeout: 7000 });
      const legacySelected = classicGrid.locator('.pr-audience-student.selected').first();
      const legacyUnselected = classicGrid.locator('.pr-audience-student:not(.selected)').first();
      await legacySelected.waitFor({ state: 'visible' });
      await legacyUnselected.waitFor({ state: 'visible' });
      for (const viewport of VIEWPORTS) {
        await classicPage.setViewportSize(viewport);
        await classicGrid.scrollIntoViewIfNeeded();
        await classicSelected.scrollIntoViewIfNeeded();
        await classicPage.screenshot({ path: path.join(runDir, `classic-selected-${viewport.width}x${viewport.height}.png`), fullPage: false });
        await legacyUnselected.scrollIntoViewIfNeeded();
        await classicPage.screenshot({ path: path.join(runDir, `classic-unselected-${viewport.width}x${viewport.height}.png`), fullPage: false });
      }
      classicComparison = true;
      await classicPage.close();
    } catch (error) {
      console.log(`Classic comparison unavailable with the fake fixture: ${error.message}`);
    }

    // Confirm long labels wrap inside their button rather than creating overflow.
    await search.fill(longName.slice(0, 25));
    assert.strictEqual(await grid.getByRole('button').count(), 1, 'long-name fixture should be searchable');
    const longMetrics = await longButton.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, text: node.innerText }));
    assert(longMetrics.height >= 44 && longMetrics.scrollWidth <= longMetrics.clientWidth, `long name should wrap within the button: ${JSON.stringify(longMetrics)}`);

    await search.fill('');
    const save = page.getByRole('button', { name: /Guardar borrador/ });
    await save.click();
    await page.waitForTimeout(500);
    const statusText = await page.locator('[role="status"]').allTextContents();
    const alertText = await page.locator('[role="alert"]').allTextContents();
    assert(statusText.some(text => /asignaciones guardadas/i.test(text)), `save should complete; status=${JSON.stringify(statusText)} alert=${JSON.stringify(alertText)}`);
    const savedRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8'));
    const savedStudentIds = savedRoot.assignments.filter(item => item.testId === TEST_ID && item.targetType === 'student').map(item => item.accountPlayerId).sort();
    const savedGroups = savedRoot.assignments.filter(item => item.testId === TEST_ID && item.targetType === 'group');
    assert.strictEqual(savedStudentIds.length, 6, 'six student assignments should be saved across grades');
    assert.deepStrictEqual(savedGroups.map(item => ({ groupId: item.groupId, startsAt: item.startsAt, closesAt: item.closesAt })), [{ groupId: GROUP_ID, startsAt: '2030-01-02T09:00:00.000Z', closesAt: '2030-01-05T17:00:00.000Z' }], 'historical group assignment should be retained unchanged');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'PRUEBAS' }).click();
    await page.getByRole('button', { name: 'Historial' }).click();
    await page.locator('article').filter({ hasText: 'Prueba ficticia: asignaciones históricas' }).getByRole('button', { name: 'Abrir' }).click();
    const reopened = page.locator('[data-recipient-grid][role="group"][aria-label="Alumnos destinatarios"]');
    await reopened.waitFor({ state: 'visible' });
    assert.strictEqual(await reopened.getByRole('button', { pressed: true }).count(), 6, 'student assignments should reload');
    for (const id of savedStudentIds) {
      const player = Number.parseInt(id.slice(0, 8), 16);
      const expectedName = player === 1 ? 'Alumna de prueba' : `Alumno ficticio ${String(player).padStart(2, '0')}`;
      assert.strictEqual(await reopened.getByRole('button', { name: new RegExp(expectedName) }).getAttribute('aria-pressed'), 'true', `assignment ${expectedName} should reload`);
    }
    const finalGroups = JSON.parse(fs.readFileSync(path.join(dataDir, 'pruebas.json'), 'utf8')).assignments.filter(item => item.testId === TEST_ID && item.targetType === 'group');
    assert.strictEqual(finalGroups.length, 1, 'group assignment should remain after reopening');
    assert.deepStrictEqual(pageErrors, [], `browser errors should be absent: ${pageErrors.join(' | ')}`);

    console.log(`OK: React recipient grid selection, bulk actions, filters, persistence, historical group, keyboard and five viewports. Classic comparison: ${classicComparison ? 'captured' : 'unavailable'}. Evidence: ${runDir}`);
  } finally {
    if (browser) await browser.close();
    if (running) await stop(running.child);
    const projectAfter = hashProjectData();
    assertProjectHashesUnchanged(projectBefore, projectAfter);
    safeRemoveTemp(dataDir);
  }
})().catch(error => { console.error(error); process.exit(1); });
