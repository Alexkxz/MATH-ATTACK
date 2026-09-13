'use strict';

const { randomUUID } = require('crypto');
const { assertUuid, assertRevision } = require('../exams/testValidation');

const SCHEMA_VERSION = 1;
const GROUP_STATES = Object.freeze(['active', 'archived']);
const now = () => new Date().toISOString();

function createRoot() {
  return { schemaVersion: SCHEMA_VERSION, groups: [], events: [] };
}

function createGroup(input = {}) {
  const timestamp = now();
  const group = {
    groupId: input.groupId || randomUUID(),
    name: input.name || '',
    grade: input.grade || '',
    schoolYear: input.schoolYear || '',
    status: input.status || 'active',
    memberAccountPlayerIds: Array.isArray(input.memberAccountPlayerIds) ? [...new Set(input.memberAccountPlayerIds)] : [],
    createdAt: input.createdAt || timestamp,
    updatedAt: input.updatedAt || timestamp,
    revision: input.revision || 1,
    history: Array.isArray(input.history) ? input.history : [],
  };
  validateGroup(group);
  return group;
}

function validateGroup(group) {
  assertUuid(group.groupId, 'groupId');
  if (typeof group.name !== 'string' || !group.name.trim()) throw Error('nombre de grupo obligatorio');
  if (typeof group.grade !== 'string' || typeof group.schoolYear !== 'string') throw Error('datos de grupo invalidos');
  if (!GROUP_STATES.includes(group.status)) throw Error('estado de grupo invalido');
  if (!Array.isArray(group.memberAccountPlayerIds)) throw Error('miembros de grupo invalidos');
  group.memberAccountPlayerIds.forEach(id => assertUuid(id, 'accountPlayerId'));
  if (!Array.isArray(group.history)) throw Error('historial de grupo invalido');
  assertRevision(group.revision);
  return true;
}

module.exports = { SCHEMA_VERSION, GROUP_STATES, createRoot, createGroup, validateGroup, now };
