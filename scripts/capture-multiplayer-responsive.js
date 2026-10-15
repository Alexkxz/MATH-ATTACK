'use strict';

const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const {silenceTestAudio}=require('./test-browser-audio');

const outputDir=path.resolve(__dirname,'..','artifacts','multiplayer-responsive');
const baseUrl=process.env.MATH_ATTACK_URL||'http://127.0.0.1:8080';
const viewports=[
  {label:'movil',width:375,height:667},
  {label:'tablet',width:820,height:1180},
];
const modes=[
  {id:'race',label:'carrera',players:4},
  {id:'rounds',label:'rondas',players:4},
  {id:'steal',label:'robo',players:4},
  {id:'apuestas',label:'apuestas',players:4},
  {id:'bomb',label:'bomba',players:2},
  {id:'survival',label:'supervivencia',players:2},
];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function openAgent(browser,baseUrl,name,inventory={}){
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});
  await page.goto(`${baseUrl}/math-attack.html`,{waitUntil:'domcontentloaded'});
  await silenceTestAudio(page);
  await page.evaluate(({playerName,testInventory})=>{
    // Perfil local efímero: ejercita el lector y renderizador reales sin usar una cuenta ni poderes de servidor.
    currentPlayer={id:null,name:playerName,aureos:0,inventory:testInventory};
    localStorage.setItem('mathattack_player',JSON.stringify(currentPlayer));
    _entrarAlJuego(playerName);
  },{playerName:name,testInventory:inventory});
  await page.locator('#workspaceSidebar .workspace-nav-item[onclick*="selectWorkspaceMode(this,\'online\')"]').click();
  await page.waitForFunction(()=>document.querySelector('#lanLobby')?.classList.contains('visible'),null,{timeout:10000});
  return page;
}

