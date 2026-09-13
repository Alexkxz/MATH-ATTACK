'use strict';

const { randomUUID, createHash } = require('crypto');
const { assertUuid, assertRevision } = require('../exams/testValidation');
const { createGroup, now } = require('./groupModel');

const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => JSON.stringify(value && typeof value === 'object' ? Object.keys(value).sort().reduce((out, key) => { out[key] = value[key]; return out; }, {}) : value);
const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');

function createGroupService({ store, resolveAccountPlayer, actor = 'admin' } = {}) {
  if (!store) throw Error('store obligatorio');
  const getRoot = () => store.load();
  const persist = root => store.save(root);
  const eventIdentity = ({ eventId, operation, groupId, accountPlayerId, revision, payload }) => ({ eventId, operation, groupId: groupId || null, accountPlayerId: accountPlayerId || null, revision: revision || null, payload: payload || {} });

  function requireActor(input) { if (input.actor !== actor) throw Error('actor no autorizado'); }
  function requireEvent(input) { if (typeof input.eventId !== 'string' || !input.eventId.trim()) throw Error('eventId obligatorio'); }
  function verifyEvent(root, input, operation, groupId, accountPlayerId, payload = {}) {
    requireEvent(input);
    const identity = eventIdentity({ eventId: input.eventId, operation, groupId, accountPlayerId, revision: input.revision, payload });
    const event = root.events.find(item => item.eventId === input.eventId);
    if (!event) return null;
    if (event.fingerprint !== fingerprint(identity)) throw Error('eventId contradictorio');
    return event;
  }
  function audit(root, input, operation, groupId, accountPlayerId, payload = {}) {
    const identity = eventIdentity({ eventId: input.eventId, operation, groupId, accountPlayerId, revision: input.revision, payload });
    root.events.push({ ...identity, actor, occurredAt: now(), fingerprint: fingerprint(identity) });
  }
  function get(root, groupId) { assertUuid(groupId, 'groupId'); const group = root.groups.find(item => item.groupId === groupId); if (!group) throw Error('grupo no encontrado'); return group; }
  function list() { return getRoot().groups.filter(group => group.status === 'active').map(clone); }
  function getOne(groupId) { return clone(get(getRoot(), groupId)); }
  function create(input = {}) {
    requireActor(input); const root = getRoot(); const payload = { name: String(input.name || '').trim(), grade: String(input.grade || ''), schoolYear: String(input.schoolYear || '') };
    const prior = verifyEvent(root, input, 'group_created', null, null, payload); if (prior) return { group: clone(root.groups.find(group => group.groupId === prior.groupId)), duplicate: true };
    if (root.groups.some(group => group.status === 'active' && group.name.toLocaleLowerCase() === payload.name.toLocaleLowerCase() && group.grade === payload.grade && group.schoolYear === payload.schoolYear)) throw Error('grupo duplicado');
    const group = createGroup(payload); root.groups.push(group); audit(root, input, 'group_created', null, null, payload);
    root.events[root.events.length - 1].groupId = group.groupId;
    persist(root); return { group: clone(group), duplicate: false };
  }
  function update(input = {}) {
    requireActor(input); assertUuid(input.groupId, 'groupId'); assertRevision(input.revision); const root = getRoot(); const group = get(root, input.groupId);
    const payload = { name: input.name === undefined ? group.name : String(input.name).trim(), grade: input.grade === undefined ? group.grade : String(input.grade), schoolYear: input.schoolYear === undefined ? group.schoolYear : String(input.schoolYear) };
    const prior = verifyEvent(root, input, 'group_updated', group.groupId, null, payload); if (prior) return { group: clone(group), duplicate: true };
    if (input.revision <= group.revision) throw Error('revision antigua');
    if (root.groups.some(item => item.groupId !== group.groupId && item.status === 'active' && item.name.toLocaleLowerCase() === payload.name.toLocaleLowerCase() && item.grade === payload.grade && item.schoolYear === payload.schoolYear)) throw Error('grupo duplicado');
    Object.assign(group, payload, { revision: input.revision, updatedAt: now() }); group.history.push({ action: 'updated', revision: group.revision, occurredAt: group.updatedAt, actor }); audit(root, input, 'group_updated', group.groupId, null, payload); persist(root); return { group: clone(group), duplicate: false };
  }
  function addMember(input = {}) { return memberMutation(input, true); }
  function removeMember(input = {}) { return memberMutation(input, false); }
  function memberMutation(input, adding) {
    requireActor(input); assertUuid(input.groupId, 'groupId'); assertUuid(input.accountPlayerId, 'accountPlayerId'); assertRevision(input.revision); const root = getRoot(); const group = get(root, input.groupId);
    const payload = { adding }; const prior = verifyEvent(root, input, adding ? 'group_member_added' : 'group_member_removed', group.groupId, input.accountPlayerId, payload); if (prior) return { group: clone(group), duplicate: true };
    if (input.revision <= group.revision) throw Error('revision antigua');
    if (typeof resolveAccountPlayer === 'function' && !resolveAccountPlayer(input.accountPlayerId)) throw Error('alumno no encontrado');
    const has = group.memberAccountPlayerIds.includes(input.accountPlayerId);
    if (adding && has) throw Error('alumno ya pertenece al grupo');
    if (!adding && !has) throw Error('alumno no pertenece al grupo');
    group.memberAccountPlayerIds = adding ? [...group.memberAccountPlayerIds, input.accountPlayerId] : group.memberAccountPlayerIds.filter(id => id !== input.accountPlayerId);
    group.revision = input.revision; group.updatedAt = now(); group.history.push({ action: adding ? 'member_added' : 'member_removed', accountPlayerId: input.accountPlayerId, revision: group.revision, occurredAt: group.updatedAt, actor }); audit(root, input, adding ? 'group_member_added' : 'group_member_removed', group.groupId, input.accountPlayerId, payload); persist(root); return { group: clone(group), duplicate: false };
  }
  function members(groupId) { const root = getRoot(); return clone(get(root, groupId).memberAccountPlayerIds); }
  function history(groupId) { return clone(get(getRoot(), groupId).history); }
  return { list, get: getOne, create, update, addMember, removeMember, members, history };
}

module.exports = { createGroupService };
