'use strict';

// Pure contract: intentionally not wired to HTTP or WebSocket production paths.
const STUDENT_SESSION_TTL_MS=15*60*1000;
function authorizeStudentSession(session,{now=Date.now(),accountPlayerId,connectionId}={}){
  if(!session||session.kind!=='student-authenticated')return {ok:false,code:'STUDENT_AUTH_REQUIRED'};
  if(!session.accountPlayerId||session.accountPlayerId!==accountPlayerId)return {ok:false,code:'STUDENT_IDENTITY_MISMATCH'};
  if(!Number.isFinite(session.expiresAt)||session.expiresAt<=now)return {ok:false,code:'STUDENT_SESSION_EXPIRED'};
  if(session.revokedAt)return {ok:false,code:'STUDENT_SESSION_REVOKED'};
  if(connectionId&&session.connectionIds&&!session.connectionIds.includes(connectionId))return {ok:false,code:'STUDENT_CONNECTION_UNBOUND'};
  return {ok:true,accountPlayerId:session.accountPlayerId};
}
function assessExistingWsIdentity({accountPlayerId,sessionId,connectionId,authenticatedAccountPlayerId}={}){
  if(!sessionId||!connectionId)return {ok:false,reason:'WS_SESSION_OR_CONNECTION_MISSING'};
  if(!authenticatedAccountPlayerId)return {ok:false,reason:'WS_ACCOUNT_NOT_AUTHENTICATED'};
  if(accountPlayerId!==authenticatedAccountPlayerId)return {ok:false,reason:'WS_ACCOUNT_MISMATCH'};
  return {ok:true};
}
module.exports={STUDENT_SESSION_TTL_MS,authorizeStudentSession,assessExistingWsIdentity};
