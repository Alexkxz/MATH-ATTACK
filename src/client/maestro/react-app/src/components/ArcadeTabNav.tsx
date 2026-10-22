import React from 'react';
import { arcadeAudio } from '../utils/arcadeAudio';

export type TabKey = 'alumnos' | 'sesiones' | 'pruebas' | 'transacciones' | 'conexion' | 'ajustes';

interface ArcadeTabNavProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  studentsCount: number;
  playingCount: number;
  connectionsCount: number;
}

export const ArcadeTabNav: React.FC<ArcadeTabNavProps> = ({
  activeTab,
  onSelectTab,
  studentsCount,
  playingCount,
  connectionsCount
}) => {
  const tabs: Array<{
    key: TabKey;
    label: string;
    icon: string;
    badge?: string | number;
    color: string;
    borderColor: string;
  }> = [
    {
      key: 'alumnos',
      label: 'ALUMNOS',
      icon: '👥',
      badge: studentsCount,
      color: '#00e5ff',
      borderColor: 'rgba(0, 229, 255, 0.4)'
    },
    {
      key: 'sesiones',
      label: 'EN JUEGO',
      icon: '🎮',
      badge: playingCount,
      color: '#39ff14',
      borderColor: 'rgba(57, 255, 20, 0.4)'
    },
    {
      key: 'pruebas',
      label: 'PRUEBAS',
      icon: '📊',
      color: '#ff007f',
      borderColor: 'rgba(255, 0, 127, 0.4)'
    },
    {
      key: 'transacciones',
      label: 'ÁUREOS',
      icon: '💰',
      badge: '🪙',
      color: '#fbbf24',
      borderColor: 'rgba(251, 191, 36, 0.4)'
    },
    {
      key: 'conexion',
      label: 'RED / TEL',
      icon: '🔌',
      badge: connectionsCount,
      color: '#a78bfa',
      borderColor: 'rgba(167, 139, 250, 0.4)'
    },
    {
      key: 'ajustes',
      label: 'AJUSTES',
      icon: '⚙️',
      color: '#94a3b8',
      borderColor: 'rgba(148, 163, 184, 0.4)'
    }
  ];

  return (
    <nav className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto pb-2 border-b-2 border-cyan-500/25 mb-6 select-none scrollbar-none">
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              arcadeAudio.playButton();
              onSelectTab(tab.key);
            }}
            className={`group relative flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-t-lg font-['Press_Start_2P'] text-[8px] sm:text-[9px] tracking-wider whitespace-nowrap transition-all arcade-btn ${
              isActive
                ? 'bg-[#150d30] border-t-2 border-x-2 text-white shadow-[0_-4px_16px_rgba(0,229,255,0.2)] scale-[1.02] -mb-0.5 z-10'
                : 'bg-[#090614] border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-[#120a26]'
            }`}
            style={{
              borderColor: isActive ? tab.color : undefined,
              boxShadow: isActive ? `0 -2px 14px ${tab.color}33, inset 0 2px 0 ${tab.color}` : undefined
            }}
          >
            <span className="text-base group-hover:scale-110 transition-transform">{tab.icon}</span>
            <span
              style={{
                color: isActive ? tab.color : undefined,
                textShadow: isActive ? `0 0 10px ${tab.color}` : undefined
              }}
            >
              {tab.label}
            </span>

            {tab.badge !== undefined && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-sm text-[7px] font-bold ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
                    : 'bg-black/60 text-slate-500 border border-slate-800'
                }`}
              >
                {tab.badge}
              </span>
            )}

            {/* Glowing bottom indicator for active tab */}
            {isActive && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ backgroundColor: tab.color, boxShadow: `0 0 8px ${tab.color}` }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};
