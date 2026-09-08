'use strict';

const assert = require('assert');
const {
  normalizePlayerName,
  PLAYER_ID_GENERATION_ERROR,
  MAX_PLAYER_ID_ATTEMPTS,
  findPlayerById,
  findPlayerIndexById,
  findPlayerByName,
  resolveCanonicalPlayer,
  indexPlayersByName,
  validatePlayerRegistration,
  generatePlayerId,
  createInitialPlayer,
  preparePlayerRegistration,
  authenticatePlayer,
  buildPlayerProfile,
  normalizeAdminPin,
  updatePlayerPin,
  updatePlayerGrade,
  updatePlayerThemeColor,
  updatePlayerAvatar,
  addPlayerInventoryItem,
  setPlayerInventoryQuantity,
  consumePlayerInventoryItem,
  ensurePlayerCosmetics,
  unlockPlayerCosmetic,
} = require('../src/game/players');

const players=[
  {id:'id-a',name:'Ana',pin:'1234',grade:'3A',aureos:25,experiencia:40},
  {id:'id-b',name:'Beto',pin:'5678',grade:'4B'},
  {id:'id-c',name:'ANA',pin:'9999',grade:'5C'},
];

// Identidad: búsquedas, casos inexistentes, duplicados y coincidencia canónica ID + nombre.
assert.strictEqual(normalizePlayerName('ÁLVARO'),'álvaro');
assert.strictEqual(findPlayerById(players,'id-b'),players[1]);
assert.strictEqual(findPlayerIndexById(players,'id-b'),1);
assert.strictEqual(findPlayerById(players,'missing'),undefined);
assert.strictEqual(findPlayerIndexById(players,'missing'),-1);
const legacyWithoutId={name:'Sin ID',pin:'1111'};
assert.strictEqual(findPlayerById([legacyWithoutId],undefined),undefined);
assert.strictEqual(findPlayerById([legacyWithoutId],null),undefined);
assert.strictEqual(findPlayerById([legacyWithoutId],''),undefined);
assert.strictEqual(findPlayerIndexById([legacyWithoutId],undefined),-1);
assert.strictEqual(findPlayerByName(players,'ana'),players[0],'un nombre duplicado conserva la primera coincidencia');
assert.strictEqual(findPlayerByName(players,'nadie'),undefined);
assert.strictEqual(resolveCanonicalPlayer(players,{id:'id-a',name:'ANA'}),players[0]);
assert.strictEqual(resolveCanonicalPlayer(players,{id:'id-a',name:'Beto'}),undefined,'el ID no debe ignorar un nombre discordante');
assert.strictEqual(resolveCanonicalPlayer(players,{id:'missing',name:'Ana'}),undefined,'un ID incorrecto no debe caer a nombre');
assert.strictEqual(resolveCanonicalPlayer(players,{id:'id-a'}),undefined,'solo ID no relaja la concordancia de nombre');
assert.strictEqual(resolveCanonicalPlayer(players,{name:'bEtO'}),players[1]);
assert.strictEqual(resolveCanonicalPlayer([legacyWithoutId],{name:'sin id'}),legacyWithoutId);
assert.strictEqual(resolveCanonicalPlayer([legacyWithoutId],{}),undefined);
assert.strictEqual(indexPlayersByName(players).get('ana'),players[2],'el índice conserva la conducta Map existente para duplicados');

// Registro: validaciones y estructura inicial exacta, sin mutar entrada ni colección.
assert.deepStrictEqual(validatePlayerRegistration({name:'',pin:'1234'}),{ok:false,error:'Nombre y PIN de 4 dígitos requeridos'});
assert.deepStrictEqual(validatePlayerRegistration({name:'Ana',pin:''}),{ok:false,error:'Nombre y PIN de 4 dígitos requeridos'});
assert.deepStrictEqual(validatePlayerRegistration({name:'Ana',pin:'123'}),{ok:false,error:'Nombre y PIN de 4 dígitos requeridos'});
const registrationInput={name:'Clara',pin:1234,grade:'6A'};
const registrationSnapshot=structuredClone(registrationInput);
const playersSnapshot=structuredClone(players);
const created=createInitialPlayer(registrationInput,{idGenerator:()=> 'account-a'});
const generated=createInitialPlayer({name:'Real',pin:'4444'});
assert.strictEqual(typeof generated.id,'string');
assert.ok(generated.id.length>0,'un jugador nuevo debe recibir un ID no vacio');
assert.deepStrictEqual(created,{
  id:'account-a',name:'Clara',pin:'1234',grade:'6A',aureos:0,experiencia:0,
  inventory:{},achievements:[],gamesPlayed:0,themeColor:'',
  dailyStreak:{current:0,best:0,lastDate:''},tableHistory:{},
});
const prepared=preparePlayerRegistration(players,registrationInput,{idGenerator:()=> 'account-a'});
assert.strictEqual(prepared.ok,true);
assert.deepStrictEqual(prepared.player,created);
assert.deepStrictEqual(registrationInput,registrationSnapshot,'preparar registro no debe mutar la entrada');
assert.deepStrictEqual(players,playersSnapshot,'preparar registro no debe mutar la colección');
assert.deepStrictEqual(preparePlayerRegistration(players,{name:'aNa',pin:'0001'}),{ok:false,error:'Jugador ya existe'});
assert.strictEqual(preparePlayerRegistration(players,{name:'Nueva',pin:'abcd'}).ok,true,'registro conserva PIN de cuatro caracteres sin exigir dígitos');
assert.notStrictEqual(
  createInitialPlayer({name:'Uno',pin:'0001'},{idGenerator:()=> 'account-one'}).id,
  createInitialPlayer({name:'Dos',pin:'0002'},{idGenerator:()=> 'account-two'}).id,
  'altas bajo la misma condición temporal no deben depender del timestamp',
);

