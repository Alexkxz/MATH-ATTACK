import { MathTest } from '../types/maestro';

export interface PowerDefinition {
  id: string;
  icon: string;
  name: string;
  color: string;
  desc: string;
}

export const POWERS_DEF: PowerDefinition[] = [
  { id: 'shield', icon: '🛡️', name: 'Escudo', color: '#60a5fa', desc: 'Protege contra 1 respuesta incorrecta' },
  { id: 'magnifier', icon: '🔍', name: 'Lupa', color: '#22d3ee', desc: 'Resalta pistas de la respuesta' },
  { id: 'extratime', icon: '⏱️', name: 'T.Extra', color: '#fbbf24', desc: '+15 segundos en el reloj' },
  { id: 'fifty', icon: '🎲', name: '50/50', color: '#f472b6', desc: 'Descarta 2 opciones incorrectas' },
  { id: 'secondchance', icon: '💚', name: '2a Oport', color: '#34d399', desc: 'Oportunidad de responder de nuevo' },
  { id: 'streaksafe', icon: '🔥', name: 'R.Segura', color: '#fb923c', desc: 'Evita perder racha con 1 fallo' },
  { id: 'doublepts', icon: '💯', name: 'Doble Pts', color: '#e879f9', desc: '2x puntos en los próximos 3 aciertos' },
  { id: 'skip', icon: '⏭️', name: 'Saltar', color: '#a78bfa', desc: 'Pasa a la siguiente pregunta' },
  { id: 'aureosmagnet', icon: '🧲', name: 'Im.Áureos', color: '#facc15', desc: 'Gana el doble de Áureos en la ronda' },
  { id: 'hint', icon: '🧩', name: 'Pista', color: '#38bdf8', desc: 'Muestra una pista matemática' },
  { id: 'freeze', icon: '🧊', name: 'Congelar', color: '#06b6d4', desc: 'Detiene el temporizador 10 segundos' },
  { id: 'bomb2', icon: '💣', name: 'Bomba', color: '#f87171', desc: 'Elimina las opciones trampa al instante' },
  { id: 'mirror', icon: '🪞', name: 'Espejo', color: '#c084fc', desc: 'Refleja penalizaciones' },
  { id: 'antidote', icon: '🧪', name: 'Antídoto', color: '#4ade80', desc: 'Limpia cualquier efecto negativo' },
];

export const PLAYER_LEVELS = [
  { level: 0, name: 'Novato', min: 0 },
  { level: 1, name: 'Explorador', min: 100 },
  { level: 2, name: 'Estudioso', min: 250 },
  { level: 3, name: 'Calculador', min: 500 },
  { level: 4, name: 'Resolvedor', min: 1000 },
  { level: 5, name: 'Matemático', min: 1600 },
  { level: 6, name: 'Analítico', min: 2400 },
  { level: 7, name: 'Estratega', min: 3600 },
  { level: 8, name: 'Genio', min: 5200 },
  { level: 9, name: 'Sabio', min: 7500 },
  { level: 10, name: 'Gran Maestro', min: 10000 },
];

export const ACHIEVEMENTS_DEF = [
  { id: 'perfect', icon: '💯', name: 'Perfección', desc: '100% de precisión en una sesión completa' },
  { id: 'streak20', icon: '🔥', name: 'Racha ×20', desc: '20 respuestas consecutivas correctas' },
  { id: 'master_mult', icon: '✖️', name: 'Maestro ×', desc: '90%+ en Multiplicación (mín. 10 resp.)' },
  { id: 'master_add', icon: '➕', name: 'Maestro +', desc: '90%+ en Suma (mín. 10 resp.)' },
  { id: 'master_sub', icon: '➖', name: 'Maestro −', desc: '90%+ en Resta (mín. 10 resp.)' },
  { id: 'master_div', icon: '➗', name: 'Maestro ÷', desc: '90%+ en División (mín. 10 resp.)' },
];

export function getPlayerLevel(xp: number) {
  let lv = PLAYER_LEVELS[0];
  for (const l of PLAYER_LEVELS) {
    if (xp >= l.min) lv = l;
  }
  const nextLv = PLAYER_LEVELS.find(l => l.min > xp);
  const progressPct = nextLv ? Math.round(((xp - lv.min) / (nextLv.min - lv.min)) * 100) : 100;
  return { ...lv, nextLv, progressPct };
}

export const INITIAL_TESTS: MathTest[] = [
  {
    testId: 'test-001',
    folio: '0042',
    title: 'Desafío de Tablas del 7 al 9',
    description: 'Evaluación rápida de velocidad y precisión en tablas intermedias',
    status: 'active',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    grade: '4° Grado',
    questionCount: 20,
    attemptCount: 14,
    allowedAttempts: 1,
    timeLimit: 0,
    timePerQuestion: 25,
    answerMode: 'options',
    multiplier: 2,
    rewards: {
      aureos: 150,
      experience: 250,
      streak: { enabled: true, bonus: 50 },
      achievements: { perfect: { enabled: true, bonus: 100 } },
      aureosTiers: [
        { minPercent: 90, maxPercent: 100, earned: 150, lost: 0 },
        { minPercent: 70, maxPercent: 89, earned: 80, lost: 0 },
        { minPercent: 0, maxPercent: 69, earned: 0, lost: 20 }
      ]
    },
    opsConfig: {
      mult: {
        tables: [7, 8, 9],
        qty: 6,
        manner: 'random',
        ranges: [{ table: 7, from: 1, to: 12 }, { table: 8, from: 1, to: 12 }, { table: 9, from: 1, to: 12 }]
      }
    },
    operations: ['Multiplicación'],
    assignmentCount: 24,
    revision: 2
  },
  {
    testId: 'test-002',
    folio: '0041',
    title: 'Gran Torneo de Sumas y Restas con Llevadas',
    description: 'Operaciones de 2 y 3 cifras con préstamos y llevadas para cálculo mental veloz',
    status: 'finished',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    grade: '3° Grado',
    questionCount: 15,
    attemptCount: 28,
    allowedAttempts: 2,
    timeLimit: 300,
    timePerQuestion: 0,
    answerMode: 'options',
    multiplier: 1,
    rewards: {
      aureos: 100,
      experience: 180,
      streak: { enabled: true, bonus: 30 },
      achievements: { perfect: { enabled: true } }
    },
    opsConfig: {
      add: { qty: 8, digits: 2, carryMode: 'carry' },
      sub: { qty: 7, digits: 2, carryMode: 'carry' }
    },
    operations: ['Suma', 'Resta'],
    assignmentCount: 28,
    revision: 3
  },
  {
    testId: 'test-003',
    folio: '0043',
    title: 'Boss Battle: Divisiones y Multiplicaciones 12x12',
    description: 'Borrador para la próxima ronda clasificatoria del torneo escolar',
    status: 'draft',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    grade: '5° Grado',
    questionCount: 25,
    attemptCount: 0,
    allowedAttempts: 1,
    timeLimit: 0,
    timePerQuestion: 30,
    answerMode: 'options',
    multiplier: 3,
    rewards: {
      aureos: 250,
      experience: 400,
      streak: { enabled: true, bonus: 100 },
      achievements: { perfect: { enabled: true, bonus: 200 } }
    },
    opsConfig: {
      mult: { tables: [11, 12], qty: 10, manner: 'random' },
      div: { tables: [6, 7, 8, 9], qty: 15, digits: 2 }
    },
    operations: ['Multiplicación', 'División'],
    assignmentCount: 0,
    revision: 1
  }
];
