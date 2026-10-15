'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const ALL_OPERATIONS = [
  { value: '+', name: 'suma' },
  { value: '×', name: 'multiplicacion' },
  { value: '÷', name: 'division' },
];
const OPERATIONS = process.env.OPERATIONS_CAPTURE
  ? ALL_OPERATIONS.filter(operation => operation.name === process.env.OPERATIONS_CAPTURE)
  : ALL_OPERATIONS;

async function waitPanel(page, panel) {
  try {
    await page.waitForFunction(expected => (
      workspaceDynamicState?.panel === expected
    ), panel, { timeout: 8000 });
  } catch (error) {
    const current = await page.evaluate(() => ({
      panel: workspaceDynamicState?.panel || null,
      mode: workspaceDynamicState?.mode || null,
      setup: setupMode || null,
      wizard: document.querySelector('#workspaceWizardHost')?.innerText?.slice(0, 240) || '',
      shellClasses: document.querySelector('#studentWorkspace')?.className || '',
    }));
    throw new Error(`No llegó al panel ${panel}: ${JSON.stringify(current)}`, { cause: error });
  }
}

async function advance(page, expectedPanel) {
  await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
  await waitPanel(page, expectedPanel);
}

async function captureOperation(browser, baseUrl, operation, outputDir, timestamp) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) {
      errors.push(message.text());
    }
  });

  try {
    await page.goto(`${baseUrl}/math-attack.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window._entrarAlJuego === 'function');
    await page.evaluate(() => {
      musicMuted = true;
      sfxMuted = true;
      localStorage.setItem(SET_KEY, JSON.stringify({ musicMuted: true, sfxMuted: true, vfxEnabled: false }));
      localStorage.setItem(workspaceMusicStorageKey, 'off');
      workspaceMusicState.userDisabled = true;
      workspaceMusicState.playing = false;
      _entrarAlJuego('Auditoría silenciosa');
    });

    await page.locator('#workspaceSidebar .workspace-nav-item', { hasText: 'Operaciones' }).click();
    await waitPanel(page, 'type');
    await page.locator('[data-wizard-action="type"][data-value="free"]').click();
    await waitPanel(page, 'answer');
    await page.locator('[data-wizard-action="answer"][data-value="write"]').click();
    await waitPanel(page, 'operations');
    await page.locator(`[data-wizard-action="operation"][data-value="${operation.value}"]`).click();
    await advance(page, 'specific');
    if (operation.value === '+') {
      await page.locator('[data-wizard-action="cifras"][data-value="2"]').click();
      const carry = page.locator('[data-wizard-action="addsub"][data-value="carry"]');
      await carry.click();
    }
    await advance(page, 'advanced');
    await advance(page, 'quantities');
    if (operation.value === '×') await advance(page, 'multiplierRange');
    await advance(page, 'summary');

    const startButton = page.locator('#workspaceWizardHost [data-wizard-action="start"]');
    await startButton.click();
    await page.waitForFunction(() => document.getElementById('gameScreen')?.classList.contains('active'), null, { timeout: 12000 });
    await page.waitForFunction(() => document.getElementById('verticalInlineInput') || document.querySelector('#verticalNotebook input'), null, { timeout: 12000 });
    await page.waitForTimeout(350);

    const layout = await page.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
        return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), right: Math.round(right), bottom: Math.round(bottom) };
      };
      const card = document.querySelector('#questionCard');
      const notebook = document.querySelector('#verticalNotebook');
      const inlineInput = document.querySelector('#verticalInlineInput') || notebook?.querySelector('input');
      return {
        title: document.querySelector('#gameModeKicker')?.textContent,
        operationsLayout: document.querySelector('#gameWrap')?.classList.contains('operations-layout'),
        notebookVisible: !!notebook && getComputedStyle(notebook).display !== 'none',
        tableLabelHidden: getComputedStyle(document.querySelector('#tableInd')).display === 'none',
        inputVisible: !!inlineInput && inlineInput.getBoundingClientRect().width > 0,
        activeOperation: document.querySelector('#verticalNotebook .vertical-badge')?.textContent,
        panel: workspaceDynamicState?.panel,
        viewport: { width: innerWidth, height: innerHeight },
        pageVerticalOverflow: document.documentElement.scrollHeight > innerHeight + 1,
        gameWrap: rect('#gameWrap'),
        modeRail: rect('#gameModeRail'),
        modeLabel: rect('#modeRailLabel'),
        card: rect('#questionCard'),
        notebook: rect('#verticalNotebook'),
        board: rect('#verticalNotebook .vertical-board'),
        arithmeticLine: rect('#verticalNotebook .vertical-line-row'),
        multRows: [...document.querySelectorAll('#verticalNotebook .vertical-mult-row')].map(row => {
          const { x, y, width, height } = row.getBoundingClientRect();
          return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
        }),
        boardChildren: [...(document.querySelector('#verticalNotebook .vertical-board')?.children || [])].map(child => {
          const { y, height, width } = child.getBoundingClientRect();
          return { className: child.className, y: Math.round(y), height: Math.round(height), width: Math.round(width) };
        }),
        input: inlineInput ? rect('#verticalInlineInput') || rect('#verticalNotebook input') : null,
        soundsMuted: musicMuted === true && sfxMuted === true && workspaceMusicState?.userDisabled === true,
        errors: [],
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        cardInsideViewport: !!card && card.getBoundingClientRect().left >= -1 && card.getBoundingClientRect().right <= innerWidth + 1,
        railCardOverlap: !!card && card.getBoundingClientRect().top < document.querySelector('#modeRailLabel').getBoundingClientRect().bottom - 1,
        notebookFitsCard: !!card && !!notebook && notebook.getBoundingClientRect().top >= card.getBoundingClientRect().top - 1 && notebook.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom + 1,
      };
    });
    layout.errors = [...errors];

    const filename = `operaciones-${operation.name}-${timestamp}.png`;
    const screenshotPath = path.join(outputDir, filename);
    await page.screenshot({ path: screenshotPath, animations: 'disabled' });

    const problems = [];
    if (!layout.operationsLayout) problems.push('no se aplicó el tema de Operaciones');
    if (!layout.notebookVisible) problems.push('el cuaderno vertical no está visible');
    if (!layout.tableLabelHidden) problems.push('el rótulo anterior de pregunta sigue visible');
    if (!layout.inputVisible) problems.push('no aparece el control de respuesta por pasos');
    if (!layout.soundsMuted) problems.push('el estado silencioso no se conservó');
    if (layout.pageVerticalOverflow) problems.push('la página tiene desbordamiento vertical');
    if (layout.railCardOverlap) problems.push('el cuaderno invade la barra de modo');
    if (!layout.notebookFitsCard) problems.push('el cuaderno sobresale del marco de operación');
    if (layout.overflowX) problems.push('la página tiene desbordamiento horizontal');
    if (!layout.cardInsideViewport) problems.push('la tarjeta de operación se sale del viewport');
    if (errors.length) problems.push(`${errors.length} error(es) de consola/runtime`);

    return { operation: operation.name, screenshot: screenshotPath, layout, problems };
  } finally {
    await context.close();
  }
}

async function main() {
  const testServer = await startTestServer({ waitPath: '/math-attack.html' });
  const browser = await chromium.launch();
  const outputDir = path.join(__dirname, '..', 'output', 'operations-arena');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    const reports = [];
    for (const operation of OPERATIONS) {
      reports.push(await captureOperation(browser, testServer.baseUrl, operation, outputDir, timestamp));
    }
    for (const report of reports) {
      console.log(`${report.problems.length ? 'REVISAR' : 'OK'} ${report.operation}: ${JSON.stringify(report.layout)}`);
      console.log(`CAPTURA ${report.screenshot}`);
      if (report.problems.length) console.error(`PROBLEMAS ${report.operation}: ${report.problems.join('; ')}`);
    }
    if (reports.some(report => report.problems.length)) process.exitCode = 1;
  } finally {
    await browser.close();
    testServer.server.kill('SIGINT');
  }
}

main().catch(error => {
  console.error('ERROR:', error.stack || error.message || error);
  process.exit(1);
});
