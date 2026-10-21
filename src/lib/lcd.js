// Plain-fetch LCD helpers — no SDK, nothing to break in a browser.
// All reads in this app (CW20, CW721, staking contract queries)
// go through here via base64-encoded smart queries.
import { LCD_URL } from '../config.js';

export function b64(obj) {
  return btoa(JSON.stringify(obj));
}

export function b64decode(str) {
  try { return JSON.parse(atob(str)); } catch { return null; }
}

export async function lcdSmart(contract, msg) {
  const res = await fetch(`${LCD_URL}/cosmwasm/wasm/v1/contract/${contract}/smart/${b64(msg)}`);
  if (!res.ok) throw new Error(`LCD query failed (${res.status}) for ${contract}`);
  const data = await res.json();
  return data.data;
}

export async function lcdContractInfo(contract) {
  const res = await fetch(`${LCD_URL}/cosmwasm/wasm/v1/contract/${contract}`);
  if (!res.ok) throw new Error(`LCD contract info failed (${res.status}) for ${contract}`);
  const data = await res.json();
  return data.contract_info;
}

// ── CW20 ──
export const cw20TokenInfo = (token) => lcdSmart(token, { token_info: {} });
export const cw20Balance = (token, address) => lcdSmart(token, { balance: { address } });

// ── CW721 ──
export const cw721ContractInfo = (cw721) => lcdSmart(cw721, { contract_info: {} }).catch(() => null);
export async function cw721TokensOf(cw721, owner) {
  try {
    const out = await lcdSmart(cw721, { tokens: { owner, limit: 100 } });
    return out?.tokens || [];
  } catch { return []; }
}
export async function cw721NftInfo(cw721, tokenId) {
  // Prefer all_nft_info (includes access/ownership), fall back to nft_info.
  try {
    const out = await lcdSmart(cw721, { all_nft_info: { token_id: tokenId } });
    if (out?.info) return out.info;
  } catch { /* fall through */ }
  try {
    const out = await lcdSmart(cw721, { nft_info: { token_id: tokenId } });
    return out || null;
  } catch { return null; }
}
export async function cw721NumTokens(cw721) {
  try { const out = await lcdSmart(cw721, { num_tokens: {} }); return out?.count ?? null; }
  catch { return null; }
}

/** Pull an image URL out of CW721 metadata (extension.image or token_uri payload). */
export function nftImage(info) {
  if (!info) return null;
  const ext = info.extension || {};
  if (ext.image) return resolveUri(ext.image);
  if (info.image) return resolveUri(info.image);
  return null;
}

export function resolveUri(uri) {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  return uri;
}
