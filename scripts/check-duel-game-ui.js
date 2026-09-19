'use strict';

const {
  OP_MUL,
  createDuelPage,
  closeDuelPage,
  setupDuelToAdvanced,
  advanceToSummary,
} = require('./duel-ui-test-utils');

const findings=[];
const result=(section,ok,detail)=>findings.push({section,ok,detail});

async function main(){
  const harness=await createDuelPage();
  const {page}=harness;
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/favicon|Failed to load resource/i.test(message.text()))consoleErrors.push(message.text());});
  try{
    await setupDuelToAdvanced(page,{type:'free',operations:[OP_MUL],opponent:'Rival juego'});
    await page.locator('#workspaceWizardHost [data-wizard-action="back"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="custom"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="tblClear"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="table"][data-value="1"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost #workspaceQptTableSlider').fill('1');
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.evaluate(()=>{
      pName='Jugador 1';
      window.__duelGameStart=false;
      runCountdown=callback=>{window.__duelGameStart=true;callback();};
    });
    const summaryStart=page.locator('#workspaceWizardHost [data-wizard-action="start"]');
    result('Configuración aplicada',await summaryStart.count()===1&&!await summaryStart.isDisabled(),'El Duelo queda listo para iniciar');
    await summaryStart.click();
    await page.waitForFunction(()=>document.querySelector('#gameScreen')?.classList.contains('active'),null,{timeout:5000});
    const gameState=await page.evaluate(()=>({
      started:window.__duelGameStart,
      mode:gameMode,
      opponent:pName2,
      selected:[...selectedOps],
      tables:[...selectedTbls],
      questions:questions.length,
      qptPerTable,
      opponentInGame:document.querySelector('#dp2name')?.textContent,
      turnVisible:document.querySelector('#turnWrap')?.classList.contains('visible'),
    }));
    result('Pantalla de juego',gameState.started&&gameState.mode==='duel'&&gameState.opponent==='Rival juego'&&JSON.stringify(gameState.selected)===JSON.stringify([OP_MUL])&&JSON.stringify(gameState.tables)===JSON.stringify([1])&&gameState.qptPerTable===1&&gameState.questions===1&&gameState.opponentInGame==='Rival juego'&&gameState.turnVisible,'La partida recibe la configuración del asistente: '+JSON.stringify(gameState));
    await page.evaluate(()=>{
      duelScores=[250,100];
      duelCorrect=[1,0];
      duelWrong=[0,1];
      duelTimeout=[0,0];
      totalC=1;totalW=1;totalT=0;
      showResults();
    });
    const resultsState=await page.evaluate(()=>({
      active:document.querySelector('#resultsScreen')?.classList.contains('active'),
      winner:document.querySelector('#dwName')?.textContent,
      score:document.querySelector('#scoreResultPts')?.textContent,
      scoreSub:document.querySelector('#scoreResultSub')?.textContent,
      scoreCards:document.querySelector('#dwScores')?.textContent,
      correct:document.querySelector('#statC')?.textContent,
      wrong:document.querySelector('#statW')?.textContent,
    }));
    result('Resultados',resultsState.active&&resultsState.winner==='Jugador 1'&&resultsState.score==='250'&&resultsState.scoreSub==='Puntaje ganador'&&/250/.test(resultsState.scoreCards)&&/100/.test(resultsState.scoreCards)&&resultsState.correct==='1'&&resultsState.wrong==='0','Ganador, puntaje y estadísticas correctas: '+JSON.stringify(resultsState));
    await page.evaluate(()=>{
      duelScores=[100,250];
      duelCorrect=[0,1];
      duelWrong=[1,0];
      duelTimeout=[0,0];
      totalC=1;totalW=1;totalT=0;
      showResults();
    });
    const opponentWinnerHeading=await page.locator('#rName').textContent();
    result('Resultado del rival',/Rival juego/.test(opponentWinnerHeading||''),'El encabezado identifica al segundo jugador cuando gana: '+JSON.stringify(opponentWinnerHeading));
    result('Errores de ejecución',pageErrors.length===0,pageErrors.length?pageErrors.join(' | '):'Sin pageerror');
    result('Errores de consola',consoleErrors.length===0,consoleErrors.length?consoleErrors.join(' | '):'Sin errores de consola');
  }catch(error){result('Ejecución',false,error.message);}
  finally{await closeDuelPage(harness);}
  const failed=findings.filter(item=>!item.ok);
  console.log('\nINFORME — TEST JUEGO Y RESULTADOS DE DUELO\n');
  findings.forEach(item=>console.log(`[${item.ok?'PASS':'FAIL'}] ${item.section}: ${item.detail}`));
  console.log(`\nResultado: ${failed.length?'FALLÓ':'APROBADO'} — ${findings.length-failed.length}/${findings.length} validaciones correctas.`);
  if(failed.length)process.exitCode=1;
}
main().catch(error=>{console.error('ERROR FATAL:',error.message||error);process.exitCode=1;});
