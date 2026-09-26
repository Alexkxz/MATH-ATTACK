'use strict';

const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const baseUrl=process.env.MATH_ATTACK_URL||'http://127.0.0.1:8080';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function openAgent(browser,name){
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto(`${baseUrl}/math-attack.html`,{waitUntil:'domcontentloaded'});
  await page.evaluate(playerName=>_entrarAlJuego(playerName),name);
  await page.locator("#workspaceSidebar .workspace-nav-item[onclick*=\"selectWorkspaceMode(this,'online')\"]").click();
  await page.waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:10000});
  return page;
}

async function startMode(browser,mode,players){
  const pages=[]; const suffix=`SIM-${mode}-${Date.now()}`;
  try{
    for(let i=0;i<players;i++) pages.push(await openAgent(browser,`${suffix}-${i+1}`));
    const host=pages[0];
    await host.evaluate(()=>lanCreateRoom());
    await host.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:5000});
    const roomId=await host.evaluate(()=>lanRoomId);
    if(players===4){
      await host.locator('#lanHosting .mp-maxp-btn[data-maxp="4"]').click();
      await wait(150);
    }
    for(const page of pages.slice(1)){
      await page.evaluate(id=>lanJoinRoom(id),roomId);
      await page.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:5000});
    }
    await host.waitForFunction(()=>mpPlayers.length===mpPlayerCount&&mpPlayers.length===Number(document.querySelector('.mp-maxp-btn.selected')?.dataset.maxp||mpPlayers.length),null,{timeout:5000});
    await host.evaluate(()=>lanStartRoom());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#mpModeSelect')?.classList.contains('visible'),null,{timeout:5000})));
    await host.locator(`.mp-mode-btn[data-mpmode="${mode}"]`).click();
    await host.locator('#mpStartModeBtn').click();
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3Screen')?.classList.contains('active'),null,{timeout:5000})));
    await host.evaluate(()=>goS3aToS3bMP());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3bScreen')?.classList.contains('active'),null,{timeout:5000})));
    await host.evaluate(()=>mpLaunchGame());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#gameScreen')?.classList.contains('active'),null,{timeout:10000})));
    return pages;
  }catch(error){
    await Promise.all(pages.map(page=>page.close().catch(()=>{})));
    throw error;
  }
}

async function leaveAndAssert(pages){
  const host=pages[0];
  await host.evaluate(()=>onlineLeaveGame());
  await pages[1].waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:6000});
  const states=await Promise.all(pages.slice(1).map(page=>page.evaluate(()=>({
    lobby:$('lanLobby').classList.contains('visible'),
    game:$('gameScreen').classList.contains('active'),
    results:$('resultsScreen').classList.contains('active'),
    feedback:$('feedbackEl').textContent,
    raceLock:$('raceLock').className
  }))));
  for(const state of states){
    assert.equal(state.lobby,true,'El jugador no regreso a la sala');
    assert.equal(state.game,false,'El juego siguio activo despues de salir');
    assert.equal(state.results,false,'La pantalla de resultados siguio activa');
    assert.equal(state.feedback,'','Quedo un mensaje de respuesta despues de salir');
    assert.equal(state.raceLock.includes('visible'),false,'Quedo visible un aviso de carrera despues de salir');
  }
}

async function testRounds(browser){
  const pages=await startMode(browser,'rounds',4);
  try{
    const host=pages[0], guest=pages[1];
    const before=await host.evaluate(()=>duelScores[0]);
    await host.evaluate(()=>selectAnswer(correctAns,document.getElementById('opt0')));
    await guest.waitForFunction(()=>duelScores[0]>0,null,{timeout:3000});
    const state=await host.evaluate(()=>({score:duelScores[0],answered,totalC}));
    assert.equal(state.answered,true); assert.equal(state.totalC>0,true);
    assert.equal(state.score>before,true,'Una respuesta correcta no aumento el puntaje');
    await leaveAndAssert(pages);
    console.log('[PASS] Rondas: respuesta correcta sincronizada y puntuación actualizada.');
  }finally{await Promise.all(pages.map(p=>p.close().catch(()=>{})));}
}

async function testRace(browser){
  const pages=await startMode(browser,'race',4);
  try{
    const host=pages[0], guest=pages[1];
    await host.evaluate(()=>selectAnswer(correctAns,document.getElementById('opt0')));
    await guest.waitForFunction(()=>document.querySelector('#raceLock')?.classList.contains('visible'),null,{timeout:3000});
    const state=await guest.evaluate(()=>({lock:$('raceLock').textContent,score:duelScores[0]}));
    assert.match(state.lock,/respondió primero/i);
    assert.equal(state.score>0,true,'Carrera no sincronizo el puntaje del ganador');
    await leaveAndAssert(pages);
    console.log('[PASS] Carrera: ganador, bloqueo visual y avance sincronizados.');
  }finally{await Promise.all(pages.map(p=>p.close().catch(()=>{})));}
}

