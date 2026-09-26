'use strict';

const net=require('node:net');
const {spawn}=require('node:child_process');

const root=process.cwd();
const port=Number(process.env.MATH_ATTACK_PORT||8080);
const url=process.env.MATH_ATTACK_URL||`http://127.0.0.1:${port}`;
const checks=[
  'check:multiplayer-review',
  'check:multiplayer-browser-modes',
  'check:multiplayer-simulated-games'
];

function isPortOpen(){
  return new Promise(resolve=>{
    const socket=net.createConnection({host:'127.0.0.1',port});
    const done=value=>{socket.destroy();resolve(value);};
    socket.once('connect',()=>done(true));
    socket.once('error',()=>done(false));
    socket.setTimeout(500,()=>done(false));
  });
}

async function waitForServer(timeoutMs=15000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    if(await isPortOpen()) return;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error(`El servidor no abrió el puerto ${port} dentro del tiempo esperado.`);
}

function runCheck(name){
  return new Promise((resolve,reject)=>{
    console.log(`\n[REGRESIÓN] Ejecutando ${name}`);
    const child=spawn(process.execPath,['scripts/check-'+name.replace(/^check:/,'')+'.js'],{
      cwd:root,
      env:{...process.env,MATH_ATTACK_URL:url},
      stdio:'inherit'
    });
    child.once('error',reject);
    child.once('exit',(code,signal)=>{
      if(code===0) resolve();
      else reject(new Error(`${name} terminó con código ${code??'nulo'}${signal?` (${signal})`:''}`));
    });
  });
}

async function main(){
  let server=null;
  const alreadyRunning=await isPortOpen();
  try{
    if(!alreadyRunning){
      server=spawn(process.execPath,['server.js'],{cwd:root,env:process.env,stdio:'inherit'});
      await waitForServer();
    }
    for(const check of checks) await runCheck(check);
    console.log('\nResultado: APROBADO — regresión multiplayer completa.');
  }finally{
    if(server&&!server.killed){
      server.kill('SIGTERM');
      setTimeout(()=>{if(!server.killed) server.kill('SIGKILL');},1500).unref();
    }
  }
}

main().catch(error=>{console.error(`\nResultado: FALLÓ — ${error.stack||error.message}`);process.exitCode=1;});
