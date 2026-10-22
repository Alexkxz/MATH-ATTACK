import React, { useState } from 'react';
import { arcadeAudio } from '../../utils/arcadeAudio';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, grade: string, pin: string) => void;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('4° Grado');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr('Ingresa el nombre del alumno');
      arcadeAudio.playWarning();
      return;
    }
    const cleanPin = pin.trim().padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(cleanPin)) {
      setErr('El PIN debe ser de 4 dígitos numéricos');
      arcadeAudio.playWarning();
      return;
    }

    arcadeAudio.playCoin();
    onAdd(name.trim(), grade, cleanPin);
    setName('');
    setPin('');
    setErr('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-[#0e0922] border-2 border-[#a78bfa] rounded-xl shadow-[0_0_30px_rgba(167,139,250,0.35)] p-6 overflow-hidden">
        {/* Arcade Cabinet Header Corner Accents */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00e5ff]" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00e5ff]" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00e5ff]" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00e5ff]" />

        <div className="flex items-center justify-between pb-4 border-b border-purple-500/30">
          <div className="flex items-center gap-2">
            <span className="text-xl">👾</span>
            <h2 className="text-xs sm:text-sm font-['Press_Start_2P'] text-[#00e5ff] tracking-wider neon-glow-cyan">
              NUEVO JUGADOR
            </h2>
          </div>
          <button
            onClick={() => { arcadeAudio.playButton(); onClose(); }}
            className="text-slate-400 hover:text-rose-400 font-['Press_Start_2P'] text-xs p-1"
          >
            [X]
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-[10px] font-['Press_Start_2P'] text-purple-300 uppercase tracking-wider mb-2">
              ▶ Nombre Completo
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. Nombre del alumno"
              className="w-full bg-black/60 border border-purple-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-['Press_Start_2P'] text-purple-300 uppercase tracking-wider mb-2">
              ▶ Grado Escolar
            </label>
            <select
              value={grade}
              onChange={e => setGrade(e.target.value)}
              className="w-full bg-[#161033] border border-purple-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff]"
            >
              <option value="1° Grado">1° Grado</option>
              <option value="2° Grado">2° Grado</option>
              <option value="3° Grado">3° Grado</option>
              <option value="4° Grado">4° Grado</option>
              <option value="5° Grado">5° Grado</option>
              <option value="6° Grado">6° Grado</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-['Press_Start_2P'] text-purple-300 uppercase tracking-wider mb-2">
              ▶ PIN de Acceso (4 dígitos)
            </label>
            <input
              type="text"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="0000"
              className="w-full bg-black/60 border border-purple-500/40 rounded px-3 py-2 text-center text-lg font-['Press_Start_2P'] tracking-widest text-[#fbbf24] focus:outline-none focus:border-[#00e5ff]"
            />
          </div>

          {err && (
            <p className="text-xs font-['Press_Start_2P'] text-rose-400 text-center animate-pulse">
              ⚠ {err}
            </p>
          )}

          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={() => { arcadeAudio.playButton(); onClose(); }}
              className="flex-1 py-2 px-4 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-['Press_Start_2P'] text-[9px] uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 arcade-btn arcade-btn-lime py-2.5 px-4 rounded font-['Press_Start_2P'] text-[9px] uppercase tracking-wider font-bold"
            >
              [ REGISTRAR ]
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
