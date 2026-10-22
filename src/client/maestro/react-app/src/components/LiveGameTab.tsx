import React, { useState } from 'react';
import { GameSession, MultiplayerRoom } from '../types/maestro';
import { buildAvatarSVG } from '../utils/avatar';
import { arcadeAudio } from '../utils/arcadeAudio';

interface LiveGameTabProps {
  sessions: GameSession[];
  onCommandAll: (cmd: 'pause' | 'resume' | 'end') => void;
  onCommandPlayer: (sessionId: string, cmd: 'pause' | 'resume' | 'end') => void;
  onOpenAnnounce: () => void;
  onOpenProjector: () => void;
  onSimulateAnswer?: () => void;
}

export const LiveGameTab: React.FC<LiveGameTabProps> = ({
  sessions,
  onCommandAll,
  onCommandPlayer,
  onOpenAnnounce,
  onOpenProjector,
  onSimulateAnswer
}) => {
  const [viewMode, setViewMode] = useState<'individual' | 'multiplayer'>('individual');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'grade' | 'status'>('score');

  const filtered = sessions
    .filter(s => (selectedGrade ? s.grade === selectedGrade : true))
    .sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'grade') return a.grade.localeCompare(b.grade);
      if (sortBy === 'status') {
        const order = (s: GameSession) => (s.paused ? 1 : s.status === 'finished' ? 2 : 0);
        return order(a) - order(b);
      }
      return a.name.localeCompare(b.name);
    });

  // Group multiplayer sessions by room
  const multiplayerRooms: MultiplayerRoom[] = React.useMemo(() => {
    const mpSessions = sessions.filter(s => s.gameMode === 'online' || s.roomId);
    const roomsMap = new Map<string, MultiplayerRoom>();

    mpSessions.forEach(s => {
      const rId = s.roomId || 'ROOM-GENERAL';
      if (!roomsMap.has(rId)) {
        roomsMap.set(rId, {
          roomId: rId,
          roomName: s.roomName || 'Arena de Combate',
          hostName: s.name,
          roomStatus: s.status === 'playing' ? 'playing' : 'lobby',
          roomPlayerCount: 0,
          roomMaxPlayers: 4,
          mpGameMode: s.mpGameMode || 'Duelo 1v1',
          players: []
        });
      }
      const room = roomsMap.get(rId)!;
      room.players.push(s);
      room.roomPlayerCount = room.players.length;
    });

    return Array.from(roomsMap.values());
  }, [sessions]);

  return (
    <div className="space-y-4 select-none">
      {/* Mass Command Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#090616] border border-cyan-500/25 rounded-lg p-3 sm:p-4">
        {/* Left: View Mode Segmented Control */}
        <div className="flex items-center gap-2">
          <div className="bg-black/60 p-1 rounded border border-purple-500/30 flex items-center">
            <button
              type="button"
              onClick={() => { arcadeAudio.playButton(); setViewMode('individual'); }}
              className={`px-3 py-1.5 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5 transition-all ${
                viewMode === 'individual'
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,229,255,0.7)] font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🧑</span>
              <span>INDIVIDUAL ({sessions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => { arcadeAudio.playButton(); setViewMode('multiplayer'); }}
              className={`px-3 py-1.5 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5 transition-all ${
                viewMode === 'multiplayer'
                  ? 'bg-pink-500 text-white shadow-[0_0_10px_rgba(255,0,127,0.7)] font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🌐</span>
              <span>MULTIJUGADOR ({multiplayerRooms.length})</span>
            </button>
          </div>

          {onSimulateAnswer && (
            <button
              type="button"
              onClick={() => { arcadeAudio.playCoin(); onSimulateAnswer(); }}
              className="px-2.5 py-1.5 rounded bg-lime-950/40 border border-lime-500/40 hover:bg-lime-900/40 text-lime-300 font-['Press_Start_2P'] text-[7px]"
              title="Simular que un alumno responde en vivo"
            >
              ⚡ SIMULAR ACCIÓN
            </button>
          )}
        </div>

        {/* Right: Master Control Push Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { arcadeAudio.playWarning(); onCommandAll('pause'); }}
            className="px-2.5 py-2 rounded bg-amber-950/40 border border-amber-500/40 hover:bg-amber-900/50 text-amber-300 font-['Press_Start_2P'] text-[8px] flex items-center gap-1"
            title="Pausar todas las partidas activas"
          >
            <span>⏸</span>
            <span>PAUSAR TODOS</span>
          </button>
          <button
            type="button"
            onClick={() => { arcadeAudio.playLaser(); onCommandAll('resume'); }}
            className="px-2.5 py-2 rounded bg-emerald-950/40 border border-emerald-500/40 hover:bg-emerald-900/50 text-emerald-300 font-['Press_Start_2P'] text-[8px] flex items-center gap-1"
            title="Reanudar todas las partidas"
          >
            <span>▶</span>
            <span>REANUDAR</span>
          </button>
          <button
            type="button"
            onClick={() => { arcadeAudio.playWarning(); onCommandAll('end'); }}
            className="px-2.5 py-2 rounded bg-rose-950/40 border border-rose-500/40 hover:bg-rose-900/50 text-rose-300 font-['Press_Start_2P'] text-[8px] flex items-center gap-1"
            title="Terminar todas las sesiones"
          >
            <span>🛑</span>
            <span>TERMINAR</span>
          </button>
          <button
            type="button"
            onClick={() => { arcadeAudio.playButton(); onOpenAnnounce(); }}
            className="arcade-btn arcade-btn-pink py-2 px-3 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1 font-bold"
          >
            <span>📢</span>
            <span>ANUNCIO</span>
          </button>
          <button
            type="button"
            onClick={() => { arcadeAudio.playLaser(); onOpenProjector(); }}
            className="arcade-btn arcade-btn-cyan py-2 px-3 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1 font-bold"
          >
            <span>📽️</span>
            <span>PROYECTOR</span>
          </button>
        </div>
      </div>

      {/* Filter and Sorting Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d081f] border border-purple-500/20 rounded-lg p-2.5 text-xs font-['Chakra_Petch']">
        <div className="flex items-center gap-2">
          <span className="font-['Press_Start_2P'] text-[8px] text-purple-300">ORDENAR:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as unknown as typeof sortBy)}
            className="bg-black/60 border border-purple-500/30 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
          >
            <option value="score">Mayor Puntaje ↓</option>
            <option value="name">Nombre A-Z</option>
            <option value="grade">Grado Escolar</option>
            <option value="status">Estado de Partida</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="font-['Press_Start_2P'] text-[8px] text-purple-300 mr-1">GRADO:</span>
          {['', '1° Grado', '2° Grado', '3° Grado', '4° Grado', '5° Grado', '6° Grado'].map(g => (
            <button
              key={g}
              type="button"
              onClick={() => { arcadeAudio.playButton(); setSelectedGrade(g); }}
              className={`px-2 py-0.5 rounded text-[8px] font-['Press_Start_2P'] ${
                selectedGrade === g
                  ? 'bg-cyan-500 text-black font-bold shadow-[0_0_8px_rgba(0,229,255,0.6)]'
                  : 'bg-black/40 text-slate-400 border border-slate-800'
              }`}
            >
              {g ? g.replace(' Grado', '') : 'TODOS'}
            </button>
          ))}
        </div>
      </div>

      {/* VIEW: INDIVIDUAL SESSIONS */}
      {viewMode === 'individual' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-16 border-2 border-dashed border-cyan-500/20 rounded-xl bg-black/30">
              <span className="text-4xl block mb-3 animate-pulse">🛸</span>
              <p className="font-['Press_Start_2P'] text-xs text-cyan-300">ESPERANDO JUGADORES EN VIVO</p>
              <p className="text-xs text-slate-500 font-['Chakra_Petch'] mt-1">
                Cuando los alumnos ingresen a Math Attack, sus terminales aparecerán aquí en tiempo real.
              </p>
            </div>
          ) : (
            filtered.map(session => {
              const progressPct = session.totalQ > 0 ? Math.round((session.qIndex / session.totalQ) * 100) : 0;
              const accuracy =
                session.correct + session.wrong > 0
                  ? Math.round((session.correct / (session.correct + session.wrong)) * 100)
                  : 0;

              // Radial Ring Math
              const R = 24;
              const circumference = 2 * Math.PI * R;
              const strokeDasharray = `${(progressPct / 100) * circumference} ${circumference}`;

              return (
                <div
                  key={session.id}
                  className={`relative flex flex-col justify-between rounded-xl bg-[#0a0718] border-2 transition-all overflow-hidden ${
                    session.paused
                      ? 'border-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.15)]'
                      : session.status === 'finished'
                      ? 'border-rose-500/40 opacity-75'
                      : 'border-cyan-400/50 shadow-[0_0_20px_rgba(0,229,255,0.2)]'
                  }`}
                >
                  {/* Top Bar: Name, Mode, Streak */}
                  <div className="bg-[#120926] px-3.5 py-2.5 border-b border-purple-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="font-['Press_Start_2P'] text-[10px] text-slate-100 font-bold truncate">
                        {session.name}
                      </span>
                      {session.streak >= 2 && (
                        <span className="text-[8px] font-['Press_Start_2P'] text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                          🔥{session.streak}
                        </span>
                      )}
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[7px] font-['Press_Start_2P'] bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 shrink-0">
                      {session.grade}
                    </span>
                  </div>

                  {/* Player Status & Radial Ring Avatar */}
                  <div className="p-3.5 flex items-center gap-3">
                    <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle
                          cx="28"
                          cy="28"
                          r={R}
                          className="stroke-slate-800"
                          strokeWidth="4"
                          fill="transparent"
                        />
                        <circle
                          cx="28"
                          cy="28"
                          r={R}
                          stroke={session.paused ? '#fbbf24' : '#00e5ff'}
                          strokeWidth="4"
                          strokeDasharray={strokeDasharray}
                          strokeLinecap="round"
                          fill="transparent"
                          className="transition-all duration-500"
                        />
                      </svg>
                      <div
                        className="w-10 h-10 rounded-full overflow-hidden bg-[#160c33] flex items-center justify-center border border-purple-400/40"
                        dangerouslySetInnerHTML={{ __html: buildAvatarSVG(session.avatar, 36) }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-['Press_Start_2P'] text-lg font-bold text-[#fbbf24] neon-glow-yellow">
                          {session.score.toLocaleString()} <span className="text-[8px] text-slate-400">PTS</span>
                        </span>
                        <span className="font-['Press_Start_2P'] text-[9px] text-cyan-400">
                          {session.qIndex}/{session.totalQ}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1.5 text-[8px] font-['Press_Start_2P']">
                        <span className="text-emerald-400 font-bold">✓ {session.correct}</span>
                        <span className="text-rose-400 font-bold">✕ {session.wrong}</span>
                        <span className="text-cyan-300 ml-auto">{accuracy}% ACC</span>
                      </div>
                    </div>
                  </div>

                  {/* Big Neon Question Display */}
                  <div className="mx-3.5 my-1 p-3 rounded-lg bg-black/70 border border-purple-500/30 text-center relative overflow-hidden">
                    <span className="block text-[7px] font-['Press_Start_2P'] text-purple-400/80 mb-1">
                      PREGUNTA ACTUAL
                    </span>
                    <span className="text-xl sm:text-2xl font-['Press_Start_2P'] font-bold text-white tracking-wider neon-glow-cyan">
                      {session.currentQuestion || 'En preparación...'}
                    </span>

                    {/* Question Time Remaining Bar */}
                    {session.timeLimit && session.timeLimit > 0 && (
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-2 border border-slate-800">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-300"
                          style={{
                            width: `${Math.max(0, Math.min(100, ((session.timeLeft || 0) / session.timeLimit) * 100))}%`
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Action Buttons for this player */}
                  <div className="bg-[#120926] p-2.5 border-t border-purple-500/20 flex items-center justify-between gap-2 text-[8px] font-['Press_Start_2P']">
                    {session.paused ? (
                      <button
                        type="button"
                        onClick={() => onCommandPlayer(session.id, 'resume')}
                        className="flex-1 py-1.5 px-3 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50"
                      >
                        ▶ REANUDAR
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCommandPlayer(session.id, 'pause')}
                        className="flex-1 py-1.5 px-3 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300 hover:bg-amber-900/50"
                      >
                        ⏸ PAUSAR
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onCommandPlayer(session.id, 'end')}
                      className="py-1.5 px-3 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 hover:bg-rose-900/50"
                      title="Terminar partida de este alumno"
                    >
                      🛑 TERMINAR
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW: MULTIPLAYER VERSUS ROOMS */}
      {viewMode === 'multiplayer' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {multiplayerRooms.length === 0 ? (
            <div className="col-span-full text-center py-16 border-2 border-dashed border-pink-500/20 rounded-xl bg-black/30">
              <span className="text-4xl block mb-3 animate-pulse">⚔️</span>
              <p className="font-['Press_Start_2P'] text-xs text-pink-300">NO HAY SALAS MULTIJUGADOR ACTIVAS</p>
              <p className="text-xs text-slate-500 font-['Chakra_Petch'] mt-1">
                Las salas de Duelo 1v1 y torneos multijugador aparecerán aquí cuando los alumnos se desafíen.
              </p>
            </div>
          ) : (
            multiplayerRooms.map(room => {
              const p1 = room.players[0];
              const p2 = room.players[1];

              return (
                <div
                  key={room.roomId}
                  className="rounded-xl bg-[#0c081e] border-2 border-pink-500/40 p-4 shadow-[0_0_25px_rgba(255,0,127,0.2)] flex flex-col justify-between"
                >
                  {/* Room Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-pink-500/25">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-['Press_Start_2P'] text-[10px] text-pink-400 font-bold">
                          {room.roomName}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[7px] font-['Press_Start_2P'] bg-pink-950 border border-pink-500 text-pink-200">
                          {room.mpGameMode}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">ID: {room.roomId}</span>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[8px] font-['Press_Start_2P'] bg-emerald-950/70 border border-emerald-400 text-emerald-300">
                      EN COMBATE
                    </span>
                  </div>

                  {/* Head-to-Head Versus Split Arena */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 my-4 bg-black/60 rounded-xl p-3 border border-purple-500/20">
                    {/* Player 1 */}
                    <div className="flex flex-col items-center text-center">
                      <div
                        className="w-14 h-14 rounded-xl border-2 border-cyan-400 overflow-hidden bg-[#140b2b] shadow-[0_0_12px_rgba(0,229,255,0.4)] flex items-center justify-center mb-1.5"
                        dangerouslySetInnerHTML={{ __html: buildAvatarSVG(p1?.avatar, 48) }}
                      />
                      <span className="font-['Press_Start_2P'] text-[9px] text-cyan-300 truncate max-w-[120px]">
                        {p1?.name || 'Jugador 1'}
                      </span>
                      <span className="font-['Press_Start_2P'] text-sm text-[#fbbf24] font-bold mt-1">
                        {p1?.score.toLocaleString() || 0}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {p1?.correct || 0}✓ · {p1?.qIndex || 0}/{p1?.totalQ || 20}
                      </span>
                    </div>

                    {/* VS Badge */}
                    <div className="flex flex-col items-center">
                      <span className="font-['Press_Start_2P'] text-xl text-[#ff007f] font-black neon-glow-fuchsia animate-pulse">
                        VS
                      </span>
                      <span className="text-[7px] font-['Press_Start_2P'] text-slate-500 mt-1">
                        DUELO
                      </span>
                    </div>

                    {/* Player 2 */}
                    <div className="flex flex-col items-center text-center">
                      <div
                        className="w-14 h-14 rounded-xl border-2 border-pink-400 overflow-hidden bg-[#140b2b] shadow-[0_0_12px_rgba(255,0,127,0.4)] flex items-center justify-center mb-1.5"
                        dangerouslySetInnerHTML={{ __html: buildAvatarSVG(p2?.avatar, 48) }}
                      />
                      <span className="font-['Press_Start_2P'] text-[9px] text-pink-300 truncate max-w-[120px]">
                        {p2?.name || 'Esperando rival...'}
                      </span>
                      <span className="font-['Press_Start_2P'] text-sm text-[#fbbf24] font-bold mt-1">
                        {p2?.score.toLocaleString() || 0}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {p2?.correct || 0}✓ · {p2?.qIndex || 0}/{p2?.totalQ || 20}
                      </span>
                    </div>
                  </div>

                  {/* Leader Bar */}
                  <div className="text-[8px] font-['Press_Start_2P'] text-slate-400 flex items-center justify-between pt-1">
                    <span>LÍDER ACTUAL:</span>
                    <span className="text-amber-400">
                      {p1 && p2
                        ? p1.score >= p2.score
                          ? `🏆 ${p1.name} (+${p1.score - p2.score} pts)`
                          : `🏆 ${p2.name} (+${p2.score - p1.score} pts)`
                        : 'En curso'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
