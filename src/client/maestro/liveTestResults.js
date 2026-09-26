'use strict';

(() => {
  const get = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const statusLabels = { pending: 'Esperando', started: 'Iniciando', in_progress: 'En progreso', paused: 'Pausado', disconnected: 'Desconectado', reconnected: 'Reentrada permitida', finished: 'Finalizado', incomplete: 'Incompleto', reopened: 'Reabierto' };
  let selectedTestId = sessionStorage.getItem('maestroLiveResultTestId') || '';
  let tests = [], timer = null, resultsRequestId = 0, testsLoading = false;
  let latestAttempts = [], liveSessions = [];

  const formatDuration = value => { const seconds = Math.max(0, Math.round(Number(value || 0) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  const formatSeconds = value => formatDuration(Math.max(0, Number(value || 0)) * 1000);
  const testLabel = test => `Folio ${test.folio || test.title || String(test.testId).slice(0, 8)} · ${test.title || 'Prueba'} · ${test.status === 'active' ? 'Activa' : 'Finalizada'}`;
  function setStatus(text, ok = false) { const node = get('prLiveResultsStatus'); if (node) { node.textContent = text; node.classList.toggle('ok', ok); } }
  function renderTestSelect() {
    const select = get('prLiveTestSelect'); if (!select) return;
    const selectedExists = tests.some(test => test.testId === selectedTestId);
    if (!selectedExists && selectedTestId) selectedTestId = '';
    select.innerHTML = `<option value="">Selecciona una prueba activa</option>${tests.map(test => `<option value="${esc(test.testId)}">${esc(testLabel(test))}</option>`).join('')}`;
    select.value = selectedTestId;
    if (!tests.length) setStatus('No hay pruebas activas disponibles.');
  }
  function renderCards(attempts = latestAttempts) {
    const target = get('prLiveResultsCards'); if (!target) return;
    const activeSessions = liveSessions.filter(session => session?.isExam && session.examTestId === selectedTestId);
    const attemptsByPlayer = new Map();
    attempts.forEach(attempt => { attemptsByPlayer.set(attempt.accountPlayerId, attempt); attemptsByPlayer.set(`name:${attempt.name}`, attempt); });
    const covered = new Set();
    const rows = activeSessions.map(session => { covered.add(session.accountPlayerId); covered.add(`name:${session.name}`); return { attempt: attemptsByPlayer.get(session.accountPlayerId) || attemptsByPlayer.get(`name:${session.name}`) || null, session }; });
    attempts.forEach(attempt => { if (!covered.has(attempt.accountPlayerId) && !covered.has(`name:${attempt.name}`)) rows.push({ attempt, session: null }); });
    if (!rows.length) { target.innerHTML = '<p class="pr-attempts-empty">Esperando alumnos. La tarjeta aparecerá cuando el alumno pulse “Aplicar prueba”.</p>'; return; }
    target.innerHTML = rows.map(({ attempt, session }) => {
      const result = attempt?.result || null;
      const total = Number(session?.totalQ || result?.total || attempt?.totalQuestions || 0);
      const correct = Number(session?.correct ?? result?.correct ?? attempt?.correct ?? 0);
      const incorrect = Number(session?.wrong ?? result?.incorrect ?? attempt?.incorrect ?? 0);
      const answered = session ? correct + incorrect : result ? correct + incorrect : Number(attempt?.index || 0);
      const progress = total ? Math.min(100, Math.round(answered / total * 100)) : 0;
      const pct = total ? Math.round(correct / total * 100) : 0;
      const finished = !session && (attempt?.status === 'finished' || !!result);
      const state = session ? (session.paused ? 'Pausado' : 'En curso') : (statusLabels[attempt?.status] || 'En seguimiento');
      const question = session?.currentQuestion || (finished ? 'Prueba finalizada' : 'Preparando pregunta…');
      const questionTime = session ? formatDuration(session.questionElapsedMs) : '—';
      const remaining = session?.timeLimit ? ` · Restan ${formatSeconds(session.timeLeft)}` : '';
      const sessionTime = session?.examStartedAt ? formatDuration(Date.now() - Number(session.examStartedAt)) : result ? formatDuration(result.duration) : '—';
      return `<article class="pr-live-result-card ${finished ? 'is-finished' : ''}">
        <div class="pr-live-result-head"><div><strong>${esc(session?.name || attempt?.name || 'Alumno')}</strong><span>${esc(session?.grade || attempt?.grade || 'Sin grado')}</span></div><b class="pr-live-result-state">${finished ? '✓ Finalizó' : esc(state)}</b></div>
        <div class="pr-live-result-metrics"><div><small>ACIERTOS</small><strong>${correct}</strong></div><div><small>ERRORES</small><strong>${incorrect}</strong></div><div><small>PROGRESO</small><strong>${answered}/${total || '—'}</strong></div></div>
        <div class="pr-live-result-bar"><span style="width:${progress}%"></span></div>
        <div class="pr-live-result-question"><small>PREGUNTA ACTUAL</small><strong>${esc(question)}</strong></div>
        <div class="pr-live-result-foot"><span>${result ? `Precisión ${pct}%` : `Pregunta ${questionTime}${remaining}`}</span><span>${finished ? `Tiempo ${formatDuration(result.duration)}` : `Sesión ${sessionTime}`}</span></div>
      </article>`;
    }).join('');
  }
  async function loadResults(testId = selectedTestId) {
    if (!testId) return;
    const requestId = ++resultsRequestId;
    try {
      const response = await fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(testId)}/attempts?limit=100&sort=updatedAt&direction=desc`));
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudieron cargar los resultados');
      if (requestId !== resultsRequestId || testId !== selectedTestId) return;
      latestAttempts = Array.isArray(data.attempts) ? data.attempts : [];
      renderCards();
      const finished = latestAttempts.filter(item => item.status === 'finished' || item.result).length;
      const active = liveSessions.filter(session => session?.isExam && session.examTestId === selectedTestId).length;
      setStatus(`${Math.max(latestAttempts.length, active)} alumno(s) · ${finished} finalizado(s) · actualización en vivo`, true);
    } catch (error) {
      if (requestId !== resultsRequestId || testId !== selectedTestId || error?.name === 'AbortError') return;
      setStatus(`Sin actualización: ${error.message || 'error de conexión'}`);
    }
  }
  async function loadTests() {
    if (testsLoading) return;
    testsLoading = true;
    try {
      const [response, liveResponse] = await Promise.all([fetch(adminUrl('/api/exams?status=active&limit=100')), fetch('/api/exam/status')]);
      const data = await response.json(), liveData = liveResponse.ok ? await liveResponse.json() : {};
      if (!response.ok) throw Error(data.error || 'No se pudieron cargar las pruebas activas');
      const active = Array.isArray(data.tests) ? data.tests : [], activeIds = new Set(active.map(test => test.testId));
      const liveModes = Array.isArray(liveData.examModes) ? liveData.examModes : liveData.examMode ? [liveData.examMode] : [];
      const missing = await Promise.all(liveModes.filter(mode => mode.testId && !activeIds.has(mode.testId)).map(async mode => { const item = await fetch(adminUrl(`/api/exams/${encodeURIComponent(mode.testId)}`)); return item.ok ? (await item.json()).test : null; }));
      const selected = selectedTestId ? await fetch(adminUrl(`/api/exams/${encodeURIComponent(selectedTestId)}`)).then(item => item.ok ? item.json() : null) : null;
      tests = active.concat(missing.filter(Boolean).filter(test => !activeIds.has(test.testId)));
      if (selected?.test && !tests.some(test => test.testId === selected.test.testId) && ['finished', 'closed', 'paused'].includes(selected.test.status)) tests.push(selected.test);
      renderTestSelect();
      if (selectedTestId) await loadResults();
    } catch (error) { setStatus(error.message || 'No se pudieron cargar las pruebas activas.'); } finally { testsLoading = false; }
  }
  function selectTest(testId) {
    selectedTestId = testId || ''; resultsRequestId += 1; latestAttempts = [];
    if (selectedTestId) sessionStorage.setItem('maestroLiveResultTestId', selectedTestId); else sessionStorage.removeItem('maestroLiveResultTestId');
    const target = get('prLiveResultsCards');
    if (!selectedTestId) { if (target) target.innerHTML = '<p class="pr-attempts-empty">Selecciona una prueba activa para iniciar el seguimiento.</p>'; setStatus('Selecciona una prueba activa.'); return; }
    if (target) target.innerHTML = '<p class="pr-attempts-empty">Cargando resultados…</p>';
    renderCards(); loadResults();
  }
  function start() {
    const select = get('prLiveTestSelect'); if (!select) return;
    select.addEventListener('change', () => selectTest(select.value));
    if (typeof latestSessions !== 'undefined') liveSessions = Array.isArray(latestSessions) ? latestSessions : [];
    loadTests(); timer = setInterval(loadTests, 2500);
  }
  window.addEventListener('load', start);
  window.prLiveResultsRefresh = loadResults;
  window.prRefreshLiveTests = loadTests;
  window.prUpdateLiveSessions = sessions => { liveSessions = Array.isArray(sessions) ? sessions : []; if (selectedTestId) renderCards(); };
})();
