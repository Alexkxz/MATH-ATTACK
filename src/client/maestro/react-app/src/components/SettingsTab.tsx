import React, { useState } from 'react';
import { arcadeAudio } from '../utils/arcadeAudio';

interface SettingsTabProps {
  crtActive: boolean;
  onToggleCrt: () => void;
  audioActive: boolean;
  onToggleAudio: () => void;
  onLogout: () => void;
  onCredentialsChanged: (password: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  crtActive,
  onToggleCrt,
  audioActive,
  onToggleAudio,
  onLogout,
  onCredentialsChanged
}) => {
  const [curPass, setCurPass] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!curPass) {
      setMsg({ text: 'Debes ingresar tu contraseña actual', ok: false });
      arcadeAudio.playWarning();
      return;
    }
    if (newPass && newPass !== newPass2) {
      setMsg({ text: 'Las nuevas contraseñas no coinciden', ok: false });
      arcadeAudio.playWarning();
      return;
    }

    try {
      const response = await fetch('/api/maestro/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: curPass, newUsername: newUser || undefined, newPassword: newPass || undefined }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudieron guardar las credenciales');
      onCredentialsChanged(newPass || curPass);
      arcadeAudio.playFanfare();
      setMsg({ text: 'Credenciales actualizadas correctamente', ok: true });
      setCurPass(''); setNewPass(''); setNewPass2(''); setNewUser('');
    } catch (error: any) {
      setMsg({ text: error.message || 'No se pudieron guardar las credenciales', ok: false });
      arcadeAudio.playWarning();
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 select-none">
      {/* Arcade Sound FX Test Station */}
      <div className="bg-[#0b081c] border-2 border-lime-500/40 rounded-xl p-5 shadow-[0_0_20px_rgba(57,255,20,0.15)]">
        <div className="flex items-center justify-between pb-3 border-b border-lime-500/30">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🔊</span>
            <h3 className="font-['Press_Start_2P'] text-xs sm:text-sm text-[#39ff14] tracking-wider neon-glow-lime">
              MÓDULO DE AUDIO ARCADE 8-BIT
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              onToggleAudio();
              arcadeAudio.playCoin();
            }}
            className={`px-3 py-1.5 rounded font-['Press_Start_2P'] text-[8px] border transition-all ${
              audioActive
                ? 'bg-lime-500 text-slate-950 border-lime-300 font-bold shadow-[0_0_10px_#39ff14]'
                : 'bg-black/40 border-slate-700 text-slate-500'
            }`}
          >
            {audioActive ? 'AUDIO HABILITADO' : 'AUDIO SILENCIADO'}
          </button>
        </div>

        <p className="text-xs text-slate-400 font-['Chakra_Petch'] mt-3 mb-4">
          Prueba los sintetizadores de frecuencia generados en tiempo real mediante Web Audio API:
        </p>

        {/* Sound Test Push Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <button
            type="button"
            onClick={() => arcadeAudio.playCoin()}
            className="arcade-btn arcade-btn-amber py-2.5 px-3 rounded text-center font-['Press_Start_2P'] text-[8px] font-bold"
          >
            🪙 COIN FX
          </button>
          <button
            type="button"
            onClick={() => arcadeAudio.playLaser()}
            className="arcade-btn arcade-btn-cyan py-2.5 px-3 rounded text-center font-['Press_Start_2P'] text-[8px] font-bold"
          >
            ⚡ LASER FX
          </button>
          <button
            type="button"
            onClick={() => arcadeAudio.playPowerup()}
            className="arcade-btn arcade-btn-pink py-2.5 px-3 rounded text-center font-['Press_Start_2P'] text-[8px] font-bold"
          >
            🚀 POWERUP
          </button>
          <button
            type="button"
            onClick={() => arcadeAudio.playFanfare()}
            className="arcade-btn arcade-btn-lime py-2.5 px-3 rounded text-center font-['Press_Start_2P'] text-[8px] font-bold"
          >
            🏆 FANFARRIA
          </button>
          <button
            type="button"
            onClick={() => arcadeAudio.playWarning()}
            className="px-3 py-2.5 rounded bg-rose-950/80 border border-rose-500/60 hover:bg-rose-900 text-rose-300 font-['Press_Start_2P'] text-[8px] font-bold"
          >
            🚨 ALERTA
          </button>
        </div>
      </div>

      {/* CRT Display Aesthetics Station */}
      <div className="bg-[#0b081c] border-2 border-cyan-500/40 rounded-xl p-5 shadow-[0_0_20px_rgba(0,229,255,0.15)]">
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/30">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📺</span>
            <h3 className="font-['Press_Start_2P'] text-xs sm:text-sm text-[#00e5ff] tracking-wider neon-glow-cyan">
              PANTALLA CRT & SCANLINES RETRO
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              arcadeAudio.playButton();
              onToggleCrt();
            }}
            className={`px-3 py-1.5 rounded font-['Press_Start_2P'] text-[8px] border transition-all ${
              crtActive
                ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-bold shadow-[0_0_10px_#00e5ff]'
                : 'bg-black/40 border-slate-700 text-slate-500'
            }`}
          >
            {crtActive ? 'CRT SCANLINES ACTIVAS' : 'CRT DESACTIVADO'}
          </button>
        </div>
        <p className="text-xs text-slate-400 font-['Chakra_Petch'] mt-3">
          El filtro CRT proyecta líneas de escaneo analógicas de 240p y viñeta en curva para replicar con precisión los gabinetes arcade de los años 80 y 90.
        </p>
      </div>

      {/* Security Credentials Form */}
      <div className="bg-[#0b081c] border-2 border-purple-500/40 rounded-xl p-5 shadow-[0_0_20px_rgba(167,139,250,0.15)]">
        <div className="flex items-center gap-2.5 pb-3 border-b border-purple-500/30">
          <span className="text-xl">🔐</span>
          <h3 className="font-['Press_Start_2P'] text-xs sm:text-sm text-[#a78bfa] tracking-wider">
            CREDENCIALES DE ACCESO MAESTRO
          </h3>
        </div>

        <form onSubmit={handleSaveCredentials} className="mt-4 space-y-4">
          <div>
            <label className="block text-[9px] font-['Press_Start_2P'] text-purple-300 uppercase mb-2">
              ▶ Contraseña Actual del Panel
            </label>
            <input
              type="password"
              value={curPass}
              onChange={e => setCurPass(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-black/60 border border-purple-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-['Press_Start_2P'] text-purple-300 uppercase mb-2">
                ▶ Nuevo Usuario (Opcional)
              </label>
              <input
                type="text"
                value={newUser}
                onChange={e => setNewUser(e.target.value)}
                placeholder="profesor_arcade"
                className="w-full bg-black/60 border border-purple-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[9px] font-['Press_Start_2P'] text-purple-300 uppercase mb-2">
                ▶ Nueva Contraseña
              </label>
              <input
                type="password"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Nueva clave"
                className="w-full bg-black/60 border border-purple-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-['Press_Start_2P'] text-purple-300 uppercase mb-2">
              ▶ Confirmar Nueva Contraseña
            </label>
            <input
              type="password"
              value={newPass2}
              onChange={e => setNewPass2(e.target.value)}
              placeholder="Repite la nueva clave"
              className="w-full bg-black/60 border border-purple-500/40 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {msg && (
            <p
              className={`text-xs font-['Press_Start_2P'] text-center p-2 rounded ${
                msg.ok ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/30' : 'text-rose-400 bg-rose-950/40 border border-rose-500/30'
              }`}
            >
              {msg.text}
            </p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="arcade-btn arcade-btn-cyan py-2.5 px-6 rounded font-['Press_Start_2P'] text-[9px] uppercase tracking-wider font-bold"
            >
              [ GUARDAR CAMBIOS ]
            </button>
          </div>
        </form>
      </div>

      {/* Logout Cabinet Button */}
      <div className="bg-[#0b081c] border-2 border-rose-500/30 rounded-xl p-5 shadow-lg flex items-center justify-between">
        <div>
          <h4 className="font-['Press_Start_2P'] text-xs text-rose-400 font-bold">
            🚪 CERRAR SESIÓN DE MAESTRO
          </h4>
          <p className="text-xs text-slate-400 font-['Chakra_Petch'] mt-1">
            Bloquea la consola maestra. Requerirá ingresar usuario y contraseña en la pantalla de inicio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            arcadeAudio.playLaser();
            onLogout();
          }}
          className="arcade-btn arcade-btn-pink py-2.5 px-5 rounded font-['Press_Start_2P'] text-[9px] uppercase tracking-wider font-bold"
        >
          [ SALIR ]
        </button>
      </div>
    </div>
  );
};
