'use strict';

const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {silenceTestAudio}=require('./test-browser-audio');

const baseUrl=process.env.MATH_ATTACK_URL||'http://127.0.0.1:8080';
const names=['Host Carrera','Jugador 2','Jugador 3','Jugador 4'];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function openAgent(browser,name){
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto(`${baseUrl}/math-attack.html`,{waitUntil:'domcontentloaded'});
  await silenceTestAudio(page);
  await page.evaluate(playerName=>_entrarAlJuego(playerName),name);
  await page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]').click();
  await page.waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:10000});
  return page;
}

async function main(){
  const browser=await chromium.launch({headless:false});
  const pages=[]; const errors=[];
  try{
    for(const name of names)pages.push(await openAgent(browser,name));
    pages.forEach((page,index)=>page.on('pageerror',error=>errors.push(`${names[index]}: ${error.message}`)));

    const host=pages[0];
    await host.evaluate(()=>lanCreateRoom());
    await host.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:5000});
    await host.locator('#lanHosting .mp-maxp-btn[data-maxp="4"]').click();
    await wait(150);
    const roomId=await host.evaluate(()=>lanRoomId);
    for(const page of pages.slice(1)){
      await page.evaluate(id=>lanJoinRoom(id),roomId);
      await page.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:5000});
    }
    await host.waitForFunction(()=>mpPlayers.length===4,null,{timeout:5000});
    console.log('[PASS] Sala LAN: cuatro participantes conectados.');

    await host.evaluate(()=>lanStartRoom());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#mpModeSelect')?.classList.contains('visible'),null,{timeout:5000})));
    console.log('[PASS] Sala: todos recibieron el selector de modalidad.');

    await host.locator('.mp-mode-btn[data-mpmode="race"]').click();
    await host.locator('#mpStartModeBtn').click();
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3Screen')?.classList.contains('active'),null,{timeout:5000})));
    console.log('[PASS] Carrera: todos recibieron el panel de configuración.');

    await host.evaluate(()=>goS3aToS3bMP());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3bScreen')?.classList.contains('active'),null,{timeout:5000})));
    await host.evaluate(()=>mpLaunchGame());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#gameScreen')?.classList.contains('active'),null,{timeout:10000})));
    console.log('[PASS] Partida: cuatro participantes entraron a la pantalla de juego.');

    await pages[1].evaluate(()=>{ $('raceLock').className='race-lock visible'; $('raceLock').textContent='⚡ ¡Host Carrera respondió primero!'; $('feedbackEl').textContent='⚠️ Jugador desconectado'; });
    const beforeLeave=await host.evaluate(()=>({readyState:lanWS?.readyState,gameMode,mpRole,lanRoomId,gameActive:$('gameScreen').classList.contains('active')}));
    console.log(`[INFO] Host antes de salir: ${JSON.stringify(beforeLeave)}`);
    await host.evaluate(()=>onlineLeaveGame());
    await pages[1].waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:5000});
    const cleanup=await pages[1].evaluate(()=>({raceLock:$('raceLock').className,feedback:$('feedbackEl').textContent,game:$('gameScreen').classList.contains('active'),results:$('resultsScreen').classList.contains('active')}));
    console.log(`[INFO] Estado posterior a desconexión: ${JSON.stringify(cleanup)}`);
    assert.equal(cleanup.raceLock.includes('visible'),false);
    assert.equal(cleanup.feedback,'');
    assert.equal(cleanup.game,false);
    assert.equal(cleanup.results,false);
    console.log(`[PASS] Desconexión del anfitrión: jugadores regresaron a salas y avisos limpios: ${JSON.stringify(cleanup)}`);
    assert.equal(errors.length,0,errors.join(' | '));
    console.log('\nResultado: APROBADO — prueba real con 4 páginas independientes.');
  }catch(error){
    console.error(`\nResultado: FALLÓ — ${error.message}`);
    process.exitCode=1;
  }finally{
    await browser.close();
  }
}

main().catch(error=>{console.error('ERROR FATAL:',error.message||error);process.exitCode=1;});
