'use strict';

const { getPlayerExperience, getPlayerLevel } = require('./playerLevels');

const REGISTRATION_REQUIRED_ERROR = 'Nombre y PIN de 4 dígitos requeridos';
const PLAYER_EXISTS_ERROR = 'Jugador ya existe';

function normalizePlayerName(name){
  return name.toLowerCase();
}

function findPlayerById(players, id){
  return (Array.isArray(players)?players:[]).find(player=>player.id===id);
}

function findPlayerIndexById(players, id){
  return (Array.isArray(players)?players:[]).findIndex(player=>player.id===id);
}

function findPlayerByName(players, name){
  const normalizedName=normalizePlayerName(name);
  return (Array.isArray(players)?players:[])
    .find(player=>normalizePlayerName(player.name)===normalizedName);
}

// Cuando llega un ID, el nombre también debe coincidir. Esto conserva el criterio
// usado por checkpoints, save_result y coinrob: un ID válido no autoriza un nombre distinto.
function resolveCanonicalPlayer(players, { id, name }){
  if(!id) return findPlayerByName(players,name);
  const normalizedName=normalizePlayerName(name);
  return (Array.isArray(players)?players:[])
    .find(player=>player.id===id&&normalizePlayerName(player.name)===normalizedName);
}

function indexPlayersByName(players){
  return new Map((Array.isArray(players)?players:[])
    .map(player=>[normalizePlayerName(player.name||''),player]));
}

function validatePlayerRegistration({ name, pin }){
  if(!name||!pin||String(pin).length!==4){
    return { ok:false, error:REGISTRATION_REQUIRED_ERROR };
  }
  return { ok:true };
}

function createInitialPlayer({ name, pin, grade }, options={}){
  const now=options.now??Date.now();
  return {
    id:now.toString(36),
    name,
    pin:String(pin),
    grade:grade||'',
    aureos:0,
    experiencia:0,
    inventory:{},
    achievements:[],
    gamesPlayed:0,
    themeColor:'',
    dailyStreak:{current:0,best:0,lastDate:''},
    tableHistory:{},
  };
}

// Prepara el alta sin modificar el arreglo recibido; HTTP y persistencia siguen en server.js.
function preparePlayerRegistration(players, input, options={}){
  const validation=validatePlayerRegistration(input);
  if(!validation.ok) return validation;
  if(findPlayerByName(players,input.name)) return { ok:false, error:PLAYER_EXISTS_ERROR };
  return { ok:true, player:createInitialPlayer(input,options) };
}

function authenticatePlayer(players, name, pin){
  const normalizedName=normalizePlayerName(name);
  return (Array.isArray(players)?players:[]).find(player=>
    normalizePlayerName(player.name)===normalizedName&&player.pin===String(pin)
  );
}

// Vista derivada: completa fallbacks legados sin escribir sobre el jugador original.
function buildPlayerProfile(player){
  const experiencia=getPlayerExperience(player);
  return {
    id:player.id,
    name:player.name,
    grade:player.grade||'',
    aureos:player.aureos||0,
    experiencia,
    inventory:player.inventory||{},
    achievements:player.achievements||[],
    gamesPlayed:player.gamesPlayed||0,
    themeColor:player.themeColor||'',
    avatar:player.avatar||{},
    cosmetics:player.cosmetics||{},
    dailyStreak:player.dailyStreak||{current:0,best:0,lastDate:''},
    level:getPlayerLevel(experiencia),
  };
}

function normalizeAdminPin(pin){
  const value=String(pin).padStart(4,'0');
  return value.length===4&&!isNaN(Number(value))
    ? { ok:true, pin:value }
    : { ok:false, error:'PIN debe ser de 4 dígitos' };
}

function updatePlayerPin(player, pin){
  player.pin=pin;
  return player.pin;
}

function updatePlayerGrade(player, grade){
  player.grade=grade||'';
  return player.grade;
}

function updatePlayerThemeColor(player, color){
  player.themeColor=color||'';
  return player.themeColor;
}

function updatePlayerAvatar(player, avatar){
  player.avatar=avatar||{};
  return player.avatar;
}

function ensurePlayerInventory(player){
  if(!player.inventory) player.inventory={};
  return player.inventory;
}

function addPlayerInventoryItem(player, itemId){
  const inventory=ensurePlayerInventory(player);
  inventory[itemId]=(inventory[itemId]||0)+1;
  return inventory;
}

function setPlayerInventoryQuantity(player, itemId, quantity){
  const inventory=ensurePlayerInventory(player);
  const normalizedQuantity=Math.max(0,Math.round(Number(quantity))||0);
  if(normalizedQuantity===0) delete inventory[itemId];
  else inventory[itemId]=normalizedQuantity;
  return normalizedQuantity;
}

function consumePlayerInventoryItem(player, itemId){
  const inventory=ensurePlayerInventory(player);
  if((inventory[itemId]||0)<=0) return { ok:false, inventory };
  inventory[itemId]--;
  if(inventory[itemId]===0) delete inventory[itemId];
  return { ok:true, inventory };
}

function ensurePlayerCosmetics(player){
  if(!player.cosmetics) player.cosmetics={};
  return player.cosmetics;
}

function unlockPlayerCosmetic(player, itemId){
  const cosmetics=ensurePlayerCosmetics(player);
  cosmetics[itemId]=true;
  return cosmetics;
}

module.exports={
  REGISTRATION_REQUIRED_ERROR,
  PLAYER_EXISTS_ERROR,
  normalizePlayerName,
  findPlayerById,
  findPlayerIndexById,
  findPlayerByName,
  resolveCanonicalPlayer,
  indexPlayersByName,
  validatePlayerRegistration,
  createInitialPlayer,
  preparePlayerRegistration,
  authenticatePlayer,
  buildPlayerProfile,
  normalizeAdminPin,
  updatePlayerPin,
  updatePlayerGrade,
  updatePlayerThemeColor,
  updatePlayerAvatar,
  ensurePlayerInventory,
  addPlayerInventoryItem,
  setPlayerInventoryQuantity,
  consumePlayerInventoryItem,
  ensurePlayerCosmetics,
  unlockPlayerCosmetic,
};
