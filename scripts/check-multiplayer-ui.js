const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const findings = [];
function result(section, ok, detail) { findings.push({ section, ok, detail }); }

async function enterMultiplayer(page) {
  await page.goto(page.baseUrl + '/math-attack.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => _entrarAlJuego('Auditoria Multijugador'));
  const button = page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]');
  if (await button.count() !== 1) throw new Error('No se encontró la entrada de Multijugador en el escritorio');
  await button.evaluate(node => node.click());
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
  }));
  const expected = state.activeScreens.includes('step2Screen') && state.embedded && state.connectionPanel === 'block' && state.lanPanel && state.lanConnect !== 'none' && !state.peerPanel && state.currentTransport === 'lan';
  result('Entrada WebSocket/LAN', expected, `Estado observado: ${JSON.stringify(state)}`);
  result('PeerJS fuera del flujo', !state.peerScript && !state.peerPanel, `PeerJS o panel Peer detectado: ${JSON.stringify(state)}`);
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
