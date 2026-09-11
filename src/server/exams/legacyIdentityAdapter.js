'use strict';
const crypto=require('crypto');
const {isUuid}=require('./testValidation');
function isCanonicalUuid(value){return isUuid(value);}
function isLegacyPlayerId(value){return typeof value==='string'&&value.trim()!==''&&!isCanonicalUuid(value);}
function derivedUuid(publicId){const bytes=crypto.createHash('sha256').update(`math-attack:legacy-account:${publicId}`,'utf8').digest().subarray(0,16);bytes[6]=(bytes[6]&0x0f)|0x50;bytes[8]=(bytes[8]&0x3f)|0x80;const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
function buildLegacyIdentityMap(players,derive=derivedUuid){
  if(!Array.isArray(players))throw Error('players invalido');const byPublicId=new Map(),byName=new Map(),byAccountId=new Map();
  for(const player of players){if(!player||typeof player.id!=='string'||!player.id.trim())throw Error('playerId invalido');if(typeof player.name!=='string'||!player.name.trim())throw Error('nombre de jugador obligatorio');const publicId=player.id.trim(),name=player.name.trim().toLocaleLowerCase();if(byPublicId.has(publicId))throw Error('playerId duplicado');if(byName.has(name))throw Error('nombre ambiguo');const accountPlayerId=isCanonicalUuid(publicId)?publicId:derive(publicId);if(!isCanonicalUuid(accountPlayerId))throw Error('identidad interna invalida');if(byAccountId.has(accountPlayerId))throw Error('colision de identidad interna');const identity=Object.freeze({publicPlayerId:publicId,accountPlayerId,playerName:player.name});byPublicId.set(publicId,identity);byName.set(name,identity);byAccountId.set(accountPlayerId,identity);}
  return Object.freeze({byPublicId,byName,byAccountId});
}
function resolveLegacyIdentity(player,identityMap){if(!player||typeof player.id!=='string')throw Error('alumno inexistente');const identity=identityMap?.byPublicId?.get(player.id.trim());if(!identity)throw Error('alumno inexistente');if(identity.playerName!==player.name)throw Error('identidad inconsistente');return identity;}
function resolveAccountPlayerId(player,identityMap){return resolveLegacyIdentity(player,identityMap).accountPlayerId;}
function assertIdentityConsistency(player,accountPlayerId,identityMap){const identity=resolveLegacyIdentity(player,identityMap);if(identity.accountPlayerId!==accountPlayerId)throw Error('identidad inconsistente');return true;}
module.exports={isCanonicalUuid,isLegacyPlayerId,resolveAccountPlayerId,resolveLegacyIdentity,assertIdentityConsistency,buildLegacyIdentityMap};
