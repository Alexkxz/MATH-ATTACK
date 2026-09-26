'use strict';

/** Silencia únicamente una página Playwright usada por pruebas automatizadas. */
async function silenceTestAudio(page){
  await page.addInitScript(()=>{
    try{ localStorage.setItem('math-attack-background-music','off'); }catch(_){ }
  });
  await page.evaluate(()=>{
    if(typeof musicMuted!=='undefined') musicMuted=true;
    if(typeof sfxMuted!=='undefined') sfxMuted=true;
    if(typeof workspaceMusicState!=='undefined') workspaceMusicState.userDisabled=true;
    if(typeof workspaceMusicStop==='function') workspaceMusicStop();
    if(typeof stopBgMusic==='function') stopBgMusic();
  });
}

module.exports={silenceTestAudio};
