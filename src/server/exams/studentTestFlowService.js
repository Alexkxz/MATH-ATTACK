'use strict';

const { randomUUID } = require('crypto');
const { multipliersForTable } = require('../../client/maestro/tableRanges');

const clone=value=>JSON.parse(JSON.stringify(value));
const OP_SYMBOLS={mult:'×',add:'+',sub:'−',div:'÷'};
const OPS=Object.keys(OP_SYMBOLS),MAX_QUESTIONS=100;
const int=(n,fallback)=>Number.isInteger(Number(n))?Number(n):fallback;
const rnd=(random,min,max)=>min+Math.floor(random()*(max-min+1));
const shuffle=(items,random)=>{const out=items.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
const digitRange=digits=>[digits===1?1:10**(digits-1),10**digits-1];
function selectedOperations(configuration){
 const cfg=configuration.opsConfig&&typeof configuration.opsConfig==='object'?configuration.opsConfig:{};
 if(!Object.keys(cfg).length){const fallback=Array.isArray(configuration.ops)&&configuration.ops.length?configuration.ops:[configuration.op||'mult'];return fallback.filter(op=>OPS.includes(op)).map(op=>[op,{...configuration,tables:configuration.tables||[1]}]);}
 const enabled=Array.isArray(configuration.enabledOperations)?configuration.enabledOperations:OPS.filter(op=>Object.prototype.hasOwnProperty.call(cfg,op));
 return enabled.filter((op,index)=>OPS.includes(op)&&enabled.indexOf(op)===index&&cfg[op]&&typeof cfg[op]==='object').map(op=>[op,cfg[op]]);
}
function operationQuantity(operation,cfg,legacy=false,totalFallback=1){
 if(operation==='mult'&&cfg.mode==='quick')return int(cfg.perTableQty,0)*(Array.isArray(cfg.tables)?new Set(cfg.tables).size:0);
 if(operation==='mult'&&cfg.mode==='exact')return Array.isArray(cfg.matrix)?new Set(cfg.matrix.map(String)).size:0;
 if(cfg.qty===undefined&&Array.isArray(cfg.matrix))return new Set(cfg.matrix.map(String)).size;
 const qty=int(cfg.qty,int(cfg.total,int(cfg.questionCount,totalFallback)));
 return Math.max(1,qty)*(legacy&&cfg.quantityMode!=='total'&&['mult','div'].includes(operation)?Math.max(1,(cfg.tables||[]).length):1);
}
function totalQuestionCount(configuration){return selectedOperations(configuration).reduce((sum,[op,cfg])=>sum+operationQuantity(op,cfg,!configuration.enabledOperations,configuration.total||1),0);}
function multiplicationVariants(table,from,to,limit){
 const maximum=Number(limit)||1,scales=[1,10,100,1000].filter(scale=>scale<=maximum),out=[];
 for(let factor=from;factor<=to;factor++)for(const scaleLeft of scales)for(const scaleRight of scales)out.push({a:table*scaleLeft,b:factor*scaleRight,answer:table*factor*scaleLeft*scaleRight,table:table*scaleLeft,baseTable:table,baseFactor:factor,scaleLeft,scaleRight});
 return out;
}

function validateMathConfiguration(configuration={}, {allowIncomplete=false}={}){
 const pairs=selectedOperations(configuration);if(!pairs.length){if(allowIncomplete)return true;throw Error('activa al menos una operación matemática');}
 const total=pairs.reduce((sum,[op,cfg])=>sum+operationQuantity(op,cfg,!configuration.enabledOperations,configuration.total||1),0);
 if(total<1||total>MAX_QUESTIONS)throw Error(`La cantidad activa debe estar entre 1 y ${MAX_QUESTIONS} preguntas.`);
 for(const [op,cfg] of pairs){
  const qty=operationQuantity(op,cfg,!configuration.enabledOperations);if(qty<1||qty>MAX_QUESTIONS)throw Error(`${OP_SYMBOLS[op]}: cantidad inválida.`);
  if(['mult','div'].includes(op)){
   if(op==='mult'&&cfg.mode!==undefined&&!['quick','exact'].includes(cfg.mode))throw Error('Multiplicacion: modo invalido.');
   if(op==='mult'&&cfg.mode==='quick'){
    const quickTables=cfg.tables??[],range=cfg.range;
    if(!Array.isArray(quickTables)||!quickTables.length||quickTables.some(t=>!Number.isInteger(t)||t<0||t>12)||new Set(quickTables).size!==quickTables.length)throw Error('Multiplicacion rapida: selecciona tablas unicas entre 0 y 12.');
    if(!Number.isInteger(cfg.perTableQty)||cfg.perTableQty<1||cfg.perTableQty>100)throw Error('Multiplicacion rapida: indica preguntas por tabla entre 1 y 100.');
    if(!range||!Number.isInteger(range.from)||!Number.isInteger(range.to)||range.from<0||range.to>12||range.from>range.to)throw Error('Multiplicacion rapida: el rango general debe estar entre 0 y 12 y Desde no puede superar Hasta.');
    if(!(configuration.repeat===true||cfg.repeat===true))for(const table of quickTables){const capacity=new Set(multiplicationVariants(table,range.from,range.to,cfg.expansionLimit).map(q=>keyFor('mult',q))).size;if(capacity<cfg.perTableQty)throw Error(`Multiplicacion rapida: la tabla ${table} solo tiene ${capacity} ejercicios distintos en el rango y ampliacion actuales; reduce preguntas por tabla o permite repeticiones.`);}
    if(cfg.quickTables!==undefined&&(!Array.isArray(cfg.quickTables)||cfg.quickTables.some(t=>!Number.isInteger(t)||t<0||t>12)||new Set(cfg.quickTables).size!==cfg.quickTables.length))throw Error('Multiplicacion rapida: seleccion guardada de tablas invalida.');
   }
   if(op==='mult'&&cfg.mode==='exact'){
    if(!Array.isArray(cfg.matrix)||!cfg.matrix.length)throw Error('Multiplicacion exacta: selecciona al menos una casilla de la matriz.');
    if(new Set(cfg.matrix.map(String)).size!==cfg.matrix.length)throw Error('Multiplicacion exacta: la matriz contiene casillas repetidas.');
    const columns=[...new Set(cfg.matrix.map(value=>Number(String(value).split('x')[1])))].sort((a,b)=>a-b),normalized=[...new Set(cfg.tables??[])].sort((a,b)=>a-b);
    if(columns.length!==normalized.length||columns.some((table,index)=>table!==normalized[index]))throw Error('Multiplicacion exacta: las tablas deben coincidir con las columnas seleccionadas.');
   }
   const tables=cfg.tables??[],minimum=op==='mult'?0:1;if(!Array.isArray(tables)||tables.some(t=>!Number.isInteger(t)||t<minimum||t>12))throw Error(`${OP_SYMBOLS[op]}: selecciona valores entre ${minimum} y 12.`);
   const extension=cfg.expansionLimit??1;if(op==='mult'&&![1,10,100,1000].includes(Number(extension)))throw Error('La ampliación de multiplicación debe ser ×1, ×10, ×100 o ×1000.');
   if(cfg.ranges!==undefined){if(!Array.isArray(cfg.ranges)||cfg.ranges.some(r=>!r||!Number.isInteger(r.table)||r.table<minimum||r.table>12||!Number.isInteger(r.from)||!Number.isInteger(r.to)||r.from<minimum||r.to>12||r.from>r.to))throw Error(`${OP_SYMBOLS[op]}: intervalo de factores inválido (1–12).`);}
   if(cfg.mode!=='quick'&&Array.isArray(cfg.matrix)&&cfg.matrix.some(value=>{const [factor,table]=String(value).split('x').map(Number);return !Number.isInteger(factor)||!Number.isInteger(table)||factor<minimum||factor>12||table<minimum||table>12||(tables.length&&!tables.includes(table));}))throw Error(`${OP_SYMBOLS[op]}: combinación avanzada fuera de la cuadrícula o de las tablas seleccionadas.`);
  }
  if(op==='div'){
   const mode=cfg.divisorMode||'specific';if(!['specific','digits'].includes(mode))throw Error('División: elige divisores concretos o por cifras.');
   const dividendDigits=int(cfg.dividendDigits,int(cfg.digits,2)),divisorDigits=int(cfg.divisorDigits,1);
   if(dividendDigits<1||dividendDigits>4||divisorDigits<1||divisorDigits>4)throw Error('División: las cifras deben estar entre 1 y 4.');
   if(mode==='specific'&&!(Array.isArray(cfg.divisors)&&cfg.divisors.length)&&!(Array.isArray(cfg.tables)&&cfg.tables.length))throw Error('División: selecciona al menos un divisor.');
   if(Array.isArray(cfg.divisors)&&cfg.divisors.some(d=>!Number.isInteger(d)||d<1||d>9999))throw Error('División: los divisores concretos deben ser de 1 a 9999.');
   if(!['exact','remainder','mixed'].includes(cfg.remainderMode||'exact'))throw Error('División: condición de residuo inválida.');
   if(configuration.answerMode==='voice'&&(cfg.remainderMode||'exact')!=='exact')throw Error('El modo Voz no admite divisiones con residuo; selecciona respuesta escrita o división exacta.');
   if(configuration.answerMode==='options'&&(cfg.remainderMode||'exact')!=='exact')throw Error('Las opciones actuales solo admiten divisiones exactas; selecciona respuesta escrita o división exacta.');
  }
  if(op==='add'||op==='sub'){
   const simple=cfg.simpleDigits!==false,digitsA=int(simple?cfg.digits:cfg.digitsA,int(cfg.digits,1)),digitsB=int(simple?cfg.digits:cfg.digitsB,int(cfg.digits,1));
   if(digitsA<1||digitsA>4||digitsB<1||digitsB>4)throw Error(`${OP_SYMBOLS[op]}: cada operando debe tener de 1 a 4 cifras.`);
   if(op==='add'&&!['direct','carry','both'].includes(cfg.carryMode||'both'))throw Error('Suma: modo de llevadas inválido.');
   if(op==='sub'&&!['direct','borrow','both'].includes(cfg.borrowMode||cfg.carryMode||'both'))throw Error('Resta: modo de préstamos inválido.');
   if(op==='sub'&&digitsA<digitsB)throw Error('Resta: el minuendo no puede tener menos cifras que el sustraendo si el resultado debe ser no negativo.');
   if(op==='sub'&&(cfg.borrowMode||cfg.carryMode)==='borrow'&&digitsA===1&&digitsB===1)throw Error('Resta de una cifra: no hay una combinación no negativa que requiera préstamo.');
  }
 }
 return true;
}

function addCarry(a,b){let carry=0;while(a||b){if(a%10+b%10>=10)return true;a=Math.floor(a/10);b=Math.floor(b/10);}return false;}
function subBorrow(a,b){let borrow=0,seen=false;while(a||b){const x=a%10-borrow,y=b%10;if(x<y){borrow=1;seen=true;}else borrow=0;a=Math.floor(a/10);b=Math.floor(b/10);}return seen;}
function randomDigits(digits,random){const out=[];for(let i=0;i<digits;i++)out.push(rnd(random,i===digits-1?1:0,9));return out;}
function numberFromDigits(digits){return digits.reduce((n,d,index)=>n+d*10**index,0);}
function makeArithmetic(op,cfg,random){
 const simple=cfg.simpleDigits!==false,dA=int(simple?cfg.digits:cfg.digitsA,int(cfg.digits,1)),dB=int(simple?cfg.digits:cfg.digitsB,int(cfg.digits,1));
  const aDigits=randomDigits(dA,random),bDigits=randomDigits(dB,random);let a=numberFromDigits(aDigits),b=numberFromDigits(bDigits);
 if(op==='add'){
  const mode=cfg.carryMode||'both';if(mode==='direct'){for(let i=0;i<Math.max(dA,dB);i++){const av=i<dA?Array.from({length:i===dA-1?9:10},(_,j)=>j+(i===dA-1?1:0)):[0],bv=i<dB?Array.from({length:i===dB-1?9:10},(_,j)=>j+(i===dB-1?1:0)):[0],valid=[];for(const x of av)for(const y of bv)if(x+y<=9)valid.push([x,y]);[aDigits[i],bDigits[i]]=valid[rnd(random,0,valid.length-1)];}a=numberFromDigits(aDigits);b=numberFromDigits(bDigits);}
  if(mode==='carry'&&!addCarry(a,b)){aDigits[0]=9;bDigits[0]=1;a=numberFromDigits(aDigits);b=numberFromDigits(bDigits);}
  return {a,b,answer:a+b};
 }
 const mode=cfg.borrowMode||cfg.carryMode||'both';
 if(mode==='direct'){
  for(let i=0;i<Math.max(dA,dB);i++){const x=aDigits[i]||0,y=bDigits[i]||0;if(x<y)aDigits[i]=y;}
  a=numberFromDigits(aDigits);b=numberFromDigits(bDigits);
 } else if(mode==='borrow'){
  aDigits[0]=0;bDigits[0]=1;
  if(dA===dB){aDigits[dA-1]=2;bDigits[dB-1]=1;}
  else if(dA>dB)aDigits[dA-1]=Math.max(1,aDigits[dA-1]);
  a=numberFromDigits(aDigits);b=numberFromDigits(bDigits);
 } else if(a<b)[a,b]=[b,a];
 return {a,b,answer:a-b};
}
function keyFor(op,q){return `${op}:${q.a}:${q.b}:${q.remainder??''}`;}
function uniqueTake(op,quantity,repeat,create,random,capacity){
 if(!repeat&&capacity<quantity)throw Error(`${OP_SYMBOLS[op]}: solo existen ${capacity} ejercicios distintos con esta configuración; reduce la cantidad o permite repetir.`);
 const out=[],seen=new Set(),attemptLimit=Math.max(1000,quantity*250);
 for(let i=0;i<attemptLimit&&out.length<quantity;i++){const candidate=create();const key=keyFor(op,candidate);if(repeat||!seen.has(key)){seen.add(key);out.push(candidate);}}
 if(out.length<quantity)throw Error(`${OP_SYMBOLS[op]}: no se pudieron elegir ${quantity} combinaciones distintas; revisa el rango.`);
 return out.map(q=>({...q,questionId:randomUUID(),op:OP_SYMBOLS[op]}));
}
function generateStructuredMultiplication(cfg,repeat,random){
 const exact=cfg.mode==='exact',tables=[...new Set(cfg.tables||[])],range=cfg.range||{from:1,to:12},maximum=Number(cfg.expansionLimit)||1;
 if(!exact&&!tables.length)throw Error('Multiplicacion rapida: selecciona al menos una tabla.');
 const bases=exact?[...new Set(cfg.matrix.map(String))].map(value=>value.split('x').map(Number)).map(([factor,table])=>({factor,table})):tables.flatMap(table=>Array.from({length:cfg.perTableQty},(_,slot)=>({table,slot})));
 let slots=bases.map(base=>{const variants=exact?multiplicationVariants(base.table,base.factor,base.factor,maximum):multiplicationVariants(base.table,range.from,range.to,maximum);const unique=[...new Map(variants.map(q=>[keyFor('mult',q),q])).values()];return {...base,candidates:shuffle(unique,random)};});
 if(cfg.manner!=='ordered')slots=shuffle(slots,random);
 let chosen;
 if(repeat)chosen=slots.map(slot=>slot.candidates[rnd(random,0,slot.candidates.length-1)]);
 else {
  const owner=new Map(),assigned=Array(slots.length);const place=(index,seen)=>{for(const candidate of slots[index].candidates){const key=keyFor('mult',candidate);if(seen.has(key))continue;seen.add(key);const previous=owner.get(key);if(previous===undefined||place(previous,seen)){owner.set(key,index);assigned[index]=candidate;return true;}}return false;};
  for(let i=0;i<slots.length;i++)if(!place(i,new Set()))throw Error(`Multiplicacion: no existe una combinacion sin repetir para las ${slots.length} preguntas seleccionadas; ajusta rango, tablas, cantidad o ampliacion.`);
  chosen=assigned;
 }
 let pairs=slots.map((slot,index)=>({slot,question:chosen[index]}));if(cfg.manner==='ordered')pairs.sort((a,b)=>(a.question.baseTable??a.slot.table)-(b.question.baseTable??b.slot.table)||(a.question.baseFactor??a.slot.factor??a.slot.slot)-(b.question.baseFactor??b.slot.factor??b.slot.slot)||a.question.scaleLeft-b.question.scaleLeft||a.question.scaleRight-b.question.scaleRight);else pairs=shuffle(pairs,random);
 return pairs.map(({question})=>({...question,questionId:randomUUID(),op:'×'}));
}
function generateMultiplication(cfg,quantity,repeat,random){
 if(cfg.mode==='quick'||cfg.mode==='exact')return generateStructuredMultiplication(cfg,repeat,random);
 const tables=[...new Set(cfg.tables||[])];if(!tables.length)throw Error('Multiplicación: selecciona al menos una tabla.');
 const exact=Array.isArray(cfg.matrix)?[...new Set(cfg.matrix.map(String))].map(v=>v.split('x').map(Number)):null;
 const ranges=Array.isArray(cfg.ranges)?cfg.ranges:tables.map(table=>({table,from:1,to:12}));
 const base=exact?exact.filter(([factor,table])=>tables.includes(table)&&factor>=0&&factor<=12):ranges.filter(r=>tables.includes(r.table)).flatMap(r=>Array.from({length:r.to-r.from+1},(_,i)=>[r.from+i,r.table]));
 if(!base.length)throw Error('Multiplicación: el rango y las tablas no contienen combinaciones.');
 const limit=Number(cfg.expansionLimit)||1,scales=[1,10,100,1000].filter(scale=>scale<=limit),candidates=[];
 for(const [factor,table] of base)for(const left of scales)for(const right of scales)candidates.push({a:table*left,b:factor*right,answer:table*left*factor*right,table:table*left,baseTable:table,baseFactor:factor,scaleLeft:left,scaleRight:right});
 const distinct=new Map(candidates.map(q=>[keyFor('mult',q),q]));const all=[...distinct.values()];if(!repeat&&all.length<quantity)throw Error(`Multiplicación: solo existen ${all.length} ejercicios distintos con estas tablas, rangos y ampliación.`);
 const ordered=(x,y)=>x.baseTable-y.baseTable||x.baseFactor-y.baseFactor||x.scaleLeft-y.scaleLeft||x.scaleRight-y.scaleRight;
 let chosen=repeat?(cfg.manner==='ordered'?Array.from({length:quantity},(_,i)=>all.slice().sort(ordered)[i%all.length]):Array.from({length:quantity},()=>all[rnd(random,0,all.length-1)])):shuffle(all,random).slice(0,quantity);
 if(cfg.manner==='ordered'&&!repeat)chosen.sort(ordered);
 return chosen.map(q=>({...q,questionId:randomUUID(),op:'×'}));
}
function divisionCapacity(divisors,min,max,mode){let exact=0,total=0;for(const d of divisors){if(d<1)continue;total+=max-min+1;exact+=Math.floor(max/d)-Math.floor((min-1)/d);}return mode==='exact'?exact:mode==='remainder'?total-exact:total;}
function generateDivision(cfg,quantity,repeat,random){
 const [minDividend,maxDividend]=digitRange(int(cfg.dividendDigits,int(cfg.digits,2)));
 let divisors;if(cfg.divisorMode==='digits'){const [min,max]=digitRange(int(cfg.divisorDigits,1));divisors=Array.from({length:max-min+1},(_,i)=>min+i);}else divisors=[...new Set(cfg.divisors||cfg.tables||[])];
 divisors=divisors.filter(d=>Number.isInteger(d)&&d>=1&&d<=maxDividend);const mode=cfg.remainderMode||'exact',capacity=divisionCapacity(divisors,minDividend,maxDividend,mode);
 if(!capacity)throw Error('División: no hay divisiones que cumplan las cifras, divisores y condición de residuo.');
 const exactCount=divisionCapacity(divisors,minDividend,maxDividend,'exact'),remainderCount=divisionCapacity(divisors,minDividend,maxDividend,'remainder');
 const create=()=>{let d,q,r=0;const pick=mode==='mixed'?(random()*(exactCount+remainderCount)<exactCount?'exact':'remainder'):mode;
  if(pick==='exact'){
   const valid=divisors.filter(x=>Math.floor(maxDividend/x)>=Math.ceil(minDividend/x));d=valid[rnd(random,0,valid.length-1)];const qmin=Math.ceil(minDividend/d),qmax=Math.floor(maxDividend/d);q=rnd(random,qmin,qmax);return {a:q*d,b:d,answer:q,remainder:0,table:d,divisor:d};
  }
  const valid=divisors.filter(x=>x>1);d=valid[rnd(random,0,valid.length-1)];let dividend=rnd(random,minDividend,maxDividend);if(dividend%d===0)dividend=dividend+1<=maxDividend?dividend+1:dividend-1;q=Math.floor(dividend/d);r=dividend%d;return {a:dividend,b:d,answer:q,remainder:r,table:d,divisor:d};
 };
 const questions=uniqueTake('div',quantity,repeat,create,random,repeat?quantity:capacity).map(q=>({...q,dividend:q.a,op:'÷'}));
 if(cfg.manner==='ordered')questions.sort((a,b)=>a.divisor-b.divisor||a.dividend-b.dividend);
 return questions;
}
function generateArithmeticOperation(op,cfg,quantity,repeat,random){
 const [amin,amax]=digitRange(int(cfg.simpleDigits===false?cfg.digitsA:cfg.digits,int(cfg.digits,1))),[bmin,bmax]=digitRange(int(cfg.simpleDigits===false?cfg.digitsB:cfg.digits,int(cfg.digits,1)));
 let capacity=Number.POSITIVE_INFINITY;
 if(op==='add'&&int(cfg.simpleDigits===false?cfg.digitsA:cfg.digits,int(cfg.digits,1))===1&&int(cfg.simpleDigits===false?cfg.digitsB:cfg.digits,int(cfg.digits,1))===1){const mode=cfg.carryMode||'both';capacity=mode==='direct'?36:mode==='carry'?45:81;}
 if(op==='sub'&&amin===1&&bmin===1){const mode=cfg.borrowMode||cfg.carryMode||'both';capacity=mode==='borrow'?0:45;}
 const mode=op==='add'?(cfg.carryMode||'both'):(cfg.borrowMode||cfg.carryMode||'both');if(capacity===0)throw Error('Resta de una cifra: no existen resultados no negativos con préstamo.');
 return uniqueTake(op,quantity,repeat,()=>makeArithmetic(op,cfg,random),random,capacity).map(q=>({...q,table:q.a,op:OP_SYMBOLS[op]}));
}
function generateConfiguredQuestions(configuration={},random=Math.random){
 validateMathConfiguration(configuration);const pairs=selectedOperations(configuration),repeat=configuration.repeat===true,byOperation=new Map();
 for(const [op,cfg] of pairs){const quantity=operationQuantity(op,cfg,!configuration.enabledOperations,configuration.total||1),allowRepeat=repeat||cfg.repeat===true;let rows;
  if(op==='mult')rows=generateMultiplication(cfg,quantity,allowRepeat,random);
  else if(op==='div')rows=generateDivision(cfg,quantity,allowRepeat,random);
  else rows=generateArithmeticOperation(op,cfg,quantity,allowRepeat,random);
  byOperation.set(op,rows);
 }
 let questions=[];const order=Array.isArray(configuration.operationOrder)?configuration.operationOrder:OPS;for(const op of order)if(byOperation.has(op))questions.push(...byOperation.get(op));for(const [op,rows] of byOperation)if(!order.includes(op))questions.push(...rows);
 if(configuration.order==='random')questions=shuffle(questions,random);return questions;
}
function publicQuestion(q){const view={questionId:q.questionId,op:q.op,a:q.a,b:q.b,text:`${q.a} ${q.op} ${q.b}`};if(q.table!==undefined)view.table=q.table;if(q.remainder!==undefined)view.remainder=q.remainder;return view;}
function publicQuestions(questions){return (questions||[]).map(publicQuestion);}
function scoreFor(correct,multiplier=1){return Math.max(0,correct)*Math.max(1,int(multiplier,1));}
function answerQuestion(question,answer){
 if(question.op==='÷'&&question.remainder!==undefined&&question.remainder>0){const match=String(answer??'').trim().match(/^(\d+)\s*(?:r|residuo|resto|,|\+)\s*(\d+)$/i);if(!match)return false;return Number(match[1])===question.answer&&Number(match[2])===question.remainder;}
 const numeric=typeof answer==='number'?answer:(typeof answer==='string'&&answer.trim()!==''?Number(answer):NaN);if(!Number.isFinite(numeric))throw Error('respuesta invalida');return numeric===question.answer;
}
module.exports={generateConfiguredQuestions,publicQuestion,publicQuestions,answerQuestion,scoreFor,clone,shuffle,validateMathConfiguration,totalQuestionCount,selectedOperations,MAX_QUESTIONS};
