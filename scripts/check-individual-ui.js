'use strict';

const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const results = [];

function pass(section, detail) {
  results.push({ section, status: 'PASS', detail });
}

function fail(section, detail) {
  results.push({ section, status: 'FAIL', detail });
}

function assert(condition, section, detail) {
  if (!condition) throw new Error(detail);
  pass(section, detail);
}

async function enterIndividual(page) {
  await page.goto(page.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => _entrarAlJuego('Prueba individual UI'));
  await page.click('#workspaceSidebar .workspace-nav-item:nth-child(2)');
  await page.waitForSelector('#workspaceWizardHost [data-wizard-action="type"]');
}

async function goToOperations(page, type = 'free') {
  await enterIndividual(page);
  await page.locator(`#workspaceWizardHost [data-wizard-action="type"][data-value="${type}"]`).click();
  if (type !== 'free') {
    await page.waitForSelector('#workspaceWizardHost [data-wizard-action="difficulty"]');
    const difficulty = page.locator('#workspaceWizardHost [data-wizard-action="difficulty"]').first();
    await difficulty.click();
  }
  await page.waitForSelector('#workspaceWizardHost [data-wizard-action="answer"]');
  const answer = page.locator('#workspaceWizardHost [data-wizard-action="answer"]').first();
  await answer.click();
  await page.waitForSelector('#workspaceWizardHost [data-wizard-action="operation"]');
}

