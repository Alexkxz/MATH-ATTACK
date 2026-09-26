'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
const npmCommand=process.platform==='win32'?'npm.cmd':'npm';
const reviews=[
  {role:'Agente funcional — protocolo LAN',script:'check:multiplayer-replay'},
  {role:'Agente visual — flujo de configuración',script:'check:multiplayer-flow-ui'},
  {role:'Agente regresión — WebSocket existente',script:'check:websocket-integration'},
];

function run(review){
  return new Promise(resolve=>{
    const child=spawn(npmCommand,['run',review.script],{cwd:root,windowsHide:true,shell:process.platform==='win32',env:process.env});
    let output='';
    child.stdout.on('data',chunk=>{output+=String(chunk);});
    child.stderr.on('data',chunk=>{output+=String(chunk);});
    child.on('close',code=>resolve({...review,code,output}));
    child.on('error',error=>resolve({...review,code:1,output:error.message}));
  });
}

async function main(){
  const results=await Promise.all(reviews.map(run));
  console.log('\nINFORME — REVISIÓN MULTIAGENTE DEL MULTIJUGADOR\n');
  results.forEach(result=>{
    const status=result.code===0?'APROBADO':'FALLÓ';
    console.log(`[${status}] ${result.role} · ${result.script}`);
    const lines=result.output.trim().split(/\r?\n/).filter(Boolean);
    lines.slice(-5).forEach(line=>console.log(`  ${line}`));
  });
  const failed=results.filter(result=>result.code!==0);
  console.log(`\nResultado consolidado: ${failed.length?'PENDIENTES':'APROBADO'} — ${results.length-failed.length}/${results.length} revisiones correctas.`);
  if(failed.length)process.exitCode=1;
}

main().catch(error=>{console.error('ERROR FATAL:',error.message||error);process.exitCode=1;});
