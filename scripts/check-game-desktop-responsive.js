'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

async function main() {
  const output = path.resolve('output', 'game-responsive', String(Date.now()));
  fs.mkdirSync(output, { recursive: true });
  const data = path.join(output, 'isolated-data');
  fs.mkdirSync(data);
  process.env.MATH_ATTACK_DATA_PATH = data;
  process.env.MATH_ATTACK_TESTS_PATH = path.join(data, 'pruebas.json');
  process.env.MATH_ATTACK_GROUPS_PATH = path.join(data, 'groups.json');
  const server = await startTestServer();
  const browser = await chromium.launch();
  let failures = 0;
  const reports = [];
  const powersOnly = process.argv.includes('--powers');
  try {
    for (const [width, height] of [[1024, 768], [1366, 768], [1024, 640], [1366, 640], [375, 667]]) {
      for (const mode of powersOnly ? ['online'] : ['solo', 'duel', 'online']) {
        for (const scenario of powersOnly ? ['powers'] : ['free', 'free-write', 'timed', 'lives', 'countdown', 'survival', ...(mode === 'online' ? ['powers'] : [])]) {
          const type = scenario === 'powers' ? 'timed' : scenario.split('-')[0];
          const page = await browser.newPage({ viewport: { width, height } });
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.route('https://**/*', route => route.abort());
          await page.goto(server.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
          await page.evaluate(({ mode, type, scenario }) => {
            musicMuted = true; sfxMuted = true;
            _entrarAlJuego('Jugador de prueba');
            gameMode = mode; gameType = type; difficulty = 'easy'; ansMode = scenario === 'free-write' ? 'write' : 'options';
            pName2 = 'Segundo jugador'; selectedOps = ['×']; selectedTbls = [2, 3];
            if (mode === 'online') {
              mpPlayerCount = 4; mpMyIdx = 0; mpSeed = 123;
              mpPlayers = [0, 1, 2, 3].map(idx => ({ idx, name: `Jugador ${idx + 1}`, color: PLAYER_COLORS[idx].hex }));
              mpGameMode = type === 'lives' ? 'survival' : type === 'survival' ? 'bomb' : 'race';
            }
            initGame(mode === 'online');
            if (scenario === 'powers') {
              sessionInventory = { shield: 2, freeze: 2, doublepts: 2 };
              renderPowerPanel();
              togglePowerDock(true);
            }
            clearInterval(timerIv);
          }, { mode, type, scenario });
          await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
          await page.waitForTimeout(50);
          const report = await page.evaluate(() => {
            const box = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
            const wrap = document.getElementById('gameWrap');
            const controls = [...wrap.querySelectorAll('.game-header button, .opt-btn, #writeInput, #writeSubmit, .power-dock.open button')].filter(node => node.getBoundingClientRect().height > 0);
            const outside = controls.filter(node => { const r = box(node); return r.left < -1 || r.right > innerWidth + 1 || (innerWidth > 620 && (r.top < -1 || r.bottom > innerHeight + 1)); });
            const buttons = controls.map(box);
            const overlap = buttons.some((a, i) => buttons.some((b, j) => i < j && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
            return { wrap: box(wrap), question: box(document.getElementById('questionCard')), outside: outside.map(node => node.id || node.textContent.trim()), overlap, overflowX: document.documentElement.scrollWidth > innerWidth + 1, screenScroll: document.getElementById('gameScreen').scrollHeight - document.getElementById('gameScreen').clientHeight };
          });
          const ok = !errors.length && !report.outside.length && !report.overlap && !report.overflowX && (width <= 620 || (report.wrap.top >= -1 && report.wrap.bottom <= height + 1 && report.screenScroll <= 1));
          if (!ok) failures++;
          const finding = { width, height, mode, scenario, ok, ...report, errors };
          reports.push(finding);
          if (!ok) console.log(JSON.stringify(finding));
          await page.screenshot({ path: path.join(output, `${width}x${height}-${mode}-${scenario}.png`), animations: 'disabled' });
          await page.close();
        }
      }
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
    console.log(`Evidencias: ${output}; verificaciones: ${reports.length}; fallos: ${failures}`);
  } finally {
    await browser.close();
    server.server.kill('SIGINT');
  }
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
