'use strict';
const { TEST_STATES, ATTEMPT_STATES } = require('./testStateMachine');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_METADATA=16_384, MAX_CHECKPOINT=262_144;
function isUuid(value){ return typeof value==='string'&&UUID.test(value); }
function assertUuid(value, field){ if(!isUuid(value)) throw new Error(`${field} debe ser UUID válido`); }
function assertIso(value, field, optional=false){ if((value===undefined||value===null||value==='')&&optional) return; if(typeof value!=='string'||Number.isNaN(Date.parse(value))) throw new Error(`${field} debe ser fecha ISO válida`); }
function assertRevision(value){ if(!Number.isInteger(value)||value<1) throw new Error('revision debe ser entero positivo'); }
function assertState(value, states, field){ if(!states.includes(value)) throw new Error(`${field} inválido`); }
function assertJsonSize(value, max, field){ if(Buffer.byteLength(JSON.stringify(value||{}),'utf8')>max) throw new Error(`${field} excede el límite`); }
function validateTest(test){ assertUuid(test.testId,'testId'); if(test.schemaVersion!==1) throw new Error('schemaVersion inválido'); if(typeof test.title!=='string'||!test.title.trim()) throw new Error('title obligatorio'); assertState(test.status,TEST_STATES,'status'); assertUuid(test.creator,'creator'); assertIso(test.createdAt,'createdAt'); assertIso(test.updatedAt,'updatedAt'); assertRevision(test.revision); return true; }
function validateAttempt(attempt){ assertUuid(attempt.attemptId,'attemptId');assertUuid(attempt.testId,'testId');assertUuid(attempt.accountPlayerId,'accountPlayerId');if(attempt.parentAttemptId)assertUuid(attempt.parentAttemptId,'parentAttemptId');assertState(attempt.status,ATTEMPT_STATES,'status');assertRevision(attempt.revision);assertIso(attempt.updatedAt,'updatedAt');return true; }
function validateCheckpoint(checkpoint){ assertUuid(checkpoint.checkpointId,'checkpointId');assertUuid(checkpoint.attemptId,'attemptId');if(!Number.isInteger(checkpoint.index)||checkpoint.index<0)throw new Error('index inválido');assertJsonSize(checkpoint,MAX_CHECKPOINT,'checkpoint');return true; }
module.exports={MAX_METADATA,MAX_CHECKPOINT,isUuid,assertUuid,assertIso,assertRevision,assertState,assertJsonSize,validateTest,validateAttempt,validateCheckpoint};
