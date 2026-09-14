'use strict';

(() => {
  let tests = [];
  let selectedTestId = sessionStorage.getItem('maestroSelectedTestId') || '';
  const configurations = new Map();
  let groups = []; let selectedGroupId = '';
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
  function summaryTests() { return tests.slice().sort((a, b) => (Date.parse(b.lastModifiedAt || b.updatedAt || b.createdAt) || 0) - (Date.parse(a.lastModifiedAt || a.updatedAt || a.createdAt) || 0) || a.testId.localeCompare(b.testId)).slice(0, 5); }
  function renderSummary() {
    const target = get('prTestSummaryList'); if (!target) return;
    const recent = summaryTests();
    if (!recent.length) { target.innerHTML = '<p class="pr-attempts-empty">No hay pruebas registradas.</p>'; return; }
    const groups = new Map(summaryOrder.map(status => [status, []]));
    recent.forEach(test => { const status = groups.has(test.status) ? test.status : 'finished'; groups.get(status).push(test); });
    target.innerHTML = summaryOrder.filter(status => groups.get(status).length).map(status => `<section class="pr-summary-status-group" data-summary-status="${status}"><h3>${summaryGroupLabels[status]}</h3><div class="pr-summary-cards">${groups.get(status).map(test => `<article class="pr-summary-card" data-summary-test-id="${esc(test.testId)}" tabindex="0" role="button" aria-label="Ver detalles de ${esc(test.title || 'prueba')}"><div class="pr-summary-card-head"><strong>${esc(test.title || 'Prueba sin título')}</strong><span class="pr-summary-status pr-summary-status-${status}">${esc(statusLabel(status))}</span></div><code>${esc(test.testId)}</code><span>Actualizada: ${esc(formatDateTime(test.lastModifiedAt || test.updatedAt || test.createdAt))}</span><span>${test.groups.length ? `Grupo: ${esc(test.groups.join(', '))}` : test.assignmentCount ? `Asignaciones: ${test.assignmentCount}` : 'Sin asignación'}</span><span>${Number(test.questionCount) || 0} preguntas · ${esc((test.operations || []).join(', ') || 'Sin operaciones')}</span></article>`).join('')}</div></section>`).join('');
    const status = get('prTestSummaryStatus'); if (status) status.textContent = `${recent.length} de ${tests.length} pruebas recientes`;
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
  function detailMarkup(test, configuration, assignments, officials) {
    const rewards = configuration.rewards || {};
    const officialIds = officials.map(item => item.officialAttemptId).filter(Boolean);
    const history = Array.isArray(test.stateHistory) && test.stateHistory.length ? test.stateHistory.map(item => `${statusLabel(String(item.action || '').replace(/^test_/, '').replace('started', 'active').replace('resumed', 'active'))} · ${formatDateTime(item.occurredAt)}`).join('<br>') : 'Sin historial disponible';
    return `<div class="pr-detail-grid"><div><b>Descripción</b><p>${esc(test.description || 'Sin descripción')}</p></div><div><b>Operaciones</b>${operationDetails(configuration)}</div><div><b>Preguntas</b><p>${Number(configuration.total) || 'Configuradas por operación'}</p></div><div><b>Multiplicador</b><p>${Number(configuration.multiplier) || 1}× (solo puntaje)</p></div><div><b>Recompensas</b><p>Áureos: ${Number(rewards.aureos) || 0} · XP: ${Number(rewards.experience) || 0} · Racha: ${rewards.streak?.enabled ? 'activa' : 'inactiva'} · Logro perfecto: ${rewards.achievements?.perfect?.enabled ? 'activo' : 'inactivo'}</p></div><div><b>Fechas</b><p>Creada: ${esc(formatDateTime(test.createdAt))}<br>Actualizada: ${esc(formatDateTime(test.updatedAt || test.createdAt))}<br>Programada: ${esc(formatDateTime(test.startsAt || test.scheduledAt))}<br>Cierre: ${esc(formatDateTime(test.closesAt))}</p></div><div><b>Historial de estados</b><p>${history}</p></div><div><b>Asignaciones</b><ul>${assignments.length ? assignments.map(item => `<li>${esc(item.targetType === 'group' ? `Grupo ${item.groupId || '—'}` : `Alumno ${item.accountPlayerId || '—'}`)}</li>`).join('') : '<li>Sin asignaciones</li>'}</ul></div><div><b>Intentos</b><p>${Number(test.attemptCount) || 0}</p></div><div><b>Estado oficial</b><p>${officialIds.length ? `Oficializada · ${officialIds.length}` : 'Sin oficializar'}${officialIds.length ? `<br>IDs: ${esc(formatList(officialIds))}` : ''}</p></div><div><b>Ranking</b><p>${test.hasRankingPublications ? `Publicado · ${test.rankingPublicationCount || 0}` : 'Sin publicación'}</p></div><div><b>testId</b><p><code>${esc(test.testId)}</code></p></div></div>`;
  }
  function closeSummaryModal() { const modal = get('prTestSummaryModal'); if (!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
  async function openSummaryModal(testId) {
    const modal = get('prTestSummaryModal'); const content = get('prSummaryModalContent'); if (!modal || !content) return;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); content.innerHTML = '<p class="pr-attempts-empty">Cargando detalles…</p>'; get('prSummaryModalClose')?.focus();
    try {
      const [testResponse, assignmentsResponse, officialsResponse] = await Promise.all([fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}`), { headers: { 'X-Admin-Password': _adminPass } }), fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}/assignments`), { headers: { 'X-Admin-Password': _adminPass } }), fetch(adminUrl(`/api/maestro/tests/${encodeURIComponent(testId)}/official-attempts`))]);
      const testData = await testResponse.json(); const assignmentData = await assignmentsResponse.json(); const officialsData = officialsResponse.ok ? await officialsResponse.json() : { officialAttempts: [] };
      if (!testResponse.ok) throw Error(testData.error || 'No se pudo cargar el detalle');
      const test = tests.find(item => item.testId === testId) || { testId }; const fullTest = { ...test, ...(testData.test || {}) };
      content.innerHTML = detailMarkup(fullTest, fullTest.configuration || {}, assignmentData.assignments || [], officialsData.officialAttempts || []);
    } catch (error) { content.innerHTML = `<p class="pr-attempts-status">${esc(error.message || 'No se pudo cargar el detalle')}</p>`; }
  }
  const groupStatus = message => { const node = get('prGroupsStatus'); if (node) node.textContent = message || ''; };
  function renderGroups() {
    const list = get('prGroupsList'); if (list) list.innerHTML = groups.length ? groups.map(group => `<div class="pr-group-card${group.groupId === selectedGroupId ? ' selected' : ''}" data-group-id="${esc(group.groupId)}"><button type="button" class="pr-group-select">${esc(group.name)} · ${esc(group.groupId)}</button><span>${group.memberAccountPlayerIds.length} miembro(s)</span></div>`).join('') : '<p class="pr-attempts-empty">No hay grupos disponibles.</p>';
    const group = groups.find(item => item.groupId === selectedGroupId); const selected = get('prSelectedGroup'); if (selected) selected.innerHTML = group ? `<strong>Grupo seleccionado: ${esc(group.name)}</strong><span>groupId: <code>${esc(group.groupId)}</code> · revision: ${group.revision}</span>` : '<span>Ningún grupo seleccionado.</span>';
    const members = get('prGroupMembersList'); if (members) members.innerHTML = group?.memberAccountPlayerIds?.length ? group.memberAccountPlayerIds.map(id => `<span class="pr-group-card">${esc(id)}</span>`).join('') : '<p class="pr-attempts-empty">Grupo sin alumnos.</p>';
  }
  async function loadGroups() { try { const response = await fetch(adminUrl('/api/maestro/groups'), { headers: { 'X-Admin-Password': _adminPass } }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudieron cargar grupos'); groups = Array.isArray(data.groups) ? data.groups : []; renderGroups(); } catch (error) { groupStatus(error.message); } }
  async function groupRequest(url, method, body) { const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'Operación de grupo rechazada'); return data; }
  async function createGroup() { const name = get('prGroupName')?.value.trim(); const grade = get('prGroupGrade')?.value.trim(); const schoolYear = get('prGroupYear')?.value.trim(); if (!name || !grade || !schoolYear) throw Error('Datos de grupo obligatorios'); const data = await groupRequest('/api/maestro/groups', 'POST', { name, grade, schoolYear, eventId: crypto.randomUUID() }); selectedGroupId = data.group.groupId; await loadGroups(); }
  async function mutateMember(add) { const group = groups.find(item => item.groupId === selectedGroupId); const accountPlayerId = get('prGroupAccountPlayerId')?.value.trim(); if (!group || !accountPlayerId) throw Error('Grupo y accountPlayerId obligatorios'); const url = `/api/maestro/groups/${group.groupId}/members${add ? '' : `/${accountPlayerId}`}`; await groupRequest(url, add ? 'POST' : 'DELETE', { accountPlayerId, revision: group.revision + 1, eventId: crypto.randomUUID() }); await loadGroups(); }
  async function assignGroup() { const group = groups.find(item => item.groupId === selectedGroupId); if (!group || !selectedTestId) throw Error('Selecciona grupo y prueba'); const currentResponse = await fetch(adminUrl(`/api/exams/${encodeURIComponent(selectedTestId)}/assignments`), { headers: { 'X-Admin-Password': _adminPass } }); const currentData = await currentResponse.json(); if (!currentResponse.ok) throw Error(currentData.error || 'No se pudieron consultar asignaciones'); const assignments = [...(currentData.assignments || []).map(item => ({ targetType: item.targetType, groupId: item.groupId, accountPlayerId: item.accountPlayerId })), { targetType: 'group', groupId: group.groupId, expandGroup: true }]; await groupRequest(`/api/exams/${encodeURIComponent(selectedTestId)}/assignments`, 'PUT', { assignments }); await load(); }
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
    target.innerHTML = test ? `<strong>Prueba seleccionada: ${esc(test.title)}</strong><span>Estado: ${esc(statusLabel(test.status))} · testId: <code>${esc(test.testId)}</code> · ${test.attemptCount} intento(s)</span>` : '<span>Ninguna prueba seleccionada.</span>';
  }
  function render() {
    const target = get('prTestLibraryList');
    if (!target) return;
    renderSummary();
    const rows = visible();
    target.innerHTML = rows.length ? rows.map(test => `<article class="pr-test-card${test.testId === selectedTestId ? ' selected' : ''}" data-test-library-card="${esc(test.testId)}"><div class="pr-test-card-main"><strong>${esc(test.title || 'Prueba sin título')}</strong><code>${esc(test.testId)}</code><span>${esc(statusLabel(test.status))} · creada ${esc(dateText(test.createdAt))} · ${test.attemptCount} intento(s)</span><span>${test.groups.length ? `Grupo(s): ${esc(test.groups.join(', '))}` : 'Sin grupo asignado'} · ${test.assignmentCount} asignación(es)</span></div><div class="pr-test-card-meta"><span>${test.hasOfficialResults ? 'Oficial ✓' : 'Sin oficializar'}</span><span>${test.hasRankingPublications ? 'Ranking ✓' : 'Sin publicación'}</span><span>${test.startsAt ? `Programada: ${esc(dateText(test.startsAt))}` : ''}</span></div><div class="pr-test-card-actions"><button type="button" class="pr-test-select" data-test-id="${esc(test.testId)}">Seleccionar prueba</button><button type="button" class="pr-test-copy" data-test-id="${esc(test.testId)}">Copiar testId</button>${test.status === 'draft' ? `<button type="button" class="pr-test-edit" data-test-id="${esc(test.testId)}">Editar borrador</button><button type="button" class="pr-test-schedule" data-test-id="${esc(test.testId)}">Programar</button>` : ''}${test.status === 'scheduled' && (!test.startsAt || Date.parse(test.startsAt) <= Date.now()) ? `<button type="button" class="pr-test-activate" data-test-id="${esc(test.testId)}">Activar</button>` : ''}${!['cancelled','finished'].includes(test.status) ? `<button type="button" class="pr-test-assign" data-test-id="${esc(test.testId)}">Asignar</button>` : ''}</div></article>`).join('') : '<p class="pr-attempts-empty">No hay pruebas que coincidan con los filtros.</p>';
    renderSelected(tests.find(test => test.testId === selectedTestId));
  }
  async function load() {
    const status = get('prTestLibraryStatus');
    if (status) status.textContent = 'Cargando biblioteca…';
    try {
      const response = await fetch(adminUrl('/api/maestro/tests?limit=100&sort=updatedAt&order=desc'));
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudo cargar la biblioteca');
      tests = Array.isArray(data.tests) ? data.tests : [];
      render();
      if (selectedTestId) loadConfiguration(selectedTestId);
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
  }
  async function loadConfiguration(testId) {
    try {
      const response = await fetch(adminUrl(`/api/exams/${encodeURIComponent(testId)}`), { headers: { 'X-Admin-Password': _adminPass } });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudo cargar la configuración');
      configurations.set(testId, { ...(data.test?.configuration || {}), title: data.test?.title || '', description: data.test?.description || '' });
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
    const title = window.prompt('Título de la nueva prueba:');
    if (title === null || !title.trim()) return;
    const response = await fetch('/api/exams', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ title: title.trim(), configuration: {} }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo crear la prueba');
    selectedTestId = data.test.testId; sessionStorage.setItem('maestroSelectedTestId', selectedTestId); await load(); select(selectedTestId);
  }
  async function editDraft(testId) {
    const test = tests.find(item => item.testId === testId); if (!test) return;
    const title = window.prompt('Nuevo título:', test.title); if (title === null || !title.trim()) return;
    const configuration = typeof window.prGetTestConfiguration === 'function' ? window.prGetTestConfiguration(configurations.get(testId) || test.configuration || {}) : (configurations.get(testId) || test.configuration || {});
    const response = await fetch(`/api/exams/${encodeURIComponent(testId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ title: (configuration.title || title.trim()), description: configuration.description || test.description || '', revision: test.revision + 1, configuration }) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo editar la prueba'); await load(); select(testId);
  }
  async function saveDraft(testId) {
    const test = tests.find(item => item.testId === testId); if (!test) throw Error('Prueba no encontrada');
    if (test.status !== 'draft') throw Error('La configuracion solo se puede editar en borrador');
    const configuration = typeof window.prGetTestConfiguration === 'function' ? window.prGetTestConfiguration(configurations.get(testId) || test.configuration || {}) : (configurations.get(testId) || test.configuration || {});
    const title = String(configuration.title || '').trim(); if (!title) throw Error('El titulo es obligatorio');
    if (busy.has(`save:${testId}`)) return; busy.add(`save:${testId}`);
    try { const response = await fetch(`/api/exams/${encodeURIComponent(testId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ title, description: configuration.description || '', revision: test.revision + 1, configuration }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo guardar la configuracion'); await load(); select(testId); const status = get('prTestLibraryStatus'); if (status) status.textContent = 'Configuracion guardada'; } finally { busy.delete(`save:${testId}`); }
  }
  async function scheduleTest(testId) {
    const test = tests.find(item => item.testId === testId); if (!test) return;
    if (busy.has(`schedule:${testId}`)) return; busy.add(`schedule:${testId}`);
    try { const startsAt = window.prompt('Inicio (ISO 8601, ejemplo 2030-01-01T10:00:00.000Z):'); if (startsAt === null || !startsAt.trim() || Number.isNaN(Date.parse(startsAt.trim()))) throw Error('La fecha de inicio debe ser ISO válida');
      const closesAt = window.prompt('Cierre (ISO 8601, opcional):'); if (closesAt === null) return; const closeValue = closesAt.trim() || null; if (closeValue && (Number.isNaN(Date.parse(closeValue)) || Date.parse(closeValue) <= Date.parse(startsAt.trim()))) throw Error('La fecha de cierre debe ser posterior al inicio');
      const response = await fetch(`/api/exams/${encodeURIComponent(testId)}/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ revision: test.revision + 1, startsAt: startsAt.trim(), closesAt: closeValue }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo programar la prueba'); await load(); select(testId);
    } finally { busy.delete(`schedule:${testId}`); }
  }
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
  document.addEventListener('click', event => {
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
    const scheduleButton = event.target.closest('.pr-test-schedule');
    if (scheduleButton) return scheduleTest(scheduleButton.dataset.testId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    const activateButton = event.target.closest('.pr-test-activate');
    if (activateButton) return activateTest(activateButton.dataset.testId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    const assignButton = event.target.closest('.pr-test-assign');
    if (assignButton) return assignTest(assignButton.dataset.testId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
    if (event.target.closest('.pr-test-create')) return createDraft().catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; });
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSummaryModal(); const card = event.target.closest('.pr-summary-card'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openSummaryModal(card.dataset.summaryTestId); } });
  window.prCloseTestSummaryModal = closeSummaryModal;
  window.prLoadTestLibrary = load;
  window.prSetTestSection = setSection;
  window.prSelectTest = select;
  window.prRenderTestLibrary = render;
  window.prSaveSelectedTest = () => selectedTestId ? saveDraft(selectedTestId).catch(error => { const status = get('prTestLibraryStatus'); if (status) status.textContent = error.message; }) : Promise.reject(Error('Selecciona una prueba borrador'));
  window.prLoadGroups = loadGroups;
  document.addEventListener('click', event => {
    const groupButton = event.target.closest('.pr-group-select'); if (groupButton) { selectedGroupId = groupButton.closest('[data-group-id]').dataset.groupId; renderGroups(); }
    const action = event.target.id; if (action === 'prGroupCreate') createGroup().catch(error => groupStatus(error.message)); if (action === 'prGroupAddMember') mutateMember(true).catch(error => groupStatus(error.message)); if (action === 'prGroupRemoveMember') mutateMember(false).catch(error => groupStatus(error.message)); if (action === 'prGroupAssign') assignGroup().catch(error => groupStatus(error.message));
  });
  window.addEventListener('load', () => { if (typeof window.prLoadTestLibrary === 'function') window.prLoadTestLibrary(); });
  setSection('summary');
})();
