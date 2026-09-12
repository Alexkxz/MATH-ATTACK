'use strict';

(() => {
  let tests = [];
  let selectedTestId = sessionStorage.getItem('maestroSelectedTestId') || '';
  const busy = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const statusLabels = { draft: 'Borrador', scheduled: 'Programada', active: 'Activa', paused: 'Pausada', closed: 'Cerrada', finished: 'Finalizada', cancelled: 'Cancelada', unknown: 'Estado desconocido' };
  const dateText = value => value ? new Date(value).toLocaleDateString('es-MX') : '—';
  const get = id => document.getElementById(id);

  function statusLabel(status) { return statusLabels[status] || statusLabels.unknown; }
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
    const rows = visible();
    target.innerHTML = rows.length ? rows.map(test => `<article class="pr-test-card${test.testId === selectedTestId ? ' selected' : ''}" data-test-library-card="${esc(test.testId)}"><div class="pr-test-card-main"><strong>${esc(test.title || 'Prueba sin título')}</strong><code>${esc(test.testId)}</code><span>${esc(statusLabel(test.status))} · creada ${esc(dateText(test.createdAt))} · ${test.attemptCount} intento(s)</span><span>${test.groups.length ? `Grupo(s): ${esc(test.groups.join(', '))}` : 'Sin grupo asignado'} · ${test.assignmentCount} asignación(es)</span></div><div class="pr-test-card-meta"><span>${test.hasOfficialResults ? 'Oficial ✓' : 'Sin oficializar'}</span><span>${test.hasRankingPublications ? 'Ranking ✓' : 'Sin publicación'}</span><span>${test.startsAt ? `Programada: ${esc(dateText(test.startsAt))}` : ''}</span></div><div class="pr-test-card-actions"><button type="button" class="pr-test-select" data-test-id="${esc(test.testId)}">Seleccionar prueba</button><button type="button" class="pr-test-copy" data-test-id="${esc(test.testId)}">Copiar testId</button>${test.status === 'draft' ? `<button type="button" class="pr-test-edit" data-test-id="${esc(test.testId)}">Editar borrador</button><button type="button" class="pr-test-schedule" data-test-id="${esc(test.testId)}">Programar</button>` : ''}${test.status === 'scheduled' && (!test.startsAt || Date.parse(test.startsAt) <= Date.now()) ? `<button type="button" class="pr-test-activate" data-test-id="${esc(test.testId)}">Activar</button>` : ''}${!['cancelled','finished'].includes(test.status) ? `<button type="button" class="pr-test-assign" data-test-id="${esc(test.testId)}">Asignar</button>` : ''}</div></article>`).join('') : '<p class="pr-attempts-empty">No hay pruebas que coincidan con los filtros.</p>';
    renderSelected(tests.find(test => test.testId === selectedTestId));
  }
  async function load() {
    const status = get('prTestLibraryStatus');
    if (status) status.textContent = 'Cargando biblioteca…';
    try {
      const response = await fetch(adminUrl('/api/maestro/tests?limit=100&sort=createdAt&order=desc'));
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudo cargar la biblioteca');
      tests = Array.isArray(data.tests) ? data.tests : [];
      render();
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
    const input = get('prAttemptTestId');
    if (input) input.value = testId;
    render();
    if (typeof window.prLoadAttempts === 'function') window.prLoadAttempts();
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
    const response = await fetch(`/api/exams/${encodeURIComponent(testId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _adminPass }, body: JSON.stringify({ title: title.trim(), revision: test.revision }) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo editar la prueba'); await load(); select(testId);
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
  window.prLoadTestLibrary = load;
  window.prSetTestSection = setSection;
  window.prSelectTest = select;
  window.prRenderTestLibrary = render;
  window.addEventListener('load', () => { if (typeof window.prLoadTestLibrary === 'function') window.prLoadTestLibrary(); });
  setSection('summary');
})();
