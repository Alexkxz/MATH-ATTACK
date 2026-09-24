'use strict';

const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const findings = [];
const DUEL_TYPES = ['free', 'timed', 'lives', 'countdown', 'streak', 'survival'];
const DIFFICULTY_TYPES = new Set(['timed', 'lives', 'countdown']);
const OP_SUM = '+';
const OP_MUL = '\u00d7';

function result(section, ok, detail) { findings.push({ section, ok, detail }); }

async function enterDuel(page) {
  await page.goto(page.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => _entrarAlJuego('Auditoria Duelo'));
  await page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'duel\')"]').evaluate(node => node.click());
  await page.waitForSelector('#workspaceWizardHost [data-wizard-action="type"]');
}

async function panelState(page) {
  return page.evaluate(() => workspaceDynamicState?.panel || null);
}

async function auditDuelLegacyGuard(page) {
  const before=await panelState(page);
  const state=await page.evaluate(()=>{
    ['goStep1','goStep2','goStep2to3','goOpToStep3','goStep3LocalBack','goStep3aToStep3b','goStep3bBack'].forEach(name=>window[name]?.());
    const legacyIds=['step2Screen','stepOpScreen','step3LocalScreen','step3bLocalScreen'];
    return {
      after:workspaceDynamicState?.panel||null,
      activeLegacyScreens:legacyIds.filter(id=>document.getElementById(id)?.classList.contains('active'))
    };
  });
  result('Duelo · separación legacy',before==='type'&&state.after==='type'&&state.activeLegacyScreens.length===0,'La navegación antigua permanece bloqueada: '+JSON.stringify(state));
}