async function main() {
  const testServer = await startTestServer({ waitPath: '/api/ranking' });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.baseUrl = testServer.baseUrl;
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) consoleErrors.push(message.text());
  });

  try {
    await enterIndividual(page);
    const types = await page.locator('#workspaceWizardHost [data-wizard-action="type"]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
    assert(types.length >= 2, '1. Modos de juego', `Se encontraron ${types.length} opciones: ${types.join(', ')}`);
    for (const type of types) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.evaluate(() => _entrarAlJuego('Prueba individual UI'));
      await page.click('#workspaceSidebar .workspace-nav-item:nth-child(2)');
      await page.locator(`#workspaceWizardHost [data-wizard-action="type"][data-value="${type}"]`).click();
      const expectedPanel = ['timed', 'lives', 'countdown', 'bot'].includes(type) ? 'difficulty' : 'answer';
      await page.waitForSelector(`#workspaceWizardHost [data-wizard-action="${expectedPanel}"]`);
      const count = await page.locator(`#workspaceWizardHost [data-wizard-action="${expectedPanel}"]`).count();
      assert(count > 0, '1. Modos de juego', `${type}: ofrece ${count} opciones posteriores`);
    }

    await enterIndividual(page);
    await page.locator('#workspaceWizardHost [data-wizard-action="type"][data-value="free"]').click();
    const answers = await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').count();
    assert(answers >= 1, '2. Tipo de respuesta', `Se encontraron ${answers} opciones`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await goToOperations(page);
    const answerValues = await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
    for (const value of answerValues) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await goToOperations(page);
      await page.locator(`#workspaceWizardHost [data-wizard-action="answer"][data-value="${value}"]`).click();
      const state = await page.evaluate(() => ({
        active: document.querySelector('[data-wizard-action="answer"].selected')?.dataset.value,
        selectedCount: document.querySelectorAll('[data-wizard-action="answer"].selected').length,
        global: ansMode,
      }));
      assert(state.active === value && state.selectedCount === 1 && state.global === value, '2. Tipo de respuesta', `${value}: selección exclusiva y estado sincronizado`);
    }

    await goToOperations(page);
    const operations = await page.locator('#workspaceWizardHost [data-wizard-action="operation"]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
    assert(operations.length >= 4, '3. Operaciones', `Se encontraron ${operations.length}: ${operations.join(', ')}`);
    const firstOperation = operations[0];
    const firstOperationButton = page.locator(`#workspaceWizardHost [data-wizard-action="operation"][data-value="${firstOperation}"]`);
    const firstAlreadySelected = await firstOperationButton.evaluate(node => node.classList.contains('selected'));
    if (!firstAlreadySelected) await firstOperationButton.click();
    await firstOperationButton.click();
    let opState = await page.evaluate(() => ({ selected: [...document.querySelectorAll('[data-wizard-action="operation"].selected')].map(n => n.dataset.value), global: [...selectedOps] }));
    assert(!opState.selected.includes(firstOperation) && !opState.global.includes(firstOperation), '3. Operaciones', `${firstOperation}: se puede deseleccionar`);
    await page.locator(`#workspaceWizardHost [data-wizard-action="operation"][data-value="${firstOperation}"]`).click();
    opState = await page.evaluate(() => ({ selected: [...document.querySelectorAll('[data-wizard-action="operation"].selected')].map(n => n.dataset.value), global: [...selectedOps] }));
    assert(opState.selected.includes(firstOperation) && opState.global.includes(firstOperation), '3. Operaciones', `${firstOperation}: se puede volver a seleccionar`);
    for (const operation of operations) {
      const selected = await page.locator(`#workspaceWizardHost [data-wizard-action="operation"][data-value="${operation}"].selected`).count();
      if (!selected) await page.locator(`#workspaceWizardHost [data-wizard-action="operation"][data-value="${operation}"]`).click();
    }
    opState = await page.evaluate(() => ({ selected: [...selectedOps] }));
    assert(operations.every(operation => opState.selected.includes(operation)), '3. Operaciones', 'Todas las operaciones pueden coexistir y quedan registradas');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await goToOperations(page);
    const addSubOps = page.locator('#workspaceWizardHost [data-wizard-action="operation"]');
    for (let i = 0; i < await addSubOps.count(); i += 1) {
      const op = await addSubOps.nth(i).getAttribute('data-value');
      const selected = await addSubOps.nth(i).evaluate(node => node.classList.contains('selected'));
      if ((op === '+' || op === '−') && !selected) await addSubOps.nth(i).click();
      if (op !== '+' && op !== '−' && selected) await addSubOps.nth(i).click();
    }
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.waitForSelector('#workspaceWizardHost [data-wizard-action="addsub"]');
    await page.locator('#workspaceWizardHost [data-wizard-action="addsub"][data-value="carry"]').click();
    let addSubState = await page.evaluate(() => ({ mode: addSubMode, selected: document.querySelectorAll('[data-wizard-action="addsub"].selected').length, old: document.querySelector('#step3LocalScreen #addSubModeGrid [data-addsub-mode="carry"]')?.className, dynamic: document.querySelector('[data-wizard-action="addsub"][data-value="carry"]')?.className }));
    assert(addSubState.mode === 'carry' && addSubState.selected === 1, '3. Sumas y restas', `Llevadas se activa y sincroniza correctamente: ${JSON.stringify(addSubState)}`);
    await page.locator('#workspaceWizardHost [data-wizard-action="addsub"][data-value="direct"]').click();
    addSubState = await page.evaluate(() => ({ mode: addSubMode, selected: document.querySelectorAll('[data-wizard-action="addsub"].selected').length }));
    assert(addSubState.mode === 'direct' && addSubState.selected === 1, '3. Sumas y restas', `Directas se puede seleccionar después de Llevadas: ${JSON.stringify(addSubState)}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await goToOperations(page);
    const mult = page.locator('#workspaceWizardHost [data-wizard-action="operation"][data-value="×"]');
    if (!(await page.locator('#workspaceWizardHost [data-wizard-action="operation"][data-value="×"].selected').count())) await mult.click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.waitForSelector('#workspaceWizardHost [data-wizard-action="tblmode"]');
    const tableModes = await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"]').count();
    assert(tableModes === 2, '4. Tablas', 'Existen los modos Todas y Elegir');
    await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="all"]').click();
    let tableState = await page.evaluate(() => ({ mode: tblSelMode, count: selectedTbls.length, total: ALL_TBL_PICK.length }));
    assert(tableState.mode === 'all' && tableState.count === tableState.total, '4. Tablas', 'Todas selecciona el conjunto completo');
    await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="custom"]').click();
    const tableButtons = page.locator('#workspaceWizardHost [data-wizard-action="table"]');
    const tableCount = await tableButtons.count();
    assert(tableCount > 0, '4. Tablas', `Modo personalizado muestra ${tableCount} tablas`);
    const tableValue = await tableButtons.first().getAttribute('data-value');
    await tableButtons.first().click();
    tableState = await page.evaluate(() => ({ mode: tblSelMode, selected: selectedTbls.length, total: ALL_TBL_PICK.length }));
    assert(tableState.mode === 'custom' && tableState.selected < tableState.total, '4. Tablas', `Tabla ${tableValue}: se deselecciona tras usar Todas`);
    await tableButtons.first().click();
    tableState = await page.evaluate(() => ({ selected: selectedTbls.length }));
    assert(tableState.selected >= 1, '4. Tablas', `Tabla ${tableValue}: se puede volver a seleccionar`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await goToOperations(page);
    const sum = page.locator('#workspaceWizardHost [data-wizard-action="operation"][data-value="+"]');
    const mul = page.locator('#workspaceWizardHost [data-wizard-action="operation"][data-value="×"]');
    if (!(await page.locator('#workspaceWizardHost [data-wizard-action="operation"][data-value="+"].selected').count())) await sum.click();
    if (!(await page.locator('#workspaceWizardHost [data-wizard-action="operation"][data-value="×"].selected').count())) await mul.click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.waitForSelector('#workspaceQptSlider');
    assert(await page.locator('#workspaceQptTableSlider').count() === 1, '5. Sliders', 'Cantidad por tabla aparece con Multiplicación');
    await page.fill('#workspaceQptSlider', '8');
    await page.fill('#workspaceQptTableSlider', '6');
    const quantityLive = await page.evaluate(() => ({ qpt, qptPerTable, qptText: document.getElementById('workspaceQptValue')?.textContent, tableText: document.getElementById('workspaceQptTableValue')?.textContent }));
    assert(quantityLive.qpt === 8 && quantityLive.qptPerTable === 6 && quantityLive.qptText.includes('8') && quantityLive.tableText.includes('6'), '5. Sliders', `Las cantidades actualizan estado y texto en tiempo real: ${JSON.stringify(quantityLive)}`);
    const quantityLayout = await page.evaluate(() => { const main = document.querySelector('.workspace-main'); const host = document.querySelector('#workspaceWizardHost'); return { mainOverflow: main.scrollHeight - main.clientHeight, hostOverflow: host.scrollHeight - host.clientHeight }; });
    assert(quantityLayout.mainOverflow <= 2 && quantityLayout.hostOverflow <= 2, '5. Layout central', `El panel de cantidades cabe sin scroll (main=${quantityLayout.mainOverflow}px, host=${quantityLayout.hostOverflow}px)`);
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.waitForSelector('#workspaceMultMin');
    assert(await page.locator('#workspaceMultMin').count() === 1 && await page.locator('#workspaceMultMax').count() === 1, '5. Rango del multiplicando', 'El rango aparece en su panel propio con Multiplicación');
    await page.fill('#workspaceMultMin', '2');
    await page.fill('#workspaceMultMax', '10');
    const live = await page.evaluate(() => ({ qpt, qptPerTable, multMin, multMax, qptText: document.getElementById('workspaceQptValue')?.textContent, tableText: document.getElementById('workspaceQptTableValue')?.textContent, rangeText: document.getElementById('workspaceMultiplierRangeValue')?.textContent }));
    assert(live.multMin === 2 && live.multMax === 10 && (live.rangeText || '').includes('2 al 10'), '5. Rango del multiplicando', `El rango actualiza estado y texto en tiempo real: ${JSON.stringify(live)}`);
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    const summary = await page.locator('.workspace-dynamic-summary').innerText();
    assert(summary.includes('8') && summary.includes('6 por tabla') && summary.includes('2 al 10') && summary.includes('×'), '6. Resumen', 'El resumen refleja operaciones, cantidades y rango elegidos');
    await page.locator('#workspaceWizardHost [data-wizard-action="back"]').click();
    const retainedRange = await page.evaluate(() => ({ multMin: $('workspaceMultMin')?.value, multMax: $('workspaceMultMax')?.value }));
    assert(retainedRange.multMin === '2' && retainedRange.multMax === '10', '7. Navegación', 'Atrás conserva el rango del multiplicando');
    await page.locator('#workspaceWizardHost [data-wizard-action="back"]').click();
    const retainedQuantity = await page.evaluate(() => ({ qpt: $('workspaceQptSlider')?.value, qptPerTable: $('workspaceQptTableSlider')?.value }));
    assert(retainedQuantity.qpt === '8' && retainedQuantity.qptPerTable === '6', '7. Navegación', 'Atrás conserva las cantidades');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await goToOperations(page);
    const onlySum = page.locator('#workspaceWizardHost [data-wizard-action="operation"][data-value="+"]');
    const allOps = page.locator('#workspaceWizardHost [data-wizard-action="operation"]');
    for (let i = 0; i < await allOps.count(); i += 1) {
      const op = await allOps.nth(i).getAttribute('data-value');
      const selected = await allOps.nth(i).evaluate(node => node.classList.contains('selected'));
      if (op === '+' && !selected) await allOps.nth(i).click();
      if (op !== '+' && selected) await allOps.nth(i).click();
    }
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    assert(await page.locator('#workspaceQptTableSlider').count() === 0 && await page.locator('#workspaceMultMin').count() === 0, '8. Visibilidad condicional', 'Cantidad por tabla y rango se ocultan sin Multiplicación');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await goToOperations(page);
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    for (let i = 0; i < 2 && await page.locator('[data-wizard-action="start"]').count() === 0; i += 1) {
      await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    }
    await page.waitForSelector('[data-wizard-action="start"]');
    await page.evaluate(() => { window.__individualStartCalled = false; beginCountdown = () => { window.__individualStartCalled = true; }; });
    await page.locator('#workspaceWizardHost [data-wizard-action="start"]').click();
    assert(await page.evaluate(() => window.__individualStartCalled === true), '9. Inicio de partida', 'Comenzar misión conserva la llamada a beginCountdown()');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await goToOperations(page);
    const divisionOps = page.locator('#workspaceWizardHost [data-wizard-action="operation"]');
    for (let i = 0; i < await divisionOps.count(); i += 1) {
      const op = await divisionOps.nth(i).getAttribute('data-value');
      const selected = await divisionOps.nth(i).evaluate(node => node.classList.contains('selected'));
      if (op === '÷' && !selected) await divisionOps.nth(i).click();
      if (op !== '÷' && selected) await divisionOps.nth(i).click();
    }
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    assert(await page.locator('#workspaceQptSlider').count() === 0 && await page.locator('#workspaceQptTableSlider').count() === 1 && await page.locator('#workspaceMultMin').count() === 0, '8. Visibilidad condicional', 'División muestra cantidad por tabla, sin cantidad por operación ni rango del multiplicando');
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    const divisionSummary = await page.locator('.workspace-dynamic-summary').innerText();
    const divisionSummaryNormalized = divisionSummary.toLowerCase();
    assert(divisionSummary.includes('÷') && divisionSummaryNormalized.includes('cantidad por operación') && divisionSummaryNormalized.includes('no aplica') && divisionSummaryNormalized.includes('cantidad por tabla'), '6. Resumen de División', `El resumen de División conserva la configuración aplicable: ${divisionSummary.replace(/\n/g, ' | ')}`);

    if (pageErrors.length) fail('10. Errores de ejecución', pageErrors.join(' | '));
    else pass('10. Errores de ejecución', 'No hubo pageerror durante el recorrido');
    if (consoleErrors.length) fail('10. Errores de ejecución', consoleErrors.join(' | '));
    else pass('10. Errores de ejecución', 'No hubo errores de consola durante el recorrido');
  } catch (error) {
    fail('Fallo no previsto', error.message || String(error));
  } finally {
    await browser.close();
    testServer.server.kill('SIGINT');
  }

  const failed = results.filter(result => result.status === 'FAIL');
  console.log('\nINFORME — MODO INDIVIDUAL\n');
  for (const result of results) console.log(`[${result.status}] ${result.section}: ${result.detail}`);
  console.log(`\nResultado: ${failed.length ? 'FALLÓ' : 'APROBADO'} — ${results.length - failed.length}/${results.length} validaciones correctas.`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error('ERROR FATAL:', error.message || error);
  process.exitCode = 1;
});
