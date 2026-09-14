'use strict';

const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    await page.setContent('<main><input id="prAttemptTestId"><div id="prAttemptsList"></div><span id="prAttemptsStatus"></span></main>');
    await page.addScriptTag({ content: `function adminUrl(value){return value;} const _adminPass='test'; ${fs.readFileSync('src/client/maestro/attemptActions.js', 'utf8')}` });
    await page.evaluate(() => prRenderAttemptActions([{ testId: '11111111-1111-4111-8111-111111111111', attemptId: '22222222-2222-4222-8222-222222222222', accountPlayerId: '33333333-3333-4333-8333-333333333333', status: 'in_progress', revision: 2, totalQuestions: 10, index: 4, correct: 3, incorrect: 1, checkpointRestored: true, checkpointRevision: 2, connectionState: 'disconnected', startedAt: '2026-09-14T10:00:00.000Z', updatedAt: '2026-09-14T10:01:00.000Z' }]));
    const text = await page.locator('.pr-attempt-card').textContent();
    assert(text.includes('accountPlayerId')); assert(text.includes('testId')); assert(text.includes('attemptId')); assert(text.includes('Checkpoint')); assert(text.includes('Desconectado')); assert(text.includes('4 / 10'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 800 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    console.log('OK UI responsive de supervisión: IDs, progreso, checkpoint, conexión y sin desbordamiento');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
