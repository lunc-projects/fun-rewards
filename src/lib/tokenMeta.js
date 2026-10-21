// Resolve CW20 metadata (symbol / name / decimals) for ANY token
// address, on-chain via token_info, with a module-level cache.
// FUN is pre-known so the home token never needs a lookup.
import { KNOWN_TOKENS } from '../config.js';
import { cw20TokenInfo } from './lcd.js';
import { shortAddr } from './format.js';

const cache = new Map();
for (const t of KNOWN_TOKENS) cache.set(t.address, { ...t });
const pending = new Map();

export function cachedTokenMeta(address) {
  return cache.get(address) || null;
}

/** Returns { address, symbol, name, decimals }. Never throws — on
 *  lookup failure it falls back to a short-address label, 6 decimals. */
export async function resolveTokenMeta(address) {
  if (!address) return null;
  if (cache.has(address)) return cache.get(address);
  if (pending.has(address)) return pending.get(address);
  const p = (async () => {
    try {
      const ti = await cw20TokenInfo(address);
      const meta = {
        address,
        symbol: ti?.symbol || shortAddr(address),
        name: ti?.name || ti?.symbol || shortAddr(address),
        decimals: Number.isInteger(ti?.decimals) ? ti.decimals : 6,
        totalSupply: ti?.total_supply ?? null,
      };
      cache.set(address, meta);
      return meta;
    } catch {
      const meta = { address, symbol: shortAddr(address), name: shortAddr(address), decimals: 6, totalSupply: null, unresolved: true };
      cache.set(address, meta);
      return meta;
    } finally {
      pending.delete(address);
    }
  })();
  pending.set(address, p);
  return p;
}

/** Normalise a contract pending list — [{reward_token, amount}] —
 *  tolerating alternate key shapes just in case. */
export function normalizePending(pending) {
  if (!pending) return [];
  const list = Array.isArray(pending) ? pending : pending.pending || pending.rewards || [];
  return list
    .map((r) => ({
      reward_token: r.reward_token || r.token || r.address,
      amount: r.amount ?? r.value ?? '0',
    }))
    .filter((r) => r.reward_token);
}

/** Sum a list of pending lists into { reward_token -> raw amount (string) }. */
export function sumPending(lists) {
  const totals = {};
  for (const list of lists) {
    for (const p of normalizePending(list)) {
      try { totals[p.reward_token] = (BigInt(totals[p.reward_token] || 0) + BigInt(p.amount || 0)).toString(); }
      catch { /* skip non-numeric */ }
    }
  }
  return totals;
}
