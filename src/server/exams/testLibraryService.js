'use strict';

const { TEST_STATES } = require('./testStateMachine');

const SORTS = new Set(['createdAt', 'scheduledAt', 'title', 'status']);
const DIRECTIONS = new Set(['asc', 'desc']);
const clone = value => JSON.parse(JSON.stringify(value));

function validDate(value, name) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw Error(`${name} invalida`);
  return Date.parse(value);
}

function createTestLibraryService({ loadRoot } = {}) {
  if (typeof loadRoot !== 'function') throw Error('loadRoot obligatorio');

  function list(filters = {}) {
    const status = filters.status || '';
    const groupId = filters.groupId || '';
    const from = validDate(filters.from, 'from');
    const to = validDate(filters.to, 'to');
    if (status && !TEST_STATES.includes(status)) throw Error('status invalido');
    if (groupId && (typeof groupId !== 'string' || groupId.length > 100)) throw Error('groupId invalido');
    if (from !== null && to !== null && from > to) throw Error('rango de fechas invalido');
    const sort = filters.sort || 'createdAt';
    const direction = filters.direction || 'desc';
    if (!SORTS.has(sort) || !DIRECTIONS.has(direction)) throw Error('orden invalido');
    const rawLimit = filters.limit === undefined || filters.limit === '' ? 50 : Number(filters.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) throw Error('limite invalido');

    const root = loadRoot() || {};
    const assignments = Array.isArray(root.assignments) ? root.assignments : [];
    const attempts = Array.isArray(root.attempts) ? root.attempts : [];
    const officialAttempts = Array.isArray(root.officialAttempts) ? root.officialAttempts : [];
    const publications = Array.isArray(root.rankingPublications) ? root.rankingPublications : [];
    const rows = (Array.isArray(root.tests) ? root.tests : []).filter(test => {
      if (status && test.status !== status) return false;
      const assignedGroups = assignments.filter(item => item.testId === test.testId && item.targetType === 'group').map(item => item.groupId).filter(Boolean);
      if (groupId && !assignedGroups.includes(groupId)) return false;
      const createdAt = Date.parse(test.createdAt);
      if (from !== null && (!Number.isFinite(createdAt) || createdAt < from)) return false;
      if (to !== null && (!Number.isFinite(createdAt) || createdAt > to)) return false;
      return true;
    }).map(test => {
      const testAssignments = assignments.filter(item => item.testId === test.testId);
      const testAttempts = attempts.filter(item => item.testId === test.testId);
      const testOfficials = officialAttempts.filter(item => item.testId === test.testId);
      const testPublications = publications.filter(item => item.testId === test.testId);
      const groups = [...new Set(testAssignments.filter(item => item.targetType === 'group' && item.groupId).map(item => item.groupId))].sort();
      return {
        testId: test.testId,
        title: test.title,
        status: TEST_STATES.includes(test.status) ? test.status : 'unknown',
        createdAt: test.createdAt,
        scheduledAt: test.scheduledAt || null,
        startsAt: test.startsAt || null,
        closesAt: test.closesAt || null,
        groups,
        assignmentCount: testAssignments.length,
        attemptCount: testAttempts.length,
        officialResultCount: testOfficials.length,
        rankingPublicationCount: testPublications.length,
        hasOfficialResults: testOfficials.length > 0,
        hasRankingPublications: testPublications.length > 0,
      };
    });
    rows.sort((a, b) => {
      const left = String(a[sort] || '').toLowerCase();
      const right = String(b[sort] || '').toLowerCase();
      const compared = left.localeCompare(right, 'es', { numeric: true });
      if (compared !== 0) return direction === 'asc' ? compared : -compared;
      return a.testId.localeCompare(b.testId);
    });
    return clone(rows.slice(0, rawLimit));
  }

  return { list };
}

module.exports = { createTestLibraryService, SORTS };
