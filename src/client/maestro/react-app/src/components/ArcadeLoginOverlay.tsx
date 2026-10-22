import React, { useState, useEffect, useRef } from 'react';
import { arcadeAudio } from '../utils/arcadeAudio';

interface ArcadeLoginOverlayProps {
  onSuccess: (username: string, password: string) => Promise<boolean>;
  studentsCount: number;
}

export const ArcadeLoginOverlay: React.FC<ArcadeLoginOverlayProps> = ({ onSuccess, studentsCount }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    fetch('/api/maestro/config').then(response => response.ok ? response.json() : null).then(data => { if (data?.username) setUsername(data.username); }).catch(() => {});
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Stars
    interface Star {
      x: number;
      y: number;
      z: number;
      pz: number;
    }
    const createStar = (): Star => ({
      x: Math.random() * width - width / 2,
      y: Math.random() * height - height / 2,
      z: Math.random() * width,
      pz: 0
    });

    const stars: Star[] = Array.from({ length: 150 }, () => {
      const s = createStar();
      s.pz = s.z;
      return s;
    });

    let animationFrameId: number;
    const render = () => {
      ctx.fillStyle = 'rgba(7, 5, 18, 0.2)';
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      stars.forEach(s => {
        s.z -= 3;
        if (s.z <= 0) {
          Object.assign(s, createStar());
          s.pz = s.z;
        }

        const k = 128 / s.z;
        const px = s.x * k + cx;
        const py = s.y * k + cy;

        const pk = 128 / s.pz;
        const ppx = s.x * pk + cx;
        const ppy = s.y * pk + cy;
        s.pz = s.z;

        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          const size = Math.max(0.5, (1 - s.z / width) * 3);
          const alpha = Math.max(0.2, (1 - s.z / width));

          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
          ctx.lineWidth = size;
          ctx.moveTo(ppx, ppy);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Ingresa usuario y contraseña');
      arcadeAudio.playWarning();
      return;
    }

    setError('');
    if (await onSuccess(username.trim(), password)) arcadeAudio.playFanfare();
    else { setError('Usuario o contraseña incorrectos'); arcadeAudio.playWarning(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070512] overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Perspective horizon glow line */}
      <div className="absolute bottom-[36%] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent shadow-[0_0_20px_#00e5ff] pointer-events-none" />

      {/* Floating arcade invaders */}
      <span className="absolute top-16 left-12 text-2xl text-cyan-400 opacity-30 animate-pulse pointer-events-none" style={{ filter: 'drop-shadow(0 0 8px #00e5ff)' }}>👾</span>
      <span className="absolute top-24 right-16 text-2xl text-pink-500 opacity-30 animate-bounce pointer-events-none" style={{ filter: 'drop-shadow(0 0 8px #ff007f)' }}>🛸</span>
      <span className="absolute bottom-20 left-20 text-xl text-lime-400 opacity-25 pointer-events-none" style={{ filter: 'drop-shadow(0 0 8px #39ff14)' }}>⭐</span>
      <span className="absolute bottom-28 right-24 text-2xl text-amber-400 opacity-25 pointer-events-none" style={{ filter: 'drop-shadow(0 0 8px #fbbf24)' }}>🪙</span>

      {/* Cabinet Frame */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[#0c091e]/95 border-2 border-[#00e5ff] rounded-lg p-6 shadow-[0_0_40px_rgba(0,229,255,0.35),inset_0_0_20px_rgba(0,229,255,0.1)] backdrop-blur-md">
        {/* Decorative corner metallic brackets */}
        <div className="absolute top-1.5 left-1.5 w-3.5 h-3.5 border-t-2 border-l-2 border-[#ff007f]" />
        <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 border-t-2 border-r-2 border-[#ff007f]" />
        <div className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 border-b-2 border-l-2 border-[#ff007f]" />
        <div className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 border-b-2 border-r-2 border-[#ff007f]" />

        {/* Title */}
        <div className="text-center mb-5">
          <div className="inline-block text-2xl mb-1">🕹️</div>
          <h1 className="font-['Press_Start_2P'] text-xs sm:text-sm text-[#00e5ff] tracking-wider neon-glow-cyan arcade-flicker">
            MATH ATTACK
          </h1>
          <p className="font-['Press_Start_2P'] text-[8px] text-purple-300 tracking-widest mt-1">
            PANEL DEL MAESTRO
          </p>
        </div>

        {/* Arcade Status Bar */}
        <div className="flex justify-between items-center py-2.5 px-3 mb-5 bg-black/60 border border-purple-500/30 rounded text-center font-['Press_Start_2P']">
          <div>
            <span className="block text-[6px] text-slate-500 uppercase">TOP SCORE</span>
              <span className="text-[10px] text-cyan-300 font-bold">------</span>
          </div>
          <div>
            <span className="block text-[6px] text-slate-500 uppercase">STAGE</span>
            <span className="text-[10px] text-pink-400 font-bold">01</span>
          </div>
          <div>
            <span className="block text-[6px] text-slate-500 uppercase">ALUMNOS</span>
            <span className="text-[10px] text-amber-300 font-bold">{String(studentsCount).padStart(2, '0')}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[8px] font-['Press_Start_2P'] text-cyan-400 uppercase tracking-wider mb-1.5">
              ▶ USUARIO
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full bg-black/70 border border-cyan-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-[8px] font-['Press_Start_2P'] text-cyan-400 uppercase tracking-wider mb-1.5">
              ▶ CONTRASEÑA
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-black/70 border border-cyan-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-[9px] font-['Press_Start_2P'] text-rose-400 text-center animate-pulse">
              ⚠ {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full arcade-btn arcade-btn-cyan py-3 px-4 rounded font-['Press_Start_2P'] text-[10px] uppercase tracking-wider font-bold shadow-lg"
          >
            [ ENTRAR ]
          </button>
        </form>

        <div className="text-center mt-5 font-['Press_Start_2P'] text-[8px] text-[#fbbf24] animate-pulse">
          — PRESS START —
        </div>
      </div>
    </div>
  );
};
