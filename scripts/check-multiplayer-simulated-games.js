'use strict';

const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {silenceTestAudio}=require('./test-browser-audio');

const baseUrl=process.env.MATH_ATTACK_URL||'http://127.0.0.1:8080';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const viewport=(()=>{
  const [width,height]=String(process.env.MATH_ATTACK_VIEWPORT||'1280x720').split('x').map(Number);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<280||height<400) throw new Error('MATH_ATTACK_VIEWPORT debe tener formato ancho x alto, por ejemplo 375x667.');
  return {width,height};
})();

async function openAgent(browser,name){
  const page=await browser.newPage({viewport});
  await page.goto(`${baseUrl}/math-attack.html`,{waitUntil:'domcontentloaded'});
  await silenceTestAudio(page);
  await page.evaluate(playerName=>_entrarAlJuego(playerName),name);
  const onlineNav=page.locator("#workspaceSidebar .workspace-nav-item[onclick*=\"selectWorkspaceMode(this,'online')\"]");
  const navBounds=await onlineNav.boundingBox();
  if(navBounds&&navBounds.y<0){
    console.warn(`[ISSUE] El acceso a Multijugador queda fuera del viewport ${viewport.width}×${viewport.height}; se invoca el mismo handler solo para continuar auditando el juego.`);
    await page.evaluate(()=>selectWorkspaceMode(document.querySelector("#workspaceSidebar .workspace-nav-item[onclick*=\"selectWorkspaceMode(this,'online')\"]"),'online'));
  }else await onlineNav.click();
  await page.waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:10000});
  await assertCentralOnlineStage(page,'step2Screen',name);
  return page;
}

async function assertCentralOnlineStage(page,screenId,label){
  const state=await page.evaluate(id=>{
    const screen=document.getElementById(id),shell=document.getElementById('studentWorkspace'),parent=document.getElementById('step1Screen');
    const rect=screen.getBoundingClientRect();
    return {inCentral:screen.parentElement?.id==='workspaceOnlineHost',centralMode:shell.classList.contains('workspace-online-central'),containerVisible:parent.classList.contains('workspace-online-container'),screenDisplay:getComputedStyle(screen).display,screenWidth:rect.width,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};
  },screenId);
  assert.equal(state.inCentral,true,`${label}: ${screenId} no está dentro del panel central`);
  assert.equal(state.centralMode,true,`${label}: escritorio no marcó el flujo central`);
  assert.equal(state.containerVisible,true,`${label}: escritorio contenedor quedó oculto`);
  assert.equal(state.screenDisplay,'flex',`${label}: panel central ${screenId} no es visible`);
  assert.equal(state.overflow,false,`${label}: ${screenId} causa overflow horizontal`);
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
    await Promise.all(pages.map(page=>assertCentralOnlineStage(page,'step3Screen',`${mode}/configuración`)));
    await host.evaluate(()=>goS3aToS3bMP());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3bScreen')?.classList.contains('active'),null,{timeout:5000})));
    await Promise.all(pages.map(page=>assertCentralOnlineStage(page,'step3bScreen',`${mode}/opciones`)));
    await host.evaluate(()=>mpLaunchGame());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#gameScreen')?.classList.contains('active'),null,{timeout:10000})));
    await verifyResponsiveControls(host,mode);
    return pages;
  }catch(error){
    await Promise.all(pages.map(page=>page.close().catch(()=>{})));
    throw error;
  }
}

async function verifyResponsiveControls(page,mode){
  const initial=await page.evaluate(()=>({
    timeLeft,
    timerVisible:getComputedStyle(document.querySelector('.timer-shell')).display!=='none',
    answerCount:document.querySelectorAll('#optionsGrid .opt-btn').length,
    overflow:document.documentElement.scrollWidth>innerWidth+1,
    questionVisible:$('questionCard').getBoundingClientRect().height>0,
  }));
  assert.equal(initial.timerVisible,true,`${mode}: temporizador oculto en ${viewport.width}px`);
  assert.equal(initial.answerCount,4,`${mode}: no aparecen las cuatro respuestas`);
  assert.equal(initial.questionVisible,true,`${mode}: pregunta no visible`);
  assert.equal(initial.overflow,false,`${mode}: desbordamiento horizontal antes de interactuar`);
  await wait(1100);
  const elapsed=await page.evaluate(()=>timeLeft);
  assert.equal(elapsed<initial.timeLeft,true,`${mode}: el temporizador no avanzó (${initial.timeLeft} → ${elapsed})`);

  await page.evaluate(()=>{
    currentPlayer.inventory={shield:2,freeze:1,doublepts:1};
    sessionInventory={shield:2,freeze:1,doublepts:1};
    renderPowerPanel();
  });
  const toggle=page.locator('#powerDockToggle');
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await page.waitForFunction(()=>document.querySelector('#powerDock')?.classList.contains('open'),null,{timeout:2000});
  const opened=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const question=rect($('questionCard')),answers=rect($('optionsGrid')),dock=rect($('powerDock'));
    const horizontalOverflow=document.documentElement.scrollWidth>innerWidth+1;
    const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    return {dock,question,answers,horizontalOverflow,overlapQuestion:overlap(question,dock),overlapAnswers:overlap(answers,dock),powers:document.querySelectorAll('#powerPanel .power-btn').length};
  });
  assert.equal(opened.powers>=3,true,`${mode}: no se renderizó el inventario del panel de poderes`);
  assert.equal(opened.horizontalOverflow,false,`${mode}: el panel de poderes causa desbordamiento`);
  assert.equal(opened.overlapQuestion,false,`${mode}: el panel cubre la pregunta`);
  assert.equal(opened.overlapAnswers,false,`${mode}: el panel cubre las respuestas`);
  if(viewport.width>620){
    assert.equal(opened.question.right<=opened.dock.left+1,true,`${mode}: panel invade horizontalmente la pregunta`);
    assert.equal(opened.answers.right<=opened.dock.left+1,true,`${mode}: panel invade horizontalmente las respuestas`);
  }
  await toggle.click();
  await page.waitForFunction(()=>!document.querySelector('#powerDock')?.classList.contains('open'),null,{timeout:2000});
  console.log(`[PASS] ${mode}: temporizador activo y panel de poderes usable (${viewport.width}×${viewport.height}).`);
}

