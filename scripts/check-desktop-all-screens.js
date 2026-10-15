'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const viewports = process.argv.includes('--mobile-only') ? [[375,667]] : process.argv.includes('--browser-bars') ? [[1920, 952], [1024, 640], [1366, 640]] : [[1920, 1080], [1024, 768], [1366, 768]];
const reports = [];
const sectionFilter = process.argv.find(arg => arg.startsWith('--section='))?.split('=')[1];
let output;

async function inspect(page, label, scope = '.screen.active', capture = false) {
  await page.waitForTimeout(25);
  const report = await page.evaluate(scope => {
    const roots = [...document.querySelectorAll(scope)];
    const visible = node => { const r = node.getBoundingClientRect(), s = getComputedStyle(node); return r.width > 0 && r.height > 0 && s.visibility === 'visible' && s.display !== 'none'; };
    const describe = node => node.id || `${node.tagName.toLowerCase()}.${String(node.className).split(' ').join('.')} ${node.textContent.trim().slice(0, 55)}`;
    const candidates = [...new Set(roots.flatMap(root => [...root.querySelectorAll('button,input,select,h1,h2,h3,p,label,strong,small,.section-label,.workspace-dynamic-group-label,.turn-lbl')]))].filter(visible);
    const clipped = [];
    for (const node of candidates) {
      if (node.closest('.game-profile-copy,.workspace-player-copy,.dp-name,.workspace-ranking-row-name')) continue;
      let r = node.getBoundingClientRect();
      let bounds = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const s = getComputedStyle(ancestor), box = ancestor.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const xHidden = /hidden|clip/.test(s.overflowX), yHidden = /hidden|clip/.test(s.overflowY);
        const ellipsis = s.textOverflow === 'ellipsis';
        if (xHidden && !ellipsis && (bounds.left < box.left - 2 || bounds.right > box.right + 2)) {
          clipped.push({ element: describe(node), axis: 'x', container: describe(ancestor), delta: Math.round(Math.max(box.left - bounds.left, bounds.right - box.right)) }); break;
        }
        if (yHidden && (bounds.top < box.top - 2 || bounds.bottom > box.bottom + 2)) {
          clipped.push({ element: describe(node), axis: 'y', container: describe(ancestor), delta: Math.round(Math.max(box.top - bounds.top, bounds.bottom - box.bottom)) }); break;
        }
        if (/auto|scroll/.test(s.overflowY)) {
          const span = Math.min(bounds.bottom - bounds.top, box.height);
          bounds.top = Math.max(box.top, Math.min(bounds.top, box.bottom - span));
          bounds.bottom = bounds.top + span;
        }
        if (/auto|scroll/.test(s.overflowX)) {
          bounds.left = Math.max(box.left, bounds.left); bounds.right = Math.min(box.right, bounds.right);
        }
      }
    }
    const controls = candidates.filter(node => node.matches('button,input,select') && !node.closest('.power-dock:not(.open)'));
    const visibleBox = node => {
      const r=node.getBoundingClientRect();
      const box={left:r.left,right:r.right,top:r.top,bottom:r.bottom};
      for(let ancestor=node.parentElement;ancestor;ancestor=ancestor.parentElement){
        const s=getComputedStyle(ancestor),ar=ancestor.getBoundingClientRect();
        if(/hidden|clip|auto|scroll/.test(s.overflowX)){box.left=Math.max(box.left,ar.left);box.right=Math.min(box.right,ar.right);}
        if(/hidden|clip|auto|scroll/.test(s.overflowY)){box.top=Math.max(box.top,ar.top);box.bottom=Math.min(box.bottom,ar.bottom);}
      }
      return box.right>box.left&&box.bottom>box.top?box:null;
    };
    const overlaps = [];
    for (let i = 0; i < controls.length; i++) {
      const a = controls[i], ar = visibleBox(a);
      if(!ar)continue;
      for (let j = i + 1; j < controls.length; j++) {
        const b = controls[j];
        if (a.contains(b) || b.contains(a) || (a.id.startsWith('workspaceMult') && b.id.startsWith('workspaceMult')) || (a.matches('input[type="range"]') && b.matches('input[type="range"]') && a.parentElement === b.parentElement)) continue;
        const br = visibleBox(b);
        if(!br)continue;
        if (ar.left < br.right - 2 && ar.right > br.left + 2 && ar.top < br.bottom - 2 && ar.bottom > br.top + 2) overlaps.push([describe(a), describe(b)]);
      }
    }
    const scrollables = roots.flatMap(root => [root, ...root.querySelectorAll('*')]).filter(node => visible(node) && /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 2).map(node => ({ element: describe(node), height: node.clientHeight, content: node.scrollHeight }));
    return { viewport: [innerWidth, innerHeight], count: candidates.length, clipped, overlaps, scrollables, invalidText: roots.some(root=>root.innerText.includes('[object Object]')), overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
  }, scope);
  const result = { label, ...report, ok: !report.clipped.length && !report.overlaps.length && !report.overflowX && !report.invalidText };
  reports.push(result);
  if (capture || !result.ok) {
    const file = `${report.viewport.join('x')}-${String(reports.length).padStart(3, '0')}-${label.replace(/[^a-z0-9-]/gi, '_')}.png`;
    await page.screenshot({ path: path.join(output, file), animations: 'disabled' });
    result.screenshot = file;
  }
  return result;
}

