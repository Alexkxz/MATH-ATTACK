'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:8080';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(BASE_URL + '/api/ranking');
      if (res.ok) return;
    } catch (e) {}
    await wait(250);
  }
  throw new Error('No se pudo iniciar el servidor local');
}

function getAdminCredentials() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
    return {
      username: config.adminUsername || 'admin',
      password: config.adminPassword || 'admin',
    };
  } catch (e) {
    return { username: 'admin', password: 'admin' };
  }
}

async function openCheckedPage(browser, pathname) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(BASE_URL + pathname, { waitUntil: 'domcontentloaded' });
  return { page, pageErrors, consoleErrors };
}

function assertNoCriticalErrors(label, pageErrors, consoleErrors) {
  const criticalConsole = consoleErrors.filter(text => !/favicon|Failed to load resource/i.test(text));
  if (pageErrors.length || criticalConsole.length) {
    throw new Error(`${label}: errores JS\n${pageErrors.concat(criticalConsole).join('\n')}`);
  }
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let serverOutput = '';
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

  try {
    await waitForServer();
    const browser = await chromium.launch();
    try {
      {
        const { page, pageErrors, consoleErrors } = await openCheckedPage(browser, '/math-attack.html');
        await page.waitForSelector('#loginScreen.active, #step1Screen.active', { timeout: 5000 });
        const ok = await page.evaluate(() => !!(
          document.getElementById('loginNameInput') &&
          document.querySelector('.login-btn-main') &&
          document.getElementById('openRegBtn')
        ));
        if (!ok) throw new Error('Alumno: faltan controles principales de inicio');
        assertNoCriticalErrors('Alumno', pageErrors, consoleErrors);
        await page.close();
        console.log('OK: alumno carga pantalla inicial sin errores criticos.');
      }

      {
        const creds = getAdminCredentials();
        const { page, pageErrors, consoleErrors } = await openCheckedPage(browser, '/maestro');
        await page.fill('#loginUser', creds.username);
        await page.fill('#loginPass', creds.password);
        await page.click('.login-btn');
        await page.waitForFunction(() => document.getElementById('loginOverlay')?.classList.contains('hidden'), null, { timeout: 5000 });
        const ok = await page.evaluate(() => !!(
          document.querySelector('.tab-panel') &&
          document.querySelector('.students-header') &&
          document.getElementById('panel-transacciones')
        ));
        if (!ok) throw new Error('Maestro: no aparecieron controles principales tras autenticar');
        assertNoCriticalErrors('Maestro', pageErrors, consoleErrors);
        await page.close();
        console.log('OK: maestro autentica y muestra controles principales sin errores criticos.');
      }

      {
        const { page, pageErrors, consoleErrors } = await openCheckedPage(browser, '/ranking');
        await page.waitForSelector('#mainContent, #topCards, .tabs', { timeout: 5000 });
        const rankingStatus = await page.evaluate(async () => {
          const res = await fetch('/api/ranking');
          const data = await res.json();
          return { ok: res.ok, isArray: Array.isArray(data) };
        });
        if (!rankingStatus.ok || !rankingStatus.isArray) throw new Error('Ranking: no pudo consultar /api/ranking');
        assertNoCriticalErrors('Ranking', pageErrors, consoleErrors);
        await page.close();
        console.log('OK: ranking carga, consulta API publica y renderiza elementos principales.');
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (serverOutput.trim()) console.error(serverOutput.trim());
    throw err;
  } finally {
    server.kill('SIGINT');
  }
}

main().catch(error => {
  console.error('ERROR:', error.message || error);
  process.exit(1);
});
