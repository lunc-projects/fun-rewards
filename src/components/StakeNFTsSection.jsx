import { useEffect, useState } from 'react';
import { isContractDeployed } from '../config.js';
import { loadOwnedNfts, useWalletCtx } from './hooks.js';
import { stakeNft, claim, claimAll, unstake, queryStakes, queryConfig } from '../lib/stakingClient.js';
import { formatAmount, shortAddr } from '../lib/format.js';
import PendingList from './PendingList.jsx';

export default function StakeNFTsSection({ collections }) {
  const { address, getSigningClient } = useWalletCtx();
  const [owned, setOwned] = useState([]);
  const [stakes, setStakes] = useState([]);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  async function refreshStakes() {
    if (!address || !isContractDeployed()) { setStakes([]); return; }
    try { setStakes(await queryStakes(address)); } catch { /* keep last */ }
  }

  useEffect(() => { (async () => { try { setConfig(await queryConfig()); } catch { setConfig(null); } })(); }, []);
  useEffect(() => { refreshStakes(); /* eslint-disable-next-line */ }, [address]);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!address || !collections.length) { setOwned([]); return; }
      const all = [];
      for (const c of collections) {
        const nfts = await loadOwnedNfts(c.cw721, address);
        nfts.forEach((n) => all.push({ ...n, collection: c.cw721 }));
      }
      if (live) setOwned(all);
    })();
    return () => { live = false; };
  }, [address, collections]);

  const feeUluna = config?.stake_fee_uluna ?? config?.stake_fee ?? '0';
  const hasFee = feeUluna && String(feeUluna) !== '0';
  const lockSecs = config?.lock_period_seconds ?? 0;

  async function act(key, fn, label) {
    setBusy(key); setMsg(null);
    try {
      const client = await getSigningClient();
      const res = await fn(client);
      setMsg(`${label} — tx ${res.transactionHash}${res.feeTx ? ` (stake-fee tx ${res.feeTx})` : ''}`);
      refreshStakes();
    } catch (e) { setMsg(e.message); }
    setBusy('');
  }

  if (!isContractDeployed()) {
    return (
      <section>
        <h2>Stake NFTs</h2>
        <div className="empty">
          <p className="big">NFT staking opens when the contract goes live 🎉</p>
          <p>Once deployed, stake NFTs from any registered collection here and earn <strong>FUN</strong> plus any other reward the admin adds — per-NFT pending rewards, Claim, Claim All, and Unstake.</p>
          {!collections.length && <p className="muted">No collections are registered yet — they'll be added by the admin after launch (collections can be registered at any time, they don't need to exist before the contract).</p>}
        </div>
      </section>
    );
  }
  if (!address) return (<section><h2>Stake NFTs</h2><div className="empty"><p>Connect your wallet to see your NFTs and stakes.</p></div></section>);

  return (
    <section>
      <h2>Stake NFTs</h2>
      {msg && <p className="notice">{msg}</p>}
      {hasFee && <p className="muted">Stake fee: {formatAmount(feeUluna, 6)} LUNC per NFT — paid in a quick separate step right before staking.{lockSecs ? ` Lock period: ${(Number(lockSecs) / 86400).toFixed(1)} days.` : ''}</p>}

      <h3>My NFTs (unstaked)</h3>
      {!collections.length && <div className="empty"><p>No collections are registered yet — your NFTs will show here once the admin registers the first collection.</p></div>}
      {collections.length > 0 && !owned.length && <div className="empty"><p>No NFTs from the registered collections in this wallet yet.</p></div>}
      <div className="grid">
        {owned.map((n) => (
          <article className="card" key={`${n.collection}-${n.token_id}`}>
            {n.image ? <img className="cardimg" src={n.image} alt="" /> : <div className="cardimg placeholder">🎉</div>}
            <h3>#{n.token_id}</h3>
            <p className="addr-sm">{shortAddr(n.collection)}</p>
            <button className="btn primary" disabled={busy === n.token_id}
              onClick={() => act(n.token_id, (c) => stakeNft(c, address, n.collection, n.token_id), `Staked NFT #${n.token_id}`)}>
              {busy === n.token_id ? 'Staking…' : hasFee ? 'Pay fee & Stake' : 'Stake'}
            </button>
          </article>
        ))}
      </div>

      <h3>My staked NFTs</h3>
      {!stakes.length && <div className="empty"><p>Nothing staked yet — stake an NFT above.</p></div>}
      {!!stakes.length && (
        <p><button className="btn primary" onClick={() => act('claimall', (c) => claimAll(c, address), 'Claimed all NFT rewards')}>Claim All NFT rewards</button></p>
      )}
      <div className="grid">
        {stakes.map((st) => (
          <article className="card" key={`${st.collection}-${st.token_id}`}>
            <h3>#{st.token_id}</h3>
            <p className="addr-sm">{shortAddr(st.collection)}</p>
            {st.staked_at_seconds != null && <p className="muted">Staked {new Date(Number(st.staked_at_seconds) * 1000).toLocaleDateString()}</p>}
            <PendingList pending={st.pending} />
            <div className="row">
              <button className="btn" disabled={busy === `c-${st.token_id}`}
                onClick={() => act(`c-${st.token_id}`, (c) => claim(c, address, st.collection, st.token_id), 'Claimed')}>Claim</button>
              <button className="btn ghost" disabled={busy === `u-${st.token_id}`}
                onClick={() => act(`u-${st.token_id}`, (c) => unstake(c, address, st.collection, st.token_id), 'Unstaked')}>Unstake</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
