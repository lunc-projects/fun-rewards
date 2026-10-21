import { useEffect, useState, useCallback } from 'react';
import { FUN } from '../config.js';
import { cw20TokenInfo, cw20Balance } from '../lib/lcd.js';
import { formatAmount, shortAddr } from '../lib/format.js';
import { useWalletCtx } from './hooks.js';

export default function TokenCards() {
  const { address } = useWalletCtx() || {};
  const [info, setInfo] = useState(null);
  const [balance, setBalance] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const ti = await cw20TokenInfo(FUN.address);
      setInfo(ti); setFailed(false);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!address) { setBalance(null); return; }
      try { const b = await cw20Balance(FUN.address, address); if (live) setBalance(b?.balance ?? null); }
      catch { if (live) setBalance(null); }
    })();
    return () => { live = false; };
  }, [address]);

  const dec = info?.decimals ?? FUN.decimals;
  return (
    <div className="tokengrid single">
      <article className="tokencard">
        <div className="tokenbadge">FUN</div>
        <div>
          <h3>{info?.name || FUN.name} <span className="sym">$FUN</span></h3>
          <p className="muted">Total supply</p>
          {info ? (
            <p className="supply">{formatAmount(info.total_supply, dec)} FUN</p>
          ) : failed ? (
            <p className="supply">Couldn't load <button className="btn ghost sm" onClick={load}>Retry</button></p>
          ) : (
            <p className="supply">Loading from chain…</p>
          )}
          {address && (
            <p className="muted">Your balance: {balance != null ? `${formatAmount(balance, dec)} FUN` : '…'}</p>
          )}
          <p className="addr-sm" title={FUN.address}>{shortAddr(FUN.address)}</p>
        </div>
      </article>
      <article className="tokencard">
        <div>
          <h3>Cross staking</h3>
          <p className="muted">Stake NFTs to earn FUN — or any reward the admin adds. Stake FUN (or any registered token) in a pool and earn any token. Every reward resolves live from its own CW20 — no fixed list.</p>
        </div>
      </article>
    </div>
  );
}
