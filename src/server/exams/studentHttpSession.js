'use strict';
const crypto=require('crypto');
const {STUDENT_SESSION_TTL_MS}=require('./studentAuthContract');
const hash=value=>crypto.createHash('sha256').update(value).digest();
const opaqueToken=()=>crypto.randomBytes(32).toString('base64url');
function createStudentHttpSessionStore({ttlMs=STUDENT_SESSION_TTL_MS,maxSessionsPerStudent=2,now=()=>Date.now()}={}){
  const sessions=new Map();
  const tokenIndex=new Map();
  function tokenKey(token){return crypto.createHash('sha256').update(token).digest('hex');}
  function createStudentSession(accountPlayerId,{connectionId=null}={}){
    if(typeof accountPlayerId!=='string'||!accountPlayerId)throw Error('accountPlayerId obligatorio');
    cleanupExpiredStudentSessions();
    const active=[...sessions.values()].filter(s=>s.accountPlayerId===accountPlayerId&&!s.revokedAt&&s.expiresAt>now());
    while(active.length>=maxSessionsPerStudent){const oldest=active.shift();revokeStudentSessionById(oldest.sessionId);}
    const token=opaqueToken(),sessionId=crypto.randomUUID(),createdAt=now();
    const session={sessionId,accountPlayerId,tokenHash:hash(token),createdAt,expiresAt:createdAt+ttlMs,connectionId,revision:1,revokedAt:null};
    sessions.set(sessionId,session);tokenIndex.set(tokenKey(token),sessionId);
    return {token,session:{sessionId,accountPlayerId,createdAt,expiresAt:session.expiresAt,connectionId,revision:1}};
  }
  function lookup(token){if(typeof token!=='string'||token.length<20)return null;const id=tokenIndex.get(tokenKey(token));const s=id&&sessions.get(id);if(!s)return null;const candidate=hash(token);if(candidate.length!==s.tokenHash.length||!crypto.timingSafeEqual(candidate,s.tokenHash))return null;return s;}
  function validateStudentSession(token,{connectionId=null}={}){const s=lookup(token);if(!s)return {ok:false,code:'STUDENT_AUTH_REQUIRED'};if(s.revokedAt)return {ok:false,code:'STUDENT_SESSION_REVOKED'};if(s.expiresAt<=now())return {ok:false,code:'STUDENT_SESSION_EXPIRED'};if(connectionId&&s.connectionId&&s.connectionId!==connectionId)return {ok:false,code:'STUDENT_CONNECTION_UNBOUND'};return {ok:true,session:{sessionId:s.sessionId,accountPlayerId:s.accountPlayerId,expiresAt:s.expiresAt,connectionId:s.connectionId,revision:s.revision}};}
  function revokeStudentSessionById(sessionId){const s=sessions.get(sessionId);if(!s||s.revokedAt)return false;s.revokedAt=now();s.revision++;return true;}
  function revokeStudentSession(token){const s=lookup(token);return s?revokeStudentSessionById(s.sessionId):false;}
  function rotateStudentSession(token){const result=validateStudentSession(token);if(!result.ok)return result;const current=lookup(token);const next=createStudentSession(current.accountPlayerId,{connectionId:current.connectionId});revokeStudentSessionById(current.sessionId);return {ok:true,...next};}
  function cleanupExpiredStudentSessions(){let removed=0;for(const [id,s] of sessions){if(s.expiresAt<=now()){sessions.delete(id);tokenIndex.delete([...tokenIndex.entries()].find(([,value])=>value===id)?.[0]);removed++;}}return removed;}
  function bindStudentConnection(token,connectionId){if(typeof connectionId!=='string'||!connectionId)return {ok:false,code:'INVALID_CONNECTION'};const result=validateStudentSession(token);if(!result.ok)return result;const s=lookup(token);s.connectionId=connectionId;s.revision++;return validateStudentSession(token);}
  function unbindStudentConnection(token,connectionId){const result=validateStudentSession(token);if(!result.ok)return result;const s=lookup(token);if(connectionId&&s.connectionId!==connectionId)return {ok:false,code:'STUDENT_CONNECTION_UNBOUND'};s.connectionId=null;s.revision++;return {ok:true};}
  return {createStudentSession,validateStudentSession,revokeStudentSession,rotateStudentSession,cleanupExpiredStudentSessions,bindStudentConnection,unbindStudentConnection};
}
module.exports={createStudentHttpSessionStore};
