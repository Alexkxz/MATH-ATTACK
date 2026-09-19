function examGradeMatches(expected, actual) {
  if (!String(expected || '').trim()) return true;
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const left = normalize(expected);
  const right = normalize(actual);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftGrade = left.match(/^[1-6](?=\D|$)/)?.[0];
  const rightGrade = right.match(/^[1-6](?=\D|$)/)?.[0];
  return Boolean(leftGrade && rightGrade && leftGrade === rightGrade);
}

module.exports = { examGradeMatches };
