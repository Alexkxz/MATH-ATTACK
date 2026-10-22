'use strict';

const assert=require('assert');
const {generateConfiguredQuestions,answerQuestion,validateMathConfiguration}=require('../src/server/exams/studentTestFlowService');
const mult=(limit,qty=1)=>({enabledOperations:['mult'],opsConfig:{mult:{qty,tables:[5],matrix:['2x5','6x5','7x5','8x5','10x5'],expansionLimit:limit}},answerMode:'write',repeat:false});
for(const [limit,pair,count] of [[10,[50,10],20],[100,[50,100],45],[1000,[500,8000],80]]){
 const questions=generateConfiguredQuestions(mult(limit,count));
 assert(questions.some(q=>q.a===pair[0]&&q.b===pair[1]),`falta ampliación ${limit}: ${pair.join('×')}`);
 if(limit===1000)assert(questions.some(q=>q.a===50&&q.b===700),'falta ampliación 50×700');
}
assert.throws(()=>generateConfiguredQuestions(mult(1,6)),/solo existen 5/);
const repeats=generateConfiguredQuestions({...mult(1,6),repeat:true});assert.strictEqual(repeats.length,6);

const divConfig=mode=>({enabledOperations:['div'],answerMode:'write',opsConfig:{div:{qty:20,divisorMode:'specific',divisors:[3,5],dividendDigits:2,remainderMode:mode}}});
const exact=generateConfiguredQuestions(divConfig('exact'));
assert(exact.every(q=>q.a>=10&&q.a<=99&&q.b!==0&&q.a%q.b===0&&q.remainder===0));
const residue=generateConfiguredQuestions(divConfig('remainder'));
assert(residue.every(q=>q.a>=10&&q.a<=99&&q.b!==0&&q.a%q.b!==0&&q.remainder===q.a%q.b));
const firstResidue=residue[0];assert.strictEqual(answerQuestion(firstResidue,String(firstResidue.answer)),false);
assert.strictEqual(answerQuestion(firstResidue,`${firstResidue.answer} r ${firstResidue.remainder}`),true);
assert.strictEqual(answerQuestion(firstResidue,`${firstResidue.answer} r ${firstResidue.remainder+1}`),false);
assert.throws(()=>validateMathConfiguration({...divConfig('mixed'),answerMode:'options'}),/opciones/i);
assert.throws(()=>generateConfiguredQuestions({...divConfig('exact'),opsConfig:{div:{qty:1,divisorMode:'specific',divisors:[99],dividendDigits:1,remainderMode:'exact'}}}),/no hay divisiones/);

const add={enabledOperations:['add'],opsConfig:{add:{qty:25,simpleDigits:false,digitsA:2,digitsB:3,carryMode:'carry'}},answerMode:'write'};
const hasCarry=(a,b)=>{while(a||b){if(a%10+b%10>=10)return true;a=Math.floor(a/10);b=Math.floor(b/10);}return false;};
assert(generateConfiguredQuestions(add).every(q=>q.a>=10&&q.a<=99&&q.b>=100&&q.b<=999&&hasCarry(q.a,q.b)));
const sub={enabledOperations:['sub'],opsConfig:{sub:{qty:25,simpleDigits:false,digitsA:3,digitsB:2,borrowMode:'borrow'}},answerMode:'write'};
assert(generateConfiguredQuestions(sub).every(q=>q.a>=100&&q.a<=999&&q.b>=10&&q.b<=99&&q.a>=q.b));

const blocks={enabledOperations:['add','sub'],operationOrder:['sub','add'],order:'ordered',opsConfig:{add:{qty:2,digits:1},sub:{qty:2,digits:1}}};
assert.deepStrictEqual(generateConfiguredQuestions(blocks).map(q=>q.op),['−','−','+','+']);
console.log('OK configuraciones matemáticas: ampliaciones, capacidad, división con residuo, cifras, llevadas, préstamos y orden.');
