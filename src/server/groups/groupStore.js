'use strict';

const fs = require('fs');
const path = require('path');
const { createRoot, validateGroup, SCHEMA_VERSION } = require('./groupModel');

function validateRoot(root) {
  if (!root || root.schemaVersion !== SCHEMA_VERSION || !Array.isArray(root.groups) || !Array.isArray(root.events)) throw Error('almacen de grupos invalido');
  root.groups.forEach(validateGroup);
  return true;
}

function createGroupStore({ baseDir, fileName = 'groups.json', logger = console } = {}) {
  if (!baseDir) throw Error('baseDir obligatorio');
  fs.mkdirSync(baseDir, { recursive: true });
  const file = path.join(baseDir, fileName);
  const tempFile = () => `${file}.${process.pid}.${Date.now()}.tmp`;
  const report = error => logger?.error?.('groupStore:', error.message || error);

  function recover() {
    if (fs.existsSync(file)) return;
    const candidates = fs.readdirSync(baseDir).filter(name => name.startsWith(path.basename(file) + '.') && name.endsWith('.tmp')).sort();
    if (candidates.length) fs.renameSync(path.join(baseDir, candidates[candidates.length - 1]), file);
  }

  function load() {
    recover();
    if (!fs.existsSync(file)) return createRoot();
    try {
      const root = JSON.parse(fs.readFileSync(file, 'utf8'));
      validateRoot(root);
      return root;
    } catch (error) {
      report(error);
      throw Error('almacen de grupos invalido');
    }
  }

  function save(root) {
    validateRoot(root);
    const tmp = tempFile();
    fs.writeFileSync(tmp, JSON.stringify(root, null, 2), 'utf8');
    try { fs.renameSync(tmp, file); } catch (error) {
      try { fs.copyFileSync(tmp, file); fs.unlinkSync(tmp); } catch (copyError) { report(copyError); throw error; }
    }
  }

  return { file, load, save, validateRoot };
}

module.exports = { createGroupStore, validateRoot };
