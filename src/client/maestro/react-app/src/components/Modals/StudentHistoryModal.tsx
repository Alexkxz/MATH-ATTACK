import React from 'react';
import { Player } from '../../types/maestro';

interface HistoryRecord { date?:string; time?:string; score?:number; pct?:number; correct?:number; wrong?:number; gameMode?:string; difficulty?:string; }
interface StudentWithHistory extends Player { history?:HistoryRecord[]; }
interface Props { isOpen:boolean; student:StudentWithHistory|null; onClose:()=>void; }

export const StudentHistoryModal: React.FC<Props> = ({isOpen,student,onClose}) => {
  if(!isOpen||!student)return null;
  const records=student.history||[];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={`Historial de ${student.name}`}>
    <section className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border-2 border-cyan-500/50 bg-[#0b081c] p-5 shadow-[0_0_30px_rgba(0,229,255,.2)]">
      <header className="flex items-center justify-between gap-4 border-b border-cyan-500/30 pb-3">
        <div><h2 className="font-['Press_Start_2P'] text-xs text-cyan-300">HISTORIAL DEL ALUMNO</h2><p className="mt-2 text-sm text-slate-300">{student.name} · {student.grade}</p></div>
        <button onClick={onClose} className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400" aria-label="Cerrar">Cerrar</button>
      </header>
      {records.length===0?<p className="py-10 text-center text-sm text-slate-400">El servidor no tiene partidas guardadas para este alumno.</p>:<div className="mt-4 space-y-2">{records.map((row,index)=><article key={`${row.date}-${row.time}-${index}`} className="grid grid-cols-2 gap-2 rounded border border-purple-500/20 bg-black/30 p-3 text-sm sm:grid-cols-6">
        <span className="text-slate-300">{row.date||'—'} {row.time||''}</span><span className="text-purple-300">{row.gameMode||'Partida'}</span><span className="text-cyan-300">{Number(row.score||0).toLocaleString()} pts</span><span className="text-emerald-300">{Number(row.pct||0)}%</span><span className="text-emerald-400">{row.correct||0} aciertos</span><span className="text-rose-300">{row.wrong||0} errores</span>
      </article>)}</div>}
    </section>
  </div>;
};
