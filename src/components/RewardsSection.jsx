import { useEffect, useState } from 'react';
import { isContractDeployed } from '../config.js';
import { useWalletCtx, useTokenMeta } from './hooks.js';
import { queryStakes, queryTokenStakes, claim, claimAll, claimPool } from '../lib/stakingClient.js';
import { sumPending } from '../lib/tokenMeta.js';
import { formatAmount, shortAddr } from '../lib/format.js';
import PendingList, { TotalRow } from './PendingList.jsx';

function PositionLabel({ stakingToken }) {
  const meta = useTokenMeta(stakingToken);
  return <span>{meta?.symbol || shortAddr(stakingToken)} pool</span>;
}

export default function RewardsSection() {
  const { address, getSigningClient } = useWalletCtx();
  const [stakes, setStakes] = useState([]);
  const [positions, setPositions] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  async function refresh() {
    if (!address || !isContractDeployed()) { setStakes([]); setPositions([]); return; }
    try { setStakes(await queryStakes(address)); } catch { /* keep */ }
    try { setPositions(await queryTokenStakes(address)); } catch { /* keep */ }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [address]);

  async function act(key, fn, label) {
    setBusy(key); setMsg(null);
    try {
      const client = await getSigningClient();
      const res = await fn(client);
      setMsg(`${label} — tx ${res.transactionHash}`);
      refresh();
    } catch (e) { setMsg(e.message); }
    setBusy('');
  }

  if (!isContractDeployed()) {
    return (
      <section>
        <h2>Rewards</h2>
        <div className="empty">
          <p className="big">Your rewards hub opens at launch 🎉</p>
          <p>Every pending reward — from NFT stakes <em>and</em> token pools, in <strong>any token</strong> — will be totalled here, with Claim All for NFTs and a claim per pool.</p>
        </div>
      </section>
    );
  }
  if (!address) return (<section><h2>Rewards</h2><div className="empty"><p>Connect your wallet to see all your pending rewards.</p></div></section>);

  const nftTotals = sumPending(stakes.map((s) => s.pending));
  const poolTotals = sumPending(positions.map((p) => p.pending));
  const allTotals = sumPending([...stakes.map((s) => s.pending), ...positions.map((p) => p.pending)]);
  const totalTokens = Object.keys(allTotals);

  return (
    <section>
      <h2>Rewards — all my pending</h2>
      {msg && <p className="notice">{msg}</p>}

      <div className="totals">
        {totalTokens.length
          ? totalTokens.map((t) => <TotalRow key={t} token={t} amount={allTotals[t]} />)
          : <div className="totalbox"><span>Pending</span><strong>Nothing yet</strong></div>}
      </div>

      <div className="card wide">
        <h3>From NFT stakes</h3>
        {!stakes.length && <p className="muted">No NFT stakes — nothing pending here.</p>}
        {stakes.map((st) => (
          <div className="rewardrow" key={`${st.collection}-${st.token_id}`}>
            <strong>#{st.token_id}</strong>
            <span className="muted">{shortAddr(st.collection)}</span>
            <PendingList pending={st.pending} />
            <button className="btn sm" disabled={busy === `nft-${st.token_id}`}
              onClick={() => act(`nft-${st.token_id}`, (c) => claim(c, address, st.collection, st.token_id), 'Claimed')}>Claim</button>
          </div>
        ))}
        {!!stakes.length && (
          <p><button className="btn primary" disabled={busy === 'all'}
            onClick={() => act('all', (c) => claimAll(c, address), 'Claimed all NFT rewards')}>
            {busy === 'all' ? 'Claiming…' : 'Claim All (NFT stakes)'}
          </button></p>
        )}
        {!!Object.keys(nftTotals).length && <p className="muted">NFT total: {Object.entries(nftTotals).map(([t, a]) => `${formatAmount(a, 6)} (${shortAddr(t)})`).join(' · ')}</p>}
      </div>

      <div className="card wide">
        <h3>From token pools</h3>
        {!positions.length && <p className="muted">No token positions — nothing pending here.</p>}
        {positions.map((p) => (
          <div className="rewardrow" key={p.staking_token}>
            <strong><PositionLabel stakingToken={p.staking_token} /></strong>
            <PendingList pending={p.pending} />
            <button className="btn sm" disabled={busy === `pool-${p.staking_token}`}
              onClick={() => act(`pool-${p.staking_token}`, (c) => claimPool(c, address, p.staking_token), 'Pool rewards claimed')}>Claim pool</button>
          </div>
        ))}
        {!!Object.keys(poolTotals).length && <p className="muted">Pool claims are per-pool (the contract claims one pool at a time) — use each row's button above.</p>}
      </div>
    </section>
  );
}