async function newPage(browser, baseUrl, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.auditErrors = [];
  page.on('pageerror', error => page.auditErrors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.goto(baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.evaluate(() => { musicMuted = true; sfxMuted = true; workspaceMusicState.userDisabled = true; workspaceMusicStop(); });
  return page;
}

async function finishPage(page) {
  if (page.auditErrors.length) reports.push({ label: 'JavaScript', ok: false, errors: page.auditErrors });
  await page.close();
}

async function enter(page) {
  await page.evaluate(() => _entrarAlJuego('Alumno de revisión'));
}

async function auditMenus(page) {
  await inspect(page, 'login', '#loginScreen', true);
  await page.evaluate(() => { $('loginPinWrap').style.display=''; $('loginErr').textContent='Revisa tu nombre de usuario y el PIN de cuatro dígitos.'; });
  await inspect(page, 'login-pin-error', '#loginScreen', true);
  await page.evaluate(() => { $('loginErr').textContent=''; });
  await page.locator('#openRegBtn').click();
  await inspect(page, 'registro', '#regPanel', true);
  await page.evaluate(() => closeRegPanel());
  await enter(page);
  await inspect(page, 'inicio', '#studentWorkspace', true);
  for (const target of ['tests', 'missions']) {
    await page.locator(`#workspaceSidebar [onclick*="'${target}'"]`).click();
    await inspect(page, target, '#studentWorkspace', true);
  }
  await page.route('**/api/ranking', route => route.fulfill({ json: [86,74,92,63,99,54].map((score, i) => ({ id: i, name: 'Alumno de revisión', score, correct: 8, wrong: 2, total: 10, gameMode: 'solo', date: '05/10/2026', tblResults: { '+': {correct:2,wrong:1,total:3}, '×': {correct:6,wrong:1,total:7} } })) }));
  await page.locator('#workspaceSidebar [onclick*="openWorkspaceRegistry"]').click();
  await page.waitForFunction(() => !!document.querySelector('#workspacePersonalRanking .workspace-ranking-stat'));
  await inspect(page, 'ranking', '#studentWorkspace', true);
  await page.locator('#workspaceSidebar [onclick*="openWorkspaceShop"]').click();
  await inspect(page, 'tienda-login', '#studentWorkspace', true);
  await page.evaluate(() => { shopSetView('store'); renderShop(); });
  await inspect(page, 'tienda', '#studentWorkspace', true);
  const categories=await page.evaluate(()=>Object.keys(POWER_CATEGORIES));
  for(const category of categories){
    await page.evaluate(category=>setShopCategory(category),category);
    await inspect(page,`tienda-${category}`,'#studentWorkspace');
  }
  const profileButton=page.locator('#workspaceSidebar [onclick*="openWorkspaceProfile"]');
  if(await profileButton.isVisible()) await profileButton.click();
  else await page.evaluate(()=>openWorkspaceProfile());
  for (const tab of ['face', 'accessories', 'appearance']) {
    await page.evaluate(tab => setAvatarEditorTab(tab), tab);
    await inspect(page, `perfil-${tab}`, '#studentWorkspace', true);
  }
  await page.evaluate(() => openSettings());
  await inspect(page, 'configuracion', '#settingsOverlay', true);
  await page.evaluate(() => closeSettings());
  const logoutButton=page.locator('#workspaceSidebar .workspace-logout-item');
  if(await logoutButton.isVisible()) await logoutButton.click();
  else await page.evaluate(()=>confirmarCerrarSesion());
  await inspect(page,'cerrar-sesion','#logoutConfirmOverlay',true);
  await page.evaluate(()=>closeLogoutConfirm());
}

async function auditWizards(page) {
  await enter(page);
  for (const mode of ['solo', 'duel', 'operations']) {
    const selector = mode === 'operations' ? '#workspaceSidebar [onclick*="selectWorkspaceOperations"]' : `#workspaceSidebar [onclick*="selectWorkspaceMode"][onclick*="'${mode}'"]`;
    await page.locator(selector).click();
    await inspect(page, `${mode}-tipos`, '#studentWorkspace', true);
    const types = await page.locator('#workspaceWizardHost [data-wizard-action="type"]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
    for (const type of types) {
      await page.locator(selector).click();
      await page.locator(`#workspaceWizardHost [data-wizard-action="type"][data-value="${type}"]`).click();
      for (let step = 0; step < 12; step++) {
        const panel = await page.evaluate(() => workspaceDynamicState.panel);
        if (panel === 'specific') {
          const custom = page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="custom"]');
          if (await custom.count()) await custom.click();
          const digits = page.locator('#workspaceWizardHost [data-wizard-action="cifras"][data-value="6"]');
          if (await digits.count()) await digits.click();
        }
        if (panel === 'quantities' && mode === 'solo' && (await page.locator('#workspaceWizardHost [data-wizard-action="table"], #workspaceWizardHost [data-wizard-action="tblmode"]').count())) {
          if (!(await page.locator('#workspaceQptTableSlider').count())) throw new Error(`Falta cantidad por tabla en modo individual (${type})`);
        }
        if (panel === 'advanced' && mode === 'duel') await page.locator('#workspacePlayer2Name').fill('Segundo alumno con nombre largo');
        await inspect(page, `${mode}-${type}-${panel}`, '#studentWorkspace', type === 'free');
        if (panel === 'summary') break;
        if (panel === 'difficulty') await page.locator('#workspaceWizardHost [data-wizard-action="difficulty"]').first().click();
        else if (panel === 'answer') await page.locator(`#workspaceWizardHost [data-wizard-action="answer"][data-value="${mode === 'operations' ? 'write' : 'options'}"]`).click();
        else {
          if (panel === 'operations' && mode !== 'operations') await page.evaluate(() => { selectedOps = ['+', '−', '×', '÷']; renderCurrentPanel(); });
          await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
        }
      }
    }
    if (mode === 'operations') {
      for (const op of ['+', '−', '×', '÷']) {
        await page.locator(selector).click();
        await page.evaluate(op => { workspaceSyncType('free'); workspaceDynamicState.type='free'; selectedOps=[op]; tblSelMode='custom'; selectedTbls=[2,3,4,5,6,7,8,9]; selectedCifras=6; workspaceSetPanel('specific'); }, op);
        await inspect(page, `operations-${op}-specific`, '#studentWorkspace', true);
      }
    }
  }
}

async function auditMultiplayer(browser, baseUrl, width, height) {
  const host = await newPage(browser, baseUrl, width, height);
  const guest = await newPage(browser, baseUrl, width, height);
  for (const [page, name] of [[host, 'Anfitrión'], [guest, 'Invitado']]) {
    await page.evaluate(name => _entrarAlJuego(name), name);
    await page.locator('#workspaceSidebar [onclick*="selectWorkspaceMode"][onclick*="\'online\'"]').click();
    await page.waitForFunction(() => document.querySelector('#lanLobby')?.classList.contains('visible'));
  }
  await inspect(host, 'multijugador-salas', '#studentWorkspace', true);
  await host.evaluate(() => lanCreateRoom());
  await host.waitForFunction(() => !!lanRoomId);
  await inspect(host, 'multijugador-crear-sala', '#studentWorkspace', true);
  await guest.evaluate(room => lanJoinRoom(room), await host.evaluate(() => lanRoomId));
  await guest.waitForFunction(() => !!lanRoomId);
  await inspect(guest, 'multijugador-invitado-color', '#studentWorkspace', true);
  await host.waitForFunction(() => mpPlayers.length === 2);
  await host.evaluate(() => lanStartRoom());
  await host.waitForFunction(() => document.querySelector('#mpModeSelect')?.classList.contains('visible'));
  for (const mode of ['race','rounds','steal','apuestas','bomb','survival']) {
    await host.locator(`.mp-mode-btn[data-mpmode="${mode}"]`).click();
    await inspect(host, `multijugador-${mode}-descripcion`, '#studentWorkspace', true);
  }
  await host.locator('.mp-mode-btn[data-mpmode="apuestas"]').click();
  await host.locator('#mpStartModeBtn').click();
  await host.waitForFunction(() => document.querySelector('#step3Screen')?.classList.contains('active'));
  if (!(await host.locator('#s3DiffGrid [data-diff="free"]').count())) throw new Error('Falta la opción Sin tiempo en la configuración multijugador');
  await host.locator('#s3DiffGrid [data-diff="free"]').click();
  await guest.waitForFunction(() => gameType === 'free' && timeLimit === 0);
  await inspect(host, 'multijugador-configuracion-sin-tiempo', '#studentWorkspace', true);
  await host.locator('#s3DiffGrid [data-diff="easy"]').click();
  await guest.waitForFunction(() => gameType === 'timed' && timeLimit > 0);
  await host.evaluate(() => { selectedOps=['+','−','×','÷']; updateS3Sections(); });
  await inspect(host, 'multijugador-configuracion', '#studentWorkspace', true);
  await inspect(guest, 'multijugador-configuracion-invitado', '#studentWorkspace', true);
  await host.evaluate(() => goS3aToS3bMP());
  await host.evaluate(() => { tblSelMode='custom'; selectedTbls=[2,3,4,5,6,7,8,9]; selectedCifras=6; updateS3Sections(); });
  await inspect(host, 'multijugador-tablas-cifras', '#studentWorkspace', true);
  await inspect(guest, 'multijugador-tablas-cifras-invitado', '#studentWorkspace', true);
  await finishPage(guest); await finishPage(host);
}

async function auditGames(browser, baseUrl, width, height) {
  const cases = [
    ...['free','timed','lives','countdown','streak','survival','bot'].map(type => ({ mode:'solo',type })),
    ...['free','timed','lives','countdown','streak','survival'].map(type => ({ mode:'duel',type })),
    ...['race','rounds','steal','apuestas','bomb','survival'].map(mp => ({mode:'online',type:'timed',mp})),
    {mode:'online',type:'free',mp:'rounds'},
    ...['+','−','×','÷'].map(op => ({mode:'operations',type:'free',op})),
    {mode:'solo',type:'timed',answer:'write'},
    {mode:'duel',type:'timed',answer:'write'},
    {mode:'solo',type:'free',visual:'inversa'},
  ];
  for (const test of cases) {
    const page = await newPage(browser, baseUrl, width, height);
    await enter(page);
    await page.evaluate(test => {
      setupMode=test.mode; gameMode=test.mode === 'operations' ? 'solo' : test.mode;
      gameType=test.type; difficulty='easy'; ansMode=test.answer||(test.mode==='operations'?'write':'options');
      visualMode=test.visual||'normal';
      selectedOps=[test.op||'×']; selectedTbls=[2,3,4,5]; selectedCifras=6;
      multTopDigits=3; multBottomDigits=2; pName2='Segundo jugador'; livesCount=8;
      isBotMode=test.type==='bot';
      if(test.mode==='online'){
        mpGameMode=test.mp;mpPlayerCount=test.mp==='bomb'?2:4;mpMyIdx=0;mpRole='host';mpSeed=123;
        mpPlayers=Array.from({length:mpPlayerCount},(_,idx)=>({idx,name:`Jugador ${idx+1}`,color:PLAYER_COLORS[idx].hex}));
      }
      initGame(test.mode==='online'); clearInterval(timerIv);
    }, test);
    const label = `juego-${test.mode}-${test.mp || test.type}-${test.op || test.answer || test.visual || ''}`;
    await inspect(page, label, '#gameScreen', true);
    if (test.mode==='solo' && test.type==='free' || test.mode==='duel' && test.type==='timed') {
      await page.evaluate(() => applyPauseState(true, 'Jugador'));
      await inspect(page, label+'-pausa', '#gameScreen', true);
      await page.evaluate(() => { applyPauseState(false, 'Jugador'); clearInterval(timerIv); showResults(); });
      await inspect(page, label+'-resultados', '#resultsScreen', true);
    }
    await finishPage(page);
  }
}

async function main() {
  output=path.resolve('output','desktop-all-screens',`${Date.now()}-${sectionFilter||'all'}`);
  const data=path.join(output,'isolated-data');fs.mkdirSync(data,{recursive:true});
  process.env.MATH_ATTACK_DATA_PATH=data;
  process.env.MATH_ATTACK_TESTS_PATH=path.join(data,'pruebas.json');
  process.env.MATH_ATTACK_GROUPS_PATH=path.join(data,'groups.json');
  const server=await startTestServer();
  const browser=await chromium.launch();
  try {
    for(const [width,height] of viewports){
      for(const section of ['menus','wizards','multiplayer','games']){
        if(sectionFilter&&sectionFilter!==section)continue;
        const begin=reports.length;
        try{
          if(section==='multiplayer')await auditMultiplayer(browser,server.baseUrl,width,height);
          else if(section==='games')await auditGames(browser,server.baseUrl,width,height);
          else{
            const page=await newPage(browser,server.baseUrl,width,height);
            if(section==='menus')await auditMenus(page);else await auditWizards(page);
            await finishPage(page);
          }
        }catch(error){reports.push({label:section,viewport:[width,height],ok:false,error:error.message});}
        console.log(`${width}x${height} ${section}: ${reports.length-begin} vistas, ${reports.slice(begin).filter(r=>!r.ok).length} pendientes`);
        fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
      }
    }
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
    const failed=reports.filter(r=>!r.ok);
    for(const report of failed.slice(0,12))console.log(JSON.stringify(report));
    console.log(`Evidencias: ${output}; ${reports.length} vistas; ${failed.length} pendientes`);
    if(failed.length)process.exitCode=1;
  }finally{await browser.close();server.server.kill('SIGINT');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
