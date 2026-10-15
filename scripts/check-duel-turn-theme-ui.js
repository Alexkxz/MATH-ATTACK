'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

async function main() {
  const output = path.resolve('output', 'duel-turn-theme', String(Date.now()));
  const data = path.join(output, 'isolated-data');
  fs.mkdirSync(data, { recursive: true });
  process.env.MATH_ATTACK_DATA_PATH = data;
  process.env.MATH_ATTACK_TESTS_PATH = path.join(data, 'pruebas.json');
  process.env.MATH_ATTACK_GROUPS_PATH = path.join(data, 'groups.json');
  const server = await startTestServer();
  const browser = await chromium.launch();
  const reports = [];
  try {
    for (const [width, height] of [[1024, 768], [1366, 768], [1024, 640], [375, 667]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**/*', route => route.abort());
      await page.goto(server.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
      await page.evaluate(() => {
        musicMuted = true; sfxMuted = true;
        _entrarAlJuego('Primer jugador');
        pName2 = 'Segundo jugador'; gameMode = 'duel'; gameType = 'timed'; difficulty = 'easy';
        ansMode = 'options'; selectedOps = ['×']; selectedTbls = [2, 3];
        pColor = '#f87171'; p2Color = '#60a5fa';
        initGame(false); clearInterval(timerIv);
      });
      await page.locator('#opt0').click();
      assert.equal(await page.evaluate(() => duelTurn), 1, 'Responder cambia al segundo jugador');
      for (const style of ['arcade', 'arena', 'command', 'classroom']) {
        for (const [first, second] of [['#f87171', '#60a5fa'], ['#1e1e2e', '#f1f5f9'], ['#fbbf24', '#34d399']]) {
          const turns = [];
          for (const turn of [0, 1]) {
            await page.evaluate(({ style, first, second, turn }) => {
              pColor = first; p2Color = second; duelTurn = turn;
              applyPlayerColors(); updateDuelUI(true); setGamePresentationStyle(style);
              clearInterval(timerIv);
            }, { style, first, second, turn });
            const report = await page.evaluate(() => {
              const wrap = document.getElementById('gameWrap');
              const label = document.getElementById('turnLbl');
              const question = document.getElementById('questionCard');
              const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
              const labelBox = rect(label), questionBox = rect(question), wrapBox = rect(wrap);
              const headerBox = rect(wrap.querySelector('.game-header'));
              const railBox = rect(document.getElementById('gameModeRail'));
              return {
                turn: duelTurn, name: label.textContent, font: parseFloat(getComputedStyle(label).fontSize),
                color: getComputedStyle(label).color, rawColor: document.documentElement.style.getPropertyValue('--theme-player-color'),
                background: getComputedStyle(wrap).backgroundImage, questionBackground: getComputedStyle(question).backgroundImage,
                labelFits: labelBox.left >= wrapBox.left && labelBox.right <= wrapBox.right && labelBox.bottom <= questionBox.top && labelBox.top >= headerBox.bottom && railBox.bottom <= questionBox.top,
                fitsViewport: wrapBox.top >= 0 && wrapBox.bottom <= innerHeight + 1,
                overflowX: document.documentElement.scrollWidth > innerWidth + 1,
              };
            });
            assert.equal(report.rawColor, turn === 0 ? first : second);
            assert.match(report.name, turn === 0 ? /Primer jugador/ : /Segundo jugador/);
            assert(report.font >= 18 && report.labelFits && !report.overflowX);
            if (width > 620) assert(report.fitsViewport, JSON.stringify(report));
            turns.push(report);
            if (style === 'arcade' && first === '#f87171') await page.screenshot({ path: path.join(output, `${width}x${height}-jugador-${turn + 1}.png`), animations: 'disabled' });
          }
          assert.notEqual(turns[0].background, turns[1].background, 'El escenario cambia de color');
          assert.notEqual(turns[0].questionBackground, turns[1].questionBackground, 'La pregunta cambia de color');
          reports.push({ width, height, style, first, second, turns });
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
    console.log(`APROBADO: ${reports.length} combinaciones, ambos turnos. Evidencias: ${output}`);
  } finally {
    await browser.close();
    server.server.kill('SIGINT');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