// Login: comparación actual, errores y compatibilidad con perfiles legados.
assert.strictEqual(authenticatePlayer(players,'aNA',1234),players[0]);
assert.strictEqual(authenticatePlayer(players,'Ana','0000'),undefined);
assert.strictEqual(authenticatePlayer(players,'Nadie','1234'),undefined);
assert.throws(()=>authenticatePlayer(players,undefined,'1234'),TypeError,'un nombre faltante conserva el error capturado por HTTP');
let collisionIds=['id-a','fresh-id'];
const collision=preparePlayerRegistration(players,{name:'Nueva',pin:'0001'},
  {idGenerator:()=>collisionIds.shift()});
assert.strictEqual(collision.ok,true,'una colisión debe reintentarse');
assert.strictEqual(collision.player.id,'fresh-id');
assert.strictEqual(players.some(player=>player.id===collision.player.id),false,'no debe crear duplicados');
let attempts=0;
const exhausted=preparePlayerRegistration(players,{name:'Agotada',pin:'0002'},
  {idGenerator:()=>{ attempts++; return 'id-a'; }});
assert.deepStrictEqual(exhausted,{ok:false,error:PLAYER_ID_GENERATION_ERROR});
assert.strictEqual(attempts,MAX_PLAYER_ID_ATTEMPTS,'las colisiones deben tener un límite');

const legacy={name:'Legado',pin:'1111',experience:73};
const timestampLegacy={id:(1700000000000).toString(36),name:'Timestamp',pin:'3333'};
assert.strictEqual(findPlayerById([timestampLegacy],timestampLegacy.id),timestampLegacy,'un ID historico tipo timestamp sigue resolviendose');
assert.strictEqual(authenticatePlayer([legacy],'legado',1111),legacy);
const legacySnapshot=structuredClone(legacy);
assert.deepStrictEqual(buildPlayerProfile(legacy),{
  id:undefined,name:'Legado',grade:'',aureos:0,experiencia:73,inventory:{},achievements:[],gamesPlayed:0,
  themeColor:'',avatar:{},cosmetics:{},dailyStreak:{current:0,best:0,lastDate:''},
  level:{level:0,name:'Novato',minExperience:0},
});
assert.deepStrictEqual(legacy,legacySnapshot,'la vista normalizada no debe mutar al jugador legado');
assert.strictEqual(findPlayerById([legacy],undefined),undefined,'un ID ausente no debe coincidir con un legado sin ID');
assert.strictEqual(resolveCanonicalPlayer([legacy],{name:'LEGADO'}),legacy,'el legado sin ID conserva el fallback por nombre');

// Perfil: mutaciones simples y estabilidad del ID al cambiar grado.
const profile={id:'stable-id',name:'Eva',pin:'2222'};
const goodPin=normalizeAdminPin(7);
assert.deepStrictEqual(goodPin,{ok:true,pin:'0007'});
assert.strictEqual(normalizeAdminPin('abcd').ok,false);
assert.strictEqual(normalizeAdminPin('12345').ok,false);
updatePlayerPin(profile,goodPin.pin);
assert.strictEqual(profile.pin,'0007');
updatePlayerGrade(profile,'6B');
assert.strictEqual(profile.grade,'6B');
assert.strictEqual(profile.id,'stable-id','cambiar grado no debe cambiar el ID');
updatePlayerThemeColor(profile,'blue');
updatePlayerAvatar(profile,{hair:'afro'});
assert.strictEqual(profile.themeColor,'blue');
assert.deepStrictEqual(profile.avatar,{hair:'afro'});
addPlayerInventoryItem(profile,'shield');
addPlayerInventoryItem(profile,'shield');
assert.strictEqual(profile.inventory.shield,2);
assert.strictEqual(setPlayerInventoryQuantity(profile,'freeze',2.6),3);
assert.strictEqual(profile.inventory.freeze,3);
assert.strictEqual(setPlayerInventoryQuantity(profile,'freeze',0),0);
assert.strictEqual(profile.inventory.freeze,undefined);
assert.strictEqual(consumePlayerInventoryItem(profile,'shield').ok,true);
assert.strictEqual(profile.inventory.shield,1);
assert.strictEqual(consumePlayerInventoryItem(profile,'missing').ok,false);
ensurePlayerCosmetics(profile);
unlockPlayerCosmetic(profile,'crown');
assert.strictEqual(profile.cosmetics.crown,true);

console.log('OK: jugadores conserva identidad, registro, login, fallbacks legados y mutaciones simples con datos sintéticos.');
