'use strict';

const { startTestServer } = require('./server-test-utils');

let BASE_URL;

async function expectStatus(label, pathname, expected, options = {}) {
  const res = await fetch(BASE_URL + pathname, options);
  if (res.status !== expected) throw new Error(`${label}: esperaba ${expected}, recibio ${res.status}`);
  console.log(`OK: ${label} -> ${expected}`);
  return res;
}

async function expectHtml(label, pathname, expectedText) {
  const res = await expectStatus(label, pathname, 200);
  const text = await res.text();
  if (!text.includes(expectedText)) throw new Error(`${label}: no contiene "${expectedText}"`);
}

async function main() {
  const testServer = await startTestServer({ waitPath: '/api/ranking' });
  const { server } = testServer;
  BASE_URL = testServer.baseUrl;

  try {
    await expectHtml('math-attack.html servido', '/math-attack.html', 'Math Attack');
    await expectHtml('maestro.html servido', '/maestro', 'Panel del Maestro');
    await expectHtml('ranking.html servido', '/ranking', 'Ranking');

    const ranking = await expectStatus('api ranking publica', '/api/ranking', 200);
    if (!Array.isArray(await ranking.json())) throw new Error('/api/ranking no devolvio un arreglo');

    const exam = await expectStatus('api estado examen publica', '/api/exam/status', 200);
    const examJson = await exam.json();
    if (!Object.prototype.hasOwnProperty.call(examJson, 'examMode')) {
      throw new Error('/api/exam/status no devolvio examMode');
    }

    await expectStatus('api logros publica', '/api/achievements', 200);
    await expectStatus('registro alumno con parametros faltantes', '/api/players/register', 400, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    await expectStatus('json invalido no cierra servidor', '/api/players/login', 400, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad-json',
    });
    await expectStatus('servidor sigue vivo tras json invalido', '/api/ranking', 200);
    await expectStatus('ruta desconocida responde estado ok legacy', '/api/no-existe', 200);
  } catch (err) {
    if (testServer.getOutput().trim()) console.error(testServer.getOutput().trim());
    throw err;
  } finally {
    server.kill('SIGINT');
  }
}

main().catch(error => {
  console.error('ERROR:', error.message || error);
  process.exit(1);
});
