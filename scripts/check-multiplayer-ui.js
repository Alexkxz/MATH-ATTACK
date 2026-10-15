const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');
const { silenceTestAudio } = require('./test-browser-audio');

const findings = [];
function result(section, ok, detail) { findings.push({ section, ok, detail }); }

async function enterMultiplayer(page) {
  await page.goto(page.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => _entrarAlJuego('Auditoria Multijugador'));
  const shopButton = page.locator('#workspaceSidebar .workspace-nav-item[onclick*="openWorkspaceShop"]');
  if (await shopButton.count() === 1) {
    await shopButton.evaluate(node => node.click());
    await page.waitForTimeout(100);
  }
  const button = page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]');
  if (await button.count() !== 1) throw new Error('No se encontró la entrada de Multijugador en el escritorio');
  await button.evaluate(node => node.click());
  await page.waitForTimeout(250);
}

async function auditShopCleanup(page) {
  const state = await page.evaluate(() => ({
    shopMode: document.querySelector('#studentWorkspace')?.classList.contains('workspace-show-shop'),
    shopActive: document.querySelector('#shopOverlay')?.classList.contains('active'),
    shopDisplay: getComputedStyle(document.querySelector('#shopOverlay')).display,
    activityDisplay: getComputedStyle(document.querySelector('#workspaceActivityCard')).display,
  }));
  const expected = !state.shopMode && !state.shopActive && state.shopDisplay === 'none' && state.activityDisplay !== 'none';
  result('Shop panel cleared before multiplayer', expected, `Observed: ${JSON.stringify(state)}`);
}

async function auditMultiplayerToShop(page) {
  const shopButton = page.locator('#workspaceSidebar .workspace-nav-item[onclick*="openWorkspaceShop"]');
  await shopButton.evaluate(node => node.click());
  await page.waitForTimeout(150);
  const state = await page.evaluate(() => ({
    shopMode: document.querySelector('#studentWorkspace')?.classList.contains('workspace-show-shop'),
    shopActive: document.querySelector('#shopOverlay')?.classList.contains('active'),
    shopDisplay: getComputedStyle(document.querySelector('#shopOverlay')).display,
    onlineCentral: document.querySelector('#studentWorkspace')?.classList.contains('workspace-online-central'),
    onlineScreensActive: ['step2Screen', 'step3Screen', 'step3bScreen'].some(id => document.getElementById(id)?.classList.contains('active')),
  }));
  const expected = state.shopMode && state.shopActive && state.shopDisplay !== 'none' && !state.onlineCentral && !state.onlineScreensActive;
  result('Multiplayer screens hidden in shop', expected, `Observed: ${JSON.stringify(state)}`);
  const onlineButton = page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]');
  await onlineButton.evaluate(node => node.click());
  await page.waitForTimeout(250);
}

async function auditEntry(page) {
  const state = await page.evaluate(() => ({
    activeScreens: [...document.querySelectorAll('.screen.active')].map(screen => screen.id),
    workspaceDynamic: document.querySelector('#studentWorkspace')?.classList.contains('workspace-dynamic-wizard'),
    workspaceConfig: document.querySelector('#studentWorkspace')?.classList.contains('workspace-show-config'),
    embedded: mpEmbedded,
    connectionPanel: document.querySelector('#step2OnlinePanel')?.style.display,
    lanPanel: document.querySelector('#panelLan')?.classList.contains('visible'),
    lanConnect: document.querySelector('#lanConnect')?.style.display,
    peerPanel: document.querySelector('#panelPeer')?.classList.contains('visible'),
    currentTransport: mpCurrentMode,
    peerScript: [...document.scripts].some(script => script.src.includes('peerjs')),
    hasDisconnectServerButton: Boolean(document.querySelector('#lanLobby button[onclick="lanDisconnect();goStart()"]')),
  }));
  const expected = state.activeScreens.includes('step2Screen') && state.embedded && state.connectionPanel === 'block' && state.lanPanel && state.lanConnect !== 'none' && !state.peerPanel && state.currentTransport === 'lan';
  result('Entrada WebSocket/LAN', expected, `Estado observado: ${JSON.stringify(state)}`);
  result('PeerJS fuera del flujo', !state.peerScript && !state.peerPanel, `PeerJS o panel Peer detectado: ${JSON.stringify(state)}`);
  result('Sin botón para desconectar servidor en salas', !state.hasDisconnectServerButton, 'La lista de salas ya no ofrece desconectar el servidor.');
}

