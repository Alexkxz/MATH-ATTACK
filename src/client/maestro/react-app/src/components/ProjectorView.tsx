import React from 'react';
import { GameSession } from '../types/maestro';
import { buildAvatarSVG } from '../utils/avatar';
import { arcadeAudio } from '../utils/arcadeAudio';

interface ProjectorViewProps {
  sessions: GameSession[];
  onExit: () => void;
}

export const ProjectorView: React.FC<ProjectorViewProps> = ({ sessions, onExit }) => {
  const sorted = [...sessions].sort((a, b) => b.score - a.score);
  const leader = sorted[0];

  return (
    <div className="fixed inset-0 z-50 bg-[#05030f] text-white flex flex-col p-6 sm:p-8 overflow-y-auto select-none">
      {/* Top Projector Header */}
      <div className="flex items-center justify-between pb-4 border-b-2 border-cyan-400">
        <div className="flex items-center gap-3">
          <span className="text-3xl animate-bounce">📽️</span>
          <div>
            <h1 className="font-['Press_Start_2P'] text-sm sm:text-xl text-[#00e5ff] tracking-wider neon-glow-cyan">
              MODO PROYECTOR DE AULA · EN VIVO
            </h1>
            <p className="font-['Press_Start_2P'] text-[9px] text-pink-400 tracking-widest mt-1">
              TORNEO MATH ATTACK EN CURSO
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            arcadeAudio.playLaser();
            onExit();
          }}
          className="arcade-btn arcade-btn-pink py-2 px-5 rounded font-['Press_Start_2P'] text-xs font-bold"
        >
          [ ✕ SALIR ]
        </button>
      </div>

      {/* Leader Showcase Banner if active */}
      {leader && (
        <div className="my-6 p-6 rounded-2xl bg-gradient-to-r from-amber-950/60 via-[#1f1606] to-amber-950/60 border-2 border-amber-400 shadow-[0_0_35px_rgba(251,191,36,0.3)] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <span className="text-5xl animate-bounce">👑</span>
            <div
              className="w-20 h-20 rounded-2xl border-4 border-amber-400 overflow-hidden bg-[#160c33] shadow-[0_0_20px_rgba(251,191,36,0.6)] flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: buildAvatarSVG(leader.avatar, 70) }}
            />
            <div>
              <span className="font-['Press_Start_2P'] text-xs text-amber-300 block mb-1">
                LÍDER DE LA SALA
              </span>
              <h2 className="font-['Press_Start_2P'] text-xl sm:text-2xl text-white font-black neon-glow-yellow">
                {leader.name}
              </h2>
              <p className="text-sm font-['Chakra_Petch'] text-amber-200/80 mt-1">
                {leader.grade} · Racha de {leader.streak} aciertos seguidos 🔥
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="font-['Press_Start_2P'] text-xs text-slate-400 block mb-1">PUNTAJE ACTUAL</span>
            <span className="font-['Press_Start_2P'] text-3xl sm:text-4xl text-[#fbbf24] font-black neon-glow-yellow">
              {leader.score.toLocaleString()} <span className="text-sm text-amber-300">PTS</span>
            </span>
          </div>
        </div>
      )}

      {/* Grid of All Live Player Stations (High-Vis for Students looking at projector) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 flex-1">
        {sorted.map((s, idx) => (
          <div
            key={s.id}
            className={`p-4 rounded-xl border-2 bg-[#090618] flex flex-col justify-between shadow-xl transition-all ${
              idx === 0
                ? 'border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.35)]'
                : idx === 1
                ? 'border-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.25)]'
                : idx === 2
                ? 'border-pink-500 shadow-[0_0_20px_rgba(255,0,127,0.25)]'
                : 'border-slate-800'
            }`}
          >
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span
                  className={`font-['Press_Start_2P'] text-sm font-bold ${
                    idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-cyan-400' : idx === 2 ? 'text-pink-400' : 'text-slate-500'
                  }`}
                >
                  #{idx + 1}
                </span>
                <span className="font-['Press_Start_2P'] text-[9px] text-slate-400">
                  {s.qIndex}/{s.totalQ}
                </span>
              </div>

              <div className="flex items-center gap-3 my-3">
                <div
                  className="w-12 h-12 rounded-xl border-2 border-slate-700 overflow-hidden bg-[#160d33] flex items-center justify-center shrink-0"
                  dangerouslySetInnerHTML={{ __html: buildAvatarSVG(s.avatar, 42) }}
                />
                <div className="truncate">
                  <span className="font-['Press_Start_2P'] text-xs text-white block truncate">
                    {s.name}
                  </span>
                  <span className="text-xs text-slate-400 font-['Chakra_Petch']">{s.grade}</span>
                </div>
              </div>

              {/* Massive Question readout for the classroom */}
              <div className="p-3 bg-black/70 rounded-lg text-center border border-purple-500/30 my-2">
                <span className="font-['Press_Start_2P'] text-lg text-cyan-300 font-bold block truncate">
                  {s.currentQuestion || 'Pensando...'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 font-['Press_Start_2P'] text-[10px]">
              <span className="text-emerald-400">✓ {s.correct}</span>
              <span className="text-amber-400 font-bold text-xs">{s.score.toLocaleString()} pts</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
