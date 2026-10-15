'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const sizes = { escritorio: { width: 1366, height: 768 }, tableta: { width: 820, height: 1180 }, movil: { width: 375, height: 667 } };
const cases = [
  { op: 'suma', size: 'escritorio', digits: 6, kind: 'direct', q: 4 },
  { op: 'suma', size: 'tableta', digits: 5, kind: 'carry', q: 3 },
  { op: 'suma', size: 'movil', digits: 6, kind: 'mixed', q: 2 },
  { op: 'resta', size: 'escritorio', digits: 6, kind: 'direct', q: 2 },
  { op: 'resta', size: 'tableta', digits: 5, kind: 'carry', q: 2 },
  { op: 'resta', size: 'movil', digits: 6, kind: 'mixed', q: 2 },
  { op: 'multiplicacion', size: 'escritorio', tables: [4,5,6,7,8], invert: true, min: 2, max: 10, q: 4 },
  { op: 'multiplicacion', size: 'tableta', tables: [4,9], min: 4, max: 8, q: 3 },
  { op: 'multiplicacion', size: 'movil', all: true, min: 2, max: 6, q: 2 },
  { op: 'division', size: 'escritorio', all: true, q: 4 },
  { op: 'division', size: 'tableta', tables: [2,9], q: 3 },
  { op: 'division', size: 'movil', tables: [4], invert: true, q: 2 },
  { op: 'suma', size: 'escritorio', digits: 2, kind: 'carry', q: 1, complete: true },
  { op: 'resta', size: 'escritorio', digits: 2, kind: 'carry', q: 1, complete: true },
  { op: 'multiplicacion', size: 'escritorio', tables: [4], min: 2, max: 3, q: 1, complete: true },
  { op: 'division', size: 'escritorio', tables: [7], q: 1, complete: true },
];
const check = (ok, message) => { if (!ok) throw new Error(message); };
const waitPanel = (page, panel) => page.waitForFunction(value => typeof workspaceDynamicState !== 'undefined' && workspaceDynamicState?.panel === value, panel, { timeout: 10000 });
async function next(page, panel) { await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click(); await waitPanel(page, panel); }
async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function chooseOperation(page, op) {
  const names = { suma: 'Suma', resta: 'Resta', multiplicacion: 'Multiplicación', division: 'División' };
  const buttons = page.locator('#workspaceWizardHost [data-wizard-action="operation"]');
  for (let i = 0; i < await buttons.count(); i++) if ((await buttons.nth(i).innerText()).includes(names[op])) { await buttons.nth(i).click(); return; }
  throw new Error('No aparece operación: ' + names[op]);
}
async function selectTables(page, test) {
  const division = test.op === 'division';
  if (division) {
    await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="custom"]').click();
    const buttons = page.locator('#workspaceWizardHost [data-wizard-action="table"]');
    const actual = await buttons.evaluateAll(list => list.map(button => ({ value: +button.dataset.value, label: button.innerText.trim(), icon: button.querySelector('.dynamic-option-icon')?.textContent.trim() })));
    check(actual.length === 8 && actual.map(item => item.value).join(',') === '2,3,4,5,6,7,8,9', 'División no presenta únicamente los divisores 2–9: ' + JSON.stringify(actual));
    check(actual.every(item => item.label.includes('Divisor') && item.icon.startsWith('÷')), 'Las opciones no están rotuladas como divisores.');
  }
  if (test.all) await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="all"]').click();
  else {
    await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="custom"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="tblClear"]').click();
    for (const table of test.tables) await page.locator('#workspaceWizardHost [data-wizard-action="table"][data-value="' + table + '"]').click();
    if (test.invert) await page.locator('#workspaceWizardHost [data-wizard-action="tblInvert"]').click();
  }
  const selected = await page.evaluate(() => [...selectedTbls].sort((a,b) => a-b));
  const pool = division ? [2,3,4,5,6,7,8,9] : [1,2,3,4,5,6,7,8,9,10,11,12];
  const expected = test.all ? pool : test.invert ? pool.filter(value => !test.tables.includes(value)) : [...test.tables].sort((a,b) => a-b);
  check(JSON.stringify(selected) === JSON.stringify(expected), 'Selección incorrecta, actual=' + selected + ' esperada=' + expected);
  return selected;
}
async function runCase(browser, baseUrl, test, out) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/favicon|Failed to load resource/i.test(msg.text())) errors.push(msg.text()); });
  await page.route('**/*', route => ['POST','PUT','PATCH','DELETE'].includes(route.request().method()) ? route.abort() : route.continue());
  try {
    await page.goto(baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window._entrarAlJuego === 'function');
    await page.evaluate(() => {
      musicMuted = true; sfxMuted = true;
      localStorage.setItem(SET_KEY, JSON.stringify({ musicMuted: true, sfxMuted: true, vfxEnabled: false }));
      localStorage.setItem(workspaceMusicStorageKey, 'off'); workspaceMusicState.userDisabled = true; workspaceMusicState.playing = false;
      _entrarAlJuego('Auditoría silenciosa');
    });
    await page.locator('#workspaceSidebar .workspace-nav-item', { hasText: 'Operaciones' }).click();
    await waitPanel(page, 'type');
    await page.setViewportSize(sizes[test.size]);
    await page.locator('#workspaceWizardHost [data-wizard-action="type"][data-value="free"]').click(); await waitPanel(page, 'answer');
    await page.locator('#workspaceWizardHost [data-wizard-action="answer"][data-value="write"]').click(); await waitPanel(page, 'operations');
    await chooseOperation(page, test.op); await next(page, 'specific');
    let tables = [];
    const addSub = test.op === 'suma' || test.op === 'resta';
    if (addSub) {
      await page.locator('#workspaceWizardHost [data-wizard-action="cifras"][data-value="' + test.digits + '"]').click();
      await page.locator('#workspaceWizardHost [data-wizard-action="addsub"][data-value="' + test.kind + '"]').click();
      const state = await page.evaluate(() => ({ digits: selectedCifras, kind: addSubMode }));
      check(state.digits === test.digits && state.kind === test.kind, 'No conservó cifras/tipo: ' + JSON.stringify(state));
    } else tables = await selectTables(page, test);
    const caseName = test.op + '-' + test.size + (test.complete ? '-completa' : '');
    await page.screenshot({ path: path.join(out, caseName + '-config.png'), animations: 'disabled' });
    await next(page, 'advanced'); await next(page, 'quantities');
    const qSelector = addSub ? '#workspaceQptSlider' : '#workspaceQptTableSlider';
    await setRange(page, qSelector, test.q);
    if (test.op === 'multiplicacion') {
      await next(page, 'multiplierRange'); await setRange(page, '#workspaceMultMin', test.min); await setRange(page, '#workspaceMultMax', test.max);
      const range = await page.evaluate(() => [multMin, multMax]);
      check(range[0] === test.min && range[1] === test.max, 'Rango no conservado: ' + range);
    }
    await next(page, 'summary');
    const summary = await page.locator('#workspaceWizardHost').innerText();
    const summaryLower = summary.toLocaleLowerCase();
    if (addSub) {
      check(summaryLower.includes(String(test.digits)), 'Resumen sin cantidad de cifras.');
      check(summaryLower.includes(({ direct: 'directas', carry: 'llevadas', mixed: 'mixtas' })[test.kind]), 'Resumen sin tipo Directas/Llevadas/Mixtas.');
    }
    if (test.op === 'division') { check(summaryLower.includes('divisores'), 'Resumen no identifica divisores.'); check(!summary.includes('×7'), 'Resumen etiqueta el divisor como tabla ×7.'); }
    if (test.op === 'multiplicacion') check(summaryLower.includes('rango del multiplicando'), 'Resumen sin rango del multiplicando: ' + summary);
    check(!/undefined|NaN/.test(summary), 'Resumen contiene valores inválidos.');
    const summaryPath = path.join(out, caseName + '-resumen.png');
    await page.screenshot({ path: summaryPath, animations: 'disabled' });
    const layout = await page.evaluate(() => {
      const r = document.querySelector('#workspaceWizardHost .workspace-dynamic-panel')?.getBoundingClientRect();
      return { viewport: [innerWidth, innerHeight], overflowX: document.documentElement.scrollWidth > innerWidth + 1, overflowY: document.documentElement.scrollHeight > innerHeight + 1, panelInViewport: !!r && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, soundMuted: musicMuted && sfxMuted && workspaceMusicState?.userDisabled };
    });
    check(!layout.overflowX && !layout.overflowY && layout.panelInViewport && layout.soundMuted, 'Layout/audio no válido: ' + JSON.stringify(layout));
    await page.locator('#workspaceWizardHost [data-wizard-action="start"]').click();
    await page.waitForFunction(() => document.getElementById('gameScreen')?.classList.contains('active'), null, { timeout: 15000 });
    await page.waitForFunction(() => questions.length > 0 && (document.querySelector('#verticalInlineInput') || document.querySelector('#verticalNotebook input')), null, { timeout: 15000 });
    await page.waitForFunction(() => typeof verticalOpState !== 'undefined' && verticalOpState?.steps?.length > 0, null, { timeout: 15000 });
    const q = await page.evaluate(() => { const item = questions[qIndex] || questions[0]; return { a: item.a, b: item.b, op: item.op, answer: item.answer, table: item.table, dividend: item._divA, remainder: item._remainder, total: questions.length, text: qText(item) }; });
    if (addSub) {
      check(String(q.a).length === test.digits && String(q.b).length === test.digits, 'Pregunta no usa ' + test.digits + ' cifras: ' + JSON.stringify(q));
      if (test.kind !== 'mixed') {
        const hasCarry = await page.evaluate(({ a, b, op }) => {
          const first = String(a).split('').reverse().map(Number), second = String(b).split('').reverse().map(Number);
          if (op === '+') {
            let carry = 0;
            for (let index = 0; index < Math.max(first.length, second.length); index++) {
              const sum = (first[index] || 0) + (second[index] || 0) + carry;
              if (sum >= 10) return true;
              carry = sum >= 10 ? 1 : 0;
            }
          } else {
            let borrow = 0;
            for (let index = 0; index < Math.max(first.length, second.length); index++) {
              const digit = (first[index] || 0) - borrow;
              if (digit < (second[index] || 0)) return true;
              borrow = 0;
            }
          }
          return false;
        }, q);
        check(hasCarry === (test.kind === 'carry'), 'El algoritmo de ' + test.op + ' no coincide con la elección ' + test.kind + ': ' + q.text);
      }
      if (test.kind === 'mixed') {
        const opSymbol = test.op === 'resta' ? '−' : '+';
        const kinds = await page.evaluate(op => {
          const carry = q => {
            const a=String(q.a).split('').reverse().map(Number),b=String(q.b).split('').reverse().map(Number);
            if(q.op==='+'){let c=0;for(let i=0;i<Math.max(a.length,b.length);i++){const n=(a[i]||0)+(b[i]||0)+c;if(n>=10)return true;c=n>=10?1:0;}return false;}
            let borrow=0;for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)-borrow<(b[i]||0))return true;borrow=0;}return false;
          };
          const questions = Array.from({length:60},()=>makeConfiguredAddSubQuestion(op,6,'mixed'));
          return { direct: questions.some(q=>!carry(q)), carry: questions.some(carry) };
        }, opSymbol);
        check(kinds.direct && kinds.carry, 'Mixtas no generó ambos tipos: ' + JSON.stringify(kinds));
      }
      check(q.total === test.q, 'Cantidad por operación incorrecta: ' + q.total);
    }
    if (test.op === 'multiplicacion') {
      check(tables.includes(q.a), 'Multiplicación ignoró tablas elegidas: ' + JSON.stringify({ tables, q }));
      check(q.b >= test.min && q.b <= test.max, 'Multiplicando fuera del rango configurado: ' + JSON.stringify({ min: test.min, max: test.max, q }));
      check(q.answer === q.a * q.b, 'Producto interno incorrecto.');
      check(q.total === tables.length * test.q, 'Cantidad por tabla incorrecta: ' + q.total + ', tablas=' + tables.length);
    }
    if (test.op === 'division') {
      const allowed = test.all ? [2,3,4,5,6,7,8,9] : tables;
      check(allowed.includes(q.table) && q.table >= 2 && q.table <= 9, 'Divisor fuera de selección/rango: ' + JSON.stringify(q));
      check(q.dividend === q.table * q.answer + q.remainder && q.remainder >= 0 && q.remainder < q.table, 'División/cociente/residuo incorrectos: ' + JSON.stringify(q));
      check(q.total === tables.length * test.q, 'Cantidad por divisor incorrecta: ' + q.total);
    }
    const gameLayout = await page.evaluate(() => {
      const card = document.querySelector('#questionCard');
      const notebook = document.querySelector('#verticalNotebook');
      const cardRect = card?.getBoundingClientRect();
      const notebookRect = notebook?.getBoundingClientRect();
      const input = document.querySelector('#verticalInlineInput') || notebook?.querySelector('input');
      return {
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        overflowY: document.documentElement.scrollHeight > innerHeight + 1,
        cardInsideViewport: !!cardRect && cardRect.left >= -1 && cardRect.right <= innerWidth + 1,
        notebookFitsCard: !!cardRect && !!notebookRect && notebookRect.left >= cardRect.left - 1 && notebookRect.right <= cardRect.right + 1,
        inputVisible: !!input && input.getBoundingClientRect().width > 0,
        soundsMuted: musicMuted && sfxMuted && workspaceMusicState?.userDisabled,
      };
    });
    check(!gameLayout.overflowX && !gameLayout.overflowY && gameLayout.cardInsideViewport && gameLayout.notebookFitsCard && gameLayout.inputVisible && gameLayout.soundsMuted, 'Layout de partida no válido: ' + JSON.stringify(gameLayout));
    await page.waitForTimeout(200);
    const gamePath = path.join(out, caseName + '-partida.png');
    await page.screenshot({ path: gamePath, animations: 'disabled' });
    let resultsPath = null;
    let finalStats = null;
    if (test.complete) {
      for (let guard = 0; guard < 45; guard++) {
        if (await page.locator('#resultsScreen.active').count()) break;
        const stepState = await page.evaluate(() => ({ op: verticalOpState?.op, cursor: verticalOpState?.cursor, length: verticalOpState?.steps?.length, step: verticalOpState?.steps?.[verticalOpState?.cursor], activeInput: !!document.getElementById('verticalInlineInput') }));
        const expected = stepState.step?.expected;
        if (stepState.length > 0 && stepState.cursor >= stepState.length) {
          await page.waitForFunction(() => document.getElementById('resultsScreen')?.classList.contains('active'), null, { timeout: 15000 });
          break;
        }
        check(Number.isFinite(expected), 'No se encontró el siguiente paso correcto del cuaderno: ' + JSON.stringify(stepState));
        await page.evaluate(value => {
          const input = document.getElementById('verticalInlineInput');
          input.value = String(value);
          verticalEntryValue = String(value);
          submitVerticalStep();
        }, expected);
        await page.waitForTimeout(300);
      }
      await page.waitForFunction(() => document.getElementById('resultsScreen')?.classList.contains('active'), null, { timeout: 15000 });
      finalStats = await page.evaluate(() => ({ correct: Number(document.getElementById('statC')?.textContent), wrong: Number(document.getElementById('statW')?.textContent), timeout: Number(document.getElementById('statT')?.textContent), title: document.getElementById('rName')?.textContent }));
      check(finalStats.correct === 1 && finalStats.wrong === 0 && finalStats.timeout === 0, 'Resultado final inesperado: ' + JSON.stringify(finalStats));
      resultsPath = path.join(out, caseName + '-resultado.png');
      await page.screenshot({ path: resultsPath, animations: 'disabled' });
    }
    check(errors.length === 0, 'Errores de navegador: ' + errors.join(' | '));
    return { status: 'PASS', test, tables, summary, layout, gameLayout, question: q, finalStats, captures: [summaryPath, gamePath, ...(resultsPath ? [resultsPath] : [])] };
  } finally { await context.close(); }
}