async function captureScenario(browser,baseUrl,viewport,mode,index){
  const pages=[];
  let phase='abrir agentes';
  try{
    for(let i=0;i<mode.players;i++) pages.push(await openAgent(browser,baseUrl,`Vista-${viewport.label}-${mode.label}-${i+1}`,
      i===0?{shield:2,freeze:1,doublepts:1}:{}));
    const host=pages[0];
    await host.evaluate(()=>lanCreateRoom());
    phase='crear sala';
    await host.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:6000});
    const roomId=await host.evaluate(()=>lanRoomId);
    if(mode.players===4){await host.locator('#lanHosting .mp-maxp-btn[data-maxp="4"]').click();await wait(120);}
    for(const page of pages.slice(1)){
      await page.evaluate(id=>lanJoinRoom(id),roomId);
      await page.waitForFunction(()=>Boolean(lanRoomId),null,{timeout:6000});
    }
    await host.waitForFunction(()=>mpPlayers.length===mpPlayerCount,null,{timeout:6000});
    await host.evaluate(()=>lanStartRoom());
    phase='esperar selección modalidad';
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#mpModeSelect')?.classList.contains('visible'),null,{timeout:6000})));
    await host.locator(`.mp-mode-btn[data-mpmode="${mode.id}"]`).click();
    await host.locator('#mpStartModeBtn').click();
    phase='pasar a configuración';
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3Screen')?.classList.contains('active'),null,{timeout:6000})));
    await host.evaluate(()=>goS3aToS3bMP());
    phase='avanzar configuración';
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#step3bScreen')?.classList.contains('active'),null,{timeout:6000})));
    await host.evaluate(()=>mpLaunchGame());
    phase='esperar pantalla de juego';
    await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('#gameScreen')?.classList.contains('active'),null,{timeout:10000})));
    await host.setViewportSize({width:viewport.width,height:viewport.height});
    await wait(450);
    const layout=await host.evaluate(()=>({
      viewport:{width:innerWidth,height:innerHeight},
      wrapClass:$('gameWrap').className,
      doc:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
      shell:(()=>{const r=$('gameWrap').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})(),
      regions:Object.fromEntries(['.game-header','#duelScoresEl','#gameModeRail','.timer-shell','#questionCard','#optionsGrid','#feedbackEl','#miniTablesEl'].map(selector=>{const el=document.querySelector(selector),r=el?.getBoundingClientRect();return [selector,r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height}:null]})),
      railChildren:[...$('gameModeRail').children].map(el=>{const r=el.getBoundingClientRect();return {id:el.id||el.className,display:getComputedStyle(el).display,position:getComputedStyle(el).position,y:r.y,bottom:r.bottom,height:r.height}}),
      directChildren:[...$('gameWrap').children].map(el=>{const r=el.getBoundingClientRect();return {id:el.id||el.className,order:getComputedStyle(el).order,flexShrink:getComputedStyle(el).flexShrink,y:r.y,bottom:r.bottom,height:r.height}}),
      answers:[...document.querySelectorAll('#optionsGrid .opt-btn')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}),
      powers:!!$('powerDock')?.classList.contains('has-powers'),
      scoresClass:$('duelScoresEl').className,
      scoresGrid:getComputedStyle($('duelScoresEl')).gridTemplateColumns,
    }));
    const name=`${viewport.label}${viewport.suffix?`-${viewport.suffix}`:''}-${String(index+1).padStart(2,'0')}-${mode.label}-${mode.players}p.png`;
    await host.screenshot({path:path.join(outputDir,name),fullPage:false});
    if(layout.doc.width>layout.viewport.width+1) throw new Error(`Desbordamiento horizontal en ${viewport.width}px/${mode.label}: ${JSON.stringify(layout.doc)}`);
    console.log(`[CAPTURE] ${name} ${JSON.stringify(layout)}`);
    if(viewport.width<=620){
      await host.evaluate(()=>{const screen=$('gameScreen');screen.scrollTop=screen.scrollHeight;});
      await wait(180);
      await host.screenshot({path:path.join(outputDir,name.replace('.png','-desplazado.png')),fullPage:false});
      await host.evaluate(()=>{$('gameScreen').scrollTop=0;});
      {
        const powerScreenshot=`${viewport.label}${viewport.suffix?`-${viewport.suffix}`:''}-${mode.label}-${mode.players}p-poderes.png`;
        await host.screenshot({path:path.join(outputDir,powerScreenshot),fullPage:false});
        const mobilePowers=await host.evaluate(()=>({
          viewport:{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight},
          gameScreen:{clientHeight:$('gameScreen').clientHeight,scrollHeight:$('gameScreen').scrollHeight},
          dock:$('powerDock').getBoundingClientRect().toJSON(),question:$('questionCard').getBoundingClientRect().toJSON(),
          options:$('optionsGrid').getBoundingClientRect().toJSON(),progress:$('miniTablesEl').getBoundingClientRect().toJSON(),
          dockDirection:getComputedStyle($('powerDock')).flexDirection,
          titleColor:getComputedStyle(document.querySelector('#powerDock .power-dock-title')).color,
          powers:[...document.querySelectorAll('#powerPanel .power-btn')].map(button=>({id:button.dataset.powerId,name:button.querySelector('.power-btn-name')?.textContent,qty:button.querySelector('.power-btn-qty')?.textContent})),
        }));
        console.log(`[CAPTURE] ${powerScreenshot} ${JSON.stringify(mobilePowers)}`);
        if(mobilePowers.viewport.documentWidth>mobilePowers.viewport.width+1) throw new Error(`Hay desbordamiento horizontal en móvil: ${JSON.stringify(mobilePowers.viewport)}`);
        if(mobilePowers.dockDirection!=='column'||mobilePowers.titleColor==='rgb(0, 0, 0)') throw new Error(`El panel móvil no quedó apilado y legible: ${JSON.stringify(mobilePowers)}`);
        await host.evaluate(()=>{$('gameScreen').scrollTop=$('gameScreen').scrollHeight;});
        await wait(180);
        const mobileClosed=await host.evaluate(()=>({
          panelDisplay:getComputedStyle($('powerPanel')).display,
          questionWidth:$('questionCard').getBoundingClientRect().width,
          optionsWidth:$('optionsGrid').getBoundingClientRect().width,
          viewportWidth:document.documentElement.scrollWidth,
        }));
        await host.screenshot({path:path.join(outputDir,`${powerScreenshot.replace('.png','')}-cerrados.png`),fullPage:false});
        if(!await host.locator('#powerDockToggle').isVisible()||mobileClosed.panelDisplay!=='none') throw new Error(`El panel móvil no inicia plegado o falta la pestaña: ${JSON.stringify(mobileClosed)}`);
        await host.locator('#powerDockToggle').click();
        await wait(300);
        await host.screenshot({path:path.join(outputDir,`${powerScreenshot.replace('.png','')}-abiertos.png`),fullPage:false});
        const mobileOpen=await host.evaluate(()=>({
          open:$('powerDock').classList.contains('open'),panelDisplay:getComputedStyle($('powerPanel')).display,
          questionWidth:$('questionCard').getBoundingClientRect().width,optionsWidth:$('optionsGrid').getBoundingClientRect().width,
          viewportWidth:document.documentElement.scrollWidth,powers:document.querySelectorAll('#powerPanel .power-btn').length,
        }));
        if(!mobileOpen.open||mobileOpen.panelDisplay==='none'||mobileOpen.powers!==3) throw new Error(`No abrió correctamente el panel móvil: ${JSON.stringify(mobileOpen)}`);
        if(Math.abs(mobileOpen.questionWidth-mobileClosed.questionWidth)>1||Math.abs(mobileOpen.optionsWidth-mobileClosed.optionsWidth)>1) throw new Error(`El panel móvil alteró el ancho de operación o respuestas: ${JSON.stringify({mobileClosed,mobileOpen})}`);
        if(mobileOpen.viewportWidth>viewport.width+1) throw new Error(`El panel móvil causó desbordamiento horizontal: ${JSON.stringify(mobileOpen)}`);
        await host.locator('#powerDockToggle').click();
        await wait(300);
        const mobileReclosed=await host.evaluate(()=>({open:$('powerDock').classList.contains('open'),panelDisplay:getComputedStyle($('powerPanel')).display,expanded:$('powerDockToggle').getAttribute('aria-expanded')}));
        if(mobileReclosed.open||mobileReclosed.panelDisplay!=='none'||mobileReclosed.expanded!=='false') throw new Error(`No se pudo volver a plegar el panel móvil: ${JSON.stringify(mobileReclosed)}`);
      }
    }
    if(viewport.width>=621){
      const inventoryBefore=await host.evaluate(()=>({
        dockHasPowers:$('powerDock').classList.contains('has-powers'),
        panelVisible:$('powerPanel').classList.contains('visible'),
        powers:[...document.querySelectorAll('#powerPanel .power-btn')].map(button=>({id:button.dataset.powerId,name:button.querySelector('.power-btn-name')?.textContent,qty:button.querySelector('.power-btn-qty')?.textContent})),
        source:currentPlayer?.id===null?'perfil local aislado':'perfil no aislado',
      }));
      if(!inventoryBefore.dockHasPowers||!inventoryBefore.panelVisible||inventoryBefore.powers.length!==3) throw new Error(`El panel no renderizó los 3 poderes del inventario aislado: ${JSON.stringify(inventoryBefore)}`);
      if(inventoryBefore.powers.some(power=>!power.id||!power.name||!power.qty)) throw new Error(`Datos incompletos en botones de poder: ${JSON.stringify(inventoryBefore)}`);
      const tabletPrefix=`${viewport.label}${viewport.suffix?`-${viewport.suffix}`:''}-${mode.label}-${mode.players}p`;
      await host.screenshot({path:path.join(outputDir,`${tabletPrefix}-carrera-4p-poderes-cerrados.png`),fullPage:false});
      await host.locator('#powerDockToggle').click();
      await wait(500);
      await host.screenshot({path:path.join(outputDir,`${tabletPrefix}-carrera-4p-poderes-abiertos.png`),fullPage:false});
      const powersLayout=await host.evaluate(()=>({
        wrapClass:$('gameWrap').className,dockClass:$('powerDock').className,wrapDisplay:getComputedStyle($('gameWrap')).display,
        gridColumns:getComputedStyle($('gameWrap')).gridTemplateColumns,gridAreas:getComputedStyle($('gameWrap')).gridTemplateAreas,
        question:$('questionCard').getBoundingClientRect().toJSON(),options:$('optionsGrid').getBoundingClientRect().toJSON(),
        dockGridArea:getComputedStyle($('powerDock')).gridArea,dockPosition:getComputedStyle($('powerDock')).position,
        dockTransform:getComputedStyle($('powerDock')).transform,dock:$('powerDock').getBoundingClientRect().toJSON(),
        viewport:{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth},
        inventory: [...document.querySelectorAll('#powerPanel .power-btn')].map(button=>({id:button.dataset.powerId,name:button.querySelector('.power-btn-name')?.textContent,qty:button.querySelector('.power-btn-qty')?.textContent})),
      }));
      const q=powersLayout.question,opts=powersLayout.options,d=powersLayout.dock;
      if(!dockIsOpen(powersLayout.dockClass)) throw new Error(`El botón no abrió el panel: ${JSON.stringify(powersLayout)}`);
      if(q.right>d.left||opts.right>d.left) throw new Error(`El panel se encimó con la operación/respuestas: ${JSON.stringify(powersLayout)}`);
      if(powersLayout.viewport.documentWidth>powersLayout.viewport.width+1) throw new Error(`Hay desbordamiento horizontal en tablet: ${JSON.stringify(powersLayout.viewport)}`);
      console.log(`[CAPTURE] ${tabletPrefix}-carrera-4p-poderes-abiertos.png ${JSON.stringify(powersLayout)}`);
      const closeToggle=host.locator('#powerDockToggle');
      if(!await closeToggle.isVisible()) throw new Error('Defecto confirmado: al desplegar Poderes desaparece el único botón de cierre; el usuario no puede regresar a la vista completa desde la interfaz.');
      await closeToggle.click();
      await wait(500);
      const closed=await host.evaluate(()=>({open:$('powerDock').classList.contains('open'),hasPowers:$('powerDock').classList.contains('has-powers'),toggleExpanded:$('powerDockToggle').getAttribute('aria-expanded')}));
      if(closed.open||!closed.hasPowers||closed.toggleExpanded!=='false') throw new Error(`El botón no cerró el panel correctamente: ${JSON.stringify(closed)}`);
    }
    await host.evaluate(()=>onlineLeaveGame());
  }catch(error){throw new Error(`${viewport.label}/${mode.label}: ${phase} — ${error.message}`,{cause:error});}
  finally{await Promise.all(pages.map(page=>page.close().catch(()=>{})));}
}

