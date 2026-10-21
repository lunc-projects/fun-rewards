import { useEffect, useState } from 'react';
import { isContractDeployed } from '../config.js';
import { useWalletCtx, useTokenMeta, usePoolRewards, useStakingPools } from './hooks.js';
import { stakeTokens, unstakeTokens, claimPool, queryTokenStakes } from '../lib/stakingClient.js';
import { cw20Balance } from '../lib/lcd.js';
import { formatAmount, toBaseUnits, shortAddr } from '../lib/format.js';
import PendingList from './PendingList.jsx';

function PoolRewardRow({ reward }) {
  const tokenAddr = reward.reward_token || reward.token;
  const meta = useTokenMeta(tokenAddr);
  const rate = reward.rate_per_token_per_day ?? reward.rate ?? null;
  const paused = reward.paused ?? (reward.enabled === false);
  const bal = reward.pool_balance ?? reward.balance ?? null;
  return (
    <div className="rewardrow">
      <strong>{meta?.symbol || '…'}</strong>
      <span>Rate: {rate != null ? `${formatAmount(rate, meta?.decimals ?? 6)} / token / day` : '—'}</span>
      <span>Pool: {bal != null ? `${formatAmount(bal, meta?.decimals ?? 6)} ${meta?.symbol || ''}` : '—'}</span>
      <span className="muted">{paused ? 'Paused' : 'Active'}</span>
    </div>
  );
}

function PoolCard({ pool, position, address, getSigningClient, onDone }) {
  const stakingToken = pool.staking_token;
  const meta = useTokenMeta(stakingToken);
  const rewards = usePoolRewards(stakingToken);
  const [stakeAmt, setStakeAmt] = useState('');
  const [unstakeAmt, setUnstakeAmt] = useState('');
  const [balance, setBalance] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const dec = meta?.decimals ?? 6;
  const paused = pool.paused ?? (pool.enabled === false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!address) { setBalance(null); return; }
      try { const b = await cw20Balance(stakingToken, address); if (live) setBalance(b?.balance ?? null); }
      catch { if (live) setBalance(null); }
    })();
    return () => { live = false; };
  }, [address, stakingToken]);

  async function act(key, fn, label) {
    setBusy(key); setMsg(null);
    try {
      const client = await getSigningClient();
      const res = await fn(client);
      setMsg(`${label} — tx ${res.transactionHash}`);
      onDone?.();
    } catch (e) { setMsg(e.message); }
    setBusy('');
  }

  return (
    <div className="card wide">
      <h3>Stake {meta?.symbol || shortAddr(stakingToken)} {paused && <span className="muted">· Paused</span>}</h3>
      <p className="muted">Total staked: {formatAmount(pool.total_staked ?? '0', dec)} {meta?.symbol || ''}</p>
      <p className="addr-sm">{stakingToken}</p>
      {rewards.length ? rewards.map((r) => <PoolRewardRow key={r.reward_token || r.token} reward={r} />)
        : <p className="muted">No rewards added to this pool yet.</p>}
      {msg && <p className="notice">{msg}</p>}

      {position && (
        <div className="rewardrow">
          <strong>Your stake: {formatAmount(position.amount, dec)} {meta?.symbol || ''}</strong>
          <PendingList pending={position.pending} emptyText="No pool rewards pending yet" />
        </div>
      )}

      {address ? (
        <>
          <div className="form">
            <label>Stake amount ({meta?.symbol || 'tokens'}){balance != null ? ` — balance ${formatAmount(balance, dec)}` : ''}
              <input inputMode="decimal" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value)} placeholder="e.g. 100" />
            </label>
          </div>
          <div className="row">
            <button className="btn primary" disabled={!stakeAmt || busy === 'stake' || paused}
              onClick={() => act('stake', (c) => stakeTokens(c, address, stakingToken, toBaseUnits(stakeAmt, dec)), `Staked ${meta?.symbol || ''}`)}>
              {busy === 'stake' ? 'Staking…' : 'Stake'}
            </button>
            <button className="btn" disabled={!position || busy === 'claim'}
              onClick={() => act('claim', (c) => claimPool(c, address, stakingToken), 'Pool rewards claimed')}>
              {busy === 'claim' ? 'Claiming…' : 'Claim'}
            </button>
          </div>
          {position && (
            <>
              <div className="form">
                <label>Unstake amount ({meta?.symbol || 'tokens'})
                  <input inputMode="decimal" value={unstakeAmt} onChange={(e) => setUnstakeAmt(e.target.value)} placeholder="e.g. 50" />
                </label>
              </div>
              <div className="row">
                <button className="btn ghost" disabled={!unstakeAmt || busy === 'unstake'}
                  onClick={() => act('unstake', (c) => unstakeTokens(c, address, stakingToken, toBaseUnits(unstakeAmt, dec)), 'Unstaked')}>
                  {busy === 'unstake' ? 'Unstaking…' : 'Unstake'}
                </button>
              </div>
            </>
          )}
        </>
      ) : <p className="muted">Connect your wallet to stake.</p>}
    </div>
  );
}

export default function CrossStakeSection() {
  const { address, getSigningClient } = useWalletCtx();
  const pools = useStakingPools();
  const [positions, setPositions] = useState([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!address || !isContractDeployed()) { setPositions([]); return; }
      try { const p = await queryTokenStakes(address); if (live) setPositions(p || []); } catch { /* none */ }
    })();
    return () => { live = false; };
  }, [address, nonce]);

  if (!isContractDeployed()) {
    return (
      <section>
        <h2>Cross Stake Tokens</h2>
        <div className="empty">
          <p className="big">Token pools open when the contract goes live 🎉</p>
          <p>Stake <strong>FUN</strong> — or any token the admin registers as a staking pool — and earn <strong>any reward token</strong> that pool carries. Rates are per token per day and adjustable by the admin.</p>
          <p className="muted">This works even before any NFT collection exists — pools can be the first thing live.</p>
        </div>
      </section>
    );
  }

  const posByToken = Object.fromEntries(positions.map((p) => [p.staking_token, p]));

  return (
    <section>
      <h2>Cross Stake Tokens</h2>
      {!pools.length && <div className="empty"><p>No staking pools registered yet — the admin adds the first one (FUN is the natural first pool) from the Admin tab.</p></div>}
      {pools.map((pool) => (
        <PoolCard key={pool.staking_token} pool={pool} position={posByToken[pool.staking_token]}
          address={address} getSigningClient={getSigningClient} onDone={() => setNonce((n) => n + 1)} />
      ))}
    </section>
  );
}
