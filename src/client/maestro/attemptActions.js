'use strict';

(function () {
  const ACTIONS = {
    pause: { label: 'Pausar', states: ['started', 'in_progress', 'reconnected'] },
    resume: { label: 'Reanudar', states: ['paused'] },
    close: { label: 'Cerrar', states: ['started', 'in_progress', 'paused', 'reconnected', 'reopened'] },
    allowReentry: { label: 'Permitir reentrada', states: ['disconnected'] },
    reopen: { label: 'Reabrir', states: ['finished', 'incomplete'] },
    restart: { label: 'Reiniciar', states: ['finished', 'incomplete'] },
    markIncomplete: { label: 'Marcar incompleto', states: ['started', 'in_progress', 'paused', 'disconnected', 'reconnected', 'reopened'] },
    delete: { label: 'Eliminar', states: ['pending', 'started', 'in_progress', 'paused', 'disconnected', 'reconnected', 'finished', 'incomplete', 'reopened'] },
  };
  const DELICATE = new Set(['close', 'reopen', 'restart', 'markIncomplete', 'delete']);
  const busy = new Set();
  const rows = new Map();
  let currentAttempts = [];
  let bulkBusy = false;
  let loadedTestId = '';
  const id = () => { try { return crypto.randomUUID(); } catch (_) { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; } };
  const escText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const statusLabel = { pending: 'Pendiente', started: 'Iniciado', in_progress: 'En progreso', paused: 'Pausado', disconnected: 'Desconectado', reconnected: 'Reentrada permitida', finished: 'Finalizado', incomplete: 'Incompleto', reopened: 'Reabierto', restarted: 'Reiniciado', deleted: 'Eliminado' };
  const rewardLabels = { aureos: 'Áureos', experience: 'XP', streak: 'Racha' };
  const connectionLabels = { connected: 'Conectado', disconnected: 'Desconectado', reconnected: 'Reentrada permitida', finished: 'Finalizado', unknown: 'Sin conexión confirmada' };
  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    try { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'medium' }).format(date); } catch (_) { return date.toLocaleString('es-MX'); }
  }

  function message(text, ok = false) { const element = document.getElementById('prAttemptsStatus'); if (element) { element.textContent = text; element.classList.toggle('ok', ok); element.classList.toggle('error', !ok); } }
  function askConfirmation(title, text) {
    return new Promise(resolve => {
      let modal = document.getElementById('prActionConfirmModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'prActionConfirmModal';
        modal.className = 'pr-action-confirm-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = '<div class="pr-action-confirm-card" role="dialog" aria-modal="true" aria-labelledby="prActionConfirmTitle"><div class="pr-action-confirm-kicker">CONFIRMACIÓN DE ACCIÓN</div><h3 id="prActionConfirmTitle"></h3><p id="prActionConfirmText"></p><div class="pr-action-confirm-actions"><button type="button" class="pr-action-confirm-cancel">CANCELAR</button><button type="button" class="pr-action-confirm-ok">CONFIRMAR</button></div></div>';
        document.body.appendChild(modal);
      }
      const titleElement = modal.querySelector('#prActionConfirmTitle');
      const textElement = modal.querySelector('#prActionConfirmText');
      const cancel = modal.querySelector('.pr-action-confirm-cancel');
      const ok = modal.querySelector('.pr-action-confirm-ok');
      titleElement.textContent = title;
      textElement.textContent = text;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      const close = result => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); cancel.removeEventListener('click', onCancel); ok.removeEventListener('click', onOk); modal.removeEventListener('click', onBackdrop); resolve(result); };
      const onCancel = () => close(false);
      const onOk = () => close(true);
      const onBackdrop = event => { if (event.target === modal) close(false); };
      cancel.addEventListener('click', onCancel); ok.addEventListener('click', onOk); modal.addEventListener('click', onBackdrop); ok.focus();
    });
  }
  function safeReward(value) { if (!value || typeof value !== 'object') return null; return { status: value.status || '', rewardSettlementId: value.rewardSettlementId || '', eventId: value.eventId || '', applied: value.applied && typeof value.applied === 'object' ? value.applied : {}, completedAt: value.completedAt || '' }; }
  function rewardEligibility(attempt) {
    if (!attempt || attempt.status !== 'finished' || attempt.deletedAt || !attempt.hasValidResult) return { kind: 'ineligible', label: 'No elegible' };
    if (!attempt.officialAttempt) return { kind: 'ineligible', label: 'No elegible · no oficial' };
    if (!attempt.rankingPublication) return { kind: 'pending-publication', label: 'Pendiente de publicación' };
    if (attempt.rewardError) return { kind: 'unknown', label: 'Estado desconocido' };
    if (attempt.rewardSettlement?.status === 'completed') return { kind: 'completed', label: 'Recompensas aplicadas' };
    if (attempt.rewardSettlement?.status === 'pending') return { kind: 'pending', label: 'Liquidación pendiente' };
    if (attempt.rewardSettlement?.status) return { kind: 'unknown', label: 'Estado desconocido' };
    return { kind: 'ready', label: 'Listo para liquidar' };
  }
  function effectSummary(reward) {
    if (!reward?.applied) return '';
    const effects = Object.keys(reward.applied).filter(key => reward.applied[key]).map(key => key.startsWith('achievement:') ? `Logro ${key.slice(12)}` : rewardLabels[key] || key);
    return effects.length ? `<span class="pr-attempt-reward-effects">Efectos: ${escText(effects.join(' · '))}</span>` : '';
  }
  function actionButtons(attempt) {
    const actions = Object.entries(ACTIONS).filter(([action, config]) => config.states.includes(attempt.status) && !(attempt.officialAttempt && ['reopen', 'restart'].includes(action))).map(([action, config]) => `<button type="button" class="pr-attempt-btn pr-attempt-${action}" data-action="${action}" data-attempt-id="${escText(attempt.attemptId)}">${config.label}</button>`);
    if (attempt.status === 'finished' && attempt.hasValidResult && !attempt.officialAttempt) actions.push(`<button type="button" class="pr-attempt-btn pr-attempt-official" data-special="official" data-attempt-id="${escText(attempt.attemptId)}">Oficializar intento</button>`);
    if (attempt.status === 'finished' && attempt.officialAttempt && !attempt.rankingPublication) actions.push(`<button type="button" class="pr-attempt-btn pr-attempt-publish" data-special="publish" data-attempt-id="${escText(attempt.attemptId)}">Publicar en Ranking</button>`);
    const reward = rewardEligibility(attempt);
    if (reward.kind === 'ready' || reward.kind === 'pending') actions.push(`<button type="button" class="pr-attempt-btn pr-attempt-reward" data-special="reward" data-attempt-id="${escText(attempt.attemptId)}">${reward.kind === 'pending' ? 'Recuperar recompensas' : 'Liquidar recompensas'}</button>`);
    return actions.join('');
  }
  function row(attempt) {
    const status = statusLabel[attempt.status] || attempt.status || 'Estado desconocido';
    const progress = attempt.totalQuestions ? `${Number(attempt.index) || 0} / ${Number(attempt.totalQuestions) || 0}` : '—';
    const checkpoint = attempt.checkpointRestored ? `Checkpoint ${Number(attempt.checkpointRevision) || 0} · índice ${Number(attempt.index) || 0}` : 'Sin checkpoint';
    const timing = `Inicio: ${escText(formatDateTime(attempt.startedAt))} · Actualizado: ${escText(formatDateTime(attempt.updatedAt))}${attempt.finishedAt ? ` · Fin: ${escText(formatDateTime(attempt.finishedAt))}` : ''}`;
    const reward = rewardEligibility(attempt);
    const stateTag = ['completed', 'pending', 'ready', 'pending-publication', 'unknown', 'ineligible'].includes(reward.kind) ? reward.label : attempt.rankingPublication ? 'Publicado en Ranking' : attempt.officialAttempt ? 'Oficial · pendiente de publicación' : status;
    return `<article class="pr-attempt-card" data-attempt-card="${escText(attempt.attemptId)}"><div class="pr-attempt-main"><strong>${escText(attempt.name || 'Cuenta del alumno')}</strong><span class="pr-attempt-meta">Progreso: ${escText(progress)} · Aciertos: ${Number(attempt.correct) || 0} · Errores: ${Number(attempt.incorrect) || 0}</span><span class="pr-attempt-meta">${escText(checkpoint)} · ${escText(connectionLabels[attempt.connectionState] || connectionLabels.unknown)}</span><span class="pr-attempt-meta">${timing}</span>${effectSummary(attempt.rewardSettlement)}</div><span class="pr-attempt-state">${escText(stateTag)} · rev. ${Number(attempt.revision) || 0}</span><div class="pr-attempt-actions">${actionButtons(attempt)}</div></article>`;
  }
  function updateOfficializeAllButton() { const button = document.getElementById('prOfficializeAll'); const publishButton = document.getElementById('prPublishAll'); const settleButton = document.getElementById('prSettleAll'); const eligible = [...rows.values()].filter(attempt => attempt.status === 'finished' && attempt.hasValidResult && !attempt.officialAttempt); const publishable = [...rows.values()].filter(attempt => attempt.status === 'finished' && attempt.hasValidResult && attempt.officialAttempt && !attempt.rankingPublication); const settleable = [...rows.values()].filter(attempt => ['ready', 'pending'].includes(rewardEligibility(attempt).kind)); if (button) { button.hidden = eligible.length === 0; button.textContent = eligible.length ? `⚡ OFICIALIZAR TODO (${eligible.length})` : '⚡ OFICIALIZAR TODO'; button.disabled = false; } if (publishButton) { publishButton.hidden = publishable.length === 0; publishButton.textContent = publishable.length ? `🏆 PUBLICAR TODO (${publishable.length})` : '🏆 PUBLICAR TODO'; publishButton.disabled = false; } if (settleButton) { settleButton.hidden = settleable.length === 0; settleButton.textContent = settleable.length ? `💰 LIQUIDAR TODO (${settleable.length})` : '💰 LIQUIDAR TODO'; settleButton.disabled = false; } }
  function matchesFilter(attempt) { const filter = document.getElementById('prAttemptStatusFilter')?.value || 'all'; if (filter === 'pending-official') return attempt.status === 'finished' && attempt.hasValidResult && !attempt.officialAttempt; if (filter === 'official') return !!attempt.officialAttempt && !attempt.rankingPublication; if (filter === 'published') return !!attempt.rankingPublication; if (filter === 'rewards-pending') return ['ready', 'pending'].includes(rewardEligibility(attempt).kind); if (filter === 'rewards-completed') return rewardEligibility(attempt).kind === 'completed'; return true; }
  function updateBatchSummary() { const target = document.getElementById('prBatchSummary'); if (!target) return; const total = currentAttempts.length; const official = currentAttempts.filter(attempt => !!attempt.officialAttempt).length; const published = currentAttempts.filter(attempt => !!attempt.rankingPublication).length; const pendingRewards = currentAttempts.filter(attempt => ['ready', 'pending'].includes(rewardEligibility(attempt).kind)).length; const completedRewards = currentAttempts.filter(attempt => rewardEligibility(attempt).kind === 'completed').length; target.textContent = total ? `Intentos: ${total} · Oficializados: ${official} · Publicados: ${published} · Recompensas pendientes: ${pendingRewards} · Aplicadas: ${completedRewards}` : '';
  }
  function renderFiltered() { const element = document.getElementById('prAttemptsList'); if (!element) return; const visible = currentAttempts.filter(matchesFilter); element.innerHTML = visible.length ? visible.map(row).join('') : '<p class="pr-attempts-empty">No hay intentos para este filtro.</p>'; updateBatchSummary(); }
  function render(list) { const element = document.getElementById('prAttemptsList'); if (!element) return; currentAttempts = list; rows.clear(); list.forEach(attempt => rows.set(attempt.attemptId, attempt)); renderFiltered(); updateOfficializeAllButton(); }
  async function load() {
    const input = document.getElementById('prAttemptTestId'); const testId = (input?.value || '').trim();
    if (!testId) { message('Indica el ID de la prueba.'); return; }
    loadedTestId = testId; message('Cargando…', true);
    try {
      const response = await fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(testId)}/attempts`)); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudieron cargar los intentos');
      const attempts = Array.isArray(data.attempts) ? data.attempts : []; const officialResponse = await fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(testId)}/official-attempts`)); const officialData = officialResponse.ok ? await officialResponse.json() : { officialAttempts: [] }; const officials = new Map((officialData.officialAttempts || []).map(item => [item.attemptId, item]));
      await Promise.all(attempts.map(async attempt => {
        attempt.officialAttempt = officials.get(attempt.attemptId) || null; if (!attempt.officialAttempt) return;
        const publicationResponse = await fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(testId)}/attempts/${encodeURIComponent(attempt.attemptId)}/ranking-publication`)); if (publicationResponse.ok) { const publicationData = await publicationResponse.json(); attempt.rankingPublication = publicationData.publication || null; }
        if (attempt.rankingPublication && attempt.status === 'finished' && attempt.hasValidResult) { const rewardResponse = await fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(testId)}/attempts/${encodeURIComponent(attempt.attemptId)}/rewards?officialAttemptId=${encodeURIComponent(attempt.officialAttempt.officialAttemptId)}&rankingPublicationId=${encodeURIComponent(attempt.rankingPublication.rankingPublicationId)}`)); if (rewardResponse.ok) { const rewardData = await rewardResponse.json(); attempt.rewardSettlement = safeReward(rewardData.settlement); } else if (rewardResponse.status !== 404) attempt.rewardError = true; }
      }));
      render(attempts); message(`${attempts.length} intentos cargados`, true);
    } catch (error) { render([]); message(error.message || 'Error al cargar intentos'); }
  }
  async function send(attemptId, action) {
    if (busy.has(attemptId)) return; const card = document.querySelector(`[data-attempt-card="${CSS.escape(attemptId)}"]`); const state = card?.querySelector('.pr-attempt-state')?.textContent || ''; const current = Number((state.match(/rev\.\s*(\d+)/) || [])[1]); if (!Number.isInteger(current)) { message('No se pudo determinar la revisión del intento.'); return; }
    if (DELICATE.has(action) && !await askConfirmation(ACTIONS[action].label, `¿Deseas ${ACTIONS[action].label.toLowerCase()} este intento? Esta acción quedará registrada.`)) return; const reason = action === 'delete' ? 'Eliminación desde Supervisión' : prompt('Motivo de la acción:'); if (reason === null || !reason.trim()) { message('El motivo es obligatorio.'); return; }
    busy.add(attemptId); card?.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { const response = await fetch(`/api/maestro/tests/${encodeURIComponent(loadedTestId)}/attempts/${encodeURIComponent(attemptId)}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ action, reason: reason.trim(), revision: current + 1, eventId: id() }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo aplicar la acción'); const next = data.newAttempt || data.attempt; if (next && card) { const previous = rows.get(attemptId) || {}; Object.assign(previous, next); rows.set(next.attemptId, previous); card.outerHTML = row(previous); } else if (card) card.remove(); message(data.duplicate ? 'Acción ya aplicada' : `${ACTIONS[action].label} aplicado`, true); }
    catch (error) { message(error.message || 'Error de red'); card?.querySelectorAll('button').forEach(button => { button.disabled = false; }); } finally { busy.delete(attemptId); }
  }
  async function sendSpecial(attemptId, special, options = {}) {
    if (special === 'reward') return sendReward(attemptId); const key = `${special}:${attemptId}`; if (busy.has(key)) return; const attempt = rows.get(attemptId); if (!attempt) return;
    const text = 'Publicar este intento oficial agregará una entrada separada al Ranking. ¿Continuar?'; if (special !== 'official' && !options.skipConfirmation && !await askConfirmation('Publicar en Ranking', text)) return; const reason = special === 'official' ? 'Oficialización desde Supervisión' : (options.reason || prompt('Motivo de publicación:')); if (reason === null || !reason.trim()) { message('El motivo es obligatorio.'); return; }
    busy.add(key); const card = document.querySelector(`[data-attempt-card="${CSS.escape(attemptId)}"]`); card?.querySelectorAll('button').forEach(button => { button.disabled = true; }); const endpoint = special === 'official' ? `/api/maestro/tests/${encodeURIComponent(loadedTestId)}/attempts/${encodeURIComponent(attemptId)}/official` : `/api/maestro/tests/${encodeURIComponent(loadedTestId)}/attempts/${encodeURIComponent(attemptId)}/ranking-publication`;
    try { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ action: special === 'official' ? 'officialize' : 'publish', reason: reason.trim(), eventId: id() }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo completar la operación'); if (special === 'official') attempt.officialAttempt = data.officialAttempt; else attempt.rankingPublication = data.publication; rows.set(attemptId, attempt); if (card) card.outerHTML = row(attempt); updateOfficializeAllButton(); message(data.duplicate ? 'Operación ya aplicada' : special === 'official' ? 'Intento oficializado' : 'Publicado en Ranking', true); }
    catch (error) { message(error.message || 'Error de red'); card?.querySelectorAll('button').forEach(button => { button.disabled = false; }); } finally { busy.delete(key); }
  }
  async function officializeAll() {
    const pending = [...rows.values()].filter(attempt => attempt.status === 'finished' && attempt.hasValidResult && !attempt.officialAttempt);
    if (!pending.length) { message('No hay intentos válidos pendientes de oficializar.'); return; }
    const button = document.getElementById('prOfficializeAll'); if (button) button.disabled = true;
    for (const attempt of pending) await sendSpecial(attempt.attemptId, 'official');
    updateOfficializeAllButton();
    message(`${pending.length} intento(s) procesado(s) para oficialización`, true);
  }
  async function publishAll() {
    const pending = [...rows.values()].filter(attempt => attempt.status === 'finished' && attempt.hasValidResult && attempt.officialAttempt && !attempt.rankingPublication);
    if (!pending.length) { message('No hay intentos oficializados pendientes de publicar.'); return; }
    if (!await askConfirmation('Publicar todos en Ranking', `Se publicarán ${pending.length} intento(s) oficializado(s) de esta prueba.`)) return;
    const button = document.getElementById('prPublishAll'); if (button) button.disabled = true;
    for (const attempt of pending) await sendSpecial(attempt.attemptId, 'publish', { skipConfirmation: true, reason: 'Publicación desde Supervisión' });
    updateOfficializeAllButton();
    message(`${pending.length} intento(s) publicado(s) en Ranking`, true);
  }
  async function settleAll() {
    const pending = [...rows.values()].filter(attempt => ['ready', 'pending'].includes(rewardEligibility(attempt).kind));
    if (!pending.length) { message('No hay recompensas pendientes de liquidar.'); return; }
    if (!await askConfirmation('Liquidar todas las recompensas', `Se aplicarán las recompensas de ${pending.length} intento(s) publicados.`)) return;
    const button = document.getElementById('prSettleAll'); if (button) button.disabled = true;
    for (const attempt of pending) await sendReward(attempt.attemptId, { skipConfirmation: true, reason: 'Liquidación desde Supervisión' });
    updateOfficializeAllButton();
    message(`${pending.length} liquidación(es) de recompensas procesada(s)`, true);
  }
  function filterAttempts() { renderFiltered(); updateOfficializeAllButton(); }
  function exportAttemptsCsv() {
    const selected = currentAttempts.filter(matchesFilter); if (!selected.length) { message('No hay intentos para exportar.'); return; }
    const escCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [['Alumno', 'Grado', 'Estado', 'Aciertos', 'Errores', 'Oficializado', 'Publicado', 'Recompensas'], ...selected.map(attempt => [attempt.name || 'Sin nombre', attempt.grade || 'Sin grado', statusLabel[attempt.status] || attempt.status, attempt.correct || 0, attempt.incorrect || 0, attempt.officialAttempt ? 'Sí' : 'No', attempt.rankingPublication ? 'Sí' : 'No', rewardEligibility(attempt).label])].map(row => row.map(escCsv).join(','));
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `supervision-${loadedTestId || 'prueba'}.csv`; link.click(); URL.revokeObjectURL(url); message(`${selected.length} intento(s) exportado(s)`, true);
  }
  function printAttempts() { if (!currentAttempts.length) { message('No hay intentos para imprimir.'); return; } window.print(); }
  async function sendReward(attemptId, options = {}) {
    const key = `reward:${attemptId}`; if (busy.has(key)) return; const attempt = rows.get(attemptId); if (!attempt || !['ready', 'pending'].includes(rewardEligibility(attempt).kind)) return;
    if (!options.skipConfirmation && !await askConfirmation('Liquidar recompensas', 'Se aplicarán las recompensas del resultado oficial publicado. Las cantidades provienen del resultado persistido.')) return; const reason = options.reason || prompt('Motivo de liquidación:'); if (reason === null || !reason.trim()) { message('El motivo es obligatorio.'); return; }
    busy.add(key); const card = document.querySelector(`[data-attempt-card="${CSS.escape(attemptId)}"]`); card?.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { const response = await fetch(`/api/maestro/tests/${encodeURIComponent(loadedTestId)}/attempts/${encodeURIComponent(attemptId)}/rewards`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ eventId: id(), reason: reason.trim() }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudieron liquidar las recompensas'); attempt.rewardSettlement = safeReward(data.settlement); rows.set(attemptId, attempt); if (card) card.outerHTML = row(attempt); message(data.duplicate ? 'Recompensas ya aplicadas' : data.settlement?.status === 'pending' ? 'Liquidación pendiente' : 'Recompensas aplicadas', true); }
    catch (error) { message(error.message || 'Error de red'); card?.querySelectorAll('button').forEach(button => { button.disabled = false; }); } finally { busy.delete(key); }
  }
  document.addEventListener('click', event => { const button = event.target.closest('.pr-attempt-btn'); if (!button) return; if (button.dataset.special) sendSpecial(button.dataset.attemptId, button.dataset.special); else send(button.dataset.attemptId, button.dataset.action); });
  window.prLoadAttempts = load;
  window.prOfficializeAll = officializeAll;
  window.prPublishAll = publishAll;
  window.prSettleAll = settleAll;
  window.prFilterAttempts = filterAttempts;
  window.prExportAttemptsCsv = exportAttemptsCsv;
  window.prPrintAttempts = printAttempts;
  window.prRenderAttemptActions = render;
})();