function dockIsOpen(className){return className.split(/\s+/).includes('open');}

async function main(){
  fs.mkdirSync(outputDir,{recursive:true});
  const requestedSizes=(process.env.MATH_ATTACK_VIEWPORT_SIZES||'').split(',').map(value=>value.trim()).filter(Boolean);
  const selectedViewports=requestedSizes.length?requestedSizes.map(value=>{
    const match=value.match(/^(\d+)x(\d+)$/);
    if(!match) throw new Error(`Tamaño no válido: ${value}; usa ANCHOxALTO`);
    const width=Number(match[1]),height=Number(match[2]);
    return {label:width<=620?'movil':'tablet',suffix:`${width}x${height}`,width,height};
  }):viewports.filter(viewport=>!process.env.MATH_ATTACK_VIEWPORT||viewport.label===process.env.MATH_ATTACK_VIEWPORT);
  const selectedModes=modes.filter(mode=>!process.env.MATH_ATTACK_MODE||mode.id===process.env.MATH_ATTACK_MODE);
  const browser=await chromium.launch({headless:false});
  try{
    for(const viewport of selectedViewports){
      for(let i=0;i<selectedModes.length;i++) await captureScenario(browser,baseUrl,viewport,selectedModes[i],i);
    }
    console.log(`\nCapturas y mediciones: ${outputDir}`);
  }finally{
    await browser.close();
  }
}

main().catch(error=>{console.error('ERROR:',error.message||error);process.exitCode=1;});
