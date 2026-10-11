// TestParameter.padDigits: a lab can ask for leading zeros, so "3" shows as "03" (2) or "003" (3).
// Only the whole-number part of a plain number is padded; text, blanks and longer numbers pass through.
// Shared by the entry screens and lib/report-data.js (the report).
function padValue(value, digits) {
  const s = value == null ? '' : String(value);
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s.trim());
  return digits > 1 && m ? m[1] + m[2].padStart(digits, '0') + (m[3] || '') : s;
}

module.exports = { padValue };
