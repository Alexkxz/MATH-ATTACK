import React, { useEffect, useRef } from 'react';
import { displayExamPercent } from './TestRewardsEditor';

const button = 'min-h-10 rounded border border-cyan-400/50 bg-cyan-950/40 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:opacity-40';
type Props = { data: any; testTitle: string; achievements: Array<{ id: string; name: string }>; busy: boolean; error: string; onClose: () => void; onApprove: (reason: string) => void };

export const ApprovalRewardsDialog: React.FC<Props> = ({ data, testTitle, achievements, busy, error, onClose, onApprove }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const reason = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node || !data) return;
    if (!node.open) node.showModal();
    reason.current?.focus();
    return () => { if (node.open) node.close(); };
  }, [data]);
  if (!data) return null;
  const { attempt, pending, preview } = data;
  const result = attempt.result;
  const earned = pending ? data.settlement?.rewards : preview?.rewards;
  const applied = pending ? data.settlement?.applied || {} : {};
  const showAmount = (key: string, amount: number) => <p className="text-sm">{key}: <b>{amount || 0}</b> Áureos {pending ? (applied[key] ? '· ya aplicado' : '· pendiente') : ''}</p>;
  const onSubmit = (event: React.FormEvent) => { event.preventDefault(); const value = reason.current?.value.trim() || ''; if (value) onApprove(value); };
  return <dialog ref={dialog} aria-labelledby="approval-title" aria-describedby="approval-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-xl border border-cyan-400/50 bg-[#0b081c] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75">
    <form onSubmit={onSubmit} className="space-y-4 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-cyan-300">Revisión de recompensas</p><h2 id="approval-title" className="mt-2 text-lg font-bold">Aprobar participación</h2></div><button type="button" className={button} aria-label="Cerrar revisión de recompensas" disabled={busy} onClick={onClose}>Cerrar</button></header>
      <div id="approval-description" className="space-y-2 rounded-lg border border-purple-400/25 bg-black/20 p-3">
        <p className="break-words text-sm"><b>Alumno:</b> {attempt.name}</p><p className="break-words text-sm"><b>Prueba:</b> {testTitle}</p><p className="text-sm"><b>Intento:</b> {attempt.attemptNumber || 1}</p>
        <p className="text-sm"><b>Resultado:</b> {result?.correct || 0} aciertos de {result?.total || attempt.totalQuestions || 0} · {displayExamPercent(result?.correct || 0, result?.total || attempt.totalQuestions || 0)}</p>
        {pending && <p role="status" className="rounded border border-amber-400/40 bg-amber-950/30 p-3 text-sm text-amber-100">Liquidación pendiente: se reanudarán los efectos que falten. Los que ya aparecen como aplicados no se repetirán.</p>}
        {showAmount('Áureos', earned?.aureos || 0)}
        <p className="text-sm">Experiencia: <b>{earned?.experience || 0}</b> {pending ? (applied.experience ? '· ya aplicada' : '· pendiente') : ''}</p>
        {earned?.streak && <p className="text-sm">Racha: actualización {pending && applied.streak ? 'ya aplicada' : 'incluida'}</p>}
        {(earned?.achievements || []).map((item: any) => <p className="break-words text-sm" key={item.id}>Logro {achievements.find(entry => entry.id === item.id)?.name || 'histórico'}: {item.bonus || 0} Áureos {pending && applied[`achievement:${item.id}`] ? '· ya aplicado' : ''}</p>)}
        {preview && <><p className="mt-2 border-t border-white/10 pt-2 text-sm"><b>Saldo de Áureos:</b> {preview.before.aureos} → {preview.after.aureos}</p><p className="text-sm"><b>Saldo de experiencia:</b> {preview.before.experience} → {preview.after.experience}</p></>}
        {pending && data.settlement?.balances && <><p className="mt-2 border-t border-white/10 pt-2 text-sm"><b>Saldo de Áureos:</b> {data.settlement.balances.before.aureos} → {data.settlement.balances.after.aureos}</p><p className="text-sm"><b>Saldo de experiencia:</b> {data.settlement.balances.before.experience} → {data.settlement.balances.after.experience}</p></>}
        {pending && !data.settlement?.balances && <p className="mt-2 border-t border-white/10 pt-2 text-xs text-amber-100">La liquidación histórica no guardó el saldo anterior y posterior; el sistema conservará la aplicación idempotente de sus efectos.</p>}
      </div>
      <p className="rounded border border-amber-400/40 bg-amber-950/20 p-3 text-sm text-amber-100">Aprobar cierra la participación de este alumno en esta prueba. No publica un resultado privado.</p>
      <label className="block text-sm">Motivo requerido<textarea ref={reason} aria-label="Motivo requerido para aprobar" required minLength={1} maxLength={1000} className="mt-1 min-h-20 w-full rounded border border-purple-400/30 bg-[#080615] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" placeholder="Escribe el motivo de la revisión"/></label>
      {error && <p role="alert" className="rounded border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className={button} disabled={busy}>{busy ? 'Procesando…' : pending ? 'Continuar liquidación' : 'Aprobar y cerrar participación'}</button></div>
    </form>
  </dialog>;
};
