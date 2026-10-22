'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');

const html=fs.readFileSync(path.join(__dirname,'..','math-attack.html'),'utf8');
assert.match(html,/ansMode=\['options','write','voice'\]\.includes\(config\.answerMode\)\?config\.answerMode:'options'/);
assert.match(html,/optionsGrid.*style\.display=isOptions\?'grid':'none'/s);
assert.match(html,/writeArea\.style\.display=isOperationsGame\(\)\?'none':\(\(isWrite\|\|isVoice\)\?'flex':'none'\)/);

(async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'math-attack-exam-write-ui-'));
  const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
  const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),MATH_ATTACK_DATA_PATH:dataDir,MATH_ATTACK_TESTS_PATH:path.join(dataDir,'pruebas.json')},stdio:'ignore',windowsHide:true});
  let browser;
  try{
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    for(let index=0;index<50;index+=1){try{if((await fetch(`http://127.0.0.1:${port}/api/exam/status`)).ok)break;}catch(_){ }await new Promise(resolve=>setTimeout(resolve,100));}
    await page.goto(`http://127.0.0.1:${port}/math-attack.html`,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      document.getElementById('loginScreen')?.classList.remove('active');
      document.getElementById('step1Screen')?.classList.add('active');
      document.getElementById('step1Screen')?.querySelector('[data-mode="solo"]')?.click();
      window.handleExamStart({testId:'write-ui-test',startedAt:Date.now(),total:1,op:'mult',grade:'',answerMode:'write',tables:[2],questions:[{a:2,b:3,op:'×'}]});
    });
    await page.evaluate(()=>window.applyPrueba());
    await page.waitForFunction(()=>document.getElementById('gameScreen')?.classList.contains('active'),null,{timeout:10000});
    assert.equal(await page.locator('#optionsGrid').evaluate(el=>getComputedStyle(el).display),'none');
    assert.notEqual(await page.locator('#writeArea').evaluate(el=>getComputedStyle(el).display),'none');
    assert.equal(await page.locator('#writeInput').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log('OK UI: una prueba con answerMode=write muestra campo escrito y oculta opciones múltiples.');
  }finally{if(browser) await browser.close();child.kill('SIGINT');await new Promise(resolve=>setTimeout(resolve,150));fs.rmSync(dataDir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
