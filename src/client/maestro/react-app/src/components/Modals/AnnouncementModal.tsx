import React, { useState } from 'react';
import { arcadeAudio } from '../../utils/arcadeAudio';

interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({ isOpen, onClose, onSend }) => {
  const [text, setText] = useState('');
  const emojis = ['🎉', '⏱️', '🚨', '🏆', '💪', '📖', '🤫', '👏', '⚡', '🎮'];

  if (!isOpen) return null;

  const handleSend = () => {
    if (!text.trim()) return;
    arcadeAudio.playLaser();
    onSend(text.trim());
    setText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-[#0a081a] border-2 border-[#ff007f] rounded-xl shadow-[0_0_35px_rgba(255,0,127,0.35)] p-6 overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-pink-500/30">
          <div className="flex items-center gap-2">
            <span className="text-2xl animate-pulse">📢</span>
            <h2 className="text-xs sm:text-sm font-['Press_Start_2P'] text-[#ff007f] tracking-wider neon-glow-fuchsia">
              ANUNCIO ARCADE GENERAL
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
            <label className="block text-[10px] font-['Press_Start_2P'] text-pink-300 uppercase tracking-wider mb-2">
              ▶ Mensaje para las pantallas de todos los alumnos
            </label>
            <textarea
              rows={3}
              maxLength={200}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Ej: ¡Prepárense! La siguiente ronda comienza en 1 minuto..."
              className="w-full bg-black/60 border border-pink-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#ff007f] focus:ring-1 focus:ring-[#ff007f] resize-none"
              autoFocus
            />
            <div className="text-right text-[10px] text-pink-400/60 font-mono mt-1">
              {text.length} / 200 caracteres
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-['Press_Start_2P'] text-pink-300 uppercase tracking-wider mb-2">
              ▶ Emojis de Reacción Rápida
            </label>
            <div className="flex flex-wrap gap-2">
              {emojis.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    arcadeAudio.playButton();
                    setText(prev => prev + e);
                  }}
                  className="text-xl p-2 rounded bg-black/40 border border-pink-500/20 hover:border-pink-500 hover:scale-110 active:scale-95 transition-all"
                >
                  {e}
                </button>
              ))}
            </div>
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
              onClick={handleSend}
              className="flex-1 arcade-btn arcade-btn-pink py-2.5 px-4 rounded font-['Press_Start_2P'] text-[9px] uppercase tracking-wider font-bold"
            >
              [ TRANSMITIR 📡 ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
