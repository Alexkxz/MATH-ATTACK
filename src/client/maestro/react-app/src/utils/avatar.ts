import { AvatarConfig } from '../types/maestro';

export const AVATAR_SKIN_COLORS: Record<string, string> = {
  light: '#FDDBB4',
  canela: '#F1C27D',
  miel: '#E0AC69',
  caramel: '#C68642',
  dark: '#8D5524',
  ebony: '#4A2912',
};

export const AVATAR_HAIR_COLORS: Record<string, string> = {
  black: '#1a1a2e',
  dbrown: '#3B1F0A',
  brown: '#6B3A2A',
  blonde: '#D4A847',
  red: '#C0392B',
  gray: '#888888',
  white: '#E0E0E0',
  blue: '#3B82F6',
  pink: '#EC4899',
  purple: '#8B5CF6',
  green: '#22C55E',
  orange: '#F97316',
  cyan: '#06B6D4',
  silver: '#C0C5CE',
};

export const AVATAR_EYE_COLORS: Record<string, string> = {
  brown: '#6B3A2A',
  blue: '#3B82F6',
  green: '#10B981',
  gray: '#6B7280',
  amber: '#F59E0B',
  violet: '#8B5CF6',
  hazel: '#9C7A3C',
  black: '#1a1a1a',
  turquoise: '#06B6D4',
  pink: '#EC4899',
  golden: '#D4AF37',
};

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function buildAvatarSVG(cfg?: AvatarConfig, size: number = 80): string {
  const av = {
    skin: 'canela',
    hairStyle: 'short',
    hairColor: 'black',
    eyeType: 'normal',
    eyeColor: 'brown',
    mouth: 'smile',
    accessory: 'none',
    ears: 'normal',
    nose: 'shadow',
    ...cfg,
  };

  const sk = AVATAR_SKIN_COLORS[av.skin] || '#F1C27D';
  const hc = AVATAR_HAIR_COLORS[av.hairColor] || '#1a1a2e';
  const ec = AVATAR_EYE_COLORS[av.eyeColor] || '#6B3A2A';
  const skd = shade(sk, -25);

  let hb = '';
  if (av.hairStyle === 'long') {
    hb = `<path d="M11,20 Q1,40 7,58 Q3,72 10,79 Q18,72 13,58 Q19,40 16,20 Z" fill="${hc}"/><path d="M69,20 Q79,40 73,58 Q77,72 70,79 Q62,72 67,58 Q61,40 64,20 Z" fill="${hc}"/>`;
  } else if (av.hairStyle === 'wavy') {
    hb = `<path d="M12,20 Q2,32 10,42 Q1,52 10,62 Q3,72 11,79 Q19,72 13,62 Q20,52 12,42 Q19,32 16,20 Z" fill="${hc}"/><path d="M68,20 Q78,32 70,42 Q79,52 70,62 Q77,72 69,79 Q61,72 67,62 Q60,52 68,42 Q61,32 64,20 Z" fill="${hc}"/>`;
  } else if (av.hairStyle === 'curly') {
    hb = `<circle cx="13" cy="35" r="11" fill="${hc}"/><circle cx="67" cy="35" r="11" fill="${hc}"/><circle cx="40" cy="13" r="15" fill="${hc}"/>`;
  } else if (av.hairStyle === 'afro') {
    hb = `<circle cx="40" cy="27" r="29" fill="${hc}"/>`;
  }

  let ears = `<ellipse cx="13" cy="46" rx="7" ry="9" fill="${sk}"/><ellipse cx="13" cy="46" rx="4" ry="5.5" fill="${skd}"/><ellipse cx="67" cy="46" rx="7" ry="9" fill="${sk}"/><ellipse cx="67" cy="46" rx="4" ry="5.5" fill="${skd}"/>`;
  if (av.ears === 'pointed') {
    ears = `<path d="M16,39 Q17,47 15,55 Q7,54 3,47 Q0,38 4,30 Q11,31 16,39Z" fill="${sk}"/><path d="M64,39 Q63,47 65,55 Q73,54 77,47 Q80,38 76,30 Q69,31 64,39Z" fill="${sk}"/>`;
  }

  let hf = `<path d="M13,48 Q13,14 40,12 Q67,14 67,48 Q55,27 40,21 Q25,27 13,48 Z" fill="${hc}"/>`;
  if (av.hairStyle === 'short') {
    hf += `<polygon points="26,18 21,7 31,17" fill="${hc}"/><polygon points="40,16 36,5 44,5 40,16" fill="${hc}"/><polygon points="54,18 49,17 59,7" fill="${hc}"/>`;
  } else if (av.hairStyle === 'spiky') {
    hf += `<polygon points="22,18 15,2 30,13" fill="${hc}"/><polygon points="35,14 30,0 44,2 40,14" fill="${hc}"/><polygon points="56,16 48,1 62,5 60,16" fill="${hc}"/>`;
  }

  const eye = (cx: number, cy: number) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="7.5" ry="7.5" fill="white"/><circle cx="${cx}" cy="${cy}" r="5" fill="${ec}"/><circle cx="${cx}" cy="${cy}" r="2.8" fill="#111"/><circle cx="${cx + 1.8}" cy="${cy - 1.8}" r="1.2" fill="white"/>`;

  let eyes = eye(29, 38) + eye(51, 38);
  if (av.eyeType === 'happy') {
    eyes = `<path d="M21,40 Q29,31 37,40" stroke="#333" fill="${sk}" stroke-width="2.5" stroke-linecap="round"/><path d="M43,40 Q51,31 59,40" stroke="#333" fill="${sk}" stroke-width="2.5" stroke-linecap="round"/>`;
  } else if (av.eyeType === 'stars') {
    eyes = `<text x="29" y="44" text-anchor="middle" font-size="14" fill="${ec}">★</text><text x="51" y="44" text-anchor="middle" font-size="14" fill="${ec}">★</text>`;
  }

  let mouth = `<path d="M30,57 Q40,64 50,57" stroke="${shade(sk, -40)}" fill="none" stroke-width="2.5" stroke-linecap="round"/>`;
  if (av.mouth === 'bigsmile') {
    mouth = `<path d="M28,55 Q40,69 52,55" fill="#CC6644"/><rect x="29" y="55" width="22" height="5" fill="white" rx="1"/><path d="M28,55 Q40,69 52,55" stroke="#AA4422" fill="none" stroke-width="1.5"/>`;
  } else if (av.mouth === 'surprised') {
    mouth = `<ellipse cx="40" cy="59" rx="5" ry="7" fill="#CC6644"/><ellipse cx="40" cy="60" rx="3" ry="5" fill="#111"/>`;
  }

  let acc = '';
  if (av.accessory === 'glasses') {
    acc = `<circle cx="29" cy="38" r="9" fill="rgba(0,229,255,0.15)" stroke="#00e5ff" stroke-width="2"/><circle cx="51" cy="38" r="9" fill="rgba(0,229,255,0.15)" stroke="#00e5ff" stroke-width="2"/><line x1="38" y1="38" x2="42" y2="38" stroke="#00e5ff" stroke-width="2"/>`;
  } else if (av.accessory === 'sunglasses') {
    acc = `<rect x="20" y="33" width="18" height="10" rx="3" fill="#090514" stroke="#ff007f" stroke-width="1.5"/><rect x="42" y="33" width="18" height="10" rx="3" fill="#090514" stroke="#ff007f" stroke-width="1.5"/><line x1="38" y1="38" x2="42" y2="38" stroke="#ff007f" stroke-width="2"/>`;
  } else if (av.accessory === 'crown') {
    acc = `<polygon points="18,14 22,4 28,12 36,1 44,12 50,4 54,14" fill="#fbbf24" stroke="#d97706" stroke-width="1"/><rect x="18" y="14" width="36" height="5" rx="1" fill="#fbbf24"/>`;
  } else if (av.accessory === 'halo') {
    acc = `<ellipse cx="40" cy="8" rx="18" ry="5" fill="none" stroke="#ffe600" stroke-width="3"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="${size}" height="${size}">
    ${hb}
    <ellipse cx="40" cy="46" rx="27" ry="30" fill="${sk}"/>
    ${ears}
    <path d="M21,29 Q29,25 37,29" stroke="${hc}" fill="none" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M43,29 Q51,25 59,29" stroke="${hc}" fill="none" stroke-width="2.5" stroke-linecap="round"/>
    ${eyes}
    <path d="M37,50 Q40,54 43,50" stroke="${skd}" fill="none" stroke-width="1.5" stroke-linecap="round"/>
    ${mouth}
    ${hf}
    ${acc}
  </svg>`;
}
