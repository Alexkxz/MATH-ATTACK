'use strict';
const { SCHEMA_VERSION,createRoot }=require('./testModel');
function migrate(raw){
  if(!raw||typeof raw!=='object') return createRoot();
  if(raw.schemaVersion===SCHEMA_VERSION&&Array.isArray(raw.tests)&&Array.isArray(raw.attempts)) return raw;
  const next=createRoot();
  ['tests','assignments','attempts','checkpoints','results','events'].forEach(key=>{if(Array.isArray(raw[key]))next[key]=raw[key];});
  return next;
}
module.exports={migrate};
