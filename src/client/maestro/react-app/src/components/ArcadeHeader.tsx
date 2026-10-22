import React from 'react';
import { arcadeAudio } from '../utils/arcadeAudio';

interface ArcadeHeaderProps {
  crtActive: boolean;
  onToggleCrt: () => void;
  audioActive: boolean;
  onToggleAudio: () => void;
  projectorMode: boolean;
  onToggleProjector: () => void;
  connected: boolean;
  ping: number | null;
}

export const ArcadeHeader: React.FC<ArcadeHeaderProps> = ({
  crtActive,
  onToggleCrt,
  audioActive,
  onToggleAudio,
  projectorMode,
  onToggleProjector,
  connected,
  ping
}) => {
  const toggleFullscreen = () => {
    arcadeAudio.playButton();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header className="relative bg-[#070512] border-b-2 border-[#00e5ff] shadow-[0_4px_24px_rgba(0,229,255,0.25)] px-4 sm:px-6 py-3 overflow-hidden select-none z-30">
      {/* Background Arcade Neon Stripe */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent opacity-80" />
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#ff007f] to-transparent opacity-80" />

      {/* Marquee Corner Brackets */}
      <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-[#00e5ff]" />
      <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-[#00e5ff]" />

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left Side: Arcade Logo & Marquee Title */}
        <div className="flex items-center gap-3">
          {/* Animated Joystick & Invader */}
          <div className="flex items-center gap-1.5 text-lg">
            <span className="inline-block animate-bounce text-xl" title="Arcade Machine">🕹️</span>
            <span className="text-cyan-400 animate-pulse text-lg" style={{ filter: 'drop-shadow(0 0 6px #00e5ff)' }}>👾</span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-['Press_Start_2P'] text-xs sm:text-sm text-[#00e5ff] tracking-wider neon-glow-cyan arcade-flicker">
                ◈ MATH ATTACK ◈
              </h1>
              <span className="bg-pink-500/20 border border-pink-500/50 text-[#ff007f] text-[8px] font-['Press_Start_2P'] px-1.5 py-0.5 rounded neon-glow-fuchsia hidden sm:inline-block">
                MASTER CPU
              </span>
            </div>
            <div className="font-['Press_Start_2P'] text-[7px] sm:text-[8px] text-purple-300/80 tracking-widest mt-1 flex items-center gap-2">
              <span>PANEL DE CONTROL DEL MAESTRO</span>
              <span className="text-slate-600">|</span>
              <span className="text-amber-400 animate-pulse">MODO MAESTRO</span>
            </div>
          </div>
        </div>

        {/* Right Side: Arcade Control Switches & Quick Tools */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3 text-xs">
          {/* Live Ping & Connection LED */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-black/60 border border-cyan-500/30 font-['Press_Start_2P'] text-[8px]">
            <span
              className={`w-2.5 h-2.5 rounded-sm inline-block ${
                connected
                  ? 'bg-[#39ff14] shadow-[0_0_8px_#39ff14] animate-pulse'
                  : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
              }`}
            />
            <span className={connected ? 'text-emerald-300' : 'text-rose-400'}>
              {connected ? `ONLINE · ${ping == null ? '—' : `${ping}ms`}` : 'DESCONECTADO'}
            </span>
          </div>

          {/* CRT Scanline Toggle */}
          <button
            onClick={() => {
              arcadeAudio.playButton();
              onToggleCrt();
            }}
            title="Alternar filtro retro CRT Scanlines"
            className={`px-2.5 py-1.5 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5 border transition-all ${
              crtActive
                ? 'bg-cyan-500/20 border-[#00e5ff] text-[#00e5ff] shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                : 'bg-black/40 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>📺</span>
            <span className="hidden sm:inline">CRT</span>
            <span className="text-[7px] opacity-80">{crtActive ? 'ON' : 'OFF'}</span>
          </button>

          {/* 8-Bit Audio Synth Toggle */}
          <button
            onClick={() => {
              onToggleAudio();
              arcadeAudio.playCoin();
            }}
            title="Sonidos Retro Arcade 8-Bit"
            className={`px-2.5 py-1.5 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5 border transition-all ${
              audioActive
                ? 'bg-lime-500/20 border-[#39ff14] text-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.4)]'
                : 'bg-black/40 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>{audioActive ? '🔊' : '🔇'}</span>
            <span className="hidden sm:inline">AUDIO</span>
            <span className="text-[7px] opacity-80">{audioActive ? 'ON' : 'MUTE'}</span>
          </button>

          {/* Modo Proyector Toggle */}
          <button
            onClick={() => {
              arcadeAudio.playLaser();
              onToggleProjector();
            }}
            title="Vista de alto contraste y pantalla grande para proyector de aula"
            className={`px-3 py-1.5 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5 border transition-all ${
              projectorMode
                ? 'bg-pink-500/25 border-[#ff007f] text-[#ff007f] shadow-[0_0_15px_rgba(255,0,127,0.5)] scale-105'
                : 'bg-black/40 border-slate-700 text-slate-300 hover:border-pink-500/50'
            }`}
          >
            <span>📽️</span>
            <span>PROYECTOR</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title="Pantalla completa"
            className="p-1.5 rounded bg-black/40 border border-slate-700 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-all font-['Press_Start_2P'] text-[9px]"
          >
            ⛶
          </button>
        </div>
      </div>
    </header>
  );
};
