'use strict';

const fs=require('fs');
const os=require('os');
const path=require('path');
const net=require('net');
const {spawn}=require('child_process');
const {chromium}=require('playwright');
const {createRoot}=require('../src/server/exams/testModel');

const root=path.resolve(__dirname,'..');
const evidenceRoot=path.join(root,'evidence','pruebas-responsive-2026-10-22-v6');
const viewports=[['movil-360x800',360,800],['movil-390x844',390,844],['tableta-768x1024',768,1024],['computadora-1366x768',1366,768],['amplia-1920x1080',1920,1080]];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
async function waitReady(base){for(let i=0;i<80;i++){try{if((await fetch(`${base}/api/ranking`)).ok)return;}catch(_){}await sleep(100);}throw Error('El servidor de pruebas no inició.');}
async function loginStudent(page,base){await page.goto(`${base}/math-attack.html`,{waitUntil:'domcontentloaded'});await page.fill('#loginNameInput','Alumno Visual');await page.locator('#loginPinDigits .login-pin-digit').evaluateAll((inputs,pin)=>inputs.forEach((input,i)=>{input.value=pin[i];input.dispatchEvent(new Event('input',{bubbles:true}));}),'1234');await page.locator('.login-btn-main').click();await page.waitForSelector('#step1Screen.active',{timeout:12000});}
async function metrics(page){return page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,horizontallyScrollableControls:[...document.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el);return s.overflowX==='auto'&&el.scrollWidth>el.clientWidth+1;}).map(el=>({tag:el.tagName,className:String(el.className).slice(0,100),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth})).slice(0,8),offscreen:[...document.querySelectorAll('button,input,select,textarea,[role=alert]')].filter(el=>{const r=el.getBoundingClientRect();if(!r.width||(r.left>=-1&&r.right<=innerWidth+1))return false;return !el.closest('*')||!([...document.querySelectorAll('*')].some(parent=>parent.contains(el)&&getComputedStyle(parent).overflowX==='auto'&&parent.scrollWidth>parent.clientWidth+1));}).slice(0,12).map(el=>({tag:el.tagName,text:(el.innerText||el.getAttribute('aria-label')||el.placeholder||'').slice(0,60),left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right)}))}));}

