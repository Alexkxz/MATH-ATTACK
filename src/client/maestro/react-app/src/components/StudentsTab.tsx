import React, { useState } from 'react';
import { Player } from '../types/maestro';
import { POWERS_DEF, getPlayerLevel } from '../utils/constants';
import { buildAvatarSVG } from '../utils/avatar';
import { arcadeAudio } from '../utils/arcadeAudio';
import { EditValueType } from './Modals/EditValueModal';

interface StudentsTabProps {
  students: Player[];
  onlineStudentNames: string[];
  onAddStudentClick: () => void;
  onBulkAureosClick: () => void;
  onOpenHistory: (student: Player) => void;
  onDeleteStudent: (id: string, name: string) => void;
  onOpenEditModal: (type: EditValueType, title: string, hint: string, initial: string | number, onSave: (val: string | number) => void) => void;
  onUpdateStudent: (student: Player) => void;
  onExportCsv: () => void;
}

export const StudentsTab: React.FC<StudentsTabProps> = ({
  students,
  onlineStudentNames,
  onAddStudentClick,
  onBulkAureosClick,
  onOpenHistory,
  onDeleteStudent,
  onOpenEditModal,
  onUpdateStudent,
  onExportCsv
}) => {
  const [selectedGrade, setSelectedGrade] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPowersStudentIds, setExpandedPowersStudentIds] = useState<Set<string>>(() => new Set());
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  const grades = ['', '1° Grado', '2° Grado', '3° Grado', '4° Grado', '5° Grado', '6° Grado'];

  const filteredStudents = students.filter(s => {
    if (selectedGrade && s.grade !== selectedGrade) return false;
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const allFilteredPowersExpanded = filteredStudents.length > 0 && filteredStudents.every(s => expandedPowersStudentIds.has(s.id));
  const toggleAllPowerEditors = () => {
    arcadeAudio.playButton();
    if (allFilteredPowersExpanded && !selectedGrade && !searchQuery) {
      setExpandedPowersStudentIds(new Set());
      return;
    }
    setSelectedGrade('');
    setSearchQuery('');
    setExpandedPowersStudentIds(new Set(students.map(student => student.id)));
  };

  const togglePin = (id: string) => {
    arcadeAudio.playLaser();
    setRevealedPins(prev => ({ ...prev, [id]: !prev[id] }));
    setTimeout(() => {
      setRevealedPins(prev => ({ ...prev, [id]: false }));
    }, 4000);
  };

  const handleQuickCoinChange = (student: Player, delta: number) => {
    arcadeAudio.playCoin();
    const updated = {
      ...student,
      aureos: Math.max(0, student.aureos + delta)
    };
    onUpdateStudent(updated);
  };

  return (
    <div className="space-y-4">
      {/* Action Header & Tools */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0a0718] border border-cyan-500/20 rounded-lg p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">👥</span>
          <div>
            <h2 className="text-xs sm:text-sm font-['Press_Start_2P'] text-[#00e5ff] tracking-wider neon-glow-cyan">
              PADRÓN DE JUGADORES
            </h2>
            <p className="text-[10px] text-slate-400 font-['Chakra_Petch']">
              {filteredStudents.length} de {students.length} alumnos registrados
            </p>
          </div>
        </div>

        {/* Action Buttons Deck */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAllPowerEditors}
            className="px-3 py-2 rounded bg-purple-950/50 border border-purple-400/40 hover:bg-purple-900/50 text-purple-200 font-['Press_Start_2P'] text-[8px]"
            title="Quita los filtros y muestra el editor de poderes de cada alumno"
          >
            {allFilteredPowersExpanded && !selectedGrade && !searchQuery ? 'CERRAR PODERES' : `EDITAR PODERES DE TODOS (${students.length})`}
          </button>
          <button
            type="button"
            onClick={() => { arcadeAudio.playButton(); onAddStudentClick(); }}
            className="arcade-btn arcade-btn-lime py-2 px-3 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5 font-bold"
          >
            <span>+</span>
            <span>NUEVO ALUMNO</span>
          </button>
          <button
            type="button"
            onClick={() => { arcadeAudio.playButton(); onBulkAureosClick(); }}
            className="arcade-btn arcade-btn-amber py-2 px-3 rounded font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5 font-bold"
          >
            <span>🪙</span>
            <span>DAR ÁUREOS</span>
          </button>
          <button
            type="button"
            onClick={() => { arcadeAudio.playButton(); onExportCsv(); }}
            className="px-3 py-2 rounded bg-cyan-950/40 border border-cyan-500/40 hover:bg-cyan-900/40 text-cyan-300 font-['Press_Start_2P'] text-[8px] flex items-center gap-1.5"
            title="Descargar lista completa en formato CSV"
          >
            <span>📊</span>
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0d091f] border border-purple-500/20 rounded-lg p-3">
        {/* Grade Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <span className="text-[9px] font-['Press_Start_2P'] text-purple-300 mr-1 shrink-0">GRADO:</span>
          {grades.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => { arcadeAudio.playButton(); setSelectedGrade(g); }}
              className={`px-2.5 py-1 rounded text-[8px] font-['Press_Start_2P'] whitespace-nowrap transition-all ${
                selectedGrade === g
                  ? 'bg-[#ff007f] text-white shadow-[0_0_10px_rgba(255,0,127,0.5)] font-bold'
                  : 'bg-black/40 text-slate-400 border border-purple-500/20 hover:border-purple-400/50'
              }`}
            >
              {g ? g.replace(' Grado', '') : 'TODOS'}
            </button>
          ))}
        </div>

        {/* Live Search Input */}
        <div className="relative min-w-[200px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre..."
            className="w-full bg-black/60 border border-cyan-500/30 rounded pl-7 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      {/* Collectible Cards Grid */}
      {filteredStudents.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-purple-500/20 rounded-xl bg-black/30">
          <span className="text-4xl block mb-3 animate-bounce">👾</span>
          <p className="font-['Press_Start_2P'] text-xs text-purple-300">NO SE ENCONTRARON ALUMNOS</p>
          <p className="text-xs text-slate-500 font-['Chakra_Petch'] mt-1">
            Intenta cambiar el filtro de grado o agrega un nuevo jugador al padrón.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
          {filteredStudents.map(student => {
            const isOnline = onlineStudentNames.includes(student.name.toLowerCase());
            const levelInfo = getPlayerLevel(student.experience || 0);
            const isPowersExpanded = expandedPowersStudentIds.has(student.id);
            const powersKeys = Object.keys(student.inventory || {}).filter(k => (student.inventory[k] || 0) > 0);

            return (
              <div
                key={student.id}
                className={`relative flex flex-col justify-between rounded-xl bg-[#090616] border-2 transition-all duration-200 overflow-hidden shadow-lg ${
                  isOnline
                    ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.25)] ring-1 ring-emerald-400/50'
                    : 'border-purple-500/30 hover:border-cyan-400/60 hover:shadow-[0_0_20px_rgba(0,229,255,0.2)]'
                }`}
              >
                {/* Card Top Banner */}
                <div className="bg-gradient-to-r from-[#170e33] to-[#201046] px-3.5 py-2.5 border-b border-purple-500/20 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="font-['Press_Start_2P'] text-[10px] sm:text-[11px] text-slate-100 font-bold block truncate">
                      {student.name}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[8px] font-['Press_Start_2P'] bg-amber-500/20 border border-amber-400/40 text-amber-300 shrink-0">
                    {student.grade}
                  </span>
                </div>

                {/* Avatar & Online status glow */}
                <div className="p-4 flex items-center gap-4 bg-gradient-to-b from-transparent to-black/40">
                  <div className="relative shrink-0">
                    <div
                      className={`w-16 h-16 rounded-xl border-2 overflow-hidden flex items-center justify-center bg-[#130b2e] shadow-md ${
                        isOnline ? 'border-emerald-400' : 'border-purple-400/40'
                      }`}
                      dangerouslySetInnerHTML={{ __html: buildAvatarSVG(student.avatar, 56) }}
                    />
                    {/* Live Online Badge */}
                    {isOnline && (
                      <span
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#39ff14] border-2 border-black animate-pulse"
                        title="Jugador conectado ahora mismo"
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Level & XP */}
                    <div className="flex items-center justify-between text-[9px] font-['Press_Start_2P']">
                      <span className="text-cyan-400">Lv.{levelInfo.level} {levelInfo.name}</span>
                      <span className="text-purple-300 font-mono">{student.experience} XP</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-purple-500/30 p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${levelInfo.progressPct}%` }}
                      />
                    </div>

                    {/* Badges row */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {student.avgPct && student.avgPct >= 80 && (
                        <span className="text-[8px] font-['Press_Start_2P'] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                          ★ PRECISIÓN {student.avgPct}%
                        </span>
                      )}
                      {isOnline && (
                        <span className="text-[8px] font-['Press_Start_2P'] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                          EN LÍNEA
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coins Row & Quick Adjust */}
                <div className="px-3.5 py-2 bg-black/40 border-y border-purple-500/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="animate-coin text-base">🪙</span>
                    <span className="text-[9px] font-['Press_Start_2P'] text-slate-400">ÁUREOS:</span>
                    <span className="font-['Press_Start_2P'] text-sm text-[#fbbf24] font-bold">
                      {student.aureos}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleQuickCoinChange(student, -10)}
                      className="px-1.5 py-0.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 rounded text-[9px] font-bold text-rose-300"
                      title="Restar 10 Áureos"
                    >
                      -10
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickCoinChange(student, 10)}
                      className="px-1.5 py-0.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/40 rounded text-[9px] font-bold text-emerald-300"
                      title="Sumar 10 Áureos"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenEditModal(
                          'aureos',
                          'EDITAR ÁUREOS',
                          `Modifica el saldo total de monedas para ${student.name}`,
                          student.aureos,
                          val => onUpdateStudent({ ...student, aureos: Number(val) })
                        )
                      }
                      className="p-1 text-slate-400 hover:text-amber-400 text-xs"
                      title="Editar saldo exacto"
                    >
                      ✏️
                    </button>
                  </div>
                </div>

                {/* PIN Management */}
                <div className="px-3.5 py-2 bg-[#0d081f] flex items-center justify-between text-[9px] font-['Press_Start_2P'] text-slate-400 border-b border-purple-500/20">
                  <div className="flex items-center gap-1.5">
                    <span>PIN:</span>
                    <span className="text-cyan-300 font-mono font-bold tracking-widest text-[11px]">
                      {revealedPins[student.id] ? student.pin : '••••'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => togglePin(student.id)}
                      className="text-cyan-400 hover:text-cyan-200 text-[8px]"
                      title="Revelar PIN por 4 segundos"
                    >
                      {revealedPins[student.id] ? '🙈 OCULTAR' : '👁 VER PIN'}
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenEditModal(
                          'pin',
                          'CAMBIAR PIN',
                          `Asigna una nueva clave numérica de 4 dígitos para ${student.name}`,
                          student.pin,
                          val => onUpdateStudent({ ...student, pin: String(val) })
                        )
                      }
                      className="text-amber-400 hover:text-amber-200 text-[8px]"
                      title="Cambiar contraseña del alumno"
                    >
                      🔑 EDITAR
                    </button>
                  </div>
                </div>

                {/* Powers Drawer */}
                <div className="p-3 bg-black/50">
                  <div
                    onClick={() => {
                      arcadeAudio.playButton();
                      setExpandedPowersStudentIds(prev => {
                        const next = new Set(prev);
                        if (next.has(student.id)) next.delete(student.id);
                        else next.add(student.id);
                        return next;
                      });
                    }}
                    className="flex items-center justify-between text-[8px] font-['Press_Start_2P'] text-purple-300 cursor-pointer hover:text-purple-100"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>◈ PODERES</span>
                      <span className="px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 font-mono">
                        {powersKeys.length}
                      </span>
                    </span>
                    <span className="text-[10px]">{isPowersExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Collapsed quick chips */}
                  {!isPowersExpanded && (
                    <div className="flex flex-wrap gap-1 mt-2 min-h-[22px]">
                      {powersKeys.length === 0 ? (
                        <span className="text-[9px] font-['Press_Start_2P'] text-slate-600">
                          SIN PODERES EN INVENTARIO
                        </span>
                      ) : (
                        powersKeys.map(k => {
                          const def = POWERS_DEF.find(p => p.id === k);
                          return (
                            <span
                              key={k}
                              className="px-1.5 py-0.5 rounded bg-[#160d33] border border-purple-500/30 text-[10px] inline-flex items-center gap-1"
                              title={`${def?.name || k}: ${student.inventory[k]} disponibles`}
                            >
                              <span>{def?.icon}</span>
                              <span className="text-purple-300 font-mono text-[9px] font-bold">
                                ×{student.inventory[k]}
                              </span>
                            </span>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Expanded full grid to grant/modify powers */}
                  {isPowersExpanded && (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 mt-3 pt-2 border-t border-purple-500/20">
                      {POWERS_DEF.map(p => {
                        const qty = student.inventory?.[p.id] || 0;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              onOpenEditModal(
                                'power',
                                `PODER: ${p.name.toUpperCase()}`,
                                `Cantidad de ${p.name} en inventario (${p.desc})`,
                                qty,
                                val => {
                                  const updatedInv = { ...student.inventory, [p.id]: Number(val) };
                                  if (Number(val) <= 0) delete updatedInv[p.id];
                                  onUpdateStudent({ ...student, inventory: updatedInv });
                                }
                              )
                            }
                            className={`p-1.5 rounded flex flex-col items-center justify-center border transition-all ${
                              qty > 0
                                ? 'bg-purple-950/70 border-purple-400 text-purple-200 shadow-[0_0_8px_rgba(167,139,250,0.3)]'
                                : 'bg-black/40 border-purple-900/30 text-slate-600 hover:border-purple-400/40 hover:text-slate-300'
                            }`}
                            title={`${p.name}: ${qty} disponibles. Clic para editar cantidad.`}
                          >
                            <span className="text-sm">{p.icon}</span>
                            <span className="text-[8px] font-mono font-bold mt-0.5">
                              {qty > 0 ? `×${qty}` : '0'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="bg-[#120a28] p-2 border-t border-purple-500/20 flex items-center justify-between gap-1 text-[8px] font-['Press_Start_2P']">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenEditModal(
                        'grade',
                        'CAMBIAR GRADO',
                        `Asigna el nuevo grado escolar para ${student.name}`,
                        student.grade,
                        val => onUpdateStudent({ ...student, grade: String(val) })
                      )
                    }
                    className="flex-1 py-1.5 px-2 bg-black/40 hover:bg-purple-900/40 border border-purple-500/30 rounded text-slate-300 text-center"
                  >
                    🎓 GRADO
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      arcadeAudio.playLaser();
                      onOpenHistory(student);
                    }}
                    className="flex-1 py-1.5 px-2 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/40 rounded text-cyan-300 text-center"
                    title="Ver gráfica de precisión y partidas"
                  >
                    📊 STATS
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteStudent(student.id, student.name)}
                    className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 rounded text-rose-400 px-2.5"
                    title="Eliminar alumno"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