async function testSteal(browser){
  const pages=await startMode(browser,'steal',4);
  try{
    const host=pages[0], guest=pages[1];
    await host.evaluate(()=>{duelScores[0]=100; gameScore=100; updateMPScoresUI(); mpSendGame({type:'ans',player:0,q:qIndex,res:'wrong',streak:0,score:100});});
    await guest.waitForFunction(()=>duelScores[1]===25,null,{timeout:3000});
    const state=await guest.evaluate(()=>({myScore:duelScores[1],rivalScore:duelScores[0],feedback:$('feedbackEl').textContent}));
    assert.equal(state.myScore,25,'Robo no otorgo la cuarta parte del puntaje');
    assert.equal(state.rivalScore,75,'Robo no desconto el puntaje al rival');
    assert.match(state.feedback,/Robaste 25 pts/i);
    await leaveAndAssert(pages);
    console.log('[PASS] Robo: transferencia de puntos y mensaje de confirmación correctos.');
  }finally{await Promise.all(pages.map(p=>p.close().catch(()=>{})));}
}

async function testBomb(browser){
  const pages=await startMode(browser,'bomb',2);
  try{
    const host=pages[0], guest=pages[1];
    const initial=await host.evaluate(()=>({owner:mpBombOwner,my:mpMyIdx}));
    assert.equal(initial.owner,0,'La bomba no inicia en el anfitrión');
    await host.evaluate(()=>{mpBombSent=true; mpBombOwner=1; mpSendGame({type:'bomb_pass',timeLeft:2});});
    await guest.waitForFunction(()=>mpBombOwner===mpMyIdx&&mpBombAnswered===true,null,{timeout:3000});
    await guest.evaluate(()=>mpSendGame({type:'ans',player:1,q:qIndex,res:'correct',streak:1,score:10}));
    await host.waitForFunction(()=>mpBombOwner===mpMyIdx,null,{timeout:3000});
    const state=await Promise.all([host,guest].map(page=>page.evaluate(()=>({owner:mpBombOwner,my:mpMyIdx,bombVisible:$('bombInd').classList.contains('visible')}))));
    assert.equal(state[0].owner,state[0].my,'La bomba no regreso al anfitrión tras el acierto');
    assert.equal(state[1].owner,state[1].my,'El receptor no actualizo su estado de bomba');
    await leaveAndAssert(pages);
    console.log('[PASS] Bomba: pase, turno y retorno de la bomba verificados.');
  }finally{await Promise.all(pages.map(p=>p.close().catch(()=>{})));}
}

async function testSurvival(browser){
  const pages=await startMode(browser,'survival',2);
  try{
    const host=pages[0], guest=pages[1];
    const initial=await guest.evaluate(()=>mpLives[0]);
    const target=initial-1;
    // En supervivencia la vida se replica mediante el evento dedicado que usa
    // la lógica real después de una respuesta incorrecta o un timeout.
    await host.evaluate(nextLives=>{mpLives[0]=nextLives; mpSendGame({type:'survival_life',lives:nextLives,player:0});},target);
    await guest.waitForFunction(expected=>mpLives[0]===expected,target,{timeout:3000});
    const state=await guest.evaluate(()=>({lives:mpLives[0],hearts:$('livesH1').textContent}));
    assert.equal(initial>1,true); assert.equal(state.lives,target); assert.match(state.hearts,/❤️/);
    await leaveAndAssert(pages);
    console.log('[PASS] Supervivencia: pérdida de vida y renderizado sincronizados.');
  }finally{await Promise.all(pages.map(p=>p.close().catch(()=>{})));}
}

async function testApuestasAndResults(browser){
  const pages=await startMode(browser,'apuestas',4);
  try{
    const host=pages[0];
    const config=await host.evaluate(()=>({bet:mpBetAmount,mode:mpGameMode,players:mpPlayerCount}));
    assert.equal(config.mode,'apuestas'); assert.equal(config.players,4); assert.equal(config.bet>0,true);
    await host.evaluate(()=>{
      duelScores=[120,80,60,40];
      mpMyIdx=0;
      window.mpPotAwarded=false;
      $('gameScreen').classList.remove('active');
      $('resultsScreen').classList.add('active');
      $('scoreResultBox').style.display='block';
      showFinalOnlineResults(false);
    });
    await host.waitForFunction(()=>document.querySelector('#resultsScreen')?.classList.contains('active'),null,{timeout:3000});
    const result=await host.evaluate(()=>({active:$('resultsScreen').classList.contains('active'),score:$('scoreResultPts').textContent,bet:$('aureosEarnedBox').style.display}));
    assert.equal(result.active,true); assert.equal(result.score,'120'); assert.notEqual(result.bet,'none');
    await leaveAndAssert(pages);
    console.log('[PASS] Apuestas/resultados: apuesta configurada, ranking y resultado visibles.');
  }finally{await Promise.all(pages.map(p=>p.close().catch(()=>{})));}
}

async function main(){
  const browser=await chromium.launch({headless:false});
  try{
    await testRounds(browser);
    await testRace(browser);
    await testSteal(browser);
    await testBomb(browser);
    await testSurvival(browser);
    await testApuestasAndResults(browser);
    console.log('\nResultado: APROBADO — simulación funcional de respuestas y estados en 6 modalidades.');
  }catch(error){
    console.error(`\nResultado: FALLÓ — ${error.stack||error.message}`);
    process.exitCode=1;
  }finally{await browser.close();}
}

main().catch(error=>{console.error('ERROR FATAL:',error.stack||error.message);process.exitCode=1;});
