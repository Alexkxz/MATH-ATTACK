'use strict';

const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const {silenceTestAudio}=require('./test-browser-audio');

const baseUrl=process.env.MATH_ATTACK_URL||'http://127.0.0.1:8080';
const outputDir=path.resolve(__dirname,'..','artifacts','multiplayer-gallery-v13');
const modes=[
  {id:'race',label:'carrera',players:4},
  {id:'rounds',label:'rondas',players:4},
  {id:'steal',label:'robo',players:4},
  {id:'apuestas',label:'apuestas',players:4},
  {id:'bomb',label:'bomba',players:2},
  {id:'survival',label:'supervivencia',players:2},
];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function openAgent(browser,name){
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});
  await page.goto(`${baseUrl}/math-attack.html`,{waitUntil:'domcontentloaded'});
  await silenceTestAudio(page);
  await page.evaluate(playerName=>_entrarAlJuego(playerName),name);
  await page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]').click();
  await page.waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:10000});
  return page;
}

async function captureMode(browser,mode,index){
  const pages=[];
  try{
    for(let i=0;i<mode.players;i++) pages.push(await openAgent(browser,`Galeria-${mode.label}-${i+1}`));
    const host=pages[0];
    await host.evaluate(()=>lanCreateRoom());
    await host.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:5000});
    const roomId=await host.evaluate(()=>lanRoomId);
    if(mode.players===4){
      await host.locator('#lanHosting .mp-maxp-btn[data-maxp="4"]').click();
      await wait(120);
    }
    for(const page of pages.slice(1)){
      await page.evaluate(id=>lanJoinRoom(id),roomId);
      await page.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:5000});
    }
    await host.waitForFunction(()=>mpPlayers.length===mpPlayerCount&&mpPlayers.length===Number(document.querySelector('.mp-maxp-btn.selected')?.dataset.maxp||mpPlayers.length),null,{timeout:5000});
    await host.evaluate(()=>lanStartRoom());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#mpModeSelect')?.classList.contains('visible'),null,{timeout:5000})));
    await host.locator(`.mp-mode-btn[data-mpmode="${mode.id}"]`).click();
    await host.locator('#mpStartModeBtn').click();
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3Screen')?.classList.contains('active'),null,{timeout:5000})));
    await host.evaluate(()=>goS3aToS3bMP());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3bScreen')?.classList.contains('active'),null,{timeout:5000})));
    await host.evaluate(()=>mpLaunchGame());
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#gameScreen')?.classList.contains('active'),null,{timeout:10000})));
    await wait(500);
    if(index===0){
      await host.evaluate(()=>{
        const dock=$('powerDock'),panel=$('powerPanel');
        dock?.classList.add('has-powers');
        if(panel){ panel.classList.add('visible'); panel.innerHTML='<button class="power-btn" type="button"><span class="power-btn-icon">🛡️</span><span><strong class="power-btn-name">Escudo</strong><small class="power-btn-meta">Protección disponible</small></span></button><button class="power-btn" type="button"><span class="power-btn-icon">❄️</span><span><strong class="power-btn-name">Congelar</strong><small class="power-btn-meta">Ralentiza el tiempo</small></span></button>'; }
      });
    }
    const file=path.join(outputDir,`${String(index+1).padStart(2,'0')}-${mode.label}-${mode.players}p.png`);
    await host.screenshot({path:file,fullPage:false});
    console.log(`[CAPTURE] ${file}`);
    if(index===0){
      await host.locator('#powerDockToggle').click();
      await wait(280);
      const openFile=path.join(outputDir,'01-carrera-4p-poderes-abiertos.png');
      await host.screenshot({path:openFile,fullPage:false});
      console.log(`[CAPTURE] ${openFile}`);
    }
    await host.evaluate(()=>onlineLeaveGame());
  }finally{
    await Promise.all(pages.map(page=>page.close().catch(()=>{})));
  }
}

async function main(){
  fs.mkdirSync(outputDir,{recursive:true});
  const browser=await chromium.launch({headless:false});
  try{
    for(let i=0;i<modes.length;i++) await captureMode(browser,modes[i],i);
    console.log(`\nGalería creada en: ${outputDir}`);
  }finally{await browser.close();}
}

main().catch(error=>{console.error('ERROR:',error.message||error);process.exitCode=1;});
