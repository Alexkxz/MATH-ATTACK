import React from 'react';

const input = 'w-full rounded border border-purple-400/30 bg-[#080615] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-300';
const button = 'min-h-10 rounded border border-cyan-400/50 bg-cyan-950/40 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:opacity-40';
const amountMax = 100000;

export const exactExamPercent = (correct: number, total: number) => total > 0 ? Math.max(0, correct) / total * 100 : 0;
export const displayExamPercent = (correct: number, total: number) => `${exactExamPercent(correct, total).toLocaleString('es-MX', { maximumFractionDigits: 2 })}% (${correct} de ${total})`;

export function rewardTierCoverageError(rewards: any = {}) {
  const tiers = Array.isArray(rewards.aureosTiers) ? rewards.aureosTiers : [];
  if (!tiers.length) return '';
  const version = Number(rewards.aureosTiersVersion) || 1;
  const sorted = [...tiers].sort((a, b) => a.minPercent - b.minPercent || a.maxPercent - b.maxPercent);
  for (let i = 0; i < sorted.length; i += 1) {
    if (i === 0 && sorted[i].minPercent !== 0) return 'Falta definir qué Áureos se entregan desde 0%.';
    if (i > 0) {
      const previous = sorted[i - 1];
      const overlaps = version >= 2 ? sorted[i].minPercent < previous.maxPercent : sorted[i].minPercent <= previous.maxPercent;
      if (overlaps) return 'Hay tramos superpuestos. Ajusta sus límites antes de iniciar.';
      const contiguous = version >= 2 && sorted[i].minPercent === previous.maxPercent;
      if (!contiguous) return `Hay un hueco entre ${previous.maxPercent}${version >= 2 ? '%' : '%'} y ${sorted[i].minPercent}%. Define un tramo para cubrirlo antes de iniciar.`;
    }
  }
  if (sorted[sorted.length - 1].maxPercent !== 100) return `Falta definir qué Áureos se entregan desde ${sorted[sorted.length - 1].maxPercent}% hasta 100%.`;
  return '';
}

export function rewardConfigError(rewards: any = {}) {
  for (const [name, value] of [['Áureos', rewards.aureos ?? 0], ['Experiencia', rewards.experience ?? 0]] as const) {
    if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > amountMax) return `${name}: usa un número entero de 0 a ${amountMax}.`;
  }
  if (rewards.aureosTiers !== undefined && !Array.isArray(rewards.aureosTiers)) return 'Los intervalos de Áureos deben ser una lista.';
  for (const tier of rewards.aureosTiers || []) {
    if (!Number.isInteger(tier.minPercent) || !Number.isInteger(tier.maxPercent) || tier.minPercent < 0 || tier.maxPercent > 100 || tier.minPercent > tier.maxPercent || !Number.isInteger(tier.earned) || tier.earned < 0 || tier.earned > amountMax) return 'Revisa los límites y la cantidad de Áureos de cada tramo.';
  }
  const version = Number(rewards.aureosTiersVersion) || 1;
  const tiers = [...(rewards.aureosTiers || [])].sort((a: any, b: any) => a.minPercent - b.minPercent);
  for (let index = 1; index < tiers.length; index += 1) {
    if (version >= 2 ? tiers[index].minPercent < tiers[index - 1].maxPercent : tiers[index].minPercent <= tiers[index - 1].maxPercent) return 'Hay tramos superpuestos; asigna cada porcentaje a un solo tramo.';
  }
  return '';
}

type Props = { rewards: any; setRewards: (value: any) => void; achievements: Array<{ id: string; name: string; desc?: string; bonus?: number }>; disabled?: boolean };

