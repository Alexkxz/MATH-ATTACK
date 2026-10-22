import React, { useState } from 'react';
import { arcadeAudio } from '../../utils/arcadeAudio';

interface AureosResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReset: () => void;
}

export const AureosResetModal: React.FC<AureosResetModalProps> = ({ isOpen, onClose, onConfirmReset }) => {
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === 'RESETEAR';

  const handleExecute = () => {
    if (!isConfirmed) return;
    arcadeAudio.playLaser();
    onConfirmReset();
    setConfirmText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md bg-[#160808] border-2 border-red-500 rounded-xl shadow-[0_0_40px_rgba(239,68,68,0.4)] p-6 overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-red-500/30">
          <div className="flex items-center gap-2">
            <span className="text-2xl animate-bounce">⚠️</span>
            <h2 className="text-xs sm:text-sm font-['Press_Start_2P'] text-red-500 tracking-wider">
              RESET TOTAL DE ÁUREOS
            </h2>
          </div>
          <button
            onClick={() => { arcadeAudio.playButton(); onClose(); }}
            className="text-slate-400 hover:text-white font-['Press_Start_2P'] text-xs p-1"
          >
            [X]
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="p-3 bg-red-950/60 border border-red-500/30 rounded text-red-200 text-xs leading-relaxed font-['Chakra_Petch']">
            <strong className="block font-bold text-red-400 mb-1 font-['Press_Start_2P'] text-[9px]">
              ¡ATENCIÓN MAESTRO!
            </strong>
            Esta acción pondrá en <b>0</b> el saldo de monedas de todos los alumnos registrados y limpiará el historial de transacciones. Los clientes de los alumnos se actualizarán inmediatamente.
          </div>

          <div>
            <label className="block text-[9px] font-['Press_Start_2P'] text-red-400 uppercase tracking-wider mb-2">
              Escribe <span className="text-white underline">RESETEAR</span> para confirmar:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="RESETEAR"
              className="w-full bg-black/70 border border-red-500/50 rounded px-3 py-2 text-center text-sm font-['Press_Start_2P'] uppercase text-red-400 tracking-widest focus:outline-none focus:border-red-400"
              autoFocus
            />
          </div>

          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={() => { arcadeAudio.playButton(); onClose(); }}
              className="flex-1 py-2 px-4 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-['Press_Start_2P'] text-[9px] uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!isConfirmed}
              onClick={handleExecute}
              className={`flex-1 py-2.5 px-4 rounded font-['Press_Start_2P'] text-[9px] uppercase tracking-wider font-bold transition-all ${
                isConfirmed
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.7)] cursor-pointer'
                  : 'bg-red-950/40 text-red-500/40 border border-red-900/30 cursor-not-allowed'
              }`}
            >
              [ RESETEAR AHORA ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