(async()=>{
 if(fs.existsSync(evidenceRoot))throw Error(`La carpeta de evidencias ya existe; no se sobrescribe: ${evidenceRoot}`);
 fs.mkdirSync(evidenceRoot,{recursive:true});
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'math-attack-responsive-'));
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 const store=createRoot();fs.writeFileSync(path.join(dataDir,'pruebas.json'),JSON.stringify(store));
 fs.writeFileSync(path.join(dataDir,'players.json'),JSON.stringify([{id:'88888888-8888-4888-8888-888888888888',name:'Alumno Visual',pin:'1234',grade:'5A',aureos:0,experiencia:0}]));
 fs.writeFileSync(path.join(dataDir,'ranking.json'),'[]');fs.writeFileSync(path.join(dataDir,'groups.json'),JSON.stringify({schemaVersion:1,groups:[]}));
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),MATH_ATTACK_DATA_PATH:dataDir,MATH_ATTACK_TESTS_PATH:path.join(dataDir,'pruebas.json'),MATH_ATTACK_GROUPS_PATH:path.join(dataDir,'groups.json'),MATH_ATTACK_LOG_PATH:path.join(dataDir,'server.log')},stdio:['ignore','ignore','pipe'],windowsHide:true});
 const browser=await chromium.launch({headless:true});const report={createdAt:new Date().toISOString(),evidenceRoot,viewports:[],screenshots:[],browserErrors:[]};let teacherContext,studentContext;
 const capture=async(page,name,fullPage=false)=>{const file=path.join(evidenceRoot,`${String(report.screenshots.length+1).padStart(2,'0')}-${name}.png`);await page.screenshot({path:file,fullPage});report.screenshots.push({file:path.relative(root,file),state:name,metrics:await metrics(page)});};
 try{
  await waitReady(base);teacherContext=await browser.newContext({viewport:{width:1366,height:768}});const teacher=await teacherContext.newPage();teacher.on('pageerror',error=>report.browserErrors.push(error.message));
  await teacher.goto(`${base}/maestro`,{waitUntil:'domcontentloaded'});await teacher.getByPlaceholder('admin').fill('admin');await teacher.locator('input[type=password]').first().fill('admin');await teacher.getByRole('button',{name:/ENTRAR/i}).click();await teacher.getByRole('button',{name:'PRUEBAS'}).waitFor();await teacher.getByRole('button',{name:'PRUEBAS'}).click();await teacher.getByRole('button',{name:/Nueva prueba/i}).click();await teacher.locator('label').filter({hasText:'Nombre'}).locator('input').first().fill('Inspección responsive');await teacher.locator('label').filter({hasText:'Grado'}).locator('select').first().selectOption({label:'5A'});
  await teacher.keyboard.press('Tab');report.keyboardFocus=await teacher.evaluate(()=>({tag:document.activeElement?.tagName,text:(document.activeElement?.innerText||document.activeElement?.getAttribute('aria-label')||'').slice(0,60),focusVisible:document.activeElement?.matches(':focus-visible'),outline:getComputedStyle(document.activeElement).outlineStyle}));
  const cards=teacher.locator('div[class~="sm:grid-cols-2"] > section');const mult=cards.nth(0);await mult.locator('input[type=checkbox]').first().check();await mult.getByLabel('Cantidad de preguntas').fill('2');
  for(const [name,width,height] of viewports){await teacher.setViewportSize({width,height});await teacher.waitForTimeout(80);await capture(teacher,`${name}-sencilla`,true);report.viewports.push({name,width,height,metrics:await metrics(teacher)});}
  const add=cards.nth(1),div=cards.nth(3);await add.locator('input[type=checkbox]').first().check();await add.getByLabel('Cantidad de preguntas').fill('2');await div.locator('input[type=checkbox]').first().check();await div.getByLabel('Cantidad de preguntas').fill('2');
  await teacher.locator('label').filter({hasText:'Respuesta'}).locator('select').selectOption('write');await div.locator('label').filter({hasText:'Cifras del dividendo'}).locator('select').selectOption('2');
  await teacher.locator('summary').filter({hasText:'Avanzados'}).evaluateAll(nodes=>nodes.forEach(node=>node.click()));
  await mult.locator('label').filter({hasText:'Ampliación opcional'}).locator('select').selectOption('1000');
  await div.locator('label').filter({hasText:'Condición'}).locator('select').selectOption('remainder');
  await teacher.locator('label').filter({hasText:'Activar tiempo total'}).locator('input').check();
  await teacher.locator('label').filter({hasText:'Minutos totales'}).locator('input').fill('2');
  for(const [name,width,height] of viewports.slice(0,3)){await teacher.setViewportSize({width,height});await teacher.waitForTimeout(100);await capture(teacher,`${name}-avanzada-varias-operaciones`,true);}
  await teacher.locator('label').filter({hasText:'Forma de respuesta'}).locator('select').selectOption('options');await teacher.setViewportSize({width:390,height:844});await teacher.waitForTimeout(100);await capture(teacher,'390x844-error-division-residuo-opciones',true);
  await teacher.locator('label').filter({hasText:'Forma de respuesta'}).locator('select').selectOption('write');await teacher.setViewportSize({width:390,height:844});await capture(teacher,'390x844-configuracion-lista-resumen',true);
  await teacher.locator('label').filter({hasText:'Alumno Visual'}).locator('input[type=checkbox]').check();await teacher.getByRole('button',{name:'Guardar borrador'}).click();await teacher.getByText('Configuración y asignaciones guardadas.').waitFor({timeout:12000});
  await mult.locator('input[type=checkbox]').first().uncheck();await add.locator('input[type=checkbox]').first().uncheck();
  const studentTest=await browser.newContext({viewport:{width:1366,height:768}});studentContext=studentTest;const student=await studentTest.newPage();student.on('pageerror',error=>report.browserErrors.push(error.message));await loginStudent(student,base);await teacher.getByRole('button',{name:'Guardar e iniciar'}).click();await teacher.getByText('Prueba iniciada en el juego.').waitFor({timeout:12000});await student.waitForSelector('#examBannerStep1 .exam-apply-btn',{timeout:15000});await student.locator('#examBannerStep1 .exam-apply-btn').click();await student.waitForSelector('#gameScreen.active',{timeout:15000});
  if(!(await student.locator('#writeInput').getAttribute('placeholder'))?.startsWith('Cociente'))throw Error('La pregunta de división con residuo no está activa.');await student.evaluate(()=>window.scrollTo(0,0));
  for(const [name,width,height] of viewports){await student.setViewportSize({width,height});await student.evaluate(()=>window.scrollTo(0,0));await student.waitForTimeout(100);await capture(student,`${name}-alumno-barra-respuestas`,false);report.viewports.push({name,width,height,screen:'alumno',metrics:await metrics(student)});}
  report.browserErrors=[...new Set(report.browserErrors)];fs.writeFileSync(path.join(evidenceRoot,'visual-report.json'),JSON.stringify(report,null,2),'utf8');
  if(report.browserErrors.length)throw Error(`Errores de navegador: ${report.browserErrors.join('; ')}`);
  console.log(JSON.stringify({evidenceRoot,viewports:report.viewports.length,screenshots:report.screenshots.length,overflow:report.screenshots.filter(s=>s.metrics.horizontalOverflow).map(s=>s.state),offscreen:report.screenshots.filter(s=>s.metrics.offscreen.length).map(s=>({state:s.state,elements:s.metrics.offscreen})),browserErrors:report.browserErrors},null,2));
 }finally{await browser.close();if(child&&!child.killed)child.kill('SIGINT');await sleep(200);fs.rmSync(dataDir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
