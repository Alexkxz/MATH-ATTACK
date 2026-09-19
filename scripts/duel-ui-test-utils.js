'use strict';

const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const OP_SUM = '+';
const OP_MUL = '\u00d7';
const DIFFICULTY_TYPES = new Set(['timed', 'lives', 'countdown']);

async function createDuelPage(viewport={ width: 1280, height: 720 }) {
  const server = await startTestServer({ waitPath: '/api/ranking' });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  page.baseUrl = server.baseUrl;
  return { server, browser, page };
}

async function closeDuelPage(harness) {
  await harness.browser.close();
  harness.server.server.kill('SIGINT');
}

async function enterDuel(page) {
  await page.goto(page.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => _entrarAlJuego('Auditoria Duelo'));
  await page.waitForTimeout(300);
  await page.locator('#workspaceSidebar .workspace-nav-item:nth-child(3)').evaluate(node => node.click());
  await page.waitForSelector('#workspaceWizardHost [data-wizard-action="type"]');
}

async function chooseOperations(page, expected=[OP_SUM, OP_MUL]) {
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

async function setupDuelToAdvanced(page, { type='free', operations=[OP_SUM, OP_MUL], opponent='Rival de prueba' }={}) {
  await enterDuel(page);
  await page.locator(`#workspaceWizardHost [data-wizard-action="type"][data-value="${type}"]`).click();
  if (DIFFICULTY_TYPES.has(type)) await page.locator('#workspaceWizardHost [data-wizard-action="difficulty"]').first().click();
  await page.locator('#workspaceWizardHost [data-wizard-action="answer"]').first().click();
  const selected = await chooseOperations(page, operations);
  await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
  await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
  if (opponent !== null) await page.locator('#workspaceWizardHost #workspacePlayer2Name').fill(opponent);
  return selected;
}

async function advanceToSummary(page) {
  const visited=[];
  for (let guard=0; guard<10; guard+=1) {
    const panel=await page.evaluate(() => workspaceDynamicState?.panel || null);
    if (panel&&!visited.includes(panel)) visited.push(panel);
    if (panel==='summary') return visited;
    const next=page.locator('#workspaceWizardHost [data-wizard-action="next"]');
    if (await next.count()!==1||await next.isDisabled()) return visited;
    await next.click();
  }
  return visited;
}

module.exports={
  DIFFICULTY_TYPES,
  OP_SUM,
  OP_MUL,
  createDuelPage,
  closeDuelPage,
  enterDuel,
  chooseOperations,
  setupDuelToAdvanced,
  advanceToSummary,
};
