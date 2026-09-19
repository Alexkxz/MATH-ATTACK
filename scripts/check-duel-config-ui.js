'use strict';

const {
  OP_SUM,
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
  try{
    await setupDuelToAdvanced(page,{type:'free',operations:[OP_SUM,OP_MUL],opponent:'Rival persistente'});
    const p2Colors=page.locator('#workspaceWizardHost [data-wizard-action="color2"]:not(:disabled)');
    await p2Colors.first().click();
    await page.locator('#workspaceWizardHost [data-wizard-action="back"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="all"]').click();
    const allTables=await page.evaluate(()=>getConfiguredTables());
    result('Todas las tablas',JSON.stringify(allTables)===JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12]),'El modo Todas aplica las tablas 1 a 12: '+JSON.stringify(allTables));
    await page.locator('#workspaceWizardHost [data-wizard-action="tblmode"][data-value="custom"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="tblClear"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="table"][data-value="1"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="table"][data-value="4"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="cifras"][data-value="3"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="addsub"][data-value="carry"]').click();
    const specific=await page.evaluate(()=>({tables:[...selectedTbls],digits:selectedCifras,addSub:addSubMode}));
    result('Configuración específica',JSON.stringify(specific.tables)===JSON.stringify([1,4])&&specific.digits===3&&specific.addSub==='carry',`Estado: ${JSON.stringify(specific)}`);
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    const advanced=await page.locator('#workspaceWizardHost #workspacePlayer2Name').inputValue();
    result('Identidad del rival',advanced==='Rival persistente','El nombre sobrevive al cambiar de panel');
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost #workspaceQptSlider').fill('7');
    await page.locator('#workspaceWizardHost #workspaceQptTableSlider').fill('5');
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    await page.locator('#workspaceWizardHost #workspaceMultMin').fill('2');
    await page.locator('#workspaceWizardHost #workspaceMultMax').fill('8');
    await page.locator('#workspaceWizardHost [data-wizard-action="next"]').click();
    const summary=await page.locator('#workspaceWizardHost .workspace-dynamic-summary').textContent();
    const finalState=await page.evaluate(()=>({qpt,qptPerTable,multMin,multMax,pName2,selectedTbls:[...selectedTbls],selectedCifras,addSubMode}));
    result('Resumen',/Rival persistente/.test(summary)&&/Cantidad por operación/.test(summary)&&/Cantidad por tabla/.test(summary),`Resumen conserva el rival y cantidades: ${JSON.stringify(finalState)}`);
    result('Estado final',finalState.qpt===7&&finalState.qptPerTable===5&&finalState.multMin===2&&finalState.multMax===8&&JSON.stringify(finalState.selectedTbls)===JSON.stringify([1,4]),`Estado: ${JSON.stringify(finalState)}`);
    for(let i=0;i<5;i++)await page.locator('#workspaceWizardHost [data-wizard-action="back"]').click();
    const returned=await page.evaluate(()=>({panel:workspaceDynamicState?.panel,tables:[...selectedTbls],qpt,qptPerTable,multMin,multMax,selectedCifras,addSubMode}));
    result('Atrás/Continuar',returned.panel==='specific'&&JSON.stringify(returned.tables)===JSON.stringify([1,4])&&returned.qpt===7&&returned.qptPerTable===5&&returned.multMin===2&&returned.multMax===8&&returned.selectedCifras===3&&returned.addSubMode==='carry',`Estado restaurado: ${JSON.stringify(returned)}`);
  }catch(error){result('Ejecución',false,error.message);}
  finally{await closeDuelPage(harness);}
  const failed=findings.filter(item=>!item.ok);
  console.log('\nINFORME — TEST CONFIGURACIÓN DE DUELO\n');
  findings.forEach(item=>console.log(`[${item.ok?'PASS':'FAIL'}] ${item.section}: ${item.detail}`));
  console.log(`\nResultado: ${failed.length?'FALLÓ':'APROBADO'} — ${findings.length-failed.length}/${findings.length} validaciones correctas.`);
  if(failed.length)process.exitCode=1;
}
main().catch(error=>{console.error('ERROR FATAL:',error.message||error);process.exitCode=1;});
