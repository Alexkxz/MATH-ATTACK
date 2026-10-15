'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

async function main() {
  const output = path.resolve('output', 'duel-power-drawer', String(Date.now()));
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
        _entrarAlJuego('Jugador 1'); pName2 = 'Jugador 2';
        gameMode = 'duel'; gameType = 'free'; difficulty = 'free'; ansMode = 'options';
        selectedOps = ['×']; selectedTbls = [2, 3]; initGame(false); clearInterval(timerIv);
      });
      for (const count of [1, 3, 'all']) {
        await page.evaluate(count => {
          togglePowerDock(false);
          const powers = POWERS.filter(power => power.modes !== 'multi');
          sessionInventory = Object.fromEntries((count === 'all' ? powers : powers.slice(0, count)).map(power => [power.id, 2]));
          renderPowerPanel();
          document.getElementById('gameScreen').scrollTop = 0;
        }, count);
        const closed = await page.evaluate(() => {
          const dock = document.getElementById('powerDock'), tab = document.getElementById('powerDockToggle');
          const r = tab.getBoundingClientRect();
          return { left: dock.getBoundingClientRect().left, tabLeft: r.left, tabRight: r.right, tabWidth: r.width, bodyVisible: getComputedStyle(document.getElementById('powerPanel')).visibility, overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        assert(closed.left >= width - 1 && closed.tabLeft >= width - 31 && closed.tabRight <= width + 1, JSON.stringify(closed));
        assert.equal(closed.bodyVisible, 'hidden');
        assert(!closed.overflowX);
        await page.screenshot({ path: path.join(output, `${width}x${height}-${count}-closed.png`), animations: 'disabled' });
        await page.locator('#powerDockToggle').click();
        const open = await page.evaluate(() => {
          const dock = document.getElementById('powerDock'), panel = document.getElementById('powerPanel');
          const r = dock.getBoundingClientRect(), answers = document.getElementById('optionsGrid').getBoundingClientRect();
          const clearAnswers = [...document.querySelectorAll('.opt-btn')].every(button => {
            const box = button.getBoundingClientRect();
            if (box.top >= innerHeight || box.bottom <= 0) return true;
            const hit = document.elementFromPoint(box.left + box.width / 2, Math.min(innerHeight - 1, box.top + box.height / 2));
            return hit === button || button.contains(hit);
          });
          panel.scrollTop = panel.scrollHeight;
          const last = panel.lastElementChild.getBoundingClientRect();
          return { width: r.width, height: r.height, top: r.top, bottom: r.bottom, right: r.right, answersTop: answers.top, clearAnswers, lastAccessible: last.bottom <= r.bottom + 1, expanded: document.getElementById('powerDockToggle').getAttribute('aria-expanded') };
        });
        assert(open.width <= 220 && open.right <= width && open.top >= 0 && open.bottom <= height, JSON.stringify(open));
        assert(open.bottom <= open.answersTop - 5 && open.clearAnswers && open.lastAccessible, JSON.stringify(open));
        assert.equal(open.expanded, 'true');
        if (count === 1) assert(open.height <= 130, JSON.stringify(open));
        await page.screenshot({ path: path.join(output, `${width}x${height}-${count}-open.png`), animations: 'disabled' });
        await page.locator('#powerDockToggle').click();
        assert.equal(await page.locator('#powerDockToggle').getAttribute('aria-expanded'), 'false');
        reports.push({ width, height, count, closed, open });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
    console.log(`APROBADO: ${reports.length} escenarios de apertura y cierre. Evidencias: ${output}`);
  } finally {
    await browser.close(); server.server.kill('SIGINT');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
