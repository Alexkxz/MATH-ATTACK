import React, { useState } from 'react';
import { AureosTransaction, Player } from '../types/maestro';
import { arcadeAudio } from '../utils/arcadeAudio';

interface TransactionsTabProps {
  transactions: AureosTransaction[];
  students: Player[];
  onOpenBulkAureos: () => void;
  onOpenResetTotal: () => void;
  onClearFilteredTransactions: (studentName?: string, grade?: string, date?: string) => void;
}

export const TransactionsTab: React.FC<TransactionsTabProps> = ({
  transactions,
  students,
  onOpenBulkAureos,
  onOpenResetTotal,
  onClearFilteredTransactions
}) => {
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const filtered = transactions.filter(t => {
    if (selectedStudent && t.name !== selectedStudent) return false;
    if (selectedGrade && t.grade !== selectedGrade) return false;
    if (dateFilter) {
      const d = new Date(t.ts).toISOString().slice(0, 10);
      if (d !== dateFilter) return false;
    }
    return true;
  });

  const totalDelivered = transactions
    .filter(t => t.delta > 0)
    .reduce((acc, t) => acc + t.delta, 0);

  const totalSpent = transactions
    .filter(t => t.delta < 0)
    .reduce((acc, t) => acc + Math.abs(t.delta), 0);

  return (
    <div className="space-y-4 select-none">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0c081e] border border-amber-500/30 rounded-lg p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl animate-coin">🪙</span>
          <div>
            <h2 className="text-xs sm:text-sm font-['Press_Start_2P'] text-[#fbbf24] tracking-wider neon-glow-yellow">
              BÓVEDA DE ÁUREOS & ECONOMÍA
            </h2>
            <p className="text-xs text-slate-400 font-['Chakra_Petch'] mt-0.5">
              Registro contable de recompensas, compras en tienda y premios de torneos
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { arcadeAudio.playButton(); onOpenBulkAureos(); }}
            className="arcade-btn arcade-btn-amber py-2 px-3 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5 font-bold"
          >
            <span>🎁</span>
            <span>DAR ÁUREOS</span>
          </button>
          <button
            type="button"
            onClick={() => {
              arcadeAudio.playWarning();
              onClearFilteredTransactions(selectedStudent || undefined, selectedGrade || undefined, dateFilter || undefined);
            }}
            className="px-3 py-2 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 font-['Press_Start_2P'] text-[8px]"
          >
            🗑 BORRAR VISTA
          </button>
          <button
            type="button"
            onClick={() => { arcadeAudio.playWarning(); onOpenResetTotal(); }}
            className="px-3 py-2 rounded bg-rose-950/70 border border-rose-500/70 hover:bg-rose-900 text-rose-300 font-['Press_Start_2P'] text-[8px] font-bold"
            title="Resetear saldo de todos los alumnos a cero"
          >
            ⚠️ RESET TOTAL
          </button>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-black/50 border border-amber-500/30 rounded-lg p-3 text-center">
          <span className="block text-[8px] font-['Press_Start_2P'] text-amber-400 mb-1">TOTAL TRANSACCIONES</span>
          <span className="text-xl font-['Press_Start_2P'] text-amber-200 font-bold">{transactions.length}</span>
        </div>
        <div className="bg-black/50 border border-emerald-500/30 rounded-lg p-3 text-center">
          <span className="block text-[8px] font-['Press_Start_2P'] text-emerald-400 mb-1">ÁUREOS REPARTIDOS (+)</span>
          <span className="text-xl font-['Press_Start_2P'] text-emerald-300 font-bold">+{totalDelivered.toLocaleString()} 🪙</span>
        </div>
        <div className="bg-black/50 border border-purple-500/30 rounded-lg p-3 text-center">
          <span className="block text-[8px] font-['Press_Start_2P'] text-purple-400 mb-1">GASTO EN TIENDA (-)</span>
          <span className="text-xl font-['Press_Start_2P'] text-purple-300 font-bold">-{totalSpent.toLocaleString()} 🪙</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-[#0a0718] border border-purple-500/20 rounded-lg p-3 text-xs">
        {/* Student Selector */}
        <div className="flex items-center gap-2">
          <span className="font-['Press_Start_2P'] text-[8px] text-purple-300">ALUMNO:</span>
          <select
            value={selectedStudent}
            onChange={e => setSelectedStudent(e.target.value)}
            className="bg-black/60 border border-purple-500/30 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">— Todos los Alumnos —</option>
            {students.map(s => (
              <option key={s.id} value={s.name}>
                {s.name} ({s.grade})
              </option>
            ))}
          </select>
        </div>

        {/* Grade Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="font-['Press_Start_2P'] text-[8px] text-purple-300 mr-1">GRADO:</span>
          {['', '1° Grado', '2° Grado', '3° Grado', '4° Grado', '5° Grado', '6° Grado'].map(g => (
            <button
              key={g}
              type="button"
              onClick={() => { arcadeAudio.playButton(); setSelectedGrade(g); }}
              className={`px-2 py-0.5 rounded text-[8px] font-['Press_Start_2P'] ${
                selectedGrade === g
                  ? 'bg-amber-500 text-black font-bold shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                  : 'bg-black/40 text-slate-400 border border-slate-800'
              }`}
            >
              {g ? g.replace(' Grado', '') : 'TODOS'}
            </button>
          ))}
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="font-['Press_Start_2P'] text-[8px] text-purple-300">FECHA:</span>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="bg-black/60 border border-purple-500/30 rounded px-2 py-0.5 text-xs text-slate-200"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="border border-amber-500/20 rounded-xl overflow-hidden bg-black/40">
        <table className="w-full text-left text-xs font-['Chakra_Petch']">
          <thead className="bg-[#16102c] border-b border-amber-500/30 text-amber-300 font-['Press_Start_2P'] text-[8px]">
            <tr>
              <th className="p-3">FECHA / HORA</th>
              <th className="p-3">JUGADOR</th>
              <th className="p-3">MOTIVO / OPERACIÓN</th>
              <th className="p-3 text-right">MONTO</th>
              <th className="p-3 text-right">SALDO RESULTANTE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-500/10">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-slate-500 font-['Press_Start_2P'] text-[9px]">
                  NO HAY TRANSACCIONES REGISTRADAS
                </td>
              </tr>
            ) : (
              filtered.map(tx => {
                const isPositive = tx.delta >= 0;
                const d = new Date(tx.ts);
                const formattedDate =
                  d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) +
                  ' ' +
                  d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

                return (
                  <tr key={tx.id} className="hover:bg-amber-950/10 transition-colors">
                    <td className="p-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-slate-200 block">{tx.name}</span>
                      {tx.grade && <span className="text-[10px] text-slate-500">{tx.grade}</span>}
                    </td>
                    <td className="p-3 text-slate-300">
                      {tx.reason}
                    </td>
                    <td className="p-3 text-right font-['Press_Start_2P'] text-[10px] font-bold whitespace-nowrap">
                      <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                        {isPositive ? `+${tx.delta}` : tx.delta} 🪙
                      </span>
                    </td>
                    <td className="p-3 text-right font-['Press_Start_2P'] text-[10px] text-[#fbbf24] font-bold whitespace-nowrap">
                      {tx.balance} 🪙
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