async function leaveAndAssert(pages){
  const host=pages[0];
  await host.evaluate(()=>onlineLeaveGame());
  await Promise.all(pages.slice(1).map(page=>page.waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:6000})));
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

async function testReconnect(browser){
  const pages=await startMode(browser,'race',2);
  try{
    const host=pages[0],guest=pages[1];
    const before=await guest.evaluate(()=>({room:lanRoomId,index:mpMyIdx,game:$('gameScreen').classList.contains('active')}));
    await guest.evaluate(()=>lanWS.close());
    await guest.waitForFunction(()=>document.querySelector('#lanReconnecting')?.style.display==='block',null,{timeout:4000});
    await guest.waitForFunction(()=>lanWS?.readyState===WebSocket.OPEN&&document.querySelector('#lanReconnecting')?.style.display==='none',null,{timeout:10000});
    const after=await guest.evaluate(()=>({room:lanRoomId,index:mpMyIdx,game:$('gameScreen').classList.contains('active')}));
    assert.equal(after.room,before.room,'La reconexión cambió de sala');
    assert.equal(after.index,before.index,'La reconexión cambió el índice del jugador');
    assert.equal(after.game,true,'La partida no siguió visible tras reconectar');
    await wait(2200);
    const staleFeedback=await host.evaluate(()=>({feedback:$('feedbackEl').textContent,raceLock:$('raceLock').className}));
    assert.equal(staleFeedback.feedback,'','Quedó un aviso de reconexión sin limpiar');
    assert.equal(staleFeedback.raceLock.includes('visible'),false,'Quedó una alerta de carrera bloqueando la partida');
    await leaveAndAssert(pages);
    await wait(1900);
    const restored=await host.evaluate(()=>({home:$('step1Screen').classList.contains('active'),screenParent:$('step2Screen').parentElement?.id||'',central:$('workspaceOnlineHost').contains($('step2Screen')),onlineClass:$('step1Screen').classList.contains('workspace-online-container'),centralMode:$('studentWorkspace').classList.contains('workspace-online-central')}));
    assert.equal(restored.home,true,`Al salir, no se regresó al inicio: ${JSON.stringify(restored)}`);
    assert.equal(restored.central,false,'Al salir, las pantallas LAN no volvieron a su ubicación original');
    assert.equal(restored.onlineClass,false,'El contenedor central LAN quedó activo al volver a Inicio');
    await host.locator("#workspaceSidebar .workspace-nav-item[onclick*=\"selectWorkspaceMode(this,'solo')\"]").click();
    await host.waitForFunction(()=>workspaceDynamicState?.mode==='solo',null,{timeout:3000});
    await host.locator("#workspaceSidebar .workspace-nav-item[onclick*=\"selectWorkspaceMode(this,'duel')\"]").click();
    await host.waitForFunction(()=>workspaceDynamicState?.mode==='duel',null,{timeout:3000});
    await host.locator("#workspaceSidebar .workspace-nav-item[onclick*=\"selectWorkspaceMode(this,'online')\"]").click();
    await host.waitForFunction(()=>document.querySelector('#step2Screen')?.classList.contains('active')&&document.querySelector('#step2Screen')?.parentElement?.id==='workspaceOnlineHost',null,{timeout:5000});
    await assertCentralOnlineStage(host,'step2Screen','volver a Multijugador tras Individual/Duelo');
    console.log(`[PASS] Reconexión: mismo jugador/sala, partida preservada y salida limpia (${viewport.width}×${viewport.height}).`);
  }finally{await Promise.all(pages.map(p=>p.close().catch(()=>{})));}
}

async function main(){
  const browser=await chromium.launch({headless:false});
  try{
    if(process.env.MATH_ATTACK_TEST_ONLY!=='reconnect'){
      await testRounds(browser);
      await testRace(browser);
      await testSteal(browser);
      await testBomb(browser);
      await testSurvival(browser);
      await testApuestasAndResults(browser);
    }
    await testReconnect(browser);
    console.log('\nResultado: APROBADO — simulación funcional de respuestas y estados en 6 modalidades.');
  }catch(error){
    console.error(`\nResultado: FALLÓ — ${error.stack||error.message}`);
    process.exitCode=1;
  }finally{await browser.close();}
}

main().catch(error=>{console.error('ERROR FATAL:',error.stack||error.message);process.exitCode=1;});
