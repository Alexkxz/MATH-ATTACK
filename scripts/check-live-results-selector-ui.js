'use strict';

const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<select id="prLiveTestSelect"></select><span id="prLiveResultsStatus"></span><div id="prLiveResultsCards"></div>');
    await page.evaluate(() => {
      Object.defineProperty(window, 'sessionStorage', { value: { getItem: () => '', setItem: () => {}, removeItem: () => {} } });
      window.adminUrl = value => value;
      window.__liveResultFetches = [];
      const tests = [
        { testId: 'test-previo', folio: '0006', title: 'Prueba previa', status: 'active' },
        { testId: 'test-ultima', folio: '0007', title: 'Prueba actual', status: 'active' }
      ];
      window.fetch = async url => {
        window.__liveResultFetches.push(String(url));
        if (String(url).startsWith('/api/exams?')) return new Response(JSON.stringify({ tests }), { status: 200 });
        if (String(url) === '/api/exam/status') return new Response(JSON.stringify({ examModes: tests }), { status: 200 });
        if (String(url).includes('/attempts')) return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
        const test = tests.find(item => String(url).endsWith(`/api/exams/${item.testId}`));
        return new Response(JSON.stringify(test ? { test } : {}), { status: test ? 200 : 404 });
      };
    });
    await page.evaluate(source => { (0, eval)(source); }, fs.readFileSync('src/client/maestro/liveTestResults.js', 'utf8'));
    assert.equal(await page.evaluate(() => typeof window.prLiveResultsRefresh), 'function', 'el script de resultados debe cargar');
    await page.evaluate(() => window.dispatchEvent(new Event('load')));
    await page.waitForTimeout(50);

    const options = await page.locator('#prLiveTestSelect option').allTextContents();
    assert.equal(options.length, 3, `debe mostrar ambas pruebas y la opción inicial (estado: ${await page.locator('#prLiveResultsStatus').textContent()}, fetches: ${JSON.stringify(await page.evaluate(() => window.__liveResultFetches))})`);
    assert.equal(await page.locator('#prLiveTestSelect option[value="test-previo"]').count(), 1);
    assert.equal(await page.locator('#prLiveTestSelect option[value="test-ultima"]').count(), 1);

    await page.selectOption('#prLiveTestSelect', 'test-previo');
    await page.waitForTimeout(20);
    assert.equal(await page.locator('#prLiveTestSelect').inputValue(), 'test-previo');
    const fetches = await page.evaluate(() => window.__liveResultFetches);
    assert(fetches.some(url => url.includes('/api/maestro/tests/test-previo/attempts')), 'debe cargar resultados de la prueba previa');

    await page.evaluate(() => {
      window.__pendingAttempts = [];
      window.fetch = url => new Promise(resolve => window.__pendingAttempts.push({ url: String(url), resolve }));
    });
    await page.selectOption('#prLiveTestSelect', 'test-previo');
    await page.selectOption('#prLiveTestSelect', 'test-ultima');
    await page.waitForFunction(() => window.__pendingAttempts.length === 2);
    await page.evaluate(() => {
      const latest = window.__pendingAttempts.find(item => item.url.includes('test-ultima'));
      latest.resolve(new Response(JSON.stringify({ attempts: [{ name: 'Alumno actual', grade: '5A', status: 'in_progress', index: 2, totalQuestions: 5, correct: 2, incorrect: 0, updatedAt: new Date().toISOString() }] }), { status: 200 }));
    });
    await page.waitForFunction(() => document.getElementById('prLiveResultsCards').textContent.includes('Alumno actual'));
    await page.evaluate(() => {
      const previous = window.__pendingAttempts.find(item => item.url.includes('test-previo'));
      previous.resolve(new Response(JSON.stringify({ attempts: [{ name: 'Alumno anterior', grade: '5A', status: 'in_progress', index: 4, totalQuestions: 5, correct: 4, incorrect: 0, updatedAt: new Date().toISOString() }] }), { status: 200 }));
    });
    await page.waitForTimeout(20);
    const cards = await page.locator('#prLiveResultsCards').textContent();
    assert(cards.includes('Alumno actual') && !cards.includes('Alumno anterior'), 'una respuesta tardía no debe reemplazar las tarjetas del folio seleccionado');
    await page.evaluate(() => window.prUpdateLiveSessions([{
      isExam: true, examTestId: 'test-ultima', examStartedAt: Date.now() - 65000,
      accountPlayerId: 'alumno-vivo', name: 'Alumno en vivo', grade: '6° Grado',
      correct: 3, wrong: 1, totalQ: 8, currentQuestion: '7 × 8', questionElapsedMs: 4200,
      timeLeft: 6, timeLimit: 10, paused: false
    }]));
    await page.waitForFunction(() => document.getElementById('prLiveResultsCards').textContent.includes('Alumno en vivo'));
    const liveCard = await page.locator('#prLiveResultsCards').textContent();
    assert(liveCard.includes('7 × 8') && liveCard.includes('ACIERTOS') && liveCard.includes('ERRORES') && liveCard.includes('Pregunta 0:04') && liveCard.includes('Sesión 1:05'), 'la tarjeta viva debe mostrar pregunta, aciertos, errores y tiempos');
    const css = fs.readFileSync('src/client/maestro/pruebas.css', 'utf8');
    assert(css.includes('.pr-live-result-foot{flex-direction:column}'), 'el pie de tarjeta debe apilarse en móvil');
    assert(css.includes('.pr-live-result-question'), 'la pregunta actual debe conservar estilo de tarjeta');
    console.log('OK resultados live: selector, tarjetas, estado de sesión y respuestas tardías aisladas por folio');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
