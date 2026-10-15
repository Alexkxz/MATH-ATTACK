const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');
const findings = [];
function result(section, ok, detail) { findings.push({ section, ok, detail }); }

async function main() {
  const testServer = await startTestServer({ waitPath: '/api/ranking' });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const labels = ['Inicio', 'Individual', 'Duelo', 'Multijugador', 'Pruebas', 'Misiones', 'Ranking', 'Tienda'];
    const reports = [];
    for (let index = 0; index < labels.length; index += 1) {
      await page.goto(testServer.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => _entrarAlJuego('Auditoría de pestañas'));
      const item = page.locator('#workspaceSidebar .workspace-nav > .workspace-nav-item').nth(index);
      await item.evaluate(node => node.click());
      await page.waitForTimeout(180);
      if (index === 1 || index === 2) await page.waitForSelector('#workspaceWizardHost [data-wizard-action="type"]');
      if (index === 3) await page.waitForSelector('#lanConnect');
      if (index === 7) await page.evaluate(() => { shopSetView('store'); renderShop(); });
      reports.push(await page.evaluate(label => {
        const root = document.querySelector('#step1Screen');
        const main = document.querySelector('#studentWorkspace .workspace-main');
        const scrollables = [...main.querySelectorAll('*')].filter(node => {
          const style = getComputedStyle(node);
          return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
        }).map(node => ({ id: node.id, className: String(node.className).slice(0, 80), height: node.clientHeight, content: node.scrollHeight }));
        return {
          label,
          doc: document.documentElement.scrollHeight - innerHeight,
          root: root.scrollHeight - root.clientHeight,
          rootOverflowY: getComputedStyle(root).overflowY,
          main: { height: main.clientHeight, content: main.scrollHeight, overflowY: getComputedStyle(main).overflowY },
          scrollables: scrollables.slice(0, 8),
        };
      }, labels[index]));
      const report = reports.at(-1);
      const expectedMainOverflow = index === 7 ? 'auto' : 'hidden';
      result(`${labels[index]} · pantalla fija`, report.doc <= 1 && report.rootOverflowY === 'hidden' && report.main.overflowY === expectedMainOverflow, JSON.stringify(report));
    }
    await page.goto(testServer.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => _entrarAlJuego('Auditoría transición multijugador'));
    const multiplayer = page.locator('#workspaceSidebar .workspace-nav-item').nth(3);
    await multiplayer.evaluate(node => node.click());
    await page.waitForSelector('#lanConnect');
    for (const [label, selector] of [['Pruebas', '#workspaceSidebar .workspace-nav > .workspace-nav-item:nth-child(5)'], ['Inicio', '#workspaceSidebar .workspace-nav > .workspace-nav-item:nth-child(1)'], ['Duelo', '#workspaceSidebar .workspace-nav > .workspace-nav-item:nth-child(3)']]) {
      await page.locator(selector).evaluate(node => node.click());
      await page.waitForTimeout(120);
      const transition = await page.evaluate(label => {
        const shell = document.querySelector('#studentWorkspace');
        const main = shell.querySelector('.workspace-main');
        const visible = selector => { const node = shell.querySelector(selector); return !!node && getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0; };
        return { label, shellClasses: shell.className, onlineHost: !!shell.querySelector('.workspace-online-host #step2Screen, .workspace-online-host #step3Screen, .workspace-online-host #step3bScreen'), activity: visible('.workspace-activity-card'), hero: visible('.workspace-welcome-hero'), module: visible('.workspace-module-view'), wizard: visible('#workspaceWizardHost'), centerHeight: main.clientHeight, centerContent: main.scrollHeight };
      }, label);
      const hasContent = transition.activity || transition.hero || transition.module || transition.wizard;
      result(`Multijugador → ${label} · centro visible`, hasContent && !transition.onlineHost, JSON.stringify(transition));
    }
    const sampleRanking = [
      { id: 103, name: 'Auditoría transición multijugador', score: 86, correct: 8, wrong: 2, timeout: 0, total: 10, gameMode: 'solo', date: '28/09/2026', tblResults: { '+': { correct: 2, wrong: 0, total: 2 }, '−': { correct: 2, wrong: 0, total: 2 }, '×': { correct: 2, wrong: 1, total: 3 }, '÷': { correct: 2, wrong: 1, total: 3 } } },
      { id: 102, name: 'Auditoría transición multijugador', score: 74, correct: 7, wrong: 3, timeout: 0, total: 10, gameMode: 'duel', date: '27/09/2026', tblResults: { '+': { correct: 1, wrong: 1, total: 2 }, '−': { correct: 2, wrong: 0, total: 2 }, '×': { correct: 2, wrong: 1, total: 3 }, '÷': { correct: 2, wrong: 1, total: 3 } } },
      { id: 101, name: 'Auditoría transición multijugador', score: 92, correct: 9, wrong: 1, timeout: 0, total: 10, gameMode: 'online', date: '26/09/2026', tblResults: { '+': { correct: 2, wrong: 0, total: 2 }, '−': { correct: 2, wrong: 0, total: 2 }, '×': { correct: 3, wrong: 0, total: 3 }, '÷': { correct: 2, wrong: 1, total: 3 } } },
    ];
    await page.route('**/api/ranking', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleRanking) }));
    await page.locator('#workspaceSidebar .workspace-nav > .workspace-nav-item').nth(6).evaluate(node => node.click());
    await page.waitForSelector('#workspacePersonalRanking .workspace-ranking-stats');
    await page.waitForFunction(() => !document.querySelector('#workspacePersonalRanking .workspace-ranking-list')?.textContent.includes('Cargando'));
    const ranking = await page.evaluate(() => {
      const shell=document.querySelector('#studentWorkspace'),main=shell.querySelector('.workspace-main'),module=document.querySelector('#workspaceModuleView'),dashboard=document.querySelector('#workspacePersonalRanking'),rect=dashboard.getBoundingClientRect(),mainRect=main.getBoundingClientRect();
      return {visible:getComputedStyle(dashboard).display!=='none',cards:dashboard.querySelectorAll('.workspace-ranking-stat').length,operationLabels:[...dashboard.querySelectorAll('.workspace-ranking-stat small')].map(node=>node.textContent),operationValues:[...dashboard.querySelectorAll('.workspace-ranking-stat strong')].map(node=>node.textContent),hasHeading:dashboard.querySelector('.workspace-ranking-head h2')?.textContent==='Ranking personal',insidePanel:rect.top>=mainRect.top-1&&rect.bottom<=mainRect.bottom+1,mainOverflow:getComputedStyle(main).overflowY,contentHeight:main.scrollHeight,visibleHeight:main.clientHeight,hasResult:!!dashboard.querySelector('.workspace-ranking-row,.workspace-ranking-empty'),barChart:!!dashboard.querySelector('.workspace-score-chart .chart-bar'),barCount:dashboard.querySelectorAll('.workspace-score-chart .chart-bar').length,accuracyLabel:dashboard.querySelector('.workspace-accuracy-copy strong')?.textContent};
    });
    result('Ranking personal · operaciones y gráficas',ranking.visible&&ranking.cards===4&&ranking.operationLabels.join(',')==='Suma,Resta,Multiplicación,División'&&ranking.operationValues.join(',')==='83%,100%,78%,67%'&&ranking.hasHeading&&ranking.insidePanel&&ranking.mainOverflow==='hidden'&&ranking.contentHeight<=ranking.visibleHeight+1&&ranking.hasResult&&ranking.barChart&&ranking.barCount===3&&ranking.accuracyLabel==='80%',JSON.stringify(ranking));
    await page.locator('#workspacePersonalRanking .workspace-ranking-stat[data-op="×"]').click();
    const selectedOperationChart = await page.evaluate(() => ({
      selected:document.querySelector('#workspacePersonalRanking .workspace-ranking-stat[data-op="×"]')?.getAttribute('aria-pressed'),
      subtitle:document.querySelector('#workspacePersonalRanking .workspace-ranking-chart-subtitle')?.textContent,
      label:document.querySelector('#workspacePersonalRanking .workspace-score-chart')?.getAttribute('aria-label'),
      tones:[...document.querySelectorAll('#workspacePersonalRanking .workspace-score-chart .chart-bar')].map(bar=>bar.classList[1]),
      thresholds:[39,40,59,60,79,80,99,100].map(value=>workspaceRankingBarTone(value)),
    }));
    result('Ranking personal · gráfica, colores y operación elegida',selectedOperationChart.selected==='true'&&selectedOperationChart.subtitle.includes('Multiplicación')&&selectedOperationChart.label.includes('Multiplicación')&&selectedOperationChart.label.includes('100%, 67%, 67%')&&selectedOperationChart.tones.join(',')==='blue,yellow,yellow'&&selectedOperationChart.thresholds.join(',')==='red,orange,orange,yellow,yellow,green,green,blue',JSON.stringify(selectedOperationChart));
    await page.goto(testServer.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => _entrarAlJuego('Auditoría de pestañas'));
    const profile = page.locator('#workspaceSidebar .workspace-nav-footer .workspace-nav-item').first();
    await profile.evaluate(node => node.click());
    await page.waitForTimeout(150);
    reports.push(await page.evaluate(() => {
      const main = document.querySelector('#studentWorkspace .workspace-main');
      return { label: 'Perfil', main: { height: main.clientHeight, content: main.scrollHeight, overflowY: getComputedStyle(main).overflowY }, profile: { height: document.querySelector('#avatarOverlay').clientHeight, content: document.querySelector('#avatarOverlay').scrollHeight } };
    }));
    result('Perfil · superficie fija', reports.at(-1).main.overflowY === 'hidden' && reports.at(-1).profile.content <= reports.at(-1).profile.height + 1, JSON.stringify(reports.at(-1)));
    for (const tab of ['face', 'accessories', 'appearance']) {
      await page.locator(`#avatarOverlay .avatar-editor-tabs [onclick="setAvatarEditorTab('${tab}')"]`).click();
      const visible = await page.evaluate(() => {
        const main = document.querySelector('#studentWorkspace .workspace-main');
        const options = document.querySelector('#avatarOverlay .avatar-editor-options');
        const bounds = options.getBoundingClientRect();
        const area = main.getBoundingClientRect();
        return { overflow: getComputedStyle(main).overflowY, optionsHeight: options.scrollHeight, visibleHeight: options.clientHeight, insideMain: bounds.top >= area.top - 1 && bounds.bottom <= area.bottom + 1, optionSections: options.children.length };
      });
      result(`Perfil · ${tab}`, visible.overflow === 'hidden' && visible.optionsHeight <= visible.visibleHeight + 1 && visible.insideMain && visible.optionSections > 0, JSON.stringify(visible));
    }
    await page.locator('#workspaceSidebar .workspace-nav-footer .workspace-nav-item').nth(1).evaluate(node => node.click());
    const settings = await page.evaluate(() => {
      const root=document.querySelector('#step1Screen');
      const overlay=document.querySelector('#settingsOverlay');
      const card=overlay.querySelector('.settings-card');
      const rect=card.getBoundingClientRect();
      return {documentScroll:document.documentElement.scrollHeight>innerHeight+1,rootOverflow:getComputedStyle(root).overflowY,overlayActive:overlay.classList.contains('active'),insideViewport:rect.top>=0&&rect.bottom<=innerHeight,cardOverflow:card.scrollHeight-card.clientHeight};
    });
    result('Configuración · sin scroll', !settings.documentScroll&&settings.rootOverflow==='hidden'&&settings.overlayActive&&settings.insideViewport&&settings.cardOverflow<=1, JSON.stringify(settings));
    const failed = findings.filter(item => !item.ok);
    for (const item of findings) console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.section}: ${item.detail}`);
    console.log(`Resultado: ${failed.length ? 'FALLÓ' : 'APROBADO'} — ${findings.length - failed.length}/${findings.length} verificaciones.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
    testServer.server.kill('SIGINT');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