async function auditLobbyFitsCentralPanel(page) {
  const state = await page.evaluate(() => {
    const hosting = document.querySelector('#lanHosting');
    const lobby = document.querySelector('#lanLobby');
    const connect = document.querySelector('#lanConnect');
    const shell = document.querySelector('#studentWorkspace');
    const main = shell?.querySelector('.workspace-main');
    const root = document.querySelector('#step1Screen');
    selectedOps=['×']; mpRole='host'; updateS3Sections();
    lobby?.classList.remove('visible');
    hosting?.classList.add('visible');
    if(connect)connect.style.display='none';
    const start=$('lanStartBtn'); if(start)start.style.display='block';
    buildLobbyColorPicker();
    const states=[];
    ['step2Screen','step3Screen','step3bScreen'].forEach(id=>{
      ['step2Screen','step3Screen','step3bScreen'].forEach(screenId=>$(screenId).classList.toggle('active',screenId===id));
      const screen=$(id),rect=screen.getBoundingClientRect();
      states.push({screen:id,mainPanelNeedsInternalScroll:main.scrollHeight>main.clientHeight+1,mainOverflowY:getComputedStyle(main).overflowY,screenOutsideCentral:rect.bottom>main.getBoundingClientRect().bottom+1,mainHeight:main.clientHeight,mainContentHeight:main.scrollHeight,screenHeight:Math.round(rect.height)});
    });
    const result={viewport:innerHeight,documentScroll:document.documentElement.scrollHeight>innerHeight+1,rootScroll:root.scrollHeight>root.clientHeight+1,states};
    ['step2Screen','step3Screen','step3bScreen'].forEach(id=>$(id).classList.toggle('active',id==='step2Screen'));
    hosting.classList.remove('visible');
    lobby?.classList.add('visible');
    if(connect)connect.style.display='block';
    if(start)start.style.display='none';
    return result;
  });
  const fits=!state.documentScroll&&!state.rootScroll&&state.states.every(item=>item.mainOverflowY==='hidden'&&!item.mainPanelNeedsInternalScroll&&!item.screenOutsideCentral);
  result('Pestañas de Multijugador sin scroll', fits, `La página, el panel central y cada fase de configuración caben sin desplazamiento: ${JSON.stringify(state)}`);
}

async function auditModes(page) {
  const modes = await page.evaluate(() => Object.keys(MP_MODE_NAMES || {}));
  const expected = ['race', 'rounds', 'bomb', 'steal', 'survival', 'apuestas'];
  result('Catálogo de modalidades', JSON.stringify(modes) === JSON.stringify(expected), `Modalidades: ${modes.join(', ')}`);
  const restricted = await page.evaluate(() => ({
    hasRestrictionGuard: typeof _mpUpdateModeAvailability === 'function',
    restrictedModes: [...document.querySelectorAll('.mp-mode-btn')].filter(button => button.disabled).map(button => button.dataset.mpmode),
  }));
  result('Restricción Bomba/Supervivencia', restricted.hasRestrictionGuard, `Guard disponible: ${JSON.stringify(restricted)}`);
}

async function auditReplayContract(page) {
  const contract = await page.evaluate(() => ({
    requestReplay: typeof onlineRequestReplay === 'function',
    leaveGame: typeof onlineLeaveGame === 'function',
    sendGame: typeof mpSendGame === 'function',
    hasPlayerCount: typeof mpPlayerCount === 'number',
    hasRoom: typeof lanRoomId !== 'undefined',
    hasSeed: typeof mpSeed !== 'undefined',
    hasFinishedPlayers: typeof window.mpFinishedPlayers !== 'undefined',
    hasReturnMessage: String(mpHandleGameMsg).includes("return_to_room"),
    hasReplayMessage: String(mpHandleGameMsg).includes("want_replay"),
  }));
  const expected = Object.values(contract).every(Boolean);
  result('Contrato de revancha y salida', expected, `Piezas disponibles: ${JSON.stringify(contract)}`);
}

