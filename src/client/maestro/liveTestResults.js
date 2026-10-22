'use strict';

(() => {
  const get = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const statusLabels = { pending: 'Esperando', started: 'Iniciando', in_progress: 'En progreso', paused: 'Pausado', disconnected: 'Desconectado', reconnected: 'Reentrada permitida', finished: 'Finalizado', incomplete: 'Incompleto', reopened: 'Reabierto' };
  let selectedTestId = sessionStorage.getItem('maestroLiveResultTestId') || '';
  let tests = [], timer = null, resultsRequestId = 0, testsLoading = false;
  let latestAttempts = [], liveSessions = [];
  let assignedStudents = [], rosterTestId = '', rosterLoading = null, rosterLoaded = false, rosterRequestId = 0, selectedTestDetails = null;
  const finishedAttemptCache = new Map();

  const formatDuration = value => { const seconds = Math.max(0, Math.round(Number(value || 0) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  const formatCompletionTime = value => { const date = new Date(value || ''); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(date); };
  const formatSeconds = value => formatDuration(Math.max(0, Number(value || 0)) * 1000);
  const testLabel = test => `Folio ${test.folio || test.title || String(test.testId).slice(0, 8)} · ${test.title || 'Prueba'} · ${test.status === 'active' ? 'Activa' : 'Finalizada'}`;
  function setStatus(text, ok = false) { const node = get('prLiveResultsStatus'); if (node) { node.textContent = text; node.classList.toggle('ok', ok); } }
  function renderTestSelect() {
    const select = get('prLiveTestSelect'); if (!select) return;
    const selectedExists = tests.some(test => test.testId === selectedTestId);
    if (!selectedExists && selectedTestId) selectedTestId = '';
    select.innerHTML = `<option value="">Selecciona una prueba</option>${tests.map(test => `<option value="${esc(test.testId)}">${esc(testLabel(test))}</option>`).join('')}`;
    select.value = selectedTestId;
    if (!tests.length) setStatus('No hay pruebas activas disponibles.');
  }
  const normalizeName = value => String(value || '').trim().toLocaleLowerCase('es-MX');
  async function loadAssignedStudents(testId) {
    if (rosterTestId === testId && rosterLoaded) return assignedStudents;
    if (rosterTestId === testId && rosterLoading) return rosterLoading;
    rosterTestId = testId; rosterLoaded = false; assignedStudents = [];
    const requestId = ++rosterRequestId;
    rosterLoading = (async () => {
      const [assignmentsResponse, playersResponse] = await Promise.all([
        fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}/assignments`)),
        fetch(adminUrl('/api/players'))
      ]);
      if (!assignmentsResponse.ok) throw Error('No se pudieron cargar los alumnos asignados');
      const assignmentData = await assignmentsResponse.json();
      const playersData = playersResponse.ok ? await playersResponse.json() : [];
      const players = Array.isArray(playersData) ? playersData : Array.isArray(playersData.players) ? playersData.players : [];
      const unique = new Map();
      (Array.isArray(assignmentData.assignments) ? assignmentData.assignments : []).filter(item => item.targetType === 'student' && item.accountPlayerId).forEach(item => {
        const accountPlayerId = String(item.accountPlayerId);
        const player = players.find(candidate => String(candidate.accountPlayerId || candidate.id || '') === accountPlayerId);
        if (!unique.has(accountPlayerId)) unique.set(accountPlayerId, { accountPlayerId, name: player?.name || 'Alumno asignado', grade: player?.grade || '', avatar: player?.avatar || {}, themeColor: player?.themeColor || '', assignment: item });
      });
      if (requestId !== rosterRequestId || testId !== selectedTestId) return [];
      assignedStudents = [...unique.values()]; rosterLoaded = true;
      return assignedStudents;
    })().catch(error => {
      if (requestId === rosterRequestId && testId === selectedTestId) { assignedStudents = []; rosterLoaded = false; setStatus(error.message || 'No se pudieron cargar los alumnos asignados.'); }
      return [];
    }).finally(() => { if (requestId === rosterRequestId) rosterLoading = null; });
    return rosterLoading;
  }
  function tableLabel(source = {}, test = selectedTestDetails) {
    const configuration = source.configurationSnapshot || test?.configurationSnapshot || test?.configuration || {};
    const mode = source.tblSelMode || configuration.tblSelMode || '';
    const tables = Array.isArray(source.tables) && source.tables.length ? source.tables : Array.isArray(configuration.tables) && configuration.tables.length ? configuration.tables : [];
    const currentTable = Number(source.currentTable) || 0;
    if (mode === 'random') return `Tablas aleatorias${currentTable > 0 ? ` · actual ×${esc(currentTable)}` : ''}`;
    if (mode === 'all') return `Tablas ×1–×12${currentTable > 0 ? ` · actual ×${esc(currentTable)}` : ''}`;
    if (tables.length) return `Tablas ${tables.map(table => `×${esc(table)}`).join(', ')}${currentTable > 0 ? ` · actual ×${esc(currentTable)}` : ''}`;
    const operationNames = { mult: 'Multiplicación', div: 'División', add: 'Suma', sub: 'Resta' };
    const operationTables = Object.entries(configuration.opsConfig || {}).filter(([, config]) => Array.isArray(config?.tables) && config.tables.length).map(([operation, config]) => `${operationNames[operation] || operation}: ${config.tables.map(table => `×${esc(table)}`).join(', ')}`);
    return operationTables.length ? operationTables.join(' · ') : 'Tablas no disponibles';
  }
  function questionCountFor(test = selectedTestDetails) {
    const configuration = test?.configurationSnapshot || test?.configuration || {};
    const total = Number(configuration.total || test?.questionCount) || Object.values(configuration.opsConfig || {}).reduce((sum, operation) => sum + (Number(operation?.qty) || 0), 0);
    return total;
  }
  function renderCards(attempts = latestAttempts) {
    const target = get('prLiveResultsCards'), finishedTarget = get('prLiveFinishedResultsCards'); if (!target) return;
    const activeSessions = liveSessions.filter(session => session?.isExam && session.examTestId === selectedTestId);
    const attemptsByPlayer = new Map(), attemptsByName = new Map();
    attempts.slice().sort((a, b) => (Date.parse(a.updatedAt || a.finishedAt || a.startedAt) || 0) - (Date.parse(b.updatedAt || b.finishedAt || b.startedAt) || 0)).forEach(attempt => { if (attempt.accountPlayerId) attemptsByPlayer.set(String(attempt.accountPlayerId), attempt); if (attempt.name) attemptsByName.set(normalizeName(attempt.name), attempt); });
    const sessionFor = student => activeSessions.find(session => (student?.accountPlayerId && String(session.accountPlayerId) === String(student.accountPlayerId)) || (student?.name && normalizeName(session.name) === normalizeName(student.name))) || null;
    const attemptFor = student => attemptsByPlayer.get(String(student?.accountPlayerId || '')) || attemptsByName.get(normalizeName(student?.name)) || null;
    const represented = new Set();
    const markRepresented = student => { if (student?.accountPlayerId) represented.add(`id:${student.accountPlayerId}`); if (student?.name) represented.add(`name:${normalizeName(student.name)}`); };
    const hasRepresentation = student => (student?.accountPlayerId && represented.has(`id:${student.accountPlayerId}`)) || (student?.name && represented.has(`name:${normalizeName(student.name)}`));
    const rows = assignedStudents.map(student => { markRepresented(student); return { student, attempt: attemptFor(student), session: sessionFor(student) }; });
    activeSessions.forEach(session => { if (!hasRepresentation(session)) { markRepresented(session); rows.push({ student: null, attempt: attemptFor(session), session }); } });
    attempts.forEach(attempt => { if (!hasRepresentation(attempt)) { markRepresented(attempt); rows.push({ student: null, attempt, session: null }); } });
    if (!rows.length) { target.innerHTML = '<p class="pr-attempts-empty">Esperando alumnos. La tarjeta aparecerá cuando el alumno pulse “Aplicar prueba”.</p>'; if (finishedTarget) finishedTarget.innerHTML = '<p class="pr-attempts-empty">Las tarjetas finalizadas aparecerán aquí.</p>'; const count = get('prLiveFinishedCount'); if (count) count.textContent = '0 finalizadas'; return; }
    const cards = rows.map(({ student, attempt, session }) => {
      const profile = session || student || liveSessions.find(item => (attempt?.accountPlayerId && String(item.accountPlayerId) === String(attempt.accountPlayerId)) || (attempt?.name && normalizeName(item.name) === normalizeName(attempt.name))) || {};
      const result = attempt?.result || null;
      const completedAttempt = attempt?.status === 'finished' || !!result;
      const currentSession = completedAttempt ? null : session;
      const total = Number(result?.total || attempt?.totalQuestions || currentSession?.totalQ || questionCountFor() || 0);
      const correct = Number(result?.correct ?? attempt?.correct ?? currentSession?.correct ?? 0);
      const incorrect = Number(result?.incorrect ?? attempt?.incorrect ?? currentSession?.wrong ?? 0);
      const answered = result || completedAttempt ? correct + incorrect : currentSession ? correct + incorrect : Number(attempt?.index || 0);
      const progress = total ? Math.min(100, Math.round(answered / total * 100)) : 0;
      const pct = total ? Math.round(correct / total * 100) : 0;
      // Si el socket conserva por unos instantes la última sesión activa, prioriza el
      // resultado persistido: la tarjeta debe pasar a finalizada inmediatamente.
      const finished = completedAttempt;
      const completionTime = finished ? formatCompletionTime(attempt?.finishedAt || result?.completedAt || attempt?.updatedAt) : '';
      const waiting = !!student && !session && !attempt;
      const currentPrecision = (finished || !answered) ? pct : Math.min(100, Math.round(correct / answered * 100));
      const state = currentSession ? (currentSession.paused ? 'Pausado' : 'En curso') : waiting ? 'Asignado · en espera' : (statusLabels[attempt?.status] || 'En seguimiento');
      const question = finished ? 'Prueba finalizada' : waiting ? 'Esperando que inicie la prueba' : currentSession?.currentQuestion || 'Esperando actualización';
      const questionTime = currentSession ? formatDuration(currentSession.questionElapsedMs) : '—';
      const sessionTime = currentSession?.examStartedAt ? formatDuration(Date.now() - Number(currentSession.examStartedAt)) : result ? formatDuration(result.duration) : '—';
      const radius=25, circumference=2*Math.PI*radius, dash=`${(progress/100*circumference).toFixed(1)} ${circumference.toFixed(1)}`;
      const ringColor=waiting?'#64748b':finished?'#34d399':currentSession?.paused?'#fbbf24':'#00ff88';
      const themeColors={blue:'#60a5fa',purple:'#a78bfa',green:'#34d399',yellow:'#fbbf24',pink:'#f472b6',red:'#f87171',cyan:'#22d3ee',orange:'#fb923c'};
      const theme=themeColors[profile.themeColor]||'#7c3aed';
      const studentName=session?.name||attempt?.name||student?.name||'Alumno';
      const studentGrade=session?.grade||attempt?.grade||student?.grade||'Sin grado';
      const avatar=typeof buildAvatarSVG==='function'?buildAvatarSVG(profile.avatar||{},44):`<span class="pr-live-avatar-fallback">${esc(studentName.slice(0,1).toUpperCase())}</span>`;
      const timerText=currentSession?`Pregunta <strong>${questionTime}</strong>${currentSession?.timeLimit?` <i>· Restan <strong>${formatSeconds(currentSession.timeLeft)}</strong></i>`:''}`:finished?`Tiempo <strong>${formatDuration(result?.duration)}</strong>`:waiting?'Pendiente de inicio':`Sesión <strong>${sessionTime}</strong>`;
      return { finished, markup: `<article class="pr-live-result-card ${finished ? 'is-finished' : ''} ${currentSession?.paused?'is-paused':''} ${waiting?'is-waiting':''}">
        <div class="pr-live-result-top">
          <div class="pr-live-result-avatar-col"><div class="pr-live-avatar-wrap"><svg class="pr-live-ring" viewBox="0 0 60 60" aria-hidden="true"><circle class="pr-live-ring-bg" cx="30" cy="30" r="${radius}"/><circle class="pr-live-ring-fill" cx="30" cy="30" r="${radius}" stroke="${ringColor}" stroke-dasharray="${dash}" transform="rotate(-90 30 30)"/></svg><div class="pr-live-avatar-inner" style="border-color:${theme}">${avatar}</div><span class="pr-live-status-dot">${finished?'✓':currentSession?.paused?'Ⅱ':'●'}</span></div><span class="pr-live-qprog">${answered}/${total||'—'}</span></div>
          <div class="pr-live-result-main"><div class="pr-live-result-head"><div><strong>${esc(studentName)}</strong><span>${esc(studentGrade)}</span></div><b class="pr-live-result-state">${finished ? '✓ Finalizó' : esc(state)}</b></div><div class="pr-live-result-subtitle">${finished?'Prueba completada':currentSession?.paused?'Prueba en pausa':waiting?'Alumno asignado':'Avance de la prueba'}</div><div class="pr-live-result-tables">${esc(tableLabel(currentSession || attempt || student || {}))}</div></div>
        </div>
        <div class="pr-live-result-metrics"><span class="pr-live-stat ok"><small>ACIERTOS</small><strong>✓ ${correct}</strong></span><span class="pr-live-stat bad"><small>ERRORES</small><strong>✕ ${incorrect}</strong></span></div>
        <div class="pr-live-result-precision" aria-label="Precisión ${currentPrecision}%"><div class="pr-live-precision-label"><span>PRECISIÓN</span><strong>${currentPrecision}%</strong></div><div class="pr-live-precision-meter" role="img" aria-label="${currentPrecision}% de precisión"><span class="pr-live-precision-cells" aria-hidden="true">${Array.from({length:5},(_,index)=>{const fill=Math.max(0,Math.min(100,(currentPrecision-index*20)*5));const color=['#ff334f','#ff8a24','#ffe34a','#39ff88','#38bdf8'][index];return `<i style="color:${color}"><b style="width:${fill}%"></b></i>`;}).join('')}</span></div></div>
        <div class="pr-live-result-question"><small>${finished ? 'ESTADO' : 'PREGUNTA ACTUAL'}</small><strong>${esc(question)}</strong></div>
        <div class="pr-live-result-foot"><span class="pr-live-timer">⏱ ${timerText}</span><span>${finished ? `Finalizada${completionTime ? ` · ${esc(completionTime)}` : ''}` : esc(state)}</span></div>
      </article>` };
    });
    const activeCards = cards.filter(card => !card.finished), finishedCards = cards.filter(card => card.finished);
    target.innerHTML = finishedTarget ? (activeCards.length ? activeCards.map(card => card.markup).join('') : '<p class="pr-attempts-empty">No hay alumnos en juego ni esperando iniciar.</p>') : cards.map(card => card.markup).join('');
    if (finishedTarget) finishedTarget.innerHTML = finishedCards.length ? finishedCards.map(card => card.markup).join('') : '<p class="pr-attempts-empty">Aún no hay alumnos que hayan finalizado esta prueba.</p>';
    const count = get('prLiveFinishedCount'); if (count) count.textContent = `${finishedCards.length} finalizada(s)`;
  }
  async function loadResults(testId = selectedTestId) {
    if (!testId) return;
    const requestId = ++resultsRequestId;
    try {
      const attemptsRequest = fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(testId)}/attempts?limit=100&sort=updatedAt&order=desc`));
      await loadAssignedStudents(testId);
      const response = await attemptsRequest;
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudieron cargar los resultados');
      if (requestId !== resultsRequestId || testId !== selectedTestId) return;
      const incoming = Array.isArray(data.attempts) ? data.attempts : [];
      incoming.forEach(item => { if (item.status === 'finished' || item.result) finishedAttemptCache.set(item.attemptId, item); });
      const currentIds = new Set(incoming.map(item => item.attemptId));
      latestAttempts = incoming.concat([...finishedAttemptCache.values()].filter(item => item.testId === testId && !currentIds.has(item.attemptId)));
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
      if (selectedTestId) selectedTestDetails = active.find(test => test.testId === selectedTestId) || selectedTestDetails;
      const liveModes = Array.isArray(liveData.examModes) ? liveData.examModes : liveData.examMode ? [liveData.examMode] : [];
      const missing = await Promise.all(liveModes.filter(mode => mode.testId && !activeIds.has(mode.testId)).map(async mode => { const item = await fetch(adminUrl(`/api/exams/${encodeURIComponent(mode.testId)}`)); return item.ok ? (await item.json()).test : null; }));
      const selected = selectedTestId ? await fetch(adminUrl(`/api/exams/${encodeURIComponent(selectedTestId)}`)).then(item => item.ok ? item.json() : null) : null;
      if (selected?.test && selected.test.testId === selectedTestId) selectedTestDetails = selected.test;
      tests = active.concat(missing.filter(Boolean).filter(test => !activeIds.has(test.testId)));
      if (selectedTestId && !selectedTestDetails) selectedTestDetails = tests.find(test => test.testId === selectedTestId) || null;
      if (selected?.test && !tests.some(test => test.testId === selected.test.testId) && ['finished', 'closed', 'paused'].includes(selected.test.status)) tests.push(selected.test);
      renderTestSelect();
      if (selectedTestId) await loadResults();
    } catch (error) { setStatus(error.message || 'No se pudieron cargar las pruebas activas.'); } finally { testsLoading = false; }
  }
  function selectTest(testId) {
    selectedTestId = testId || ''; resultsRequestId += 1; latestAttempts = []; finishedAttemptCache.clear(); rosterRequestId += 1; rosterTestId = ''; rosterLoading = null; rosterLoaded = false; assignedStudents = []; selectedTestDetails = tests.find(test => test.testId === selectedTestId) || null;
    if (selectedTestId) sessionStorage.setItem('maestroLiveResultTestId', selectedTestId); else sessionStorage.removeItem('maestroLiveResultTestId');
    const target = get('prLiveResultsCards'), finishedTarget = get('prLiveFinishedResultsCards');
    if (!selectedTestId) { if (target) target.innerHTML = '<p class="pr-attempts-empty">Selecciona una prueba activa para iniciar el seguimiento.</p>'; if (finishedTarget) finishedTarget.innerHTML = '<p class="pr-attempts-empty">Las tarjetas finalizadas aparecerán aquí.</p>'; const count = get('prLiveFinishedCount'); if (count) count.textContent = '0 finalizadas'; setStatus('Selecciona una prueba activa.'); return; }
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
  window.prUpdateLiveSessions = sessions => { liveSessions = Array.isArray(sessions) ? sessions : []; if (selectedTestId) { renderCards(); const active = liveSessions.filter(session => session?.isExam && session.examTestId === selectedTestId).length; const finished = latestAttempts.filter(item => item.status === 'finished' || item.result).length; setStatus(`${Math.max(assignedStudents.length, latestAttempts.length, active)} alumno(s) · ${active} en juego · ${finished} finalizado(s) · en vivo`, true); } };
})();
