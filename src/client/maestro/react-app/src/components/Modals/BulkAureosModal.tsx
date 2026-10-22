import React, { useState } from 'react';
import { arcadeAudio } from '../../utils/arcadeAudio';

interface BulkAureosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number, grade: string) => void;
}

export const BulkAureosModal: React.FC<BulkAureosModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [amount, setAmount] = useState(50);
  const [grade, setGrade] = useState('');

  if (!isOpen) return null;

  const handleGive = () => {
    if (amount <= 0) return;
    arcadeAudio.playCoin();
    onConfirm(amount, grade);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-[#100b24] border-2 border-[#fbbf24] rounded-xl shadow-[0_0_35px_rgba(251,191,36,0.3)] p-6 overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-amber-500/30">
          <div className="flex items-center gap-2">
            <span className="text-2xl animate-coin">🪙</span>
            <h2 className="text-xs sm:text-sm font-['Press_Start_2P'] text-[#fbbf24] tracking-wider neon-glow-yellow">
              REGALO DE ÁUREOS
            </h2>
          </div>
          <button
            onClick={() => { arcadeAudio.playButton(); onClose(); }}
            className="text-slate-400 hover:text-rose-400 font-['Press_Start_2P'] text-xs p-1"
          >
            [X]
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-[10px] font-['Press_Start_2P'] text-amber-300 uppercase tracking-wider mb-2">
              ▶ Cantidad a Entregar (Áureos)
            </label>
            <div className="flex items-center gap-2">
              {[25, 50, 100, 200].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { arcadeAudio.playButton(); setAmount(val); }}
                  className={`flex-1 py-1.5 rounded text-[10px] font-['Press_Start_2P'] border transition-all ${
                    amount === val
                      ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                      : 'bg-black/40 border-amber-500/20 text-slate-400 hover:border-amber-400/50'
                  }`}
                >
                  +{val}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={10000}
              value={amount}
              onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
              className="mt-3 w-full bg-black/60 border border-amber-500/40 rounded px-3 py-2 text-center text-xl font-['Press_Start_2P'] text-[#fbbf24] focus:outline-none focus:border-[#fbbf24]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-['Press_Start_2P'] text-amber-300 uppercase tracking-wider mb-2">
              ▶ Destinatarios
            </label>
            <select
              value={grade}
              onChange={e => setGrade(e.target.value)}
              className="w-full bg-[#1c133a] border border-amber-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#fbbf24]"
            >
              <option value="">Todos los Alumnos Registrados</option>
              <option value="1° Grado">Solo 1° Grado</option>
              <option value="2° Grado">Solo 2° Grado</option>
              <option value="3° Grado">Solo 3° Grado</option>
              <option value="4° Grado">Solo 4° Grado</option>
              <option value="5° Grado">Solo 5° Grado</option>
              <option value="6° Grado">Solo 6° Grado</option>
            </select>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/20 rounded p-3 text-xs text-amber-200/80 leading-relaxed font-['Chakra_Petch']">
            💡 Los Áureos se sumarán de inmediato al saldo de cada alumno en el grado seleccionado y se guardará la transacción en la bóveda.
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { arcadeAudio.playButton(); onClose(); }}
              className="flex-1 py-2 px-4 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-['Press_Start_2P'] text-[9px] uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGive}
              className="flex-1 arcade-btn arcade-btn-amber py-2.5 px-4 rounded font-['Press_Start_2P'] text-[9px] uppercase tracking-wider font-bold"
            >
              [ REPARTIR 🪙 ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
