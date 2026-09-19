'use strict';

(() => {
  let tests = [];
  let selectedTestId = sessionStorage.getItem('maestroSelectedTestId') || '';
  const configurations = new Map();
  let groups = []; let selectedGroupId = ''; let registeredStudents = [];
  let audienceMode = 'all'; let audienceGroupId = ''; let audienceStudentIds = new Set();
  const busy = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const statusLabels = { draft: 'Borrador', scheduled: 'Programada', active: 'Activa', paused: 'Pausada', closed: 'Cerrada', finished: 'Finalizada', cancelled: 'Cancelada', unknown: 'Estado desconocido' };
  const dateText = value => value ? new Date(value).toLocaleDateString('es-MX') : '—';
  const get = id => document.getElementById(id);

  function statusLabel(status) { return statusLabels[status] || statusLabels.unknown; }
  const summaryOrder = ['draft', 'scheduled', 'active', 'paused', 'closed', 'finished', 'cancelled'];
  const summaryGroupLabels = { draft: 'Borradores', scheduled: 'Programadas', active: 'Activas', paused: 'Pausadas', closed: 'Cerradas', finished: 'Finalizadas', cancelled: 'Canceladas' };
  const formatDateTime = value => value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const formatList = values => values.length ? values.join(', ') : '—';
  const publicTestCode = test => String(test?.folio || (test?.testId ? String(test.testId).slice(0, 8) : 'sin folio'));
  function summaryTests() { return tests.slice().sort((a, b) => (Date.parse(b.lastModifiedAt || b.updatedAt || b.createdAt) || 0) - (Date.parse(a.lastModifiedAt || a.updatedAt || a.createdAt) || 0) || a.testId.localeCompare(b.testId)).slice(0, 5); }
  function askTestConfirmation(title, text) {
    return new Promise(resolve => {
      let modal = get('prActionConfirmModal');
      if (!modal) {
        modal = document.createElement('div'); modal.id = 'prActionConfirmModal'; modal.className = 'pr-action-confirm-modal'; modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = '<div class="pr-action-confirm-card" role="dialog" aria-modal="true" aria-labelledby="prActionConfirmTitle"><div class="pr-action-confirm-kicker">CONFIRMACIÓN DE ACCIÓN</div><h3 id="prActionConfirmTitle"></h3><p id="prActionConfirmText"></p><div class="pr-action-confirm-actions"><button type="button" class="pr-action-confirm-cancel">CANCELAR</button><button type="button" class="pr-action-confirm-ok">CONFIRMAR</button></div></div>';
        document.body.appendChild(modal);
      }
      modal.querySelector('#prActionConfirmTitle').textContent = title; modal.querySelector('#prActionConfirmText').textContent = text;
      const cancel = modal.querySelector('.pr-action-confirm-cancel'); const ok = modal.querySelector('.pr-action-confirm-ok'); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
      const close = result => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); cancel.removeEventListener('click', onCancel); ok.removeEventListener('click', onOk); modal.removeEventListener('click', onBackdrop); resolve(result); };
      const onCancel = () => close(false); const onOk = () => close(true); const onBackdrop = event => { if (event.target === modal) close(false); };
      cancel.addEventListener('click', onCancel); ok.addEventListener('click', onOk); modal.addEventListener('click', onBackdrop); ok.focus();
    });
  }
  async function stopActiveTest(testId) {
    const test = tests.find(item => item.testId === testId);
    if (!test || test.status !== 'active') return;
    if (!await askTestConfirmation('Detener prueba', `¿Deseas detener la prueba Folio ${publicTestCode(test)}? Esta acción finalizará la aplicación.`)) return;
    const stopResponse = await fetch('/api/exam/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: _adminPass, testId }) });
    const stopData = await stopResponse.json();
    if (!stopResponse.ok) throw Error(stopData.error || 'No se pudo detener la prueba en vivo');
    const stateResponse = await fetch('/api/exams/' + encodeURIComponent(testId) + '/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ password: _adminPass, action: 'finish', revision: Number(test.revision) + 1 }) });
    const stateData = await stateResponse.json();
    if (!stateResponse.ok && stateResponse.status === 409) {
      const currentResponse = await fetch('/api/exams/' + encodeURIComponent(testId), { headers: { 'X-Admin-Password': _adminPass } });
      const currentData = await currentResponse.json();
      if (currentResponse.ok && currentData.test?.status === 'active') {
        const retryResponse = await fetch('/api/exams/' + encodeURIComponent(testId) + '/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ password: _adminPass, action: 'finish', revision: Number(currentData.test.revision) + 1 }) });
        const retryData = await retryResponse.json();
        if (!retryResponse.ok) throw Error(retryData.error || stateData.error || 'No se pudo cerrar la prueba');
      } else if (!(currentResponse.ok && currentData.test?.status === 'finished')) throw Error(stateData.error || 'No se pudo cerrar la prueba');
    } else if (!stateResponse.ok) throw Error(stateData.error || 'No se pudo cerrar la prueba');
    await load();
  }
  function renderSummary() {
    const target = get('prTestSummaryList'); if (!target) return;
    const recent = summaryTests();
    if (!recent.length) { target.innerHTML = '<p class="pr-attempts-empty">No hay pruebas registradas.</p>'; return; }
    const groups = new Map(summaryOrder.map(status => [status, []]));
    recent.forEach(test => { const status = groups.has(test.status) ? test.status : 'finished'; groups.get(status).push(test); });
    target.innerHTML = summaryOrder.filter(status => groups.get(status).length).map(status => `<section class="pr-summary-status-group" data-summary-status="${status}"><h3>${summaryGroupLabels[status]}</h3><div class="pr-summary-cards">${groups.get(status).map(test => `<article class="pr-summary-card" data-summary-test-id="${esc(test.testId)}" tabindex="0" role="button" aria-label="Ver detalles de ${esc(test.title || 'prueba')}"><div class="pr-summary-card-head"><strong>${esc(test.title || 'Prueba sin título')}</strong><span class="pr-summary-status pr-summary-status-${status}">${esc(statusLabel(status))}</span></div><code>${esc(test.testId)}</code><span>Actualizada: ${esc(formatDateTime(test.lastModifiedAt || test.updatedAt || test.createdAt))}</span><span>${test.groups.length ? `Grupo: ${esc(test.groups.join(', '))}` : test.assignmentCount ? `Asignaciones: ${test.assignmentCount}` : 'Sin asignación'}</span><span>${Number(test.questionCount) || 0} preguntas · ${esc((test.operations || []).join(', ') || 'Sin operaciones')}</span></article>`).join('')}</div></section>`).join('');
    target.querySelectorAll('.pr-summary-card').forEach(card => { const test = tests.find(item => item.testId === card.dataset.summaryTestId); const code = card.querySelector('code'); if (test && code) code.textContent = `Folio ${publicTestCode(test)}`; });
    const status = get('prTestSummaryStatus'); if (status) status.textContent = `${recent.length} de ${tests.length} pruebas recientes`;
  }
  function renderActiveSupervision() {
    const attempts = get('prAttemptsList');
    if (!attempts) return;
    let target = get('prActiveTestsSupervision');
    if (!target) {
      target = document.createElement('div');
      target.id = 'prActiveTestsSupervision';
      target.className = 'pr-active-tests-supervision';
      attempts.parentNode.insertBefore(target, attempts);
    }
    const active = tests.filter(test => test.status === 'active');
    target.innerHTML = active.length ? '<div class="pr-active-tests-title">PRUEBAS ACTIVAS</div>' + active.map(test => '<article class="pr-active-test-row"><div><strong>Folio ' + esc(publicTestCode(test)) + '</strong><span>' + esc(test.title || 'Prueba') + ' · ' + Number(test.assignmentCount || 0) + ' asignación(es)</span></div><button type="button" class="pr-supervision-stop" data-test-id="' + esc(test.testId) + '">DETENER PRUEBA</button></article>').join('') : '';
  }
  function operationDetails(configuration = {}) {
    const ops = configuration.opsConfig && typeof configuration.opsConfig === 'object' ? configuration.opsConfig : {};
    const names = { mult: 'Multiplicación', div: 'División', add: 'Suma', sub: 'Resta' };
    const rows = Object.entries(ops).map(([op, value]) => {
      const cfg = value && typeof value === 'object' ? value : {};
      const ranges = Array.isArray(cfg.ranges) && cfg.ranges.length ? ` · rangos: ${cfg.ranges.map(range => `${range.table}: ${range.from}–${range.to}`).join(', ')}` : '';
      const tables = Array.isArray(cfg.tables) && cfg.tables.length ? ` · tablas/divisores: ${cfg.tables.join(', ')}` : '';
      const arithmetic = ['add', 'sub'].includes(op) ? ` · ${cfg.digits || 1} cifras · ${cfg.carryMode === 'carry' ? (op === 'sub' ? 'con préstamos' : 'con llevadas') : cfg.carryMode === 'both' ? 'ambas modalidades' : (op === 'sub' ? 'sin préstamos' : 'sin llevadas')}` : '';
      return `<li><b>${names[op] || op}</b>: ${Number(cfg.qty) || 0} preguntas${tables}${ranges}${arithmetic}</li>`;
    });
    return rows.length ? `<ul>${rows.join('')}</ul>` : '<p>No hay operaciones configuradas.</p>';
  }
  function assignmentDisplay(item, players = []) {
    if (item.targetType === 'group') return `Grupo ${item.groupId || '—'}`;
    const player = players.find(candidate => candidate.accountPlayerId === item.accountPlayerId || candidate.id === item.accountPlayerId);
    if (!player) return 'Alumno no encontrado';
    return `${player.name || 'Alumno'} · ${player.grade || 'Grado no registrado'}`;
  }
  function detailMarkup(test, configuration, assignments, officials, players = []) {
    const rewards = configuration.rewards || {};
    const officialCount = officials.length;
    const history = Array.isArray(test.stateHistory) && test.stateHistory.length ? test.stateHistory.map(item => `${statusLabel(String(item.action || '').replace(/^test_/, '').replace('started', 'active').replace('resumed', 'active'))} · ${formatDateTime(item.occurredAt)}`).join('<br>') : 'Sin historial disponible';
    return `<div class="pr-detail-grid"><div><b>Descripción</b><p>${esc(test.description || 'Sin descripción')}</p></div><div><b>Operaciones</b>${operationDetails(configuration)}</div><div><b>Preguntas</b><p>${Number(configuration.total) || 'Configuradas por operación'}</p></div><div><b>Multiplicador</b><p>${Number(configuration.multiplier) || 1}× (solo puntaje)</p></div><div><b>Recompensas</b><p>Áureos: ${Number(rewards.aureos) || 0} · XP: ${Number(rewards.experience) || 0} · Racha: ${rewards.streak?.enabled ? 'activa' : 'inactiva'} · Logro perfecto: ${rewards.achievements?.perfect?.enabled ? 'activo' : 'inactivo'}</p></div><div><b>Fechas</b><p>Creada: ${esc(formatDateTime(test.createdAt))}<br>Actualizada: ${esc(formatDateTime(test.updatedAt || test.createdAt))}<br>Programada: ${esc(formatDateTime(test.startsAt || test.scheduledAt))}<br>Cierre: ${esc(formatDateTime(test.closesAt))}</p></div><div><b>Historial de estados</b><p>${history}</p></div><div><b>Asignaciones</b><ul>${assignments.length ? assignments.map(item => `<li>${esc(assignmentDisplay(item, players))}</li>`).join('') : '<li>Sin asignaciones</li>'}</ul></div><div><b>Intentos</b><p>${Number(test.attemptCount) || 0}</p></div><div><b>Estado oficial</b><p>${officialCount ? `Oficializada · ${officialCount}` : 'Sin oficializar'}</p></div><div><b>Ranking</b><p>${test.hasRankingPublications ? `Publicado · ${test.rankingPublicationCount || 0}` : 'Sin publicación'}</p></div><div><b>testId</b><p><code>${esc(test.testId)}</code></p></div></div>`;
  }
  function closeSummaryModal() { const modal = get('prTestSummaryModal'); if (!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
  async function openSummaryModal(testId) {
    const modal = get('prTestSummaryModal'); const content = get('prSummaryModalContent'); if (!modal || !content) return;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); content.innerHTML = '<p class="pr-attempts-empty">Cargando detalles…</p>'; get('prSummaryModalClose')?.focus();
    try {
      const [testResponse, assignmentsResponse, officialsResponse, playersResponse] = await Promise.all([fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}`), { headers: { 'X-Admin-Password': _adminPass } }), fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}/assignments`), { headers: { 'X-Admin-Password': _adminPass } }), fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(testId)}/official-attempts`)), fetch(adminUrl('/api/players'))]);
      const testData = await testResponse.json(); const assignmentData = await assignmentsResponse.json(); const officialsData = officialsResponse.ok ? await officialsResponse.json() : { officialAttempts: [] }; const playersData = playersResponse.ok ? await playersResponse.json() : [];
      const players = Array.isArray(playersData) ? playersData : Array.isArray(playersData.players) ? playersData.players : [];
      if (!testResponse.ok) throw Error(testData.error || 'No se pudo cargar el detalle');
      const test = tests.find(item => item.testId === testId) || { testId }; const fullTest = { ...test, ...(testData.test || {}) };
      content.innerHTML = detailMarkup(fullTest, fullTest.configuration || {}, assignmentData.assignments || [], officialsData.officialAttempts || [], players);
    } catch (error) { content.innerHTML = `<p class="pr-attempts-status">${esc(error.message || 'No se pudo cargar el detalle')}</p>`; }
  }
  const groupStatus = message => { const node = get('prGroupsStatus'); if (node) node.textContent = message || ''; };
  function renderAssignments(assignments = []) { const target = get('prAssignmentsList'); if (!target) return; target.innerHTML = assignments.length ? `<div class="pr-assignment-table-wrap"><table class="pr-assignment-table"><thead><tr><th>Tipo</th><th>Destino</th><th>Origen</th><th>Acción</th></tr></thead><tbody>${assignments.map(item => `<tr><td>${item.targetType === 'group' ? 'Grupo' : 'Alumno'}</td><td><code>${esc(item.targetType === 'group' ? item.groupId : item.accountPlayerId)}</code></td><td>${item.sourceGroupId ? `<code>${esc(item.sourceGroupId)}</code>` : '—'}</td><td><button type="button" class="pr-assignment-remove" data-assignment-id="${esc(item.assignmentId)}" data-source-group-id="${esc(item.sourceGroupId || item.groupId || '')}" data-group-id="${esc(item.groupId || '')}">Retirar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="pr-attempts-empty">La prueba no tiene asignaciones.</p>'; }
  async function loadAssignments(testId = selectedTestId) { const status = get('prAssignmentsStatus'); if (!testId) { renderAssignments([]); if (status) status.textContent = ''; return; } try { const response = await fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}/assignments`), { headers: { 'X-Admin-Password': _adminPass } }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudieron cargar asignaciones'); renderAssignments(data.assignments || []); if (status) status.textContent = `${(data.assignments || []).length} asignación(es)`; } catch (error) { renderAssignments([]); if (status) status.textContent = error.message; } }
  async function removeAssignment(assignmentId, sourceGroupId, groupId) { if (!selectedTestId || !window.confirm('¿Retirar esta asignación de la prueba?')) return; const currentResponse = await fetch(adminUrl(`/api/exams/${encodeURIComponent(selectedTestId)}/assignments`), { headers: { 'X-Admin-Password': _adminPass } }); const currentData = await currentResponse.json(); if (!currentResponse.ok) throw Error(currentData.error || 'No se pudieron consultar asignaciones'); const current = currentData.assignments || []; const assignments = current.filter(item => item.assignmentId !== assignmentId && !(sourceGroupId && item.sourceGroupId === sourceGroupId) && !(groupId && item.targetType === 'group' && item.groupId === groupId)).map(item => ({ targetType: item.targetType, groupId: item.groupId, accountPlayerId: item.accountPlayerId, sourceGroupId: item.sourceGroupId, startsAt: item.startsAt, closesAt: item.closesAt })); const response = await fetch(`/api/exams/${encodeURIComponent(selectedTestId)}/assignments`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ assignments }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo retirar la asignación'); await load(); await loadAssignments(); }
  function renderGroups() {
    const list = get('prGroupsList'); if (list) list.innerHTML = groups.length ? groups.map(group => `<div class="pr-group-card${group.groupId === selectedGroupId ? ' selected' : ''}" data-group-id="${esc(group.groupId)}"><button type="button" class="pr-group-select">${esc(group.name)} · ${esc(group.groupId)}</button><span>${group.memberAccountPlayerIds.length} miembro(s)</span></div>`).join('') : '<p class="pr-attempts-empty">No hay grupos disponibles.</p>';
    const group = groups.find(item => item.groupId === selectedGroupId); const selected = get('prSelectedGroup'); if (selected) selected.innerHTML = group ? `<strong>Grupo seleccionado: ${esc(group.name)}</strong><span>groupId: <code>${esc(group.groupId)}</code> · revision: ${group.revision}</span>` : '<span>Ningún grupo seleccionado.</span>';
    const members = get('prGroupMembersList'); if (members) members.innerHTML = group?.memberAccountPlayerIds?.length ? `<div class="pr-group-members-title">${group.memberAccountPlayerIds.length} alumno(s) dentro del grupo</div><div class="pr-group-member-cards">${group.memberAccountPlayerIds.map(id => { const student = registeredStudents.find(item => item.id === id); return `<span class="pr-group-member-card"><strong>${esc(student?.name || 'Alumno no encontrado')}</strong><small>${esc(student?.grade || 'Grado no disponible')}</small>${student ? '' : `<code>${esc(id)}</code>`}</span>`; }).join('')}</div>` : '<p class="pr-attempts-empty">Grupo sin alumnos.</p>';
    renderStudentPicker();
  }
  function gradeKey(value) { return String(value || '').match(/[1-6]/)?.[0] || ''; }
  function audienceGrade() { return gradeKey(get('prGrade')?.value || ''); }
  function audienceStudents() { const grade = audienceGrade(); return registeredStudents.filter(student => !grade || gradeKey(student.grade) === grade); }
  function renderAudience() {
    const mode = get('prAudienceMode'); const groupSelect = get('prAudienceGroup'); const grid = get('prAudienceStudentsGrid'); const status = get('prAudienceStatus');
    if (!mode || !groupSelect || !grid) return;
    mode.value = audienceMode;
    const grade = audienceGrade();
    const validGroups = groups.filter(group => !grade || gradeKey(group.grade) === grade);
    groupSelect.innerHTML = `<option value="">Selecciona un grupo</option>${validGroups.map(group => `<option value="${esc(group.groupId)}">${esc(group.name)} · ${group.memberAccountPlayerIds.length} alumno(s)</option>`).join('')}`;
    groupSelect.value = audienceGroupId;
    groupSelect.hidden = true;
    grid.hidden = false;
    grid.innerHTML = audienceStudents().length ? audienceStudents().map(student => { const selected = audienceStudentIds.has(student.id); return `<button type="button" class="pr-audience-student${selected ? ' selected' : ''}" data-audience-student="${esc(student.id)}" aria-pressed="${String(selected)}"><strong>${esc(student.name)}</strong><small>${esc(student.grade || 'Sin grado')}</small></button>`; }).join('') : '<p class="pr-attempts-empty">No hay alumnos registrados para este grado.</p>';
    if (status) status.textContent = audienceMode === 'group' ? (audienceGroupId ? 'Se asignará el grupo completo seleccionado.' : 'Selecciona un grupo.') : audienceMode === 'custom' ? `${audienceStudents().filter(student => audienceStudentIds.has(student.id)).length} alumno(s) seleccionado(s).` : `Se asignará a todos los alumnos${grade ? ` de ${get('prGrade').value}` : ''}.`;
  }
  async function loadAudience() {
    await loadGroups();
    if (!selectedTestId) { renderAudience(); return; }
    try {
      const response = await fetch(adminUrl(`/api/exams/${encodeURIComponent(selectedTestId)}/assignments`), { headers: { 'X-Admin-Password': _adminPass } });
      const data = await response.json(); const assignments = response.ok && Array.isArray(data.assignments) ? data.assignments : [];
      const groupAssignment = assignments.find(item => item.targetType === 'group');
      audienceGroupId = groupAssignment?.groupId || '';
      audienceStudentIds = new Set(assignments.filter(item => item.targetType === 'student').map(item => item.accountPlayerId));
      audienceMode = groupAssignment ? 'group' : audienceStudentIds.size ? 'custom' : 'all';
    } catch (_) { audienceMode = 'all'; audienceGroupId = ''; audienceStudentIds = new Set(); }
    renderAudience();
  }
  async function saveAudienceAssignments() {
    if (!selectedTestId) throw Error('Selecciona o crea una prueba antes de asignar alumnos');
    let assignments = [];
    if (audienceMode === 'group') {
      if (!audienceGroupId) throw Error('Selecciona un grupo completo');
      const group = groups.find(item => item.groupId === audienceGroupId);
      if (!group?.memberAccountPlayerIds?.length) throw Error('El grupo seleccionado no tiene alumnos');
      assignments = [{ targetType: 'group', groupId: audienceGroupId, expandGroup: true }];
    } else {
      const students = audienceMode === 'custom' ? audienceStudents().filter(student => audienceStudentIds.has(student.id)) : audienceStudents();
      if (!students.length) throw Error('No hay alumnos seleccionados para la prueba');
      assignments = students.map(student => ({ targetType: 'student', accountPlayerId: student.id }));
    }
    const response = await fetch(`/api/exams/${encodeURIComponent(selectedTestId)}/assignments`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ assignments }) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudieron guardar los alumnos asignados');
    const status = get('prAudienceStatus'); if (status) status.textContent = `${assignments.length} asignación(es) guardada(s).`;
    return data.assignments || assignments;
  }
  function renderStudentPicker() { const select = get('prGroupStudentSelect'); const memberSelect = get('prGroupMemberSelect'); if (!select || !memberSelect) return; const gradeFilter = get('prGroupStudentGrade')?.value || ''; const group = groups.find(item => item.groupId === selectedGroupId); const memberIds = group?.memberAccountPlayerIds || []; const members = new Set(memberIds); const available = registeredStudents.filter(student => !members.has(student.id) && (!gradeFilter || gradeKey(student.grade) === gradeFilter)); const currentMembers = registeredStudents.filter(student => memberIds.includes(student.id)); select.innerHTML = `<option value="">${available.length ? 'Selecciona un alumno registrado' : 'No hay alumnos disponibles'}</option>${available.map(student => `<option value="${esc(student.id)}">${esc(student.name)} · ${esc(student.grade || 'Sin grado')}</option>`).join('')}`; memberSelect.innerHTML = `<option value="">${currentMembers.length ? 'Selecciona un integrante para retirar' : 'El grupo no tiene integrantes'}</option>${currentMembers.map(student => `<option value="${esc(student.id)}">${esc(student.name)} · ${esc(student.grade || 'Sin grado')}</option>`).join('')}`; select.disabled = !selectedGroupId || !available.length; memberSelect.disabled = !selectedGroupId || !currentMembers.length; }
  async function loadRegisteredStudents() { try { const response = await fetch(adminUrl('/api/players')); const data = await response.json(); if (!response.ok) throw Error('No se pudieron cargar alumnos'); const students = Array.isArray(data) ? data : Array.isArray(data.players) ? data.players : []; registeredStudents = students.map(student => ({ ...student, id: student.accountPlayerId || student.id })); renderGroups(); } catch (error) { registeredStudents = []; renderGroups(); groupStatus(error.message); } }
  async function loadGroups() { try { const response = await fetch(adminUrl('/api/maestro/groups'), { headers: { 'X-Admin-Password': _adminPass } }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudieron cargar grupos'); groups = Array.isArray(data.groups) ? data.groups : []; renderGroups(); await loadRegisteredStudents(); } catch (error) { groupStatus(error.message); } }
  async function groupRequest(url, method, body) { const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'Operación de grupo rechazada'); return data; }
  async function createGroup() { const name = get('prGroupName')?.value.trim(); const grade = get('prGroupGrade')?.value.trim(); const schoolYear = get('prGroupYear')?.value.trim(); if (!name || !grade || !schoolYear) throw Error('Datos de grupo obligatorios'); const data = await groupRequest('/api/maestro/groups', 'POST', { name, grade, schoolYear, eventId: crypto.randomUUID() }); selectedGroupId = data.group.groupId; await loadGroups(); }
  async function mutateMember(add) { const group = groups.find(item => item.groupId === selectedGroupId); const source = get(add ? 'prGroupStudentSelect' : 'prGroupMemberSelect'); const accountPlayerId = source?.value.trim(); if (!group || !accountPlayerId) throw Error(add ? 'Selecciona un alumno registrado' : 'Selecciona un integrante del grupo'); const url = `/api/maestro/groups/${group.groupId}/members${add ? '' : `/${accountPlayerId}`}`; await groupRequest(url, add ? 'POST' : 'DELETE', { accountPlayerId, revision: group.revision + 1, eventId: crypto.randomUUID() }); await loadGroups(); }
  async function assignGroup() { const group = groups.find(item => item.groupId === selectedGroupId); if (!group || !selectedTestId) throw Error('Selecciona grupo y prueba'); const currentResponse = await fetch(adminUrl(`/api/exams/${encodeURIComponent(selectedTestId)}/assignments`), { headers: { 'X-Admin-Password': _adminPass } }); const currentData = await currentResponse.json(); if (!currentResponse.ok) throw Error(currentData.error || 'No se pudieron consultar asignaciones'); const current = currentData.assignments || []; const assignments = [...current.filter(item => !(item.targetType === 'group' && item.groupId === group.groupId)).map(item => ({ targetType: item.targetType, groupId: item.groupId, accountPlayerId: item.accountPlayerId, sourceGroupId: item.sourceGroupId })), { targetType: 'group', groupId: group.groupId, expandGroup: true }]; await groupRequest(`/api/exams/${encodeURIComponent(selectedTestId)}/assignments`, 'PUT', { assignments }); await load(); await loadAssignments(); }
  const sectionLabels = { summary: 'Resumen de la prueba seleccionada.', programming: 'Programación y activación.', assignments: 'Alumnos y grupos asignados.', supervision: 'Supervisión de intentos.', results: 'Resultados seguros de la prueba.', ranking: 'Oficialización y publicación al Ranking.', rewards: 'Liquidación de recompensas oficiales.' };
  function setSection(section) {
    const target = sectionLabels[section] ? section : 'summary';
    document.querySelectorAll('[data-pr-section]').forEach(element => element.classList.toggle('pr-section-hidden', !element.dataset.prSection.split(/\s+/).includes(target)));
    document.querySelectorAll('[data-pr-section-target]').forEach(button => { const active = button.dataset.prSectionTarget === target; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    const status = get('prTestSectionStatus'); if (status) status.textContent = sectionLabels[target];
  }
  function filters() { return { search: (get('prTestSearch')?.value || '').trim().toLowerCase(), status: get('prTestStatus')?.value || '', group: (get('prTestGroup')?.value || '').trim().toLowerCase(), from: get('prTestFrom')?.value || '', to: get('prTestTo')?.value || '' }; }
  function visible() {
    const filter = filters();
    return tests.filter(test => {
      if (filter.search && !`${test.title} ${test.testId}`.toLowerCase().includes(filter.search)) return false;
      if (filter.status && test.status !== filter.status) return false;
      if (filter.group && !test.groups.some(group => group.toLowerCase().includes(filter.group))) return false;
      if (filter.from && (!test.createdAt || test.createdAt.slice(0, 10) < filter.from)) return false;
      if (filter.to && (!test.createdAt || test.createdAt.slice(0, 10) > filter.to)) return false;
      return true;
    });
  }
  function renderSelected(test) {
    const target = get('prSelectedTest');
    if (!target) return;
    const configId = get('prConfigTestId'); if (configId) configId.textContent = test ? `folio: ${publicTestCode(test)}` : 'folio: sin seleccionar';
    const duplicate = get('prDuplicateFromConfig'); if (duplicate) duplicate.disabled = !test;
    const configCopy = get('prCopyConfigTestId'); if (configCopy) configCopy.disabled = !test;
    target.innerHTML = test ? `<strong>Folio ${esc(publicTestCode(test))}</strong><span>${esc(test.title || 'Prueba seleccionada')} · Estado: ${esc(statusLabel(test.status))} · ${test.attemptCount} intento(s)</span><span class="pr-internal-test-id" hidden>testId: ${esc(test.testId)}</span>` : '<span>Ninguna prueba seleccionada.</span>';
  }
  function render() {
    const target = get('prTestLibraryList');
    if (!target) return;
    renderSummary();
    renderActiveSupervision();
    renderSupervisionTestSelector();
    const rows = visible();
    target.innerHTML = rows.length ? rows.map(test => `<article class="pr-test-card${test.testId === selectedTestId ? ' selected' : ''}" data-test-library-card="${esc(test.testId)}"><div class="pr-test-card-main"><strong>${esc(test.title || 'Prueba sin título')}</strong><code>${esc(test.testId)}</code><span>${esc(statusLabel(test.status))} · creada ${esc(dateText(test.createdAt))} · ${test.attemptCount} intento(s)</span><span>${test.groups.length ? `Grupo(s): ${esc(test.groups.join(', '))}` : 'Sin grupo asignado'} · ${test.assignmentCount} asignación(es)</span></div><div class="pr-test-card-meta"><span>${test.hasOfficialResults ? 'Oficial ✓' : 'Sin oficializar'}</span><span>${test.hasRankingPublications ? 'Ranking ✓' : 'Sin publicación'}</span><span>${test.startsAt ? `Programada: ${esc(dateText(test.startsAt))}` : ''}</span></div><div class="pr-test-card-actions"><button type="button" class="pr-test-select" data-test-id="${esc(test.testId)}">Seleccionar prueba</button><button type="button" class="pr-test-copy" data-test-id="${esc(test.testId)}">Copiar testId</button>${test.status === 'draft' ? `<button type="button" class="pr-test-edit" data-test-id="${esc(test.testId)}">Editar borrador</button><button type="button" class="pr-test-schedule" data-test-id="${esc(test.testId)}">Programar</button><button type="button" class="pr-test-finish-legacy" data-test-id="${esc(test.testId)}">Cerrar como finalizada</button>` : ''}${test.status === 'scheduled' && (!test.startsAt || Date.parse(test.startsAt) <= Date.now()) ? `<button type="button" class="pr-test-activate" data-test-id="${esc(test.testId)}">Activar</button>` : ''}${!['cancelled','finished'].includes(test.status) ? `<button type="button" class="pr-test-assign" data-test-id="${esc(test.testId)}">Asignar</button>` : ''}</div></article>`).join('') : '<p class="pr-attempts-empty">No hay pruebas que coincidan con los filtros.</p>';
    target.classList.toggle('pr-finished-library', rows.length > 0 && rows.every(test => test.status === 'finished'));
    target.querySelectorAll('.pr-test-card').forEach(card => { const test = tests.find(item => item.testId === card.dataset.testLibraryCard); const code = card.querySelector('code'); if (test && code) code.textContent = `Folio ${publicTestCode(test)}`; if (test?.status === 'finished') { card.classList.add('pr-test-card-finished'); if (!card.querySelector('.pr-test-archive')) card.querySelector('.pr-test-card-actions')?.insertAdjacentHTML('beforeend', `<button type="button" class="pr-test-archive" data-test-id="${esc(test.testId)}">Eliminar de biblioteca</button>`); } });
    renderSelected(tests.find(test => test.testId === selectedTestId));
  }

  function renderSupervisionTestSelector() {
    const selector = get('prSupervisionTestSelect');
    if (!selector) return;
    const finished = tests.filter(test => test.status === 'finished');
    const current = finished.some(test => test.testId === selectedTestId) ? selectedTestId : '';
    selector.innerHTML = '<option value="">Selecciona una prueba finalizada</option>' + finished.map(test => `<option value="${esc(test.testId)}">Folio ${esc(publicTestCode(test))} · ${esc(test.title || 'Prueba sin título')} · ${Number(test.attemptCount) || 0} intento(s)</option>`).join('');
    selector.value = current;
    selector.disabled = !finished.length;
  }

  function selectSupervisionTest(testId) {
    if (!testId) return;
    select(testId);
  }
  async function load() {
    const status = get('prTestLibraryStatus');
    if (status) status.textContent = 'Cargando biblioteca…';
    try {
      const response = await fetch(adminUrl('/api/maestro/tests?limit=100&sort=updatedAt&order=desc'));
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudo cargar la biblioteca');
      tests = Array.isArray(data.tests) ? data.tests : [];
      if (!tests.some(test => test.testId === selectedTestId)) {
        const latestTest = tests.find(test => test.status === 'draft') || tests[0];
        selectedTestId = latestTest?.testId || '';
        if (selectedTestId) sessionStorage.setItem('maestroSelectedTestId', selectedTestId);
      }
      render();
      if (selectedTestId) { loadConfiguration(selectedTestId); loadAssignments(selectedTestId); loadAudience(); }
      if (status) status.textContent = `${tests.length} prueba(s) disponibles`;
    } catch (error) {
      tests = [];
      render();
      if (status) status.textContent = error.message || 'Error al cargar la biblioteca';
    }
  }
  function select(testId) {
    const test = tests.find(item => item.testId === testId);
    if (!test) return;
    selectedTestId = testId;
    sessionStorage.setItem('maestroSelectedTestId', testId);
    loadConfiguration(testId);
    const input = get('prAttemptTestId');
    if (input) input.value = testId;
    render();
    if (typeof window.prLoadAttempts === 'function') window.prLoadAttempts();
    loadAssignments(testId);
    loadAudience();
  }
  async function loadConfiguration(testId) {
    try {
      const response = await fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}`), { headers: { 'X-Admin-Password': _adminPass } });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudo cargar la configuración');
      configurations.set(testId, { ...(data.test?.configuration || {}), folio: data.test?.folio || data.test?.title || '', title: data.test?.title || '', description: data.test?.description || '', createdAt: data.test?.createdAt || '' });
      const test = tests.find(item => item.testId === testId);
      if (test) test.configuration = configurations.get(testId);
      if (selectedTestId === testId && typeof window.prLoadTestConfiguration === 'function') window.prLoadTestConfiguration(configurations.get(testId));
    } catch (error) {
      if (selectedTestId === testId) { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; }
    }
  }
  async function copy(testId) {
    try { await navigator.clipboard.writeText(testId); const status = get('prTestLibraryStatus'); if (status) status.textContent = 'testId copiado'; } catch (_) { const input = get('prAttemptTestId'); if (input) { input.focus(); input.select(); } }
  }
  async function createDraft() {
    const response = await fetch('/api/exams', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ configuration: {} }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo crear la prueba');
    selectedTestId = data.test.testId; sessionStorage.setItem('maestroSelectedTestId', selectedTestId); await load(); select(selectedTestId);
  }
  async function createDraftFromCurrentConfiguration() {
    const configuration = typeof window.prGetTestConfiguration === 'function' ? window.prGetTestConfiguration({}) : {};
    delete configuration.folio; delete configuration.title;
    const response = await fetch('/api/exams', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ configuration }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo preparar la prueba');
    selectedTestId = data.test.testId; sessionStorage.setItem('maestroSelectedTestId', selectedTestId);
    await load(); select(selectedTestId); return data.test;
  }
  async function duplicateTest(testId) {
    const source = tests.find(item => item.testId === testId); if (!source) throw Error('Selecciona una prueba para duplicar');
    const configuration = configurations.get(testId) || source.configuration || {};
    const response = await fetch('/api/exams', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ title: `${source.title || 'Prueba'} (copia)`, description: source.description || configuration.description || '', creator: configuration.creator, configuration: JSON.parse(JSON.stringify(configuration)) }) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo duplicar la prueba');
    selectedTestId = data.test.testId; sessionStorage.setItem('maestroSelectedTestId', selectedTestId); await load(); select(selectedTestId);
  }
  async function editDraft(testId) {
    const test = tests.find(item => item.testId === testId); if (!test) return;
    const configuration = typeof window.prGetTestConfiguration === 'function' ? window.prGetTestConfiguration(configurations.get(testId) || test.configuration || {}) : (configurations.get(testId) || test.configuration || {});
    const folio = String(configuration.title || test.title || 'Prueba').trim();
    const response = await fetch(`/api/exams/${encodeURIComponent(testId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ title: folio, description: configuration.description || test.description || '', revision: test.revision + 1, configuration }) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo editar la prueba'); await load(); select(testId);
  }
  async function finishLegacyTest(testId) {
    const test = tests.find(item => item.testId === testId); if (!test || test.status !== 'draft') return;
    if (!window.confirm(`El folio ${test.folio || test.title || 'sin folio'} quedará como Finalizada. ¿Confirmas que ya fue aplicada?`)) return;
    const reason = window.prompt('Escribe la razón del cierre histórico:'); if (reason === null || !reason.trim()) throw Error('La razón es obligatoria');
    const response = await fetch(`/api/exams/${encodeURIComponent(testId)}/state`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ action: 'finish_legacy', revision: test.revision + 1, reason: reason.trim() }) });
    const data = await response.json(); if (!response.ok) { const message = data.error || 'No se pudo cerrar el borrador histórico'; if (/acci[oó]n de estado inv[aá]lida/i.test(message)) throw Error('El servidor necesita reiniciarse para habilitar el cierre histórico. Reinicia Math Attack e inténtalo de nuevo.'); throw Error(message); } await load(); select(testId);
  }
  async function saveDraft(testId) {
    const test = tests.find(item => item.testId === testId); if (!test) throw Error('Prueba no encontrada');
    if (test.status !== 'draft') throw Error('La configuracion solo se puede editar en borrador');
    const configuration = typeof window.prGetTestConfiguration === 'function' ? window.prGetTestConfiguration(configurations.get(testId) || test.configuration || {}) : (configurations.get(testId) || test.configuration || {});
    const folio = String(configuration.folio || '').trim(); if (!/^\d{4}$/.test(folio)) throw Error('El folio debe tener cuatro dígitos');
    const title = String(configuration.title || '').trim(); if (!title) throw Error('El título es obligatorio');
    if (busy.has(`save:${testId}`)) return; busy.add(`save:${testId}`);
    try { const response = await fetch(`/api/exams/${encodeURIComponent(testId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ title, description: configuration.description || '', revision: test.revision + 1, configuration }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo guardar la configuracion'); await load(); select(testId); const status = get('prTestLibraryStatus'); if (status) status.textContent = 'Configuracion guardada'; return data.test; } finally { busy.delete(`save:${testId}`); }
  }
  function toDateTimeLocal(value) { if (!value) return ''; const date = new Date(value); const pad = number => String(number).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
  function closeScheduleModal() { const modal = get('prScheduleModal'); if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); } }
  function openScheduleModal(testId) { const test = tests.find(item => item.testId === testId); const modal = get('prScheduleModal'); if (!test || !modal) return; modal.dataset.testId = testId; get('prScheduleModalTest').textContent = `Folio ${publicTestCode(test)}`; get('prScheduleStart').value = toDateTimeLocal(test.startsAt || test.scheduledAt); get('prScheduleClose').value = toDateTimeLocal(test.closesAt); get('prScheduleStatus').textContent = ''; modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); get('prScheduleStart').focus(); }
  async function scheduleTest(testId) { if (!get('prScheduleModal')) { const test = tests.find(item => item.testId === testId); const startsAt = window.prompt('Inicio (ISO 8601):'); if (startsAt === null || !startsAt.trim() || Number.isNaN(Date.parse(startsAt.trim()))) throw Error('La fecha de inicio no es válida'); const closesAt = window.prompt('Cierre (ISO 8601, opcional):'); if (closesAt === null) return; const closeValue = closesAt.trim() || null; if (closeValue && (Number.isNaN(Date.parse(closeValue)) || Date.parse(closeValue) <= Date.parse(startsAt.trim()))) throw Error('El cierre debe ser posterior al inicio'); const response = await fetch(`/api/exams/${encodeURIComponent(testId)}/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ revision: test.revision + 1, startsAt: startsAt.trim(), closesAt: closeValue }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo programar la prueba'); await load(); select(testId); return; } openScheduleModal(testId); }
  async function saveSchedule() {
    const modal = get('prScheduleModal'); const testId = modal?.dataset.testId; const test = tests.find(item => item.testId === testId); const startInput = get('prScheduleStart'); const closeInput = get('prScheduleClose'); const status = get('prScheduleStatus'); if (!test || !startInput?.value) { if (status) status.textContent = 'Selecciona fecha y hora de inicio.'; return; }
    const startsAt = new Date(startInput.value); const closesAt = closeInput?.value ? new Date(closeInput.value) : null; if (Number.isNaN(startsAt.getTime())) { if (status) status.textContent = 'La fecha de inicio no es válida.'; return; } if (closesAt && (Number.isNaN(closesAt.getTime()) || closesAt <= startsAt)) { if (status) status.textContent = 'El cierre debe ser posterior al inicio.'; return; }
    if (busy.has(`schedule:${testId}`)) return; busy.add(`schedule:${testId}`); try { const response = await fetch(`/api/exams/${encodeURIComponent(testId)}/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ revision: test.revision + 1, startsAt: startsAt.toISOString(), closesAt: closesAt ? closesAt.toISOString() : null }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo programar la prueba'); closeScheduleModal(); await load(); select(testId); } catch (error) { if (status) status.textContent = error.message; } finally { busy.delete(`schedule:${testId}`); }
  }
  async function archiveTest(testId) { const test = tests.find(item => item.testId === testId); if (!test || test.status !== 'finished') return; if (!await askTestConfirmation('Eliminar de biblioteca', `La prueba Folio ${publicTestCode(test)} dejará de aparecer en la biblioteca. Sus resultados se conservarán.`)) return; try { const response = await fetch(`/api/exams/${encodeURIComponent(testId)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ revision: test.revision + 1 }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo eliminar la prueba'); await load(); } catch (error) { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; } }
  async function activateTest(testId) {
    const test = tests.find(item => item.testId === testId); if (!test || busy.has(`activate:${testId}`)) return; busy.add(`activate:${testId}`);
    try { const response = await fetch(`/api/exams/${encodeURIComponent(testId)}/state`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ action: 'start', revision: test.revision + 1 }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo activar la prueba'); await load(); select(testId); } finally { busy.delete(`activate:${testId}`); }
  }
  async function assignTest(testId) {
    const targetType = window.prompt('Tipo de asignación: student o group:'); if (!['student', 'group'].includes(targetType)) return;
    const value = window.prompt(targetType === 'student' ? 'accountPlayerId del alumno:' : 'groupId del grupo:'); if (value === null || !value.trim()) return;
    if (busy.has(`assign:${testId}`)) return; busy.add(`assign:${testId}`);
    try { const currentResponse = await fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}/assignments`), { headers: { 'X-Admin-Password': _adminPass } }); const currentData = await currentResponse.json(); if (!currentResponse.ok) throw Error(currentData.error || 'No se pudieron consultar asignaciones');
      const current = Array.isArray(currentData.assignments) ? currentData.assignments : []; const duplicate = current.some(item => item.targetType === targetType && (targetType === 'student' ? item.accountPlayerId : item.groupId) === value.trim()); if (duplicate) throw Error('La asignación ya existe');
      const assignment = targetType === 'student' ? { targetType, accountPlayerId: value.trim() } : { targetType, groupId: value.trim() }; const assignments = [...current.map(item => ({ targetType: item.targetType, groupId: item.groupId, accountPlayerId: item.accountPlayerId })), assignment];
      const response = await fetch(`/api/exams/${encodeURIComponent(testId)}/assignments`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ assignments }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo asignar'); await load(); select(testId);
    } finally { busy.delete(`assign:${testId}`); }
  }
  document.addEventListener('input', event => { if (event.target.closest('#prTestLibraryFilters')) render(); });
  document.addEventListener('change', event => { if (event.target.id === 'prGroupStudentGrade') renderStudentPicker(); });
  document.addEventListener('change', event => { if (event.target.id === 'prGrade') renderAudience(); if (event.target.id === 'prAudienceMode') { audienceMode = event.target.value; if (audienceMode === 'custom' && !audienceStudentIds.size) audienceStudentIds = new Set(); renderAudience(); } if (event.target.id === 'prAudienceGroup') { audienceGroupId = event.target.value; renderAudience(); } });
  document.addEventListener('click', event => {
    if (event.target.closest('#prAudienceSelectAll')) { audienceMode = 'custom'; audienceStudentIds = new Set(audienceStudents().map(student => student.id)); renderAudience(); return; }
    if (event.target.closest('#prAudienceInvert')) { audienceMode = 'custom'; const current = new Set(audienceStudentIds); audienceStudentIds = new Set(audienceStudents().filter(student => !current.has(student.id)).map(student => student.id)); renderAudience(); return; }
    const audienceStudent = event.target.closest('[data-audience-student]'); if (audienceStudent) { audienceMode = 'custom'; const id = audienceStudent.dataset.audienceStudent; if (audienceStudentIds.has(id)) audienceStudentIds.delete(id); else audienceStudentIds.add(id); renderAudience(); return; }
    const supervisionStop = event.target.closest('.pr-supervision-stop');
    if (supervisionStop) { event.stopPropagation(); return stopActiveTest(supervisionStop.dataset.testId).catch(error => { const status = get('prAttemptsStatus'); if (status) status.textContent = error.message; }); }
    const summaryCard = event.target.closest('.pr-summary-card');
    if (summaryCard) return openSummaryModal(summaryCard.dataset.summaryTestId);
    if (event.target.closest('#prSummaryModalClose') || event.target.id === 'prTestSummaryModal') return closeSummaryModal();
    const sectionButton = event.target.closest('[data-pr-section-target]');
    if (sectionButton) return setSection(sectionButton.dataset.prSectionTarget);
    const selectButton = event.target.closest('.pr-test-select');
    if (selectButton) return select(selectButton.dataset.testId);
    const copyButton = event.target.closest('.pr-test-copy');
    if (copyButton) return copy(copyButton.dataset.testId);
    const editButton = event.target.closest('.pr-test-edit');
    if (editButton) return editDraft(editButton.dataset.testId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    const finishLegacyButton = event.target.closest('.pr-test-finish-legacy');
    if (finishLegacyButton) return finishLegacyTest(finishLegacyButton.dataset.testId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    const scheduleButton = event.target.closest('.pr-test-schedule');
    if (scheduleButton) return scheduleTest(scheduleButton.dataset.testId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    const archiveButton = event.target.closest('.pr-test-archive');
    if (archiveButton) return archiveTest(archiveButton.dataset.testId);
    const activateButton = event.target.closest('.pr-test-activate');
    if (activateButton) return activateTest(activateButton.dataset.testId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    const assignButton = event.target.closest('.pr-test-assign');
    if (assignButton) return assignTest(assignButton.dataset.testId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    const removeAssignmentButton = event.target.closest('.pr-assignment-remove');
    if (removeAssignmentButton) return removeAssignment(removeAssignmentButton.dataset.assignmentId, removeAssignmentButton.dataset.sourceGroupId, removeAssignmentButton.dataset.groupId).catch(error => { const status = get('prAssignmentsStatus'); if (status) status.textContent = error.message; });
    if (event.target.closest('.pr-test-create')) return createDraft().catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    if (event.target.id === 'prCreateFromConfig' || event.target.id === 'prCreateNewTestFromConfig') return createDraft().catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    if (event.target.id === 'prDuplicateFromConfig') return duplicateTest(selectedTestId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    if (event.target.id === 'prCopyConfigTestId') return copy(selectedTestId);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSummaryModal(); const card = event.target.closest('.pr-summary-card'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openSummaryModal(card.dataset.summaryTestId); } });
  document.addEventListener('click', event => { if (event.target.id === 'prScheduleModalClose' || event.target.id === 'prScheduleCancel' || event.target.id === 'prScheduleModal') closeScheduleModal(); if (event.target.id === 'prScheduleSave') saveSchedule(); });
  window.prCloseTestSummaryModal = closeSummaryModal;
  window.prLoadTestLibrary = load;
  window.prSelectSupervisionTest = selectSupervisionTest;
  window.prSetTestSection = setSection;
  window.prSelectTest = select;
  window.prRenderTestLibrary = render;
  window.prSaveSelectedTest = async () => {
    if (!selectedTestId && !tests.length) await load();
    if (!selectedTestId && tests.length) {
      const latest = tests.find(test => test.status === 'draft') || tests[0];
      selectedTestId = latest.testId; sessionStorage.setItem('maestroSelectedTestId', selectedTestId);
    }
    if (!selectedTestId) return createDraftFromCurrentConfiguration();
    const selected = tests.find(test => test.testId === selectedTestId);
    if (!selected) return createDraftFromCurrentConfiguration();
    if (selected.status !== 'draft') return Promise.reject(Error(`La prueba está ${statusLabel(selected.status).toLowerCase()}; selecciona un borrador para iniciar una nueva aplicación.`));
    return saveDraft(selectedTestId);
  };
  window.prLoadGroups = loadGroups;
  window.prLoadAudience = loadAudience;
  window.prSaveAudienceAssignments = saveAudienceAssignments;
  document.addEventListener('click', event => {
    const groupButton = event.target.closest('.pr-group-select'); if (groupButton) { selectedGroupId = groupButton.closest('[data-group-id]').dataset.groupId; renderGroups(); }
    const action = event.target.id; if (action === 'prGroupCreate') createGroup().catch(error => groupStatus(error.message)); if (action === 'prGroupAddMember') mutateMember(true).catch(error => groupStatus(error.message)); if (action === 'prGroupRemoveMember') mutateMember(false).catch(error => groupStatus(error.message)); if (action === 'prGroupAssign') assignGroup().catch(error => groupStatus(error.message));
  });
  window.addEventListener('load', () => { if (typeof window.prLoadTestLibrary === 'function') window.prLoadTestLibrary(); });
  setSection('summary');
})();
