/** Format a base-unit integer string (6 decimals) as a human amount, e.g. "1,234.500001". Keeps full precision using string math. */
export function formatAmount(raw, decimals = 6) {
  if (raw === null || raw === undefined || raw === '') return '—';
  let s = String(raw).replace(/[^0-9]/g, '');
  if (!s) return '0';
  s = s.padStart(decimals + 1, '0');
  const int = s.slice(0, -decimals) || '0';
  const frac = s.slice(-decimals).replace(/0+$/, '');
  const intFmt = Number(int).toLocaleString('en-US');
  return frac ? `${intFmt}.${frac}` : intFmt;
}

/** Human amount (e.g. "12.5") → base-unit integer string for a token with `decimals`. */
export function toBaseUnits(human, decimals = 6) {
  const [whole = '0', frac = ''] = String(human).trim().split('.');
  const f = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const out = (whole.replace(/[^0-9]/g, '') || '0') + f;
  return out.replace(/^0+(?=\d)/, '');
}

export const shortAddr = (a) => (a && a.length > 20 ? `${a.slice(0, 12)}…${a.slice(-6)}` : a || '');

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
/** Bech32-ish terra address check: terra1 + 38 bech32 chars = 44 chars total. */
export function isValidTerraAddress(a) {
  if (!a || typeof a !== 'string') return false;
  const v = a.trim();
  if (v.length < 44) return false;
  if (!v.startsWith('terra1')) return false;
  const rest = v.slice(6);
  return [...rest].every((c) => BECH32_CHARSET.includes(c));
}

/** Runway in days for a reward pool: balance / (stakedCount * ratePerDay). Returns null when not computable. */
export function runwayDays(poolBalanceRaw, stakedCount, rateRawPerDay) {
  const bal = Number(poolBalanceRaw); const rate = Number(rateRawPerDay);
  if (!bal || !rate || !stakedCount) return null;
  const days = bal / (stakedCount * rate);
  return Number.isFinite(days) ? days : null;
}
