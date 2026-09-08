'use strict';

function createSaveResultMessages({
  wsContext,
  WebSocket,
  multiplayerRewards,
  buildCompletedResultRecord,
  upsertCompletedResult,
  calculateGameRewards,
  ensurePlayerExperience,
  logAureosTx,
  calculateDailyStreak,
  checkNewAchievements,
  ACHIEVEMENTS_DEF,
  send,
  L,
  resultIdempotency,
}) {
  const { gameSessions, maestroClients, examFinished } = wsContext;
  const { getAccountPlayerId, resolveAccountPlayer, getSessionId } = wsContext.identity;
  const { loadRanking, saveRanking, loadPlayers, savePlayers } = wsContext.persistence;
  const { _mpEarnedByGame } = multiplayerRewards;

  function handleSaveResult(ws, message) {
    if (message.id && resultIdempotency.hasProcessedResult(message.id)) return false;
    const ranking = loadRanking();
    const players = loadPlayers();
    const accountPlayerId = getAccountPlayerId(message);
    const player = resolveAccountPlayer(players, { accountPlayerId, name: message.name || '' });
    const resolvedGrade = message.grade || player?.grade || ws.grade || '';
    const resolvedDurationMs = Number(message.durationMs) || (
      message.isExam && message.examStartedAt ? Math.max(0, Date.now() - Number(message.examStartedAt)) : 0
    );
    const finalRecord = buildCompletedResultRecord(message, {
      canonicalName: player ? player.name : (message.name || '?'),
      grade: resolvedGrade,
    });
    saveRanking(upsertCompletedResult(ranking, finalRecord, message.id));
    const gameRewards = calculateGameRewards(message, {
      hasPlayer: !!player,
      tableHistory: player?.tableHistory,
    });
    const { earnedAureos, earnedExperience, varietyMult } = gameRewards;
    if (player && gameRewards.tableHistoryChanged) player.tableHistory = gameRewards.tableHistory;
    if (player) {
      const baseExperience = ensurePlayerExperience(player);
      player.aureos = (player.aureos || 0) + earnedAureos;
      player.experiencia = baseExperience + earnedExperience;
      if (earnedAureos > 0) logAureosTx(player, earnedAureos, 'partida');
      if (message.gameMode === 'online' && message.mpGameMode && message.mpGameMode !== 'apuestas' && message.gameId) {
        _mpEarnedByGame.set(`${ws.roomId || '?'}_${message.gameId}_${player.name.toLowerCase()}`, earnedAureos);
      }
      player.gamesPlayed = (player.gamesPlayed || 0) + 1;
      const dailyStreak = calculateDailyStreak(player.dailyStreak);
      player.dailyStreak = dailyStreak.dailyStreak;
      const streakBonus = dailyStreak.bonus;
      if (streakBonus > 0) {
        player.aureos += streakBonus;
        player.experiencia += streakBonus;
        logAureosTx(player, streakBonus, 'racha_diaria');
      }
      const newAchievements = checkNewAchievements(player, { ...message, tblResults: message.tblResults || {} }, loadRanking());
      let bonusTotal = earnedAureos + streakBonus;
      if (newAchievements.length) {
        newAchievements.forEach(achievementId => {
          const definition = ACHIEVEMENTS_DEF.find(achievement => achievement.id === achievementId);
          if (definition) {
            player.aureos += definition.bonus;
            player.experiencia += definition.bonus;
            bonusTotal += definition.bonus;
            logAureosTx(player, definition.bonus, `logro:${achievementId}`);
          }
        });
      }
      savePlayers(players);
      if (earnedAureos > 0 || streakBonus > 0 || newAchievements.length) {
        send(ws, {
          type: 'aureos_earned', amount: earnedAureos, total: player.aureos,
          experiencia: player.experiencia, experience: player.experiencia, streakBonus,
          streak: player.dailyStreak.current, newAchievements, varietyMult,
          magnetBonus: !!message.aureosBonus,
        });
      }
      if (newAchievements.length) {
        send(ws, {
          type: 'achievements_unlocked', achievements: newAchievements,
          defs: newAchievements.map(id => ACHIEVEMENTS_DEF.find(achievement => achievement.id === id)).filter(Boolean),
        });
      }
      maestroClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'students_updated' }));
      });
    } else if (earnedAureos > 0) {
      send(ws, {
        type: 'aureos_earned', amount: earnedAureos, total: earnedAureos,
        streakBonus: 0, newAchievements: [], magnetBonus: !!message.aureosBonus,
      });
    }
    const modeLabel = {
      solo: '\u{1F9D1} Individual',
      duel: '\u2694\uFE0F Duelo',
      online: '\u{1F310} LAN',
    }[message.gameMode || 'solo'] || message.gameMode;
    const typeLabel = { timed: 'cronometro', lives: 'vidas', countdown: 'contrarreloj', free: 'libre' }[message.gameType || 'timed'] || message.gameType;
    const diffLabel = message.difficulty ? `[${message.difficulty}]` : '';
    const tables = (message.tables || []).length ? `tablas:${(message.tables || []).join(',')}` : '';
    const stats = `\u2705${message.correct || 0} \u274C${message.wrong || 0} \u23F1${message.timeout || 0}`;
    const gradeStr = resolvedGrade ? ` \u00B7 ${resolvedGrade}` : '';
    if ((message.gameMode || 'solo') === 'solo') {
      L.rank(`${message.name}${gradeStr} - ${message.score}pts (${message.pct}%) | ${modeLabel} ${typeLabel} ${diffLabel} ${tables} | ${stats}`);
    } else {
      L.rank(`${message.name}${gradeStr} - ${message.score}pts (${message.pct}%) | ${modeLabel}${message.mpGameMode ? ` - ${message.mpGameMode}` : ''} | ${stats}`);
    }
    const examMode = wsContext.getExamMode();
    if (message.isExam && (!examMode || examMode.startedAt === message.examStartedAt)) {
      const examName = message.name || ws.playerName || '?';
      examFinished.set(examName, {
        name: examName, grade: resolvedGrade, score: message.score || 0, pct: message.pct || 0,
        correct: message.correct || 0, total: message.total || 0, durationMs: resolvedDurationMs,
        finished: message.finished !== false, finishedAt: Date.now(),
      });
    }
    gameSessions.removeSession(getSessionId(ws));
    if (message.id) resultIdempotency.markResultProcessed(message.id);
    return true;
  }

  return Object.freeze({ handleSaveResult });
}

module.exports = { createSaveResultMessages };