async function panelControls(page) {
  return page.evaluate(() => ({
    panel: workspaceDynamicState?.panel,
    addSub: document.querySelectorAll('[data-wizard-action="addsub"]').length,
    cifras: document.querySelectorAll('[data-wizard-action="cifras"]').length,
    tables: document.querySelectorAll('[data-wizard-action="tblmode"]').length,
    qpt: document.querySelectorAll('#workspaceQptSlider').length,
    qptTable: document.querySelectorAll('#workspaceQptTableSlider').length,
    multiplierRange: document.querySelectorAll('#workspaceMultMin, #workspaceMultMax').length,
    colors: document.querySelectorAll('[data-wizard-action="color"]').length,
    colors2: document.querySelectorAll('[data-wizard-action="color2"]:not(:disabled)').length,
    visual: document.querySelectorAll('[data-wizard-action="visual"]').length,
    manner: document.querySelectorAll('[data-wizard-action="manner"]').length,
  }));
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

function expectedPanels(type) {
  return [
    'type',
    ...(DIFFICULTY_TYPES.has(type) ? ['difficulty'] : []),
    'answer', 'operations', 'specific', 'advanced', ...(type === 'countdown' ? [] : ['order']), 'quantities', 'multiplierRange', 'summary',
  ];
}

async function advanceToSummary(page, visited, type) {
  for (let guard = 0; guard < 10; guard += 1) {
    const panel = await panelState(page);
    if (panel && !visited.includes(panel)) visited.push(panel);
    if (panel === 'summary') return true;
    if (['specific', 'advanced', 'order', 'quantities', 'multiplierRange'].includes(panel)) {
      const controls = await panelControls(page);
      if (panel === 'specific') {
        result(`Duelo ${type} · específico`, controls.tables > 0 && controls.addSub > 0 && controls.cifras > 0, 'Tablas y configuración de suma/resta disponibles');
      }
      if (panel === 'advanced') {
        result(`Duelo ${type} · avanzado`, controls.colors > 0 && controls.colors2 > 0 && controls.visual === 2, 'Colores de ambos jugadores y visualización disponibles');
      }
      if (panel === 'order') {
        result(`Duelo ${type} · orden`, controls.manner === 2, 'Orden de tablas disponible en su propio panel');
      }
      if (panel === 'quantities') {
        result(`Duelo ${type} · cantidades`, controls.qpt > 0 && controls.qptTable > 0, 'Cantidad por operación y por tabla disponibles');
      }
      if (panel === 'multiplierRange') {
        result(`Duelo ${type} · rango`, controls.multiplierRange === 2, 'Rango del multiplicando disponible');
      }
    }
    const next = page.locator('#workspaceWizardHost [data-wizard-action="next"]');
    if (await next.count() !== 1 || await next.isDisabled()) return false;
    await next.click();
  }
  return false;
}

async function configureOpponent(page, label) {
  const opponentInput = page.locator('#workspaceWizardHost #workspacePlayer2Name');
  const opponentColors = page.locator('#workspaceWizardHost [data-wizard-action="color2"]:not(:disabled)');
  result(`Duelo ${label} · rival`, await opponentInput.count() === 1, 'Nombre del segundo jugador disponible');
  result(`Duelo ${label} · rival`, await opponentColors.count() > 0, 'Colores del segundo jugador disponibles');
  await opponentInput.fill(`Rival ${label}`);
  await opponentColors.first().click();
  result(`Duelo ${label} · rival`, await page.evaluate(() => pName2.startsWith('Rival ') && p2Color !== pColor), 'Nombre y color del rival se conservan sin duplicar color');
}

async function auditDuelType(page, type) {
  await enterDuel(page);
  await page.locator(`#workspaceWizardHost [data-wizard-action="type"][data-value="${type}"]`).click();
  if (DIFFICULTY_TYPES.has(type)) {
    result(`Duelo ${type} · dificultad`, await page.locator('#workspaceWizardHost [data-wizard-action="difficulty"]').count() > 0, 'Selector de dificultad/tiempo disponible');
    await page.locator('#workspaceWizardHost [data-wizard-action="difficulty"]').first().click();
  }
  result(`Duelo ${type} · respuesta`, await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').count() > 0, 'Tipo de respuesta disponible');
  await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').first().click();
  const operations = await chooseOperations(page, [OP_SUM, OP_MUL]);
  result(`Duelo ${type} · operaciones`, JSON.stringify(operations) === JSON.stringify([OP_MUL, OP_SUM]), `Operaciones conservadas: ${operations.join(', ')}`);
  await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
  await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
  const visited = ['type', ...(DIFFICULTY_TYPES.has(type) ? ['difficulty'] : []), 'answer', 'operations', 'specific', 'advanced'];
  await configureOpponent(page, type);
  const reachedSummary = await advanceToSummary(page, visited, type);
  const expected = expectedPanels(type);
  result(`Duelo ${type} · árbol`, reachedSummary && JSON.stringify(visited) === JSON.stringify(expected), `Recorrido: ${visited.join(' → ')}`);
  const summary = await page.locator('#workspaceWizardHost .workspace-dynamic-summary').textContent();
  result(`Duelo ${type} · resumen`, summary.includes(`Rival ${type}`) && summary.includes('Segundo jugador'), 'El resumen incluye al rival');
}

async function main() {
  const testServer = await startTestServer({ waitPath: '/api/ranking' });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.baseUrl = testServer.baseUrl;
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) consoleErrors.push(message.text()); });
  try {
    await enterDuel(page);
    const types = await page.locator('#workspaceWizardHost [data-wizard-action="type"]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
    result('Catálogo Duelo', JSON.stringify(types) === JSON.stringify(DUEL_TYPES), `Modos disponibles: ${types.join(', ')}`);
    result('Catálogo Duelo', !types.includes('bot'), 'VS Bot no aparece dentro de Duelo');
    await auditDuelLegacyGuard(page);
    for (const type of DUEL_TYPES) {
      try { await auditDuelType(page, type); } catch (error) { result(`Duelo ${type} · fatal`, false, error.message); }
    }
    await enterDuel(page);
    await page.locator('#workspaceWizardHost [data-wizard-action="type"][data-value="free"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').first().click();
    await chooseOperations(page, [OP_SUM, OP_MUL]);
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await configureOpponent(page, 'inicio');
    const visited = ['type', 'answer', 'operations', 'specific', 'advanced'];
    await advanceToSummary(page, visited, 'inicio');
    const start = page.locator('#workspaceWizardHost [data-wizard-action="start"]');
    await page.evaluate(() => { window.__duelStartCalled = false; beginCountdown = () => { window.__duelStartCalled = true; }; });
    result('Duelo · inicio', await start.count() === 1 && !(await start.isDisabled()), 'El inicio se habilita con rival configurado');
    await start.click();
    result('Duelo · inicio', await page.evaluate(() => window.__duelStartCalled === true), 'Conserva la llamada a beginCountdown()');
    await page.evaluate(() => goStart());
    const resetState = await page.evaluate(() => ({
      activeScreens: [...document.querySelectorAll('.screen.active')].map(screen => screen.id),
      home: document.querySelector('#studentWorkspace')?.classList.contains('workspace-home-active'),
      wizardReset: !document.querySelector('#studentWorkspace')?.classList.contains('workspace-dynamic-wizard'),
      gameType,
      gameMode,
      difficulty,
      pName2,
      selectedOps: [...selectedOps],
      tblSelMode,
      qpt,
      qptPerTable,
      multMin,
      multMax,
    }));
    const resetOk = resetState.activeScreens.length === 1 && resetState.activeScreens[0] === 'step1Screen' && resetState.home && resetState.wizardReset && resetState.gameType === 'free' && resetState.gameMode === 'solo' && resetState.difficulty === '' && resetState.pName2 === '' && JSON.stringify(resetState.selectedOps) === JSON.stringify([OP_MUL]) && resetState.tblSelMode === 'all' && resetState.qpt === 3 && resetState.qptPerTable === 3 && resetState.multMin === 1 && resetState.multMax === 12;
    result('Duelo · retorno a Inicio', resetOk, `La siguiente configuración inicia limpia: ${JSON.stringify(resetState)}`);
    result('Errores de ejecución', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : 'Sin pageerror');
    result('Errores de consola', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' | ') : 'Sin errores de consola');
  } finally {
    await browser.close();
    testServer.server.kill('SIGINT');
  }
  const failed = findings.filter(item => !item.ok);
  console.log('\nINFORME — MODO DUELO\n');
  for (const item of findings) console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.section}: ${item.detail}`);
  console.log(`\nResultado: ${failed.length ? 'FALLÓ' : 'APROBADO'} — ${findings.length - failed.length}/${findings.length} validaciones correctas.`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => { console.error('ERROR FATAL:', error.message || error); process.exitCode = 1; });
