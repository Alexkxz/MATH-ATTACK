'use strict';

const PLAYER_LEVELS = [
  { level:0,  name:'Novato',       minExperience:0     },
  { level:1,  name:'Explorador',   minExperience:100   },
  { level:2,  name:'Estudioso',    minExperience:250   },
  { level:3,  name:'Calculador',   minExperience:500   },
  { level:4,  name:'Resolvedor',   minExperience:1000  },
  { level:5,  name:'Matematico',   minExperience:1600  },
  { level:6,  name:'Analitico',    minExperience:2400  },
  { level:7,  name:'Estratega',    minExperience:3600  },
  { level:8,  name:'Genio',        minExperience:5200  },
  { level:9,  name:'Sabio',        minExperience:7500  },
  { level:10, name:'Gran Maestro', minExperience:10000 },
];

const GAME_EXPERIENCE_MULT = 3;

function getPlayerExperience(player){
  return Math.max(0, Math.round(Number(player?.experiencia ?? player?.experience ?? player?.xp ?? player?.aureos ?? 0))||0);
}

function ensurePlayerExperience(player){
  const xp=getPlayerExperience(player);
  if(player) player.experiencia=xp;
  return xp;
}

function getPlayerLevel(experience){
  const xp=Math.max(0, Math.round(Number(experience))||0);
  let lvl=PLAYER_LEVELS[0];
  for(const l of PLAYER_LEVELS){ if(xp>=l.minExperience) lvl=l; else break; }
  return lvl;
}

module.exports = {
  PLAYER_LEVELS,
  GAME_EXPERIENCE_MULT,
  getPlayerExperience,
  ensurePlayerExperience,
  getPlayerLevel,
};
