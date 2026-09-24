'use strict';

const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const findings = [];
function result(section, ok, detail) { findings.push({ section, ok, detail }); }

async function enterIndividual(page) {
  await page.goto(page.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => _entrarAlJuego('Auditoría Modo Individual'));
  await page.click('#workspaceSidebar .workspace-nav-item:nth-child(2)');
  await page.waitForSelector('#workspaceWizardHost [data-wizard-action="type"]');
}

async function panelState(page) { return page.evaluate(() => workspaceDynamicState?.panel || null); }

async function panelControls(page) {
  return page.evaluate(() => ({
    panel: workspaceDynamicState?.panel,
    addSub: document.querySelectorAll('[data-wizard-action="addsub"]').length,
    cifras: document.querySelectorAll('[data-wizard-action="cifras"]').length,
    tables: document.querySelectorAll('[data-wizard-action="tblmode"]').length,
    tableChoices: document.querySelectorAll('[data-wizard-action="table"]').length,
    qpt: document.querySelectorAll('#workspaceQptSlider').length,
    qptTable: document.querySelectorAll('#workspaceQptTableSlider').length,
    multiplierRange: document.querySelectorAll('#workspaceMultMin, #workspaceMultMax').length,
    colors: document.querySelectorAll('[data-wizard-action="color"]').length,
    visual: document.querySelectorAll('[data-wizard-action="visual"]').length,
    manner: document.querySelectorAll('[data-wizard-action="manner"]').length,
  }));
}

async function auditSliderAlignment(page, section) {
  const report = await page.evaluate(() => {
    const measure = (input, labels) => {
      if (!input || !labels) return { present: false };
      const inputRect = input.getBoundingClientRect();
      const labelRect = labels.getBoundingClientRect();
      const spans = [...labels.querySelectorAll('span')];
      const expected = spans.map(span => Number.parseFloat(span.style.left));
      const actual = spans.map(span => {
        const rect = span.getBoundingClientRect();
        return ((rect.left + rect.width / 2 - labelRect.left) / labelRect.width) * 100;
      });
      const endpointInset = 11;
      const endpointError = Math.max(
        Math.abs((actual[0] ?? 0) - 0),
        Math.abs((actual.at(-1) ?? 100) - 100),
      );
      const middleError = actual.slice(1, -1).reduce((max, value, index) => Math.max(max, Math.abs(value - expected[index + 1])), 0);
      return { present: true, endpointError, middleError, expected, actual, inputWidth: inputRect.width };
    };
    const quantity = document.querySelector('#workspaceQptTableSlider') || document.querySelector('#workspaceQptSlider');
    const quantityLabels = quantity?.parentElement.querySelector('.workspace-range-labels');
    const multiplier = [...document.querySelectorAll('#workspaceMultMin, #workspaceMultMax')].map(input => measure(input, input.parentElement.querySelector('.workspace-range-labels')));
    const ranges = [measure(quantity, quantityLabels), ...multiplier].filter(range => range.present);
    return {
      ranges,
      ok: ranges.length > 0 && ranges.every(range => range.present && range.inputWidth > 0 && range.endpointError <= 4 && range.middleError <= 4),
    };
  });
  result(`${section} · sliders`, report.ok, `Etiquetas alineadas al recorrido real: ${JSON.stringify(report)}`);
}

async function auditLegacyNavigationGuard(page) {
  const state = await page.evaluate(() => {
    const beforePanel = workspaceDynamicState?.panel;
    ['goStep1', 'goStep2', 'goStep2to3', 'goOpToStep3', 'goStep3LocalBack', 'goStep3aToStep3b', 'goStep3bBack']
      .forEach(name => window[name]?.());
    return {
      beforePanel,
      afterPanel: workspaceDynamicState?.panel,
      activeLegacyScreens: ['step2Screen', 'stepOpScreen', 'step3LocalScreen', 'step3bLocalScreen']
        .filter(id => document.getElementById(id)?.classList.contains('active')),
    };
  });
  result('Legacy Individual · navegación', state.beforePanel === state.afterPanel && state.activeLegacyScreens.length === 0, `El asistente dinámico conserva ${state.afterPanel} y no activa pantallas antiguas: ${JSON.stringify(state)}`);
}

async function chooseOperations(page, expected) {
  const buttons = page.locator('#workspaceWizardHost [data-wizard-action="operation"]');
  for (let i = 0; i < await buttons.count(); i += 1) {
    const button = buttons.nth(i);
    const operation = await button.getAttribute('data-value');
    const selected = await button.evaluate(node => node.classList.contains('selected'));
    if (expected.includes(operation) && !selected) await button.click();
    if (!expected.includes(operation) && selected) await button.click();
  }
  return page.evaluate(() => [...selectedOps]);
}

