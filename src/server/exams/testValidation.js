'use strict';
const { TEST_STATES, ATTEMPT_STATES } = require('./testStateMachine');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_METADATA=16_384, MAX_CHECKPOINT=262_144, TEST_CONFIG_VERSION=1;
const TEST_MULTIPLIER_MIN=1, TEST_MULTIPLIER_MAX=5;
const REWARD_AMOUNT_MAX=100000;
function isUuid(value){ return typeof value==='string'&&UUID.test(value); }
function validateTestRewards(rewards={}, {allowIncomplete=true}={}){
  if(rewards===undefined||rewards===null)return true;
  if(typeof rewards!=='object'||Array.isArray(rewards))throw new Error('configuration rewards invalida');
  const known=new Set(['aureos','experience','aureosTiers','streak','achievements']);
  Object.keys(rewards).forEach(key=>{if(!known.has(key))throw new Error('configuration reward field invalido');});
  for(const key of ['aureos','experience'])if(rewards[key]!==undefined&&(!Number.isInteger(rewards[key])||rewards[key]<0||rewards[key]>REWARD_AMOUNT_MAX))throw new Error(`configuration rewards.${key} invalido`);
  if(rewards.aureosTiers!==undefined){if(!Array.isArray(rewards.aureosTiers)||rewards.aureosTiers.length>20)throw new Error('configuration rewards.aureosTiers invalido');const tiers=rewards.aureosTiers;tiers.forEach(tier=>{if(!tier||typeof tier!=='object'||Array.isArray(tier)||!Number.isInteger(tier.minPercent)||!Number.isInteger(tier.maxPercent)||tier.minPercent<0||tier.maxPercent>100||tier.minPercent>tier.maxPercent||!Number.isInteger(tier.earned)||tier.earned<0||tier.earned>REWARD_AMOUNT_MAX||!Number.isInteger(tier.lost)||tier.lost<0||tier.lost>REWARD_AMOUNT_MAX)throw new Error('configuration rewards.aureosTiers invalido');if(Object.keys(tier).some(key=>!['minPercent','maxPercent','earned','lost'].includes(key)))throw new Error('configuration reward tier field invalido');});for(let i=0;i<tiers.length;i++)for(let j=i+1;j<tiers.length;j++)if(tiers[i].minPercent<=tiers[j].maxPercent&&tiers[j].minPercent<=tiers[i].maxPercent)throw new Error('configuration reward tiers overlap');}
  if(rewards.streak!==undefined){const rule=rewards.streak;if(!rule||typeof rule!=='object'||Array.isArray(rule))throw new Error('configuration streak invalida');Object.keys(rule).forEach(key=>{if(!['enabled','bonus'].includes(key))throw new Error('configuration streak field invalido');});if(rule.enabled!==undefined&&typeof rule.enabled!=='boolean')throw new Error('configuration streak.enabled invalido');if(rule.bonus!==undefined&&(!Number.isInteger(rule.bonus)||rule.bonus<0||rule.bonus>REWARD_AMOUNT_MAX))throw new Error('configuration streak.bonus invalido');}
  if(rewards.achievements!==undefined){if(!rewards.achievements||typeof rewards.achievements!=='object'||Array.isArray(rewards.achievements))throw new Error('configuration achievements invalida');Object.entries(rewards.achievements).forEach(([id,rule])=>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||!rule||typeof rule!=='object'||Array.isArray(rule))throw new Error('configuration achievement invalido');Object.keys(rule).forEach(key=>{if(!['enabled','bonus'].includes(key))throw new Error('configuration achievement field invalido');});if(rule.enabled!==undefined&&typeof rule.enabled!=='boolean')throw new Error('configuration achievement.enabled invalido');if(rule.bonus!==undefined&&(!Number.isInteger(rule.bonus)||rule.bonus<0||rule.bonus>REWARD_AMOUNT_MAX))throw new Error('configuration achievement.bonus invalido');});}
  return true;
}
function validateTestConfiguration(configuration={}, {allowIncomplete=false}={}){
  if(!configuration||typeof configuration!=='object'||Array.isArray(configuration)) throw new Error('configuration invalida');
  const version=configuration.version??configuration.configurationVersion??TEST_CONFIG_VERSION;
  if(!Number.isInteger(version)||version!==TEST_CONFIG_VERSION) throw new Error('configuration version invalida');
  if(!allowIncomplete&&configuration.title!==undefined&&(typeof configuration.title!=='string'||configuration.title.length>200)) throw new Error('configuration title invalido');
  if(configuration.description!==undefined&&(typeof configuration.description!=='string'||configuration.description.length>2000)) throw new Error('configuration description invalida');
  if(configuration.total!==undefined&&(!Number.isInteger(configuration.total)||configuration.total<1||configuration.total>100)) throw new Error('configuration total invalido');
  if(configuration.timeLimit!==undefined&&(!Number.isFinite(Number(configuration.timeLimit))||Number(configuration.timeLimit)<0||Number(configuration.timeLimit)>3600)) throw new Error('configuration timeLimit invalido');
  const multiplier=configuration.multiplier??1;
  if(!Number.isInteger(multiplier)||multiplier<TEST_MULTIPLIER_MIN||multiplier>TEST_MULTIPLIER_MAX) throw new Error('configuration multiplier invalido');
  if(configuration.order!==undefined&&!['ordered','random'].includes(configuration.order)) throw new Error('configuration order invalido');
  if(configuration.repeat!==undefined&&typeof configuration.repeat!=='boolean') throw new Error('configuration repeat invalido');
  validateTestRewards(configuration.rewards,{allowIncomplete});
  assertJsonSize(configuration,MAX_METADATA,'configuration');
  return true;
}
function assertUuid(value, field){ if(!isUuid(value)) throw new Error(`${field} debe ser UUID válido`); }
function assertIso(value, field, optional=false){ if((value===undefined||value===null||value==='')&&optional) return; if(typeof value!=='string'||Number.isNaN(Date.parse(value))) throw new Error(`${field} debe ser fecha ISO válida`); }
function assertRevision(value){ if(!Number.isInteger(value)||value<1) throw new Error('revision debe ser entero positivo'); }
function assertState(value, states, field){ if(!states.includes(value)) throw new Error(`${field} inválido`); }
function assertJsonSize(value, max, field){ if(Buffer.byteLength(JSON.stringify(value||{}),'utf8')>max) throw new Error(`${field} excede el límite`); }
function validateTest(test){ assertUuid(test.testId,'testId'); if(test.schemaVersion!==1) throw new Error('schemaVersion inválido'); if(typeof test.title!=='string'||!test.title.trim()) throw new Error('title obligatorio'); assertState(test.status,TEST_STATES,'status'); assertUuid(test.creator,'creator'); assertIso(test.createdAt,'createdAt'); assertIso(test.updatedAt,'updatedAt'); assertRevision(test.revision); return true; }
function validateAttempt(attempt){ assertUuid(attempt.attemptId,'attemptId');assertUuid(attempt.testId,'testId');assertUuid(attempt.accountPlayerId,'accountPlayerId');if(attempt.parentAttemptId)assertUuid(attempt.parentAttemptId,'parentAttemptId');assertState(attempt.status,ATTEMPT_STATES,'status');assertRevision(attempt.revision);assertIso(attempt.updatedAt,'updatedAt');return true; }
function validateCheckpoint(checkpoint){ assertUuid(checkpoint.checkpointId,'checkpointId');assertUuid(checkpoint.attemptId,'attemptId');if(!Number.isInteger(checkpoint.index)||checkpoint.index<0)throw new Error('index inválido');assertJsonSize(checkpoint,MAX_CHECKPOINT,'checkpoint');return true; }
module.exports={MAX_METADATA,MAX_CHECKPOINT,TEST_CONFIG_VERSION,TEST_MULTIPLIER_MIN,TEST_MULTIPLIER_MAX,isUuid,assertUuid,assertIso,assertRevision,assertState,assertJsonSize,validateTestRewards,validateTestConfiguration,validateTest,validateAttempt,validateCheckpoint};