async function main() {
  const server = await startTestServer({ waitPath: '/math-attack.html' });
  const browser = await chromium.launch();
  const selectedCases = process.env.OPERATIONS_E2E_ONLY === '1'
    ? cases.filter(test => test.complete && (!process.env.OPERATIONS_E2E_OPERATION || test.op === process.env.OPERATIONS_E2E_OPERATION))
    : cases;
  const out = path.join(__dirname, '..', 'output', 'operations-audit', 'full', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  try { for (const test of selectedCases) { try { results.push(await runCase(browser, server.baseUrl, test, out)); } catch (error) { results.push({ status: 'FAIL', test, error: error.stack || error.message }); } } }
  finally { await browser.close(); server.server.kill('SIGINT'); }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2), 'utf8');
  const passed = results.filter(result => result.status === 'PASS').length;
  const reportLines = [
    '# Auditoría completa de Operaciones',
    '',
    'Fecha: ' + new Date().toISOString(),
    'Navegador: Chromium/Playwright. Audio y efectos silenciados; las partidas no completas no reciben respuesta.',
    'Las escrituras HTTP se interceptan para impedir persistencia de resultados durante las partidas completas.',
    'Matriz responsive: escritorio 1366×768, tableta 820×1180, móvil 375×667.',
    '',
    '## Casos ejecutados',
    '',
  ];
  for (const result of results) {
    reportLines.push('### ' + result.status + ': ' + result.test.op + ' / ' + result.test.size + (result.test.complete ? ' / partida completa' : ''));
    if (result.error) {
      reportLines.push('', 'Fallo: ' + result.error.split('\n')[0], '');
      continue;
    }
    reportLines.push('', 'Configuración: `' + JSON.stringify(result.test) + '`');
    if (result.tables.length) reportLines.push('Selección efectiva: `' + result.tables.join(', ') + '`');
    reportLines.push('Pregunta inicial: `' + result.question.text + '`; total de preguntas: ' + result.question.total + '.');
    reportLines.push('Layout: documento sin overflow horizontal/vertical; panel en viewport: ' + result.layout.panelInViewport + '; cuaderno dentro de tarjeta: ' + result.gameLayout.notebookFitsCard + '.');
    if (result.finalStats) reportLines.push('Resultado final: ' + result.finalStats.correct + ' correcta(s), ' + result.finalStats.wrong + ' incorrecta(s), ' + result.finalStats.timeout + ' agotada(s).');
    reportLines.push('Capturas: ' + result.captures.map(file => '`' + path.basename(file) + '`').join(', ') + '.', '');
  }
  reportLines.push('**Resultado: ' + passed + '/' + results.length + ' casos aprobados.**', '', 'La cobertura es una matriz representativa de configuraciones y dispositivos, no todas las combinaciones matemáticas ni todos los tamaños físicos posibles.');
  fs.writeFileSync(path.join(out, 'informe.md'), reportLines.join('\n'), 'utf8');
  console.log('EVIDENCIA ' + out);
  for (const result of results) console.log(result.status + ' ' + result.test.op + ' ' + result.test.size + (result.error ? ': ' + result.error.split('\n')[0] : ' — ' + result.question.text));
  console.log('RESULTADO ' + passed + '/' + results.length);
  if (passed !== results.length) process.exitCode = 1;
}
main().catch(error => { console.error('ERROR:', error.stack || error.message || error); process.exit(1); });
