import { useEffect, useState, createContext, useContext } from 'react';
import { COLLECTIONS, FUN, isContractDeployed } from '../config.js';
import { queryCollections, queryRewards, queryStakingPools, queryPoolRewards } from '../lib/stakingClient.js';
import { cw721ContractInfo, cw721NumTokens, cw721TokensOf, cw721NftInfo, nftImage } from '../lib/lcd.js';
import { cachedTokenMeta, resolveTokenMeta } from '../lib/tokenMeta.js';

// Effective collection list = config fallback merged with on-chain registry (when live).
export function useCollections() {
  const [collections, setCollections] = useState(COLLECTIONS);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!isContractDeployed()) return;
      try {
        const onchain = await queryCollections();
        if (live && onchain?.length) {
          const byAddr = new Map([...COLLECTIONS, ...onchain].map((c) => [c.cw721, c]));
          setCollections([...byAddr.values()]);
        }
      } catch { /* keep config fallback */ }
    })();
    return () => { live = false; };
  }, []);
  return collections;
}

// On-chain staking pools (token cross-staking).
export function useStakingPools() {
  const [pools, setPools] = useState([]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!isContractDeployed()) return;
      try { const p = await queryStakingPools(); if (live) setPools(p || []); } catch { /* none */ }
    })();
    return () => { live = false; };
  }, []);
  return pools;
}

// Enrich a collection with its CW721 info + sample image via LCD.
export function useCollectionMeta(cw721) {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!cw721) return;
      const [ci, count] = await Promise.all([cw721ContractInfo(cw721), cw721NumTokens(cw721)]);
      let image = null;
      try { const n = await cw721NftInfo(cw721, '1'); image = nftImage(n); } catch { /* no cover */ }
      if (live) setMeta({ name: ci?.name, symbol: ci?.symbol, count, image });
    })();
    return () => { live = false; };
  }, [cw721]);
  return meta;
}

export function useRewards(cw721) {
  const [rewards, setRewards] = useState([]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!isContractDeployed() || !cw721) return;
      try { const r = await queryRewards(cw721); if (live) setRewards(r || []); } catch { /* none */ }
    })();
    return () => { live = false; };
  }, [cw721]);
  return rewards;
}

export function usePoolRewards(stakingToken) {
  const [rewards, setRewards] = useState([]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!isContractDeployed() || !stakingToken) return;
      try { const r = await queryPoolRewards(stakingToken); if (live) setRewards(r || []); } catch { /* none */ }
    })();
    return () => { live = false; };
  }, [stakingToken]);
  return rewards;
}

/** CW20 metadata for any address — FUN is pre-known, everything
 *  else resolves from its token_info query (cached). */
export function useTokenMeta(address) {
  const [meta, setMeta] = useState(() => (address ? cachedTokenMeta(address) : null));
  useEffect(() => {
    let live = true;
    if (!address) { setMeta(null); return undefined; }
    const hit = cachedTokenMeta(address);
    if (hit) { setMeta(hit); return undefined; }
    setMeta({ address, symbol: '…', name: '…', decimals: 6 });
    resolveTokenMeta(address).then((m) => { if (live) setMeta(m); }).catch(() => {});
    return () => { live = false; };
  }, [address]);
  return meta;
}

export const funMeta = () => cachedTokenMeta(FUN.address) || FUN;

export const WalletCtx = createContext(null);
export const useWalletCtx = () => useContext(WalletCtx);

export async function loadOwnedNfts(cw721, owner) {
  const ids = await cw721TokensOf(cw721, owner);
  const out = [];
  for (const token_id of ids) {
    const info = await cw721NftInfo(cw721, token_id);
    out.push({ token_id, image: nftImage(info), info });
  }
  return out;
}
