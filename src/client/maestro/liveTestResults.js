'use strict';

(() => {
  const get = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const statusLabels = { pending: 'Esperando', started: 'Iniciando', in_progress: 'En progreso', paused: 'Pausado', disconnected: 'Desconectado', reconnected: 'Reentrada permitida', finished: 'Finalizado', incomplete: 'Incompleto', reopened: 'Reabierto' };
  let selectedTestId = sessionStorage.getItem('maestroLiveResultTestId') || '';
  let tests = [];
  let timer = null;
  let loading = false;
  let testsLoading = false;

  function formatDuration(value) {
    const seconds = Math.max(0, Math.round(Number(value || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function testLabel(test) { return `Folio ${test.folio || test.title || String(test.testId).slice(0, 8)} · ${test.title || 'Prueba'} · ${test.status === 'active' ? 'Activa' : 'Finalizada'}`; }
  function setStatus(text, ok = false) { const node = get('prLiveResultsStatus'); if (node) { node.textContent = text; node.classList.toggle('ok', ok); } }
  function renderTestSelect() {
    const select = get('prLiveTestSelect'); if (!select) return;
    const selectedExists = tests.some(test => test.testId === selectedTestId);
    if (!selectedExists && selectedTestId) selectedTestId = '';
    select.innerHTML = `<option value="">Selecciona una prueba activa</option>${tests.map(test => `<option value="${esc(test.testId)}">${esc(testLabel(test))}</option>`).join('')}`;
    select.value = selectedTestId;
    if (!tests.length) setStatus('No hay pruebas activas disponibles.');
  }
  function renderCards(attempts) {
    const target = get('prLiveResultsCards'); if (!target) return;
    if (!attempts.length) { target.innerHTML = '<p class="pr-attempts-empty">Esperando alumnos. Sus tarjetas aparecerán al iniciar la prueba.</p>'; return; }
    target.innerHTML = attempts.map(attempt => {
      const result = attempt.result || null;
      const total = Number(result?.total || attempt.totalQuestions || 0);
      const correct = Number(result?.correct ?? attempt.correct ?? 0);
      const incorrect = Number(result?.incorrect ?? attempt.incorrect ?? 0);
      const answered = result ? correct + incorrect : Number(attempt.index || 0);
      const progress = total ? Math.min(100, Math.round(answered / total * 100)) : 0;
      const pct = result ? (total ? Math.round(correct / total * 100) : 0) : (answered ? Math.round(correct / answered * 100) : 0);
      const finished = attempt.status === 'finished' || !!result;
      const state = statusLabels[attempt.status] || 'En seguimiento';
      const score = result ? Number(result.score || 0).toLocaleString('es-MX') : '—';
      return `<article class="pr-live-result-card ${finished ? 'is-finished' : ''}">
        <div class="pr-live-result-head"><div><strong>${esc(attempt.name || 'Alumno')}</strong><span>${esc(attempt.grade || 'Sin grado')}</span></div><b class="pr-live-result-state">${finished ? '✓ Finalizó' : esc(state)}</b></div>
        <div class="pr-live-result-metrics"><div><small>PROGRESO</small><strong>${answered}/${total || '—'}</strong></div><div><small>PRECISIÓN</small><strong>${pct}%</strong></div><div><small>PUNTAJE</small><strong>${score}</strong></div></div>
        <div class="pr-live-result-bar"><span style="width:${progress}%"></span></div>
        <div class="pr-live-result-foot"><span>✓ ${correct} correctas · ✕ ${incorrect} errores</span><span>${result ? `Tiempo ${formatDuration(result.duration)}` : `Actualizado ${new Date(attempt.updatedAt || Date.now()).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}</span></div>
      </article>`;
    }).join('');
  }
  async function loadResults() {
    if (!selectedTestId || loading) return;
    loading = true;
    try {
      const response = await fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(selectedTestId)}/attempts?limit=100&sort=updatedAt&direction=desc`));
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudieron cargar los resultados');
      const attempts = Array.isArray(data.attempts) ? data.attempts : [];
      renderCards(attempts);
      const finished = attempts.filter(item => item.status === 'finished' || item.result).length;
      setStatus(`${attempts.length} alumno(s) · ${finished} finalizado(s) · actualización en vivo`, true);
    } catch (error) {
      setStatus(`Sin actualización: ${error.message || 'error de conexión'}`);
    } finally { loading = false; }
  }
  async function loadTests() {
    if (testsLoading) return;
    testsLoading = true;
    try {
      const [response, liveResponse] = await Promise.all([fetch(adminUrl('/api/exams?status=active&limit=100')), fetch('/api/exam/status')]);
      const data = await response.json();
      const liveData = liveResponse.ok ? await liveResponse.json() : {};
      if (!response.ok) throw Error(data.error || 'No se pudieron cargar las pruebas activas');
      const active = Array.isArray(data.tests) ? data.tests : [];
      const activeIds = new Set(active.map(test => test.testId));
      const liveModes = Array.isArray(liveData.examModes) ? liveData.examModes : liveData.examMode ? [liveData.examMode] : [];
      const missingLiveTests = await Promise.all(liveModes.filter(mode => mode.testId && !activeIds.has(mode.testId)).map(async mode => { const item = await fetch(adminUrl(`/api/exams/${encodeURIComponent(mode.testId)}`)); return item.ok ? (await item.json()).test : null; }));
      const selected = selectedTestId ? await fetch(adminUrl(`/api/exams/${encodeURIComponent(selectedTestId)}`)).then(item => item.ok ? item.json() : null) : null;
      tests = active.concat(missingLiveTests.filter(Boolean).filter(test => !activeIds.has(test.testId)));
      if (selected?.test && !tests.some(test => test.testId === selected.test.testId) && ['finished', 'closed', 'paused'].includes(selected.test.status)) tests.push(selected.test);
      renderTestSelect();
      if (selectedTestId) await loadResults();
    } catch (error) { setStatus(error.message || 'No se pudieron cargar las pruebas activas.'); } finally { testsLoading = false; }
  }
  function selectTest(testId) {
    selectedTestId = testId || '';
    if (selectedTestId) sessionStorage.setItem('maestroLiveResultTestId', selectedTestId); else sessionStorage.removeItem('maestroLiveResultTestId');
    const target = get('prLiveResultsCards');
    if (!selectedTestId) { if (target) target.innerHTML = '<p class="pr-attempts-empty">Selecciona una prueba activa para iniciar el seguimiento.</p>'; setStatus('Selecciona una prueba activa.'); return; }
    if (target) target.innerHTML = '<p class="pr-attempts-empty">Cargando resultados…</p>';
    loadResults();
  }
  function start() {
    const select = get('prLiveTestSelect');
    if (!select) return;
    select.addEventListener('change', () => selectTest(select.value));
    loadTests();
    timer = setInterval(() => { loadTests(); }, 2500);
  }
  window.addEventListener('load', start);
  window.prLiveResultsRefresh = loadResults;
})();