export const TestRewardsEditor: React.FC<Props> = ({ rewards = {}, setRewards, achievements, disabled = false }) => {
  const tiers = Array.isArray(rewards.aureosTiers) ? rewards.aureosTiers : [];
  const version = Number(rewards.aureosTiersVersion) || (tiers.length ? 1 : 2);
  const hasHistoricalDiscount = tiers.some((tier: any) => Number(tier.lost) > 0);
  const unsupportedAchievements = Object.keys(rewards.achievements || {}).filter(id => !achievements.some(item => item.id === id));
  const legacyConflict = tiers.length > 0 && Number(rewards.aureos) > 0;
  const update = (patch: any) => setRewards({ ...rewards, ...patch });
  const updateTiers = (next: any[]) => update({ aureosTiers: next, aureosTiersVersion: version });
  const tierError = rewardTierCoverageError(rewards);
  const mode = tiers.length ? 'tiers' : 'fixed';

  const addTier = () => {
    const sorted = [...tiers].sort((a: any, b: any) => a.minPercent - b.minPercent);
    let start = 0;
    for (const tier of sorted) {
      const boundary = version >= 2 ? tier.minPercent : tier.minPercent;
      if (boundary > start) break;
      start = Math.max(start, version >= 2 ? tier.maxPercent : tier.maxPercent + 1);
    }
    const next = sorted.find((tier: any) => tier.minPercent > start);
    const end = next?.minPercent ?? 100;
    if (start >= 100 || end <= start) return;
    updateTiers([...tiers, { minPercent: start, maxPercent: end, earned: 0, lost: 0 }]);
  };
  const changeTier = (index: number, key: string, value: number) => updateTiers(tiers.map((tier: any, i: number) => i === index ? { ...tier, [key]: value, lost: Number(tier.lost) || 0 } : tier));

  return <div className="space-y-4" data-testid="test-rewards-editor">
    <div>
      <h4 className="font-semibold">Áureos</h4>
      <p className="mt-1 text-xs text-slate-400">El porcentaje es aciertos ÷ total de preguntas × 100. Las incorrectas, sin tiempo y no contestadas cuentan dentro del total.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Forma de entregar Áureos">
        <button type="button" className={`${button} ${mode === 'fixed' ? 'border-cyan-200 bg-cyan-900/70' : ''}`} aria-pressed={mode === 'fixed'} disabled={disabled || hasHistoricalDiscount || legacyConflict} onClick={() => update({ aureos: Number(rewards.aureos) || 0, aureosTiers: [], aureosTiersVersion: 2 })}>Cantidad fija</button>
        <button type="button" className={`${button} ${mode === 'tiers' ? 'border-cyan-200 bg-cyan-900/70' : ''}`} aria-pressed={mode === 'tiers'} disabled={disabled || hasHistoricalDiscount || legacyConflict} onClick={() => update({ aureos: 0, aureosTiers: tiers.length ? tiers : [{ minPercent: 0, maxPercent: 100, earned: 0, lost: 0 }], aureosTiersVersion: 2 })}>Por intervalos de porcentaje</button>
      </div>
      {legacyConflict && <p role="status" className="mt-2 rounded border border-amber-400/40 p-2 text-xs text-amber-100">Esta configuración histórica tiene cantidad fija e intervalos a la vez. Se conserva sin cambios hasta que se revise.</p>}
      {hasHistoricalDiscount && <p role="status" className="mt-2 rounded border border-amber-400/40 p-2 text-xs text-amber-100">Hay descuentos históricos en uno o más tramos. Se muestran y conservan sin cambios; estos controles no permiten crear ni editar descuentos.</p>}
    </div>
    {mode === 'fixed' && <label className="block text-xs">Áureos por aprobar<input className={`${input} mt-1`} type="number" min="0" max={amountMax} step="1" value={rewards.aureos ?? 0} disabled={disabled} onChange={e => update({ aureos: e.target.value === '' ? '' : Number(e.target.value) })}/></label>}
    {mode === 'tiers' && <div className="space-y-3">
      {tiers.map((tier: any, index: number) => <fieldset key={`${index}-${tier.minPercent}-${tier.maxPercent}`} disabled={disabled || hasHistoricalDiscount || legacyConflict} className="grid grid-cols-2 gap-2 rounded-lg border border-purple-400/25 p-3 sm:grid-cols-4">
        <legend className="px-1 text-xs font-semibold">Tramo {index + 1}</legend>
        <label className="text-xs">Mínimo (%)<input aria-label={`Tramo ${index + 1}: porcentaje mínimo`} className={`${input} mt-1`} type="number" min="0" max="100" step="1" value={tier.minPercent} onChange={e => changeTier(index, 'minPercent', Number(e.target.value))}/></label>
        <label className="text-xs">Máximo (%)<input aria-label={`Tramo ${index + 1}: porcentaje máximo`} className={`${input} mt-1`} type="number" min="1" max="100" step="1" value={tier.maxPercent} onChange={e => changeTier(index, 'maxPercent', Number(e.target.value))}/><span className="mt-1 block text-slate-500">{version >= 2 ? (tier.maxPercent === 100 ? 'incluye el 100%' : 'no incluye este límite') : 'incluye este límite (regla histórica)'}</span></label>
        <label className="text-xs">Áureos<input aria-label={`Tramo ${index + 1}: Áureos`} className={`${input} mt-1`} type="number" min="0" max={amountMax} step="1" value={tier.earned} onChange={e => changeTier(index, 'earned', Number(e.target.value))}/></label>
        {Number(tier.lost) > 0 && <p className="col-span-2 self-end text-xs text-amber-200 sm:col-span-1">Regla histórica: descuento de {tier.lost} Áureos</p>}
        <div className="col-span-2 flex items-end sm:col-span-1"><button type="button" className={button} disabled={disabled || hasHistoricalDiscount} onClick={() => updateTiers(tiers.filter((_: any, i: number) => i !== index))}>Quitar tramo {index + 1}</button></div>
      </fieldset>)}
      <div className="flex flex-wrap items-center gap-2"><button type="button" className={button} disabled={disabled || hasHistoricalDiscount || version < 2 || tiers.length >= 20 || rewardConfigError(rewards) !== ''} onClick={addTier}>Agregar tramo</button><span className="text-xs text-slate-400">En tramos nuevos, el mínimo se incluye y el máximo queda abierto; 100% sí se incluye. Así se pueden unir, por ejemplo, 0–50% y 50–100% sin solapar.</span></div>
      {version < 2 && <div className="rounded border border-amber-400/40 bg-amber-950/20 p-3 text-xs text-amber-100"><p>Estos intervalos históricos usan límites inclusivos. Se mantienen tal como fueron guardados.</p><button type="button" className={`${button} mt-2`} disabled={disabled || hasHistoricalDiscount} onClick={() => update({ aureosTiersVersion: 2 })}>Usar límites continuos sin solapamiento</button></div>}
      {tierError && <p role="alert" data-testid="reward-coverage-error" className="rounded border border-amber-400/40 bg-amber-950/30 p-3 text-xs text-amber-100">{tierError} No se asignarán Áureos a esos resultados; completa los intervalos antes de iniciar.</p>}
    </div>}
    <label className="block text-xs">Experiencia por aprobar<input className={`${input} mt-1`} type="number" min="0" max={amountMax} step="1" value={rewards.experience ?? 0} disabled={disabled} onChange={e => update({ experience: e.target.value === '' ? '' : Number(e.target.value) })}/></label>
    <fieldset disabled={disabled} className="rounded-lg border border-purple-400/25 p-3"><legend className="px-1 text-xs font-semibold">Racha</legend><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={rewards.streak?.enabled === true} onChange={e => update({ streak: { ...(rewards.streak || {}), enabled: e.target.checked } })}/>Aplicar actualización de racha del juego</label><p className="text-xs text-slate-400">Se usa el cálculo de racha existente; esta opción no añade penalizaciones.</p></fieldset>
    <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-purple-400/25 p-3"><legend className="px-1 text-xs font-semibold">Logros</legend>
      {achievements.map(item => { const rule = rewards.achievements?.[item.id] || {}; return <div key={item.id} className="grid gap-2 border-b border-white/5 py-2 sm:grid-cols-[minmax(0,1fr)_10rem]"><label className="flex min-h-10 items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={rule.enabled === true} onChange={e => update({ achievements: { ...(rewards.achievements || {}), [item.id]: { ...rule, enabled: e.target.checked } } })}/><span><b>{item.name}</b><span className="block text-xs text-slate-400">{item.desc}</span></span></label><label className="text-xs">Áureos adicionales<input className={`${input} mt-1`} type="number" min="0" max={amountMax} value={rule.bonus ?? item.bonus ?? 0} onChange={e => update({ achievements: { ...(rewards.achievements || {}), [item.id]: { ...rule, bonus: Number(e.target.value) } } })}/></label></div>; })}
      {unsupportedAchievements.map(id => <p key={id} role="status" className="text-xs text-amber-200">Logro histórico “{id}”: se conserva sin editar porque ya no está en el catálogo actual.</p>)}
    </fieldset>
    {Object.keys(rewards).some(key => !['aureos','experience','aureosTiers','aureosTiersVersion','streak','achievements'].includes(key)) && <p role="status" className="rounded border border-amber-400/40 p-2 text-xs text-amber-100">Hay reglas históricas que no tienen un control equivalente. Se conservarán al guardar esta configuración.</p>}
  </div>;
};
