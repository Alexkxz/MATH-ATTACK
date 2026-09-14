'use strict';

const { randomUUID, createHash } = require('crypto');
const { assertUuid, validateTestRewards } = require('./testValidation');
const { ensurePlayerExperience } = require('../../game/playerLevels');

const clone = value => JSON.parse(JSON.stringify(value));
const timestamp = () => new Date().toISOString();
const REWARD_CALCULATION_VERSION = 'official-v1';
const SENSITIVE_KEYS = new Set(['password', 'currentPassword', 'pwd', 'token', 'secret', 'authorization', 'timestamp', 'createdAt', 'updatedAt']);

function canonicalize(value, key = '') {
  if (SENSITIVE_KEYS.has(key)) return undefined;
  if (Array.isArray(value)) return value.map(item => canonicalize(item)).filter(item => item !== undefined);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, name) => {
      const item = canonicalize(value[name], name);
      if (item !== undefined) out[name] = item;
      return out;
    }, {});
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return undefined;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function createOfficialRewardService({
  root,
  loadPlayers = () => [],
  savePlayers = () => {},
  loadRanking = () => [],
  persist = () => {},
  logAureosTx = () => {},
  calculateGameRewards,
  calculateDailyStreak,
  checkNewAchievements,
  achievementsDef = [],
  actor = 'admin',
  clock = () => new Date(),
} = {}) {
  if (!root) throw Error('root obligatorio');
  if (typeof calculateGameRewards !== 'function') throw Error('calculateGameRewards obligatorio');
  if (typeof calculateDailyStreak !== 'function') throw Error('calculateDailyStreak obligatorio');
  if (typeof checkNewAchievements !== 'function') throw Error('checkNewAchievements obligatorio');
  if (!Array.isArray(root.rewardSettlements)) root.rewardSettlements = [];
  if (!Array.isArray(root.events)) root.events = [];

  const definitionById = new Map(achievementsDef.map(item => [item.id, item]));
  const settlementKey = ({ testId, attemptId, officialAttemptId, rankingPublicationId }) =>
    [testId, attemptId, officialAttemptId, rankingPublicationId].join(':');

  function validateRequest(input = {}) {
    for (const [name, value] of Object.entries({
      testId: input.testId,
      attemptId: input.attemptId,
      officialAttemptId: input.officialAttemptId,
      rankingPublicationId: input.rankingPublicationId,
      eventId: input.eventId,
    })) assertUuid(value, name);
    if (input.actor !== actor) throw Error('actor no autorizado');
    if (typeof input.reason !== 'string' || !input.reason.trim()) throw Error('motivo obligatorio');
    if (input.operation !== undefined && input.operation !== 'official_reward_settlement') throw Error('operacion invalida');
    if (input.rewardConfig !== undefined && (!input.rewardConfig || typeof input.rewardConfig !== 'object' || Array.isArray(input.rewardConfig))) {
      throw Error('configuracion de recompensas invalida');
    }
  }

  function requestIdentity(input) {
    return {
      operation: input.operation || 'official_reward_settlement',
      testId: input.testId,
      attemptId: input.attemptId,
      officialAttemptId: input.officialAttemptId,
      rankingPublicationId: input.rankingPublicationId,
      accountPlayerId: input.accountPlayerId ?? null,
      reason: input.reason.trim(),
      rewardCalculationVersion: input.rewardCalculationVersion || REWARD_CALCULATION_VERSION,
      rewardConfig: input.rewardConfig || {},
    };
  }

  function findPublication(input) {
    const publication = root.rankingPublications.find(item =>
      item.testId === input.testId &&
      item.attemptId === input.attemptId &&
      item.officialAttemptId === input.officialAttemptId &&
      item.rankingPublicationId === input.rankingPublicationId
    );
    if (!publication) throw Error('publicacion oficial no encontrada');
    const official = root.officialAttempts.find(item =>
      item.testId === input.testId && item.attemptId === input.attemptId &&
      item.officialAttemptId === input.officialAttemptId
    );
    if (!official) throw Error('intento oficial no encontrado');
    const attempt = root.attempts.find(item => item.testId === input.testId && item.attemptId === input.attemptId);
    if (!attempt) throw Error('intento no encontrado');
    if (attempt.status !== 'finished' || attempt.deletedAt) throw Error('intento no liquidable');
    if (official.accountPlayerId !== publication.accountPlayerId) throw Error('publicacion inconsistente');
    if (official.accountPlayerId !== attempt.accountPlayerId) throw Error('intento inconsistente');
    if (input.accountPlayerId !== undefined && input.accountPlayerId !== official.accountPlayerId) {
      throw Error('intento pertenece a otro alumno');
    }
    const result = publication.record || official.resultSnapshot;
    if (!result || result.complete === false || !Number.isFinite(Number(result.score)) ||
      !Number.isFinite(Number(result.correct)) || !Number.isFinite(Number(result.wrong ?? result.incorrect))) {
      throw Error('resultado invalido');
    }
    return { publication, official, attempt, result: clone(result) };
  }

  function playerLedger(player) {
    if (!Array.isArray(player.officialRewardLedger)) player.officialRewardLedger = [];
    return player.officialRewardLedger;
  }

  function hasLedger(player, key) {
    return playerLedger(player).some(item => item.key === key);
  }

  function addLedger(player, key, amount = 0) {
    playerLedger(player).push({ key, amount, recordedAt: timestamp() });
  }

  function pureRewards(player, result, ranking, configuredRewards) {
    // Política oficial: reutiliza únicamente el cálculo matemático puro del juego;
    // no aplica historial de tablas, partidas jugadas ni efectos multijugador.
    const legacyRewards = configuredRewards === undefined;
    const rewardsConfig = legacyRewards ? {} : clone(configuredRewards);
    validateTestRewards(rewardsConfig);
    const game = calculateGameRewards(result, { hasPlayer: false });
    const streakRule = rewardsConfig.streak || {};
    const streak = legacyRewards || streakRule.enabled === true ? calculateDailyStreak(clone(player.dailyStreak)) : null;
    const achievementProbe = clone(player);
    const detectedAchievements = legacyRewards || Object.keys(rewardsConfig.achievements || {}).length ? checkNewAchievements(achievementProbe, { ...result }, ranking) : [];
    const enabledAchievements = new Set(Object.entries(rewardsConfig.achievements || {}).filter(([, rule]) => rule.enabled === true).map(([id]) => id));
    const percentage = (Number(result.correct) + Number(result.wrong ?? result.incorrect)) > 0 ? (Number(result.correct) / (Number(result.correct) + Number(result.wrong ?? result.incorrect))) * 100 : 0;
    const tier = Array.isArray(rewardsConfig.aureosTiers) ? rewardsConfig.aureosTiers.find(item => percentage >= item.minPercent && percentage <= item.maxPercent) : null;
    const tierAmount = tier ? Number(tier.earned || 0) - Number(tier.lost || 0) : null;
    return {
      aureos: tierAmount === null ? (rewardsConfig.aureos === undefined ? (legacyRewards ? Math.max(0, Number(game.earnedAureos) || 0) : 0) : rewardsConfig.aureos) : tierAmount,
      experience: rewardsConfig.experience === undefined ? (legacyRewards ? Math.max(0, Number(game.earnedExperience) || 0) : 0) : rewardsConfig.experience,
      streak: streak ? { ...clone(streak), bonus: legacyRewards ? (Number(streak.bonus) || 0) : (streakRule.bonus === undefined ? 0 : streakRule.bonus) } : null,
      achievements: (legacyRewards ? detectedAchievements : detectedAchievements.filter(id => enabledAchievements.has(id))).map(id => ({
        id,
        bonus: legacyRewards ? (Number(definitionById.get(id)?.bonus) || 0) : (Number(rewardsConfig.achievements[id].bonus ?? definitionById.get(id)?.bonus) || 0),
      })),
    };
  }

  function safeSettlement(item) {
    if (!item) return null;
    return clone({
      rewardSettlementId: item.rewardSettlementId,
      testId: item.testId,
      attemptId: item.attemptId,
      officialAttemptId: item.officialAttemptId,
      rankingPublicationId: item.rankingPublicationId,
      accountPlayerId: item.accountPlayerId,
      status: item.status,
      eventId: item.eventId,
      requestFingerprint: item.requestFingerprint,
      actor: item.actor,
      reason: item.reason,
      rewards: item.rewards,
      applied: item.applied,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
    });
  }

  function audit(settlement, action, eventId, metadata = {}) {
    root.events.push({
      eventId,
      testId: settlement.testId,
      attemptId: settlement.attemptId,
      actor,
      action,
      reason: settlement.reason,
      revision: 1,
      occurredAt: timestamp(),
      metadata: { ...metadata, rewardSettlementId: settlement.rewardSettlementId },
    });
  }

  function findExisting(input, key, requestFingerprint) {
    const existing = root.rewardSettlements.find(item => item.settlementKey === key);
    if (!existing) return null;
    if (existing.eventId === input.eventId) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw Error('eventId contradictorio');
      }
      return existing;
    }
    return existing;
  }

  function verifyEvent(input, key, requestFingerprint) {
    const event = root.events.find(item => item.eventId === input.eventId);
    if (!event) return;
    const existing = root.rewardSettlements.find(item => item.eventId === input.eventId);
    if (!existing || existing.settlementKey !== key || existing.requestFingerprint !== requestFingerprint ||
      event.testId !== input.testId || event.attemptId !== input.attemptId || event.action !== 'official_rewards_settled') {
      throw Error('eventId contradictorio');
    }
  }

  function applyType(settlement, type, player, players, apply) {
    if (settlement.applied[type] || hasLedger(player, `${settlement.rewardSettlementId}:${type}`)) {
      settlement.applied[type] = true;
      return;
    }
    const before = clone(player);
    apply();
    try {
      addLedger(player, `${settlement.rewardSettlementId}:${type}`, settlement.rewards[type]?.amount || 0);
      savePlayers(players);
    } catch (error) {
      Object.keys(player).forEach(key => delete player[key]);
      Object.assign(player, before);
      throw error;
    }
    settlement.applied[type] = true;
    persist();
  }

  function settle(input = {}) {
    validateRequest(input);
    const key = settlementKey(input);
    const requestFingerprint = fingerprint(requestIdentity(input));
    const knownEvent = root.events.find(item => item.eventId === input.eventId);
    const knownSettlement = root.rewardSettlements.find(item => item.eventId === input.eventId);
    if (knownEvent || knownSettlement) verifyEvent(input, key, requestFingerprint);
    const target = findPublication(input);
    const existing = findExisting(input, key, requestFingerprint);
    if (existing) {
      if (existing.eventId === input.eventId && existing.status === 'completed') {
        return { settlement: safeSettlement(existing), duplicate: true };
      }
      // Una liquidación pendiente es recuperable: nunca se crea otro settlement.
      // continueSettlement consulta el ledger persistente de cada efecto y solo
      // aplica los que aún no tienen marca durable.
      const result = continueSettlement(existing, target);
      return { settlement: result.settlement, duplicate: existing.eventId === input.eventId ? false : result.duplicate };
    }

    const players = loadPlayers();
    const player = players.find(item => item.id === target.official.accountPlayerId);
    if (!player) throw Error('alumno no encontrado');
    const frozenRewards = target.attempt.configurationSnapshot?.rewards;
    const rewards = pureRewards(player, target.result, loadRanking(), frozenRewards);
    const settlement = {
      rewardSettlementId: randomUUID(), settlementKey: key,
      testId: input.testId, attemptId: input.attemptId,
      officialAttemptId: input.officialAttemptId,
      rankingPublicationId: input.rankingPublicationId,
      accountPlayerId: target.official.accountPlayerId,
      status: 'pending', eventId: input.eventId, actor,
      reason: input.reason.trim(), rewards, applied: {}, createdAt: timestamp(),
      rewardCalculationVersion: input.rewardCalculationVersion || REWARD_CALCULATION_VERSION,
      rewardConfig: clone(frozenRewards || {}), requestFingerprint,
    };
    root.rewardSettlements.push(settlement);
    audit(settlement, 'official_rewards_settled', input.eventId, { phase: 'started' });
    persist();
    return continueSettlement(settlement, target);
  }

  function continueSettlement(settlement, target) {
    const players = loadPlayers();
    const player = players.find(item => item.id === settlement.accountPlayerId);
    if (!player) throw Error('alumno no encontrado');
    ensurePlayerExperience(player);
    const addAureos = amount => { player.aureos = Math.max(0, (Number(player.aureos) || 0) + (Number(amount) || 0)); };
    applyType(settlement, 'aureos', player, players, () => {
      addAureos(settlement.rewards.aureos);
      if (settlement.rewards.aureos) logAureosTx(player, settlement.rewards.aureos, 'prueba_oficial');
    });
    applyType(settlement, 'experience', player, players, () => {
      player.experiencia = (Number(player.experiencia) || 0) + settlement.rewards.experience;
    });
    if (settlement.rewards.streak) applyType(settlement, 'streak', player, players, () => {
      player.dailyStreak = clone(settlement.rewards.streak.dailyStreak);
      addAureos(settlement.rewards.streak.bonus || 0);
      if (settlement.rewards.streak.bonus) logAureosTx(player, settlement.rewards.streak.bonus, 'racha_oficial');
    });
    for (const achievement of settlement.rewards.achievements) {
      applyType(settlement, `achievement:${achievement.id}`, player, players, () => {
        if (!Array.isArray(player.achievements)) player.achievements = [];
        if (!player.achievements.includes(achievement.id)) player.achievements.push(achievement.id);
        addAureos(achievement.bonus);
        if (achievement.bonus) logAureosTx(player, achievement.bonus, `logro_oficial:${achievement.id}`);
      });
    }
    settlement.status = 'completed';
    settlement.completedAt = settlement.completedAt || timestamp();
    persist();
    return { settlement: safeSettlement(settlement), duplicate: false };
  }

  function getSettlement(input = {}) {
    for (const name of ['testId', 'attemptId', 'officialAttemptId', 'rankingPublicationId']) assertUuid(input[name], name);
    const item = root.rewardSettlements.find(value => settlementKey(value) === settlementKey(input));
    return safeSettlement(item);
  }

  return { calculateRewards: (player, result, ranking, configuredRewards) => pureRewards(player, result, ranking, configuredRewards), settle, getSettlement };
}

module.exports = { createOfficialRewardService };