async function auditTableBatchActions(page, section) {
  await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="custom"]').click();
  const actions = page.locator('#workspaceWizardHost .workspace-table-actions [data-wizard-action]');
  result(`${section} · tablas`, await actions.count() === 2, 'Incluye Limpiar y Revertir');
  await page.locator('#workspaceWizardHost [data-wizard-action="tblClear"]').click();
  const cleared = await page.evaluate(() => ({ selected: [...selectedTbls], disabled: document.querySelector('#workspaceWizardHost [data-wizard-action="next"]')?.disabled }));
  result(`${section} · tablas`, cleared.selected.length === 0 && cleared.disabled === true, `Limpiar deselecciona todas y bloquea Continuar: ${JSON.stringify(cleared)}`);
  for (const table of [4, 5, 6, 7, 8]) await page.locator(`#workspaceWizardHost [data-wizard-action="table"][data-value="${table}"]`).click();
  await page.locator('#workspaceWizardHost [data-wizard-action="tblInvert"]').click();
  const inverted = await page.evaluate(() => [...selectedTbls].sort((a, b) => a - b));
  result(`${section} · tablas`, JSON.stringify(inverted) === JSON.stringify([1, 2, 3, 9, 10, 11, 12]), `Revertir invierte 4–8 y activa 1–3, 9–12: ${JSON.stringify(inverted)}`);
}

function expectedForMode(type, operations) {
  const addSub = operations.includes('+') || operations.includes('−');
  const multiplication = operations.includes('×');
  const tables = multiplication || operations.includes('÷');
  return {
    difficulty: ['timed', 'lives', 'countdown', 'bot'].includes(type),
    addSub, cifras: addSub, tables,
    qpt: type === 'bot' ? null : type === 'free' && addSub,
    qptTable: type === 'bot' ? null : type === 'free' && tables,
    multiplierRange: multiplication,
    colors: true, visual: true, manner: type === 'bot' ? null : type === 'free',
  };
}

function compareControls(mode, controls, expected) {
  const checksByPanel = {
    specific: [['Directas/Llevadas', expected.addSub, controls.addSub > 0], ['Cantidad de cifras', expected.cifras, controls.cifras > 0], ['Tablas', expected.tables, controls.tables > 0]],
    advanced: [['Colores', expected.colors, controls.colors > 0], ['Visualización', expected.visual, controls.visual > 0], ['Orden', expected.manner, controls.manner > 0]],
    quantities: [['Cantidad por operación', expected.qpt, controls.qpt > 0], ['Cantidad por tabla', expected.qptTable, controls.qptTable > 0]],
    multiplierRange: [['Rango del multiplicando', expected.multiplierRange, controls.multiplierRange === 2]],
  };
  const checks = checksByPanel[controls.panel] || [];
  for (const [label, shouldExist, exists] of checks) {
    if (shouldExist === null) continue;
    result(`${mode} · árbol`, shouldExist === exists, `${label}: ${exists ? 'presente' : 'omitido'}`);
  }
}

async function advanceToSummary(page, visited, mode, expected) {
  for (let guard = 0; guard < 10; guard += 1) {
    const panel = await panelState(page);
    if (panel && !visited.includes(panel)) visited.push(panel);
    if (panel === 'summary') return true;
    if (['specific', 'advanced', 'quantities', 'multiplierRange'].includes(panel)) compareControls(mode, await panelControls(page), expected);
    if (panel === 'quantities' || panel === 'multiplierRange') await auditSliderAlignment(page, panel);
    const next = page.locator('#workspaceWizardHost [data-wizard-action="next"]');
    if (await next.count() !== 1 || await next.isDisabled()) return false;
    await next.click();
  }
  return false;
}

async function auditMode(page, type) {
  await enterIndividual(page);
  const visited = ['type'];
  await page.locator(`#workspaceWizardHost [data-wizard-action="type"][data-value="${type}"]`).click();
  let panel = await panelState(page);
  if (panel === 'difficulty') {
    visited.push(panel);
    const options = await page.locator('#workspaceWizardHost [data-wizard-action="difficulty"]').count();
    result(`${type} · árbol`, options > 0, `Dificultad: ${options} opciones`);
    await page.locator('#workspaceWizardHost [data-wizard-action="difficulty"]').first().click();
  }
  panel = await panelState(page);
  if (panel !== 'answer') result(`${type} · árbol`, false, `Se esperaba answer y apareció ${panel}`);
  else {
    visited.push(panel);
    const answers = await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').count();
    result(`${type} · árbol`, answers > 0, `Tipo de respuesta: ${answers} opciones`);
    await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').first().click();
  }
  if (await panelState(page) !== 'operations') result(`${type} · árbol`, false, 'No llegó a operaciones');
  else {
    visited.push('operations');
    const selected = await chooseOperations(page, ['+', '×']);
    const expected = expectedForMode(type, selected);
    result(`${type} · árbol`, selected.length > 0, `Operaciones auditadas: ${selected.join(', ')}`);
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    visited.push('specific');
    if (expected.tables) await auditTableBatchActions(page, type);
  }
  const reachedSummary = await advanceToSummary(page, visited, type, expectedForMode(type, ['+', '×']));
  result(`${type} · árbol`, reachedSummary, reachedSummary ? 'Llega al resumen' : 'Rama muerta: no llega al resumen');
  const start = page.locator('#workspaceWizardHost [data-wizard-action="start"]');
  result(`${type} · inicio`, await start.count() === 1, 'El resumen ofrece un único botón de inicio');
  if (await start.count() === 1 && type !== 'bot') {
    await page.evaluate(() => { window.__individualTreeStart = false; beginCountdown = () => { window.__individualTreeStart = true; }; });
    await start.click();
    result(`${type} · inicio`, await page.evaluate(() => window.__individualTreeStart === true), 'beginCountdown() conserva su punto de entrada');
  }
  const unique = [...new Set(visited)];
  result(`${type} · informe`, unique.length === visited.length, `Paneles: ${unique.join(' → ')}`);
  const allPanels = ['difficulty', 'answer', 'operations', 'specific', 'advanced', 'quantities', 'multiplierRange', 'summary'];
  result(`${type} · informe`, true, `Paneles omitidos: ${allPanels.filter(name => !unique.includes(name)).join(', ') || 'ninguno'}`);
}

