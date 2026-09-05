const fs = require('fs');
const path = require('path');

const MAX_AUREOS_LOG = 10000;

function createJsonStore({ baseDir, logger = console }) {
  const files = {
    ranking: path.join(baseDir, 'ranking.json'),
    players: path.join(baseDir, 'players.json'),
    config: path.join(baseDir, 'config.json'),
    aureosLog: path.join(baseDir, 'aureosLog.json'),
  };

  function reportError(...args) {
    if (logger && typeof logger.err === 'function') logger.err(...args);
    else if (logger && typeof logger.error === 'function') logger.error(...args);
  }

  function makeQueuedWriter(file) {
    let writing = false;
    let nextData = null;
    let tmpSeq = 0;

    function makeTmpFile() {
      tmpSeq = (tmpSeq + 1) % 1000000;
      return `${file}.${process.pid}.${Date.now()}.${tmpSeq}.tmp`;
    }

    function cleanupTmp(tmp) {
      fs.unlink(tmp, () => {});
    }

    function commitTmp(tmp, cb) {
      fs.rename(tmp, file, err => {
        if (!err) {
          cb(null, false);
          return;
        }
        // OneDrive/antivirus en Windows a veces bloquean el rename temporalmente.
        fs.copyFile(tmp, file, copyErr => {
          if (copyErr) {
            cb(err, false);
            return;
          }
          cleanupTmp(tmp);
          cb(null, true);
        });
      });
    }

    function flush() {
      const data = nextData;
      nextData = null;
      writing = true;
      const tmp = makeTmpFile();
      fs.writeFile(tmp, JSON.stringify(data), err => {
        if (err) {
          reportError('Escritura fallo (' + path.basename(file) + '):', err.message);
          cleanupTmp(tmp);
          writing = false;
          if (nextData !== null) flush();
          return;
        }
        commitTmp(tmp, (err2, usedFallback) => {
          if (err2) reportError('Rename fallo (' + path.basename(file) + '):', err2.message);
          if (err2) cleanupTmp(tmp);
          else if (usedFallback && logger && typeof logger.game === 'function') {
            logger.game('Persistencia recuperada con copia de respaldo (' + path.basename(file) + ')');
          }
          writing = false;
          if (nextData !== null) flush();
        });
      });
    }

    function queueWrite(data) {
      nextData = data;
      if (!writing) flush();
    }

    // Ultimo recurso al apagar el servidor: escribe de forma sincrona lo que quedo en cola.
    queueWrite.flushSync = function flushSync() {
      if (nextData === null) return;
      const data = nextData;
      nextData = null;
      try {
        const tmp = makeTmpFile();
        fs.writeFileSync(tmp, JSON.stringify(data));
        try {
          fs.renameSync(tmp, file);
        } catch (renameErr) {
          fs.copyFileSync(tmp, file);
          cleanupTmp(tmp);
          if (logger && typeof logger.game === 'function') {
            logger.game('flushSync recuperado con copia de respaldo (' + path.basename(file) + ')');
          }
        }
      } catch (e) {
        reportError('flushSync fallo (' + path.basename(file) + '):', e.message);
      }
    };

    return queueWrite;
  }

  let rankingCache = null;
  let playersCache = null;
  let aureosLogCache = null;

  const writeRanking = makeQueuedWriter(files.ranking);
  const writePlayers = makeQueuedWriter(files.players);
  const writeAureosLog = makeQueuedWriter(files.aureosLog);

  function loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(files.config, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  function saveConfig(data) {
    try {
      fs.writeFileSync(files.config, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      reportError('Error guardando config:', e);
    }
  }

  function loadRanking() {
    if (rankingCache) return rankingCache;
    try {
      const data = JSON.parse(fs.readFileSync(files.ranking, 'utf8'));
      rankingCache = Array.isArray(data) ? data : [];
    } catch (e) {
      rankingCache = [];
    }
    return rankingCache;
  }

  function saveRanking(data) {
    rankingCache = data;
    writeRanking(data);
  }

  function loadPlayers() {
    if (playersCache) return playersCache;
    try {
      const data = JSON.parse(fs.readFileSync(files.players, 'utf8'));
      playersCache = Array.isArray(data) ? data : [];
    } catch (e) {
      playersCache = [];
    }
    // Limpiar campo aureosLog legado (migrado a aureosLog.json).
    playersCache.forEach(player => { delete player.aureosLog; });
    return playersCache;
  }

  function savePlayers(data) {
    playersCache = data;
    writePlayers(data);
  }

  function loadAureosLog() {
    if (aureosLogCache) return aureosLogCache;
    try {
      const data = JSON.parse(fs.readFileSync(files.aureosLog, 'utf8'));
      aureosLogCache = Array.isArray(data) ? data : [];
    } catch (e) {
      aureosLogCache = [];
    }
    return aureosLogCache;
  }

  function saveAureosLog(data) {
    aureosLogCache = data;
    writeAureosLog(data);
  }

  function logAureosTx(player, delta, reason) {
    if (!delta) return;
    let log = loadAureosLog();
    log.push({
      ts: Date.now(),
      delta,
      reason,
      balance: player.aureos || 0,
      playerId: player.id || '',
      name: player.name || '',
      grade: player.grade || '',
    });
    if (log.length > MAX_AUREOS_LOG) log = log.slice(-MAX_AUREOS_LOG);
    saveAureosLog(log);
  }

  function flushSync() {
    writeRanking.flushSync();
    writePlayers.flushSync();
    writeAureosLog.flushSync();
  }

  return {
    files,
    loadConfig,
    saveConfig,
    loadRanking,
    saveRanking,
    loadPlayers,
    savePlayers,
    loadAureosLog,
    saveAureosLog,
    logAureosTx,
    flushSync,
  };
}

module.exports = { createJsonStore };