async function auditServerRoomContract(page) {
  const serverContract = await page.evaluate(() => ({
    onlineMode: gameMode === 'online',
    roomTransport: mpCurrentMode,
    playerCount: mpPlayerCount,
    roomId: lanRoomId,
  }));
  result('Estado de sala', serverContract.roomTransport === 'lan' && serverContract.playerCount >= 2, `Estado inicial: ${JSON.stringify(serverContract)}`);
}

async function auditColorPriority(browser, host, baseUrl) {
  const guest = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await host.evaluate(() => lanCreateRoom());
    await host.waitForFunction(() => Boolean(lanRoomId), null, { timeout: 5000 });
    const { roomId, hostColor } = await host.evaluate(() => ({ roomId: lanRoomId, hostColor: pColor }));
    await guest.goto(baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
    await silenceTestAudio(guest);
    await guest.evaluate(() => _entrarAlJuego('Invitado Color'));
    await guest.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]').click();
    await guest.waitForFunction(() => document.querySelector('#lanLobby')?.classList.contains('visible'), null, { timeout: 5000 });
    await guest.evaluate(id => lanJoinRoom(id), roomId);
    await Promise.all([
      host.waitForFunction(() => mpTakenColors.some(color => String(color.playerId) === '1'), null, { timeout: 5000 }),
      guest.waitForFunction(() => mpTakenColors.some(color => String(color.playerId) === '0') && mpTakenColors.some(color => String(color.playerId) === '1'), null, { timeout: 5000 }),
    ]);
    const initial = await Promise.all([host.evaluate(() => ({ own: pColor, colors: mpTakenColors })), guest.evaluate(() => ({ own: pColor, colors: mpTakenColors }))]);
    const hostKeptPriority = initial[0].own === hostColor && initial[1].own !== hostColor && initial.every(state => new Set(state.colors.map(color => color.color)).size === 2);
    result('Prioridad de color por orden de entrada', hostKeptPriority, `Host=${initial[0].own}; invitado=${initial[1].own}; colores observados=${JSON.stringify(initial[0].colors)}`);

    await guest.evaluate(color => lanSend({ type: 'color_update', color, playerId: '1', name: pName }), hostColor);
    await guest.waitForTimeout(180);
    const afterAttempt = await Promise.all([host.evaluate(() => ({ own: pColor, colors: mpTakenColors })), guest.evaluate(() => ({ own: pColor, colors: mpTakenColors }))]);
    const ownerUnchanged = afterAttempt[0].own === hostColor && afterAttempt[1].own !== hostColor && afterAttempt.every(state => new Set(state.colors.map(color => color.color)).size === 2);
    result('Color ocupado no desplaza al dueño', ownerUnchanged, `Host=${afterAttempt[0].own}; invitado=${afterAttempt[1].own}; colores observados=${JSON.stringify(afterAttempt[0].colors)}`);
  } finally {
    await guest.close();
  }
}

async function main() {
  const testServer = await startTestServer({ waitPath: '/api/ranking' });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.baseUrl = testServer.baseUrl;
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) consoleErrors.push(message.text()); });
  try {
    await enterMultiplayer(page);
    await auditEntry(page);
    await auditLobbyFitsCentralPanel(page);
    await auditShopCleanup(page);
    await auditMultiplayerToShop(page);
    await auditEntry(page);
    await auditModes(page);
    await auditReplayContract(page);
    await auditServerRoomContract(page);
    result('Errores de ejecución', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : 'Sin pageerror');
    result('Errores de consola', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' | ') : 'Sin errores de consola');
  } catch (error) {
    result('Fallo fatal de auditoría', false, error.message);
  } finally {
    await browser.close();
    testServer.server.kill('SIGINT');
  }

  const failed = findings.filter(item => !item.ok);
  console.log('\nINFORME — FASE 2 MULTIJUGADOR\n');
  for (const item of findings) console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.section}: ${item.detail}`);
  console.log(`\nResultado: ${failed.length ? 'PENDIENTES' : 'APROBADO'} — ${findings.length - failed.length}/${findings.length} validaciones correctas.`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => { console.error('ERROR FATAL:', error.message || error); process.exitCode = 1; });
