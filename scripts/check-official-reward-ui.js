'use strict';

const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('src/client/maestro/attemptActions.js', 'utf8');
const attemptBase = { attemptId: 'a', testId: 't', accountPlayerId: 'p', name: 'Ana', status: 'finished', revision: 1, hasValidResult: true };
const official = { officialAttemptId: 'official-1' };
const publication = { rankingPublicationId: 'publication-1' };

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<input id="prAttemptTestId"><div id="prAttemptsList"></div><span id="prAttemptsStatus"></span>');
    await page.addScriptTag({ content: `const _adminPass='admin-secret'; function adminUrl(url){return url;} ${source}` });
    const labels = attempt => page.evaluate(value => { prRenderAttemptActions([value]); return { text: document.body.textContent, buttons: [...document.querySelectorAll('.pr-attempt-btn')].map(button => button.textContent.trim()) }; }, attempt);

    assert(!(await labels({ ...attemptBase, officialAttempt: official })).buttons.some(text => /recompensas/i.test(text)), 'no debe liquidar sin publicación');
    assert(!(await labels({ ...attemptBase, status: 'incomplete', officialAttempt: official, rankingPublication: publication })).buttons.some(text => /recompensas/i.test(text)), 'no debe liquidar incomplete');
    assert(!(await labels({ ...attemptBase, status: 'deleted', officialAttempt: official, rankingPublication: publication })).buttons.some(text => /recompensas/i.test(text)), 'no debe liquidar deleted');
    assert(!(await labels({ ...attemptBase, hasValidResult: false, officialAttempt: official, rankingPublication: publication })).buttons.some(text => /recompensas/i.test(text)), 'no debe liquidar resultado invalido');
    assert((await labels({ ...attemptBase, officialAttempt: official, rankingPublication: publication })).buttons.includes('Liquidar recompensas'));
    assert((await labels({ ...attemptBase, officialAttempt: official, rankingPublication: publication, rewardSettlement: { status: 'pending' } })).buttons.includes('Recuperar recompensas'));
    const completed = await labels({ ...attemptBase, officialAttempt: official, rankingPublication: publication, rewardSettlement: { status: 'completed', rewardSettlementId: 'settlement-1', applied: { aureos: true, experience: true, streak: true, 'achievement:perfect': true } } });
    assert(completed.text.includes('Recompensas aplicadas') && completed.text.includes('settlement-1') && completed.text.includes('Áureos') && completed.text.includes('Logro perfect'));
    assert(!completed.buttons.some(text => /recompensas/i.test(text)), 'no debe ofrecer repetir una liquidacion completada');

    await page.evaluate(() => { document.getElementById('prAttemptTestId').value = 'test-1'; });
    await page.evaluate(() => { window.fetch = async url => { const text = String(url); if (text.includes('/official-attempts')) return { ok: true, status: 200, json: async () => ({ officialAttempts: [{ attemptId: 'a', officialAttemptId: 'official-1' }] }) }; if (text.includes('/ranking-publication')) return { ok: true, status: 200, json: async () => ({ publication: { rankingPublicationId: 'publication-1' } }) }; if (/\/attempts(?:\?pwd=admin)?$/.test(text)) return { ok: true, status: 200, json: async () => ({ attempts: [{ attemptId: 'a', testId: 't', accountPlayerId: 'p', name: 'Ana', status: 'finished', revision: 1, hasValidResult: true }] }) }; return { ok: false, status: 404, json: async () => ({}) }; }; });
    await page.evaluate(() => prLoadAttempts());
    await page.waitForFunction(() => document.querySelector('.pr-attempt-reward'));
    assert((await page.locator('.pr-attempt-reward').textContent()).includes('Liquidar'));

    let resolvePost;
    await page.evaluate(() => { window.confirm = () => true; window.prompt = () => 'Liquidación manual'; });
    await page.evaluate(() => { window.__rewardPostCount = 0; window.fetch = (url, options) => { if (options?.method === 'POST') window.__rewardPostCount += 1; window.__rewardRequest = { url, options }; if (options?.method === 'POST') return new Promise(resolve => { window.__resolveReward = resolve; }); return Promise.resolve({ ok: false, status: 404, json: async () => ({}) }); }; });
    const button = page.locator('.pr-attempt-reward');
    await button.click();
    assert.equal(await button.isDisabled(), true, 'el botón debe bloquearse mientras la solicitud está pendiente');
    await page.evaluate(() => document.querySelector('.pr-attempt-reward').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    assert.equal(await page.evaluate(() => window.__rewardPostCount), 1, 'el doble clic no debe crear otra solicitud POST');
    await page.waitForFunction(() => window.__rewardRequest);
    const request = await page.evaluate(() => ({ url: window.__rewardRequest.url, headers: window.__rewardRequest.options.headers, body: JSON.parse(window.__rewardRequest.options.body) }));
    assert(request.url.endsWith('/api/maestro/tests/test-1/attempts/a/rewards'));
    assert.equal(request.headers['X-Admin-Password'], 'admin-secret');
    assert.equal(Object.keys(request.body).sort().join(','), 'eventId,reason');
    assert.equal(typeof request.body.eventId, 'string');
    assert(request.body.eventId.trim().length > 0);
    assert.match(request.body.eventId, /^[0-9a-f]+(?:-[0-9a-f]+)+$/i);
    assert.notEqual(request.body.eventId, 'null');
    assert.notEqual(request.body.eventId, 'undefined');
    assert.equal(request.body.reason, 'Liquidación manual');
    assert(!JSON.stringify(request.body).match(/password|pwd|token|aureos|experience|streak|achievement/i));
    await page.evaluate(() => window.__resolveReward({ ok: true, status: 201, json: async () => ({ ok: true, duplicate: false, settlement: { status: 'completed', rewardSettlementId: 'settlement-2', applied: { aureos: true, experience: true, streak: true, 'achievement:perfect': true } } }) }));
    await page.waitForFunction(() => document.body.textContent.includes('Recompensas aplicadas'));
    assert.equal(await page.locator('.pr-attempt-reward').count(), 0);
    console.log('OK: UI de recompensas renderiza elegibilidad, estados, confirmacion, doble clic, IDs y cuerpo seguro.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
