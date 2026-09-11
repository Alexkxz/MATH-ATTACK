'use strict';

const TEST_STATES = Object.freeze(['draft','scheduled','active','paused','closed','finished','cancelled']);
const ATTEMPT_STATES = Object.freeze(['pending','started','in_progress','paused','disconnected','reconnected','finished','incomplete','restarted','reopened','deleted']);
const TEST_TRANSITIONS = Object.freeze({
  draft:['scheduled','active','cancelled'], scheduled:['active','cancelled'],
  active:['paused','closed','finished'], paused:['active','closed'], closed:['finished'], finished:[], cancelled:[],
});
const ATTEMPT_TRANSITIONS = Object.freeze({
  pending:['started','deleted'], started:['in_progress','paused','deleted'], in_progress:['disconnected','paused','finished','incomplete','deleted'], paused:['in_progress','deleted'],
  disconnected:['reconnected','incomplete','deleted'], reconnected:['in_progress','finished','incomplete','deleted'],
  finished:['reopened','restarted','deleted'], incomplete:['reopened','restarted','deleted'], reopened:['in_progress','finished','incomplete','deleted'], restarted:[], deleted:[],
});
function canTransition(kind, from, to){ const map=kind==='test'?TEST_TRANSITIONS:ATTEMPT_TRANSITIONS; return !!map[from]?.includes(to); }
function assertTransition(kind, from, to){ if(!canTransition(kind,from,to)) throw new Error(`Transición ${kind} inválida: ${from} → ${to}`); }
module.exports={TEST_STATES,ATTEMPT_STATES,TEST_TRANSITIONS,ATTEMPT_TRANSITIONS,canTransition,assertTransition};