async function auditDivision(page) {
  await enterIndividual(page);
  await page.locator('#workspaceWizardHost [data-wizard-action="type"][data-value="free"]').click();
  await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').first().click();
  await chooseOperations(page, ['÷']);
  await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
  const specific = await panelControls(page);
  result('División · condicional', specific.tables > 0 && specific.addSub === 0 && specific.multiplierRange === 0, 'Configuración específica de División');
  await auditTableBatchActions(page, 'División');
  await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
  await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
  const quantities = await panelControls(page);
  result('División · condicional', quantities.qpt === 0 && quantities.qptTable > 0 && quantities.multiplierRange === 0, 'Cantidad por tabla sin cantidad por operación ni rango');
}

async function main() {
  const testServer = await startTestServer({ waitPath: '/api/ranking' });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.baseUrl = testServer.baseUrl;
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) consoleErrors.push(message.text()); });
  try {
    await enterIndividual(page);
    await auditLegacyNavigationGuard(page);
    const types = await page.locator('#workspaceWizardHost [data-wizard-action="type"]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
    result('Catálogo de modos', types.length === 7, `Modos: ${types.join(', ')}`);
    for (const type of types) { try { await auditMode(page, type); } catch (error) { result(`${type} · fatal`, false, error.message); } }
    try { await auditDivision(page); } catch (error) { result('División · fatal', false, error.message); }
    await page.evaluate(() => goStart());
    const homeState = await page.evaluate(() => {
      const shell = document.querySelector('#studentWorkspace');
      const homeNav = document.querySelector('#workspaceSidebar [data-workspace-target="home"]');
      return {
        activeScreens: Array.from(document.querySelectorAll('.screen.active')).map(screen => screen.id),
        home: shell?.classList.contains('workspace-home-active'),
        configHidden: !shell?.classList.contains('workspace-show-config'),
        wizardReset: !shell?.classList.contains('workspace-dynamic-wizard'),
        homeNavActive: homeNav?.classList.contains('active'),
        status: document.querySelector('#workspaceStatusText')?.textContent,
        freshConfig: {
          gameType,
          gameMode,
          setupMode,
          difficulty,
          ansMode,
          selectedOps: [...selectedOps],
          tblSelMode,
          qpt,
          qptPerTable,
          multMin,
          multMax,
          selectedCifras,
          addSubMode,
          visualMode,
          player2: pName2,
        }
      };
    });
    const fresh = homeState.freshConfig;
    const freshConfigOk = fresh.gameType === 'free' && fresh.gameMode === 'solo' && fresh.setupMode === 'solo' && fresh.difficulty === '' && fresh.ansMode === 'options' && JSON.stringify(fresh.selectedOps) === JSON.stringify(['×']) && fresh.tblSelMode === 'all' && fresh.qpt === 3 && fresh.qptPerTable === 3 && fresh.multMin === 1 && fresh.multMax === 12 && fresh.selectedCifras === 1 && fresh.addSubMode === 'direct' && fresh.visualMode === 'normal' && fresh.player2 === '';
    result('Retorno al inicio · pantalla limpia', homeState.activeScreens.length === 1 && homeState.activeScreens[0] === 'step1Screen' && homeState.home && homeState.configHidden && homeState.wizardReset && homeState.homeNavActive && homeState.status === 'Sesión lista', JSON.stringify(homeState));
    result('Retorno al inicio · configuración nueva', freshConfigOk, `Valores iniciales restaurados: ${JSON.stringify(fresh)}`);
    result('Errores de ejecución', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : 'Sin pageerror');
    result('Errores de consola', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' | ') : 'Sin errores de consola');
  } finally { await browser.close(); testServer.server.kill('SIGINT'); }
  const failed = findings.filter(item => !item.ok);
  console.log('\nINFORME — ÁRBOL DEL MODO INDIVIDUAL\n');
  for (const item of findings) console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.section}: ${item.detail}`);
  console.log(`\nResultado: ${failed.length ? 'FALLÓ' : 'APROBADO'} — ${findings.length - failed.length}/${findings.length} validaciones correctas.`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => { console.error('ERROR FATAL:', error.message || error); process.exitCode = 1; });
