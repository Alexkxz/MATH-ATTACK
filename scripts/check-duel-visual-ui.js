'use strict';

const {
  OP_SUM,
  OP_MUL,
  createDuelPage,
  closeDuelPage,
  setupDuelToAdvanced,
} = require('./duel-ui-test-utils');

const findings=[];
const result=(section,ok,detail)=>findings.push({section,ok,detail});
const viewports=[
  {name:'mobile',width:375,height:667},
  {name:'tablet',width:820,height:1180},
  {name:'desktop',width:1366,height:768},
];

async function main(){
  for(const viewport of viewports){
    const harness=await createDuelPage({width:viewport.width,height:viewport.height});
      const {page}=harness;
    try{
      await setupDuelToAdvanced(page,{type:'free',operations:[OP_SUM,OP_MUL],opponent:'Rival visual'});
      await page.waitForTimeout(300);
      const metrics=await page.evaluate(()=>{
        const host=document.querySelector('#workspaceWizardHost');
        const panel=host?.querySelector('.workspace-dynamic-panel');
        const hostRect=host?.getBoundingClientRect();
        const visible=[...host.querySelectorAll('button,input')].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0;});
        const outside=visible.filter(node=>{const r=node.getBoundingClientRect();return r.left<hostRect.left-1||r.right>hostRect.right+1||r.top<hostRect.top-1||r.bottom>hostRect.bottom+1;});
        const viewportOutside=visible.filter(node=>{const r=node.getBoundingClientRect();return r.top<0||r.bottom>window.innerHeight+1;});
        return {
          hostWidth:hostRect?.width||0,
          scrollWidth:host?.scrollWidth||0,
          clientWidth:host?.clientWidth||0,
          panelWidth:panel?.getBoundingClientRect().width||0,
          outside:outside.map(node=>node.id||node.dataset.wizardAction||node.textContent.trim().slice(0,20)),
          viewportOutside:viewportOutside.map(node=>node.id||node.dataset.wizardAction||node.textContent.trim().slice(0,20)),
          opponentVisible:!!document.querySelector('#workspacePlayer2Name'),
          color2Count:document.querySelectorAll('[data-wizard-action="color2"]').length,
          overflow:document.documentElement.scrollWidth>window.innerWidth+1,
        };
      });
      result(`${viewport.name} · ancho`,metrics.scrollWidth<=metrics.clientWidth+1&&!metrics.overflow,`Sin desbordamiento: ${JSON.stringify(metrics)}`);
      result(`${viewport.name} · controles`,metrics.opponentVisible&&metrics.color2Count>0&&metrics.outside.length===0&&metrics.viewportOutside.length===0,`Controles del rival accesibles: ${JSON.stringify(metrics.viewportOutside)}`);
    }catch(error){result(`${viewport.name} · ejecución`,false,error.message);}
    finally{await closeDuelPage(harness);}
  }
  const failed=findings.filter(item=>!item.ok);
  console.log('\nINFORME — TEST VISUAL RESPONSIVE DE DUELO\n');
  findings.forEach(item=>console.log(`[${item.ok?'PASS':'FAIL'}] ${item.section}: ${item.detail}`));
  console.log(`\nResultado: ${failed.length?'FALLÓ':'APROBADO'} — ${findings.length-failed.length}/${findings.length} validaciones correctas.`);
  if(failed.length)process.exitCode=1;
}
main().catch(error=>{console.error('ERROR FATAL:',error.message||error);process.exitCode=1;});
