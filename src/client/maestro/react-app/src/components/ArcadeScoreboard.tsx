import React from 'react';
import { GameSession, Player } from '../types/maestro';
import { arcadeAudio } from '../utils/arcadeAudio';

interface ArcadeScoreboardProps {
  students: Player[];
  sessions: GameSession[];
  onQuickOpClick?: (op: string) => void;
  operationStats?: Record<string, { pct: number | null; games: number }>;
}

export const ArcadeScoreboard: React.FC<ArcadeScoreboardProps> = ({
  students,
  sessions,
  onQuickOpClick
  , operationStats = {}
}) => {
  const activePlaying = sessions.filter(s => !s.paused && s.status !== 'finished').length;
  const pausedSessions = sessions.filter(s => s.paused).length;
  const avgScore = sessions.length ? Math.round(sessions.reduce((acc, s) => acc + s.score, 0) / sessions.length) : 0;

  const totalCoins = students.reduce((acc, s) => acc + s.aureos, 0);

  // Operations stats
  const ops = [
    {
      id: 'mult',
      sym: '×',
      name: 'MULTIPLICACIÓN',
      color: '#39ff14',
      bgGlow: 'rgba(57, 255, 20, 0.15)',
      borderColor: 'rgba(57, 255, 20, 0.4)',
      pct: operationStats.mult?.pct ?? null,
      games: operationStats.mult?.games ?? 0,
    },
    {
      id: 'add',
      sym: '+',
      name: 'SUMA',
      color: '#00e5ff',
      bgGlow: 'rgba(0, 229, 255, 0.15)',
      borderColor: 'rgba(0, 229, 255, 0.4)',
      pct: operationStats.add?.pct ?? null,
      games: operationStats.add?.games ?? 0,
    },
    {
      id: 'sub',
      sym: '−',
      name: 'RESTA',
      color: '#fb923c',
      bgGlow: 'rgba(251, 146, 60, 0.15)',
      borderColor: 'rgba(251, 146, 60, 0.4)',
      pct: operationStats.sub?.pct ?? null,
      games: operationStats.sub?.games ?? 0,
    },
    {
      id: 'div',
      sym: '÷',
      name: 'DIVISIÓN',
      color: '#ff007f',
      bgGlow: 'rgba(255, 0, 127, 0.15)',
      borderColor: 'rgba(255, 0, 127, 0.4)',
      pct: operationStats.div?.pct ?? null,
      games: operationStats.div?.games ?? 0,
    },
  ];

  return (
    <div className="space-y-3 mb-6 select-none">
      {/* 4 Arcade Cabinet Status Monitors */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Card 1: Total Players */}
        <div className="relative bg-[#0d091f] border-2 border-cyan-500/40 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(0,229,255,0.12)] overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent" />
          <div className="flex items-center justify-between text-xs text-slate-400 font-['Press_Start_2P'] text-[8px] mb-2">
            <span>JUGADORES</span>
            <span className="text-cyan-400">👥</span>
          </div>
          <div className="text-2xl sm:text-3xl font-['Press_Start_2P'] font-bold text-[#00e5ff] neon-glow-cyan">
            {students.length}
          </div>
          <div className="text-[10px] text-slate-400 font-['Chakra_Petch'] mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{sessions.length} en terminales activas</span>
          </div>
        </div>

        {/* Card 2: Playing now */}
        <div className="relative bg-[#0d091f] border-2 border-lime-500/40 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(57,255,20,0.12)] overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#39ff14] to-transparent" />
          <div className="flex items-center justify-between text-xs text-slate-400 font-['Press_Start_2P'] text-[8px] mb-2">
            <span>EN COMBATE</span>
            <span className="text-lime-400">⚡</span>
          </div>
          <div className="text-2xl sm:text-3xl font-['Press_Start_2P'] font-bold text-[#39ff14] neon-glow-lime">
            {activePlaying}
          </div>
          <div className="text-[10px] text-slate-400 font-['Chakra_Petch'] mt-1">
            Respuestas en tiempo real
          </div>
        </div>

        {/* Card 3: In Pause */}
        <div className="relative bg-[#0d091f] border-2 border-amber-500/40 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(251,191,36,0.12)] overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#fbbf24] to-transparent" />
          <div className="flex items-center justify-between text-xs text-slate-400 font-['Press_Start_2P'] text-[8px] mb-2">
            <span>EN PAUSA</span>
            <span className="text-amber-400">⏸</span>
          </div>
          <div className="text-2xl sm:text-3xl font-['Press_Start_2P'] font-bold text-[#fbbf24] neon-glow-yellow">
            {pausedSessions}
          </div>
          <div className="text-[10px] text-slate-400 font-['Chakra_Petch'] mt-1">
            Partidas suspendidas
          </div>
        </div>

        {/* Card 4: High Score & Total Coins */}
        <div className="relative bg-[#0d091f] border-2 border-pink-500/40 rounded-lg p-3 sm:p-4 shadow-[0_0_15px_rgba(255,0,127,0.12)] overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#ff007f] to-transparent" />
          <div className="flex items-center justify-between text-xs text-slate-400 font-['Press_Start_2P'] text-[8px] mb-2">
            <span>PUNTAJE PROMEDIO</span>
            <span className="text-pink-400">🏆</span>
          </div>
          <div className="text-2xl sm:text-3xl font-['Press_Start_2P'] font-bold text-[#ff007f] neon-glow-fuchsia truncate">
            {avgScore.toLocaleString()}
          </div>
          <div className="text-[10px] text-amber-300 font-['Chakra_Petch'] mt-1 flex items-center gap-1">
            <span className="animate-coin">🪙</span>
            <span>{totalCoins.toLocaleString()} Áureos en aula</span>
          </div>
        </div>
      </div>

      {/* Operation Accuracy Bars */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {ops.map(op => (
          <button
            key={op.id}
            type="button"
            onClick={() => {
              arcadeAudio.playLaser();
              if (onQuickOpClick) onQuickOpClick(op.id);
            }}
            className="group relative bg-[#0a0718] border border-purple-500/20 hover:border-cyan-400/60 rounded-md p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(0,229,255,0.18)]"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="font-['Press_Start_2P'] text-xl font-bold group-hover:scale-110 transition-transform"
                style={{ color: op.color, textShadow: `0 0 10px ${op.color}` }}
              >
                {op.sym}
              </span>
              <span className="font-['Press_Start_2P'] text-[11px] font-bold" style={{ color: op.color }}>
                {op.pct == null ? '—' : `${op.pct}%`}
              </span>
            </div>
            <div className="font-['Press_Start_2P'] text-[7px] text-slate-400 tracking-wider">
              {op.name}
            </div>

            {/* Segmented Neon Bar */}
            <div className="w-full bg-slate-900 h-2 rounded-sm overflow-hidden mt-2 p-0.5 border border-slate-800">
              <div
                className="h-full rounded-xs transition-all duration-700"
                style={{
                  width: `${op.pct ?? 0}%`,
                  backgroundColor: op.color,
                  boxShadow: `0 0 8px ${op.color}`
                }}
              />
            </div>
            <div className="text-[9px] text-slate-500 font-mono mt-1">
              {op.games} partidas registradas
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
