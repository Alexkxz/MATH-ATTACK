'use strict';

const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const baseUrl=process.env.MATH_ATTACK_URL||'http://127.0.0.1:8080';
const modes=[
  {id:'race',name:'Carrera',players:4},
  {id:'rounds',name:'Rondas',players:4},
  {id:'steal',name:'Robo',players:4},
  {id:'apuestas',name:'Apuestas',players:4},
  {id:'bomb',name:'Bomba',players:2},
  {id:'survival',name:'Supervivencia',players:2},
];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function openAgent(browser,name){
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto(`${baseUrl}/math-attack.html`,{waitUntil:'domcontentloaded'});
  await page.evaluate(playerName=>_entrarAlJuego(playerName),name);
  await page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]').click();
  await page.waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:10000});
  return page;
}

async function testMode(browser,mode,index){
  const pages=[]; const prefix=`M${index+1}`;
  try{
    for(let i=0;i<mode.players;i++) pages.push(await openAgent(browser,`${prefix}-${mode.name}-${i+1}`));
    const host=pages[0];
    await host.evaluate(()=>lanCreateRoom());
    await host.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:5000});
    const roomId=await host.evaluate(()=>lanRoomId);
    if(mode.players===4){
      await host.locator('#lanHosting .mp-maxp-btn[data-maxp="4"]').click();
      await wait(120);
    }
    for(const page of pages.slice(1)){
      await page.evaluate(id=>lanJoinRoom(id),roomId);
      await page.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:5000});
    }
    await host.waitForFunction(()=>mpPlayers.length===mpPlayerCount&&mpPlayers.length===Number(document.querySelector('.mp-maxp-btn.selected')?.dataset.maxp||mpPlayers.length),null,{timeout:5000});
    await host.evaluate(()=>lanStartRoom());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#mpModeSelect')?.classList.contains('visible'),null,{timeout:5000})));
    await host.locator(`.mp-mode-btn[data-mpmode="${mode.id}"]`).click();
    await host.locator('#mpStartModeBtn').click();
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3Screen')?.classList.contains('active'),null,{timeout:5000})));
    await host.evaluate(()=>goS3aToS3bMP());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3bScreen')?.classList.contains('active'),null,{timeout:5000})));
    if(mode.id==='apuestas'){
      const betVisible=await host.evaluate(()=>getComputedStyle($('s3ApuestasSection')).display!=='none');
      assert.equal(betVisible,true,'Apuestas debe mostrar su configuración');
    }
    await host.evaluate(()=>mpLaunchGame());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#gameScreen')?.classList.contains('active'),null,{timeout:10000})));
    const states=await Promise.all(pages.map(page=>page.evaluate(()=>({mode:mpGameMode,online:gameMode==='online',game:$('gameScreen').classList.contains('active'),players:mpPlayerCount}))))
    assert.equal(states.every(state=>state.mode===mode.id&&state.online&&state.game&&state.players===mode.players),true,`Estado incorrecto: ${JSON.stringify(states)}`);
    console.log(`[PASS] ${mode.name}: ${mode.players} jugadores configuraron e iniciaron correctamente.`);
    await host.evaluate(()=>onlineLeaveGame());
    await pages[1].waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:5000});
    const cleanup=await pages[1].evaluate(()=>({game:$('gameScreen').classList.contains('active'),results:$('resultsScreen').classList.contains('active'),raceLock:$('raceLock').className,feedback:$('feedbackEl').textContent}));
    assert.equal(cleanup.game,false); assert.equal(cleanup.results,false); assert.equal(cleanup.raceLock.includes('visible'),false); assert.equal(cleanup.feedback,'');
    console.log(`[PASS] ${mode.name}: salida y limpieza correctas.`);
  }finally{
    await Promise.all(pages.map(page=>page.close().catch(()=>{})));
  }
}

async function main(){
  const browser=await chromium.launch({headless:false});
  try{
    for(let i=0;i<modes.length;i++) await testMode(browser,modes[i],i);
    console.log('\nResultado: APROBADO — 6 modalidades auditadas en navegador real.');
  }catch(error){console.error(`\nResultado: FALLÓ — ${error.message}`);process.exitCode=1;}
  finally{await browser.close();}
}
main().catch(error=>{console.error('ERROR FATAL:',error.message||error);process.exitCode=1;});
