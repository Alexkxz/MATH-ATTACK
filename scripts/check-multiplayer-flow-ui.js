'use strict';

const { chromium } = require('playwright');
const { startTestServer } = require('./server-test-utils');

const findings=[];
function result(section,ok,detail){findings.push({section,ok,detail});}

async function main(){
  const runtime=await startTestServer({waitPath:'/api/ranking'});
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  const pageErrors=[]; const consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/favicon|Failed to load resource/i.test(message.text()))consoleErrors.push(message.text());});
  try{
    await page.goto(runtime.baseUrl+'/math-attack.html',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>_entrarAlJuego('Auditoria de flujo'));
    await page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]').evaluate(node=>node.click());
    await page.waitForTimeout(250);

    const entry=await page.evaluate(()=>({
      active:[...document.querySelectorAll('.screen.active')].map(node=>node.id),
      lanVisible:$('panelLan')?.classList.contains('visible'),
      connection:$('lanConnect')?.style.display,
      peerPanel:!!$('panelPeer'),
    }));
    result('Entrada',entry.active.includes('step2Screen')&&entry.lanVisible&&entry.connection!=='none'&&!entry.peerPanel,JSON.stringify(entry));

    const modes=await page.evaluate(()=>Object.keys(MP_MODE_NAMES));
    result('Seis modalidades',JSON.stringify(modes)===JSON.stringify(['race','rounds','bomb','steal','survival','apuestas']),modes.join(', '));

    const modeStates=await page.evaluate(()=>{
      mpConnected=true; mpRole='host'; mpPlayers=[{name:'Host',idx:0},{name:'Invitado',idx:1}]; mpPlayerCount=2; mpMyIdx=0; pName='Host'; pName2='Invitado';
      const states=[];
      for(const mode of Object.keys(MP_MODE_NAMES)){
        mpGameMode=mode; initStep3(true);
        states.push({mode,title:$('step3ModeTitle').textContent,bet:$('s3ApuestasSection').style.display!=='none',hostNav:$('s3HostNav').style.display!=='none'});
      }
      return states;
    });
    result('Identidad de modalidades',modeStates.every(state=>state.title&&state.hostNav),JSON.stringify(modeStates));
    result('Apuestas contextual',modeStates.filter(state=>state.mode==='apuestas').every(state=>state.bet)&&modeStates.filter(state=>state.mode!=='apuestas').every(state=>!state.bet),JSON.stringify(modeStates));

    const branches=await page.evaluate(()=>{
      mpGameMode='rounds'; initStep3(true);
      selectedOps=['×']; updateS3Sections();
      const multOnly={qpt:$('s3QptSection').style.display,table:$('s3QptPerTableSection').style.display,tables:$('s3bTblSection').style.display,cifras:$('s3bCifrasSection').style.display};
      selectedOps=['+']; updateS3Sections();
      const sumOnly={qpt:$('s3QptSection').style.display,table:$('s3QptPerTableSection').style.display,tables:$('s3bTblSection').style.display,cifras:$('s3bCifrasSection').style.display};
      selectedOps=['×','+']; updateS3Sections();
      const mixed={qpt:$('s3QptSection').style.display,table:$('s3QptPerTableSection').style.display,tables:$('s3bTblSection').style.display,cifras:$('s3bCifrasSection').style.display};
      return {multOnly,sumOnly,mixed};
    });
    result('Rama multiplicación',branches.multOnly.qpt==='none'&&branches.multOnly.table!=='none'&&branches.multOnly.tables!=='none',JSON.stringify(branches.multOnly));
    result('Rama suma',branches.sumOnly.qpt!=='none'&&branches.sumOnly.table==='none'&&branches.sumOnly.cifras!=='none',JSON.stringify(branches.sumOnly));
    result('Rama combinada',branches.mixed.qpt!=='none'&&branches.mixed.table!=='none'&&branches.mixed.tables!=='none'&&branches.mixed.cifras!=='none',JSON.stringify(branches.mixed));

    const panels=await page.evaluate(()=>{
      mpGameMode='rounds'; selectedOps=['×','+']; initStep3(true); $('step3Screen').classList.add('active'); goS3aToS3bMP();
      const config={step3:$('step3Screen').classList.contains('active'),step3b:$('step3bScreen').classList.contains('active'),backHostNav:$('s3bHostNav').style.display!=='none'};
      $('resultsScreen').classList.add('active'); showOnlineResultsUI();
      const results={replay:typeof $('replayBtn').onclick==='function',exit:typeof $('backStartBtn').onclick==='function',roomButton:$('returnRoomBtn').style.display!=='none'};
      return {config,results};
    });
    result('Configuración en dos paneles',!panels.config.step3&&panels.config.step3b&&panels.config.backHostNav,JSON.stringify(panels.config));
    result('Resultados online',panels.results.replay&&panels.results.exit&&panels.results.roomButton,JSON.stringify(panels.results));

    await page.evaluate(()=>{ $('raceLock').className='race-lock visible'; $('raceLock').textContent='⚡ ¡Invitado respondió primero!'; $('feedbackEl').textContent='⚠️ Invitado se desconectó'; mpReturnToLobby('test'); });
    const lobby=await page.evaluate(()=>({active:[...document.querySelectorAll('.screen.active')].map(node=>node.id),lanLobby:$('lanLobby').classList.contains('visible'),game:$('gameScreen').classList.contains('active'),results:$('resultsScreen').classList.contains('active'),raceLock:$('raceLock').className,feedback:$('feedbackEl').textContent}));
    result('Regreso al listado',lobby.active.includes('step2Screen')&&lobby.lanLobby&&!lobby.game&&!lobby.results,JSON.stringify(lobby));
    result('Limpieza de avisos de Carrera',!lobby.raceLock.includes('visible')&&!lobby.feedback,JSON.stringify(lobby));
    result('Errores de ejecución',pageErrors.length===0,pageErrors.length?pageErrors.join(' | '):'Sin pageerror');
    result('Errores de consola',consoleErrors.length===0,consoleErrors.length?consoleErrors.join(' | '):'Sin errores de consola');
  }catch(error){result('Fallo fatal',false,error.message);}
  finally{await browser.close();runtime.server.kill('SIGINT');}
  console.log('\nINFORME — FLUJO VISUAL MULTIJUGADOR\n');
  findings.forEach(item=>console.log(`[${item.ok?'PASS':'FAIL'}] ${item.section}: ${item.detail}`));
  const failed=findings.filter(item=>!item.ok);
  console.log(`\nResultado: ${failed.length?'PENDIENTES':'APROBADO'} — ${findings.length-failed.length}/${findings.length} validaciones correctas.`);
  if(failed.length)process.exitCode=1;
}

main().catch(error=>{console.error('ERROR FATAL:',error.message||error);process.exitCode=1;});
