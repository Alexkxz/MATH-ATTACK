const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

async function main() {
  const testServer = await startTestServer();
  const { server, baseUrl } = testServer;

  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
      await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });

      const result = await page.evaluate(() => {
        document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
        document.getElementById('gameScreen').classList.add('active');
        document.body.classList.add('game-active');
        const wrap = document.getElementById('gameWrap');
        wrap.classList.add('wide', 'online-layout');

        eval(`
          gameMode = 'online';
          answered = false;
          ansMode = 'options';
          currentPlayer = { id: 'test', name: 'Test', inventory: {} };
          sessionInventory = {
            shield: 2,
            freeze: 1,
            steal: 1,
            doublepts: 1,
            blackout: 1,
            aura: 1
          };
          powerState = {
            shield: false,
            doublePts: false,
            streakSafe: false,
            mirrorActive: false,
            bounceActive: false,
            fiftyTablesLeft: 0,
            auraActive: false
          };
          activatePower = id => {
            window.__lastPowerActivated = id;
            const btn = document.getElementById('pbtn_' + id);
            if (btn) btn.classList.add('just-used');
          };
        `);
        Object.assign(window.sessionInventory || {}, {
          shield: 2,
          freeze: 1,
          steal: 1,
          doublepts: 1,
          blackout: 1,
          aura: 1,
        });

        window.renderPowerPanel();

        const rect = element => {
          const r = element.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        const dock = document.getElementById('powerDock');
        const panel = document.getElementById('powerPanel');
        const question = document.getElementById('questionCard');
        const options = document.getElementById('optionsGrid');
        const buttons = [...document.querySelectorAll('.power-btn')];
        const dockRect = rect(dock);
        const questionRect = rect(question);
        const optionsRect = rect(options);

        return {
          wrapClasses: wrap.className,
          dock: dockRect,
          panel: rect(panel),
          question: questionRect,
          options: optionsRect,
          buttonCount: buttons.length,
          firstButton: buttons[0]?.getAttribute('aria-label') || '',
          keyLabels: buttons.map(btn => btn.querySelector('.power-btn-key')?.textContent || ''),
          metaVisible: buttons.every(btn => getComputedStyle(btn.querySelector('.power-btn-meta')).display !== 'none'),
          noOverlap: questionRect.right < dockRect.left && optionsRect.right < dockRect.left,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      });

      const problems = [];
      if (!result.wrapClasses.includes('online-layout')) problems.push('no se activo online-layout');
      if (result.dock.width < 220) problems.push(`panel muy angosto: ${Math.round(result.dock.width)}px`);
      if (result.buttonCount < 6) problems.push(`faltan botones: ${result.buttonCount}`);
      if (!result.keyLabels.includes('1') || !result.keyLabels.includes('6')) problems.push('faltan etiquetas de atajo');
      if (!result.metaVisible) problems.push('metadatos de poderes ocultos en desktop');
      if (!result.noOverlap) problems.push('panel encimado con pregunta/opciones');
      if (result.horizontalOverflow) problems.push('overflow horizontal');

      await page.keyboard.press('1');
      const hotkey = await page.evaluate(() => window.__lastPowerActivated);
      if (hotkey !== 'shield') problems.push(`atajo 1 activo ${hotkey || 'nada'} en vez de shield`);

      if (problems.length) throw new Error(problems.join(', '));
      console.log(`OK: panel desktop multijugador ${Math.round(result.dock.width)}px, ${result.buttonCount} poderes, atajo 1=${hotkey}`);
      await page.close();
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (testServer.getOutput().trim()) console.error(testServer.getOutput().trim());
    throw err;
  } finally {
    server.kill('SIGINT');
  }
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
