import React, { useState, useEffect } from 'react';
import { arcadeAudio } from '../../utils/arcadeAudio';

export type EditValueType = 'aureos' | 'pin' | 'grade' | 'power';

interface EditValueModalProps {
  isOpen: boolean;
  type: EditValueType;
  title: string;
  hint: string;
  initialValue: string | number;
  icon?: string;
  onClose: () => void;
  onSave: (val: string | number) => void;
}

export const EditValueModal: React.FC<EditValueModalProps> = ({
  isOpen,
  type,
  title,
  hint,
  initialValue,
  icon,
  onClose,
  onSave
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    arcadeAudio.playCoin();
    onSave(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm bg-[#0e0a24] border-2 border-[#00e5ff] rounded-xl shadow-[0_0_30px_rgba(0,229,255,0.3)] p-5 overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/30">
          <div className="flex items-center gap-2">
            {icon && <span className="text-xl">{icon}</span>}
            <h2 className="text-xs font-['Press_Start_2P'] text-[#00e5ff] tracking-wider neon-glow-cyan">
              {title}
            </h2>
          </div>
          <button
            onClick={() => { arcadeAudio.playButton(); onClose(); }}
            className="text-slate-400 hover:text-rose-400 font-['Press_Start_2P'] text-xs p-1"
          >
            [X]
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-400 font-['Chakra_Petch']">{hint}</p>

          {type === 'grade' ? (
            <select
              value={String(value)}
              onChange={e => setValue(e.target.value)}
              className="w-full bg-[#181136] border border-cyan-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff]"
            >
              <option value="1° Grado">1° Grado</option>
              <option value="2° Grado">2° Grado</option>
              <option value="3° Grado">3° Grado</option>
              <option value="4° Grado">4° Grado</option>
              <option value="5° Grado">5° Grado</option>
              <option value="6° Grado">6° Grado</option>
            </select>
          ) : type === 'pin' ? (
            <input
              type="text"
              maxLength={4}
              value={String(value)}
              onChange={e => setValue(e.target.value.replace(/\D/g, ''))}
              placeholder="0000"
              className="w-full bg-black/70 border border-cyan-500/50 rounded px-3 py-2 text-center text-lg font-['Press_Start_2P'] text-[#fbbf24] tracking-widest focus:outline-none focus:border-[#00e5ff]"
              autoFocus
            />
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="number"
                min={0}
                max={99999}
                value={Number(value)}
                onChange={e => setValue(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-black/70 border border-cyan-500/50 rounded px-3 py-2 text-center text-xl font-['Press_Start_2P'] text-[#00e5ff] focus:outline-none focus:border-[#00e5ff]"
                autoFocus
              />
              {type === 'power' && (
                <div className="flex gap-2 justify-center">
                  {[0, 1, 3, 5, 10].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => { arcadeAudio.playButton(); setValue(cnt); }}
                      className="px-2.5 py-1 text-[10px] font-['Press_Start_2P'] border border-cyan-500/30 rounded bg-black/40 hover:bg-cyan-500/20 text-cyan-300"
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => { arcadeAudio.playButton(); onClose(); }}
              className="flex-1 py-2 px-3 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-['Press_Start_2P'] text-[9px] uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 arcade-btn arcade-btn-cyan py-2 px-3 rounded font-['Press_Start_2P'] text-[9px] uppercase tracking-wider font-bold"
            >
              [ GUARDAR ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
