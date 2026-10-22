import React, { useState } from 'react';
import { ClientConnection, ConsoleLogEntry } from '../types/maestro';
import { arcadeAudio } from '../utils/arcadeAudio';

interface ConnectionsTabProps {
  connections: ClientConnection[];
  logs: ConsoleLogEntry[];
  onKickPlayer: (id: string, name: string) => void;
  onClearLogs: () => void;
}

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  connections,
  logs,
  onKickPlayer,
  onClearLogs
}) => {
  const [filterType, setFilterType] = useState<string>('all');

  const totalClients = connections.length;
  const maestroClients = connections.filter(c => c.type === 'maestro').length;
  const playerClients = connections.filter(c => c.type === 'player').length;

  const filteredLogs = logs.filter(l => {
    if (filterType === 'all') return true;
    return l.evType === filterType;
  });

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs}s`;
  };

  return (
    <div className="space-y-4 select-none">
      {/* Network Telemetry Scoreboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0b081c] border-2 border-cyan-500/40 rounded-lg p-3 sm:p-4 text-center shadow-[0_0_15px_rgba(0,229,255,0.15)]">
          <span className="block text-[8px] font-['Press_Start_2P'] text-cyan-400 mb-1">TOTAL CLIENTES</span>
          <span className="text-2xl font-['Press_Start_2P'] font-bold text-cyan-300 neon-glow-cyan">{totalClients}</span>
        </div>
        <div className="bg-[#0b081c] border-2 border-purple-500/40 rounded-lg p-3 sm:p-4 text-center shadow-[0_0_15px_rgba(167,139,250,0.15)]">
          <span className="block text-[8px] font-['Press_Start_2P'] text-purple-400 mb-1">CONSOLA MAESTRO</span>
          <span className="text-2xl font-['Press_Start_2P'] font-bold text-purple-300 neon-glow-fuchsia">{maestroClients}</span>
        </div>
        <div className="bg-[#0b081c] border-2 border-emerald-500/40 rounded-lg p-3 sm:p-4 text-center shadow-[0_0_15px_rgba(52,211,153,0.15)]">
          <span className="block text-[8px] font-['Press_Start_2P'] text-emerald-400 mb-1">JUGADORES LAN</span>
          <span className="text-2xl font-['Press_Start_2P'] font-bold text-emerald-300 neon-glow-lime">{playerClients}</span>
        </div>
        <div className="bg-[#0b081c] border-2 border-amber-500/40 rounded-lg p-3 sm:p-4 text-center shadow-[0_0_15px_rgba(251,191,36,0.15)]">
          <span className="block text-[8px] font-['Press_Start_2P'] text-amber-400 mb-1">TRÁFICO SOCKETS</span>
          <span className="text-2xl font-['Press_Start_2P'] font-bold text-amber-300">48 <span className="text-xs">msg/s</span></span>
        </div>
      </div>

      {/* Connected Clients Table */}
      <div className="border border-cyan-500/30 rounded-xl overflow-hidden bg-[#070514]">
        <div className="bg-[#100b26] p-3 border-b border-cyan-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 animate-pulse text-xs">●</span>
            <span className="font-['Press_Start_2P'] text-[9px] text-[#00e5ff] tracking-wider">
              TERMINALES CONECTADAS EN RED LOCAL
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {connections.length} socket(s) activos
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-['Chakra_Petch']">
            <thead className="bg-[#170e36] border-b border-cyan-500/20 text-cyan-300 font-['Press_Start_2P'] text-[8px]">
              <tr>
                <th className="p-3">TIPO</th>
                <th className="p-3">NOMBRE</th>
                <th className="p-3">GRADO</th>
                <th className="p-3">IP / HOST</th>
                <th className="p-3">TIEMPO</th>
                <th className="p-3 text-right">MSGS ↓</th>
                <th className="p-3 text-right">MSGS ↑</th>
                <th className="p-3 text-center">LATENCIA</th>
                <th className="p-3 text-center">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10 bg-black/40">
              {connections.map(c => {
                const isMaestro = c.type === 'maestro';
                const lat = c.latency;
                return (
                  <tr key={c.id} className="hover:bg-cyan-950/20 transition-colors">
                    <td className="p-3 whitespace-nowrap">
                      {isMaestro ? (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-['Press_Start_2P'] bg-purple-500/20 border border-purple-400 text-purple-300">
                          🖥️ MAESTRO
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-['Press_Start_2P'] bg-cyan-500/20 border border-cyan-400 text-cyan-300">
                          🎮 ALUMNO
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-slate-100">{c.name}</td>
                    <td className="p-3 text-slate-400">{c.grade || '—'}</td>
                    <td className="p-3 font-mono text-[11px] text-slate-400">{c.ip}</td>
                    <td className="p-3 font-mono text-cyan-300 text-[11px]">{formatDuration(c.connectedMs)}</td>
                    <td className="p-3 text-right font-mono text-emerald-400 font-bold">{c.msgIn}</td>
                    <td className="p-3 text-right font-mono text-cyan-400 font-bold">{c.msgOut}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded font-['Press_Start_2P'] text-[8px] font-bold ${
                          lat == null ? 'bg-slate-900 text-slate-400 border border-slate-700' : lat < 30
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                            : lat < 80
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                            : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {lat == null ? '—' : `${lat}ms`}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {!isMaestro ? (
                        <button
                          type="button"
                          onClick={() => {
                            arcadeAudio.playWarning();
                            onKickPlayer(c.id, c.name);
                          }}
                          className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-['Press_Start_2P'] text-[7px]"
                          title="Desconectar al alumno de la sesión"
                        >
                          ⚡ KICK
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[8px] font-mono">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Real-time Arcade Terminal Activity Log */}
      <div className="border border-purple-500/30 rounded-xl overflow-hidden bg-[#070512]">
        <div className="bg-[#120a28] p-3 border-b border-purple-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-purple-400">📋</span>
            <span className="font-['Press_Start_2P'] text-[9px] text-[#a78bfa] tracking-wider">
              REGISTRO DE ACTIVIDAD DEL SISTEMA (TELEMETRÍA)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-black/60 border border-purple-500/30 rounded px-2 py-0.5 text-xs text-purple-300"
            >
              <option value="all">Todos los eventos</option>
              <option value="connect">Conexiones</option>
              <option value="disconnect">Desconexiones</option>
              <option value="kick">Kicks / Expulsiones</option>
              <option value="exam">Pruebas / Exámenes</option>
              <option value="reward">Recompensas</option>
            </select>
            <button
              type="button"
              onClick={() => { arcadeAudio.playButton(); onClearLogs(); }}
              className="px-2.5 py-1 rounded bg-black/40 hover:bg-slate-800 border border-slate-700 text-slate-300 font-['Press_Start_2P'] text-[7px]"
            >
              ↻ ACTUALIZAR
            </button>
          </div>
        </div>

        <div className="p-3 font-mono text-xs max-h-56 overflow-y-auto space-y-1 bg-black/70">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-6 text-slate-600 font-['Press_Start_2P'] text-[8px]">
              SIN EVENTOS REGISTRADOS
            </div>
          ) : (
            filteredLogs.map(log => {
              const d = new Date(log.ts);
              const timeStr = d.toTimeString().slice(0, 8);
              return (
                <div key={log.id} className="flex items-baseline gap-2 py-0.5 border-b border-slate-900/60">
                  <span className="text-slate-500 text-[10px] shrink-0 font-['Press_Start_2P'] text-[7px]">
                    [{timeStr}]
                  </span>
                  <span
                    className={`font-semibold ${
                      log.evType === 'connect'
                        ? 'text-emerald-400'
                        : log.evType === 'disconnect'
                        ? 'text-rose-400'
                        : log.evType === 'kick'
                        ? 'text-amber-400'
                        : log.evType === 'exam'
                        ? 'text-cyan-400'
                        : 'text-purple-300'
                    }`}
                  >
                    {log.msg}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
