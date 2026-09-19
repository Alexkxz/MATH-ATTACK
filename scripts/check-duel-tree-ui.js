'use strict';

const {
  DIFFICULTY_TYPES,
  OP_SUM,
  OP_MUL,
  createDuelPage,
  closeDuelPage,
  enterDuel,
  setupDuelToAdvanced,
  advanceToSummary,
} = require('./duel-ui-test-utils');

const findings=[];
const duelTypes=['free','timed','lives','countdown','streak','survival'];
const result=(section,ok,detail)=>findings.push({section,ok,detail});
const expectedPanels=type=>['type',...(DIFFICULTY_TYPES.has(type)?['difficulty']:[]),'answer','operations','specific','advanced',...(type==='countdown'?[]:['order']),'quantities','multiplierRange','summary'];

async function main(){
  const harness=await createDuelPage();
  const {page}=harness;
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/favicon|Failed to load resource/i.test(message.text()))consoleErrors.push(message.text());});
  try{
    await enterDuel(page);
    const catalog=await page.locator('#workspaceWizardHost [data-wizard-action="type"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.value));
    result('Catálogo',JSON.stringify(catalog)===JSON.stringify(duelTypes),`Modos: ${catalog.join(', ')}`);
    result('Catálogo',!catalog.includes('bot'),'VS Bot no aparece en Duelo');
    for(const type of duelTypes){
      try{
        await setupDuelToAdvanced(page,{type,operations:[OP_SUM,OP_MUL],opponent:`Rival ${type}`});
        const expectedPath=expectedPanels(type);
        const currentPanel=await page.evaluate(() => workspaceDynamicState?.panel || null);
        result(`Arbol base ${type}`,currentPanel==='advanced',`La rama llega a advanced (${currentPanel||'sin panel'})`);
        const finalVisited=await advanceToSummary(page);
        const expectedTail=expectedPath.slice(expectedPath.indexOf('advanced'));
        result(`Arbol ${type}`,JSON.stringify(finalVisited)===JSON.stringify(expectedTail),`Recorrido: ${finalVisited.join(' -> ')}`);
        const start=page.locator('#workspaceWizardHost [data-wizard-action="start"]');
        result(`Inicio ${type}`,await start.count()===1&&!await start.isDisabled(),'El inicio queda disponible con rival configurado');
      }catch(error){result(`Duelo ${type}`,false,error.message);}
    }
    result('Errores de ejecución',pageErrors.length===0,pageErrors.length?pageErrors.join(' | '):'Sin pageerror');
    result('Errores de consola',consoleErrors.length===0,consoleErrors.length?consoleErrors.join(' | '):'Sin errores de consola');
  }finally{await closeDuelPage(harness);}
  const failed=findings.filter(item=>!item.ok);
  console.log('\nINFORME — TEST ÁRBOL DE DUELO\n');
  findings.forEach(item=>console.log(`[${item.ok?'PASS':'FAIL'}] ${item.section}: ${item.detail}`));
  console.log(`\nResultado: ${failed.length?'FALLÓ':'APROBADO'} — ${findings.length-failed.length}/${findings.length} validaciones correctas.`);
  if(failed.length)process.exitCode=1;
}
main().catch(error=>{console.error('ERROR FATAL:',error.message||error);process.exitCode=1;});
