import { isContractDeployed } from '../config.js';
import { useCollectionMeta, useRewards, useTokenMeta } from './hooks.js';
import { formatAmount, shortAddr } from '../lib/format.js';

function RewardBadge({ reward }) {
  const tokenAddr = reward.reward_token || reward.token;
  const meta = useTokenMeta(tokenAddr);
  const rate = reward.rate_per_nft_per_day ?? reward.rate ?? null;
  const paused = reward.paused ?? (reward.enabled === false);
  return (
    <span className="badge">
      {rate != null
        ? `${formatAmount(rate, meta?.decimals ?? 6)} ${meta?.symbol || ''}/NFT/day`
        : `${meta?.symbol || shortAddr(tokenAddr)} rewards`}
      {paused ? ' · paused' : ''}
    </span>
  );
}

function CollectionCard({ c }) {
  const meta = useCollectionMeta(c.cw721);
  const rewards = useRewards(c.cw721);
  const paused = c.enabled === false;
  return (
    <article className="card">
      {meta?.image ? <img className="cardimg" src={meta.image} alt="" /> : <div className="cardimg placeholder">🎉</div>}
      <h3>{c.name || meta?.name || 'Collection'}</h3>
      <p className="muted">{meta?.symbol ? `$${meta.symbol} · ` : ''}{meta?.count != null ? `${meta.count} NFTs` : 'On Terra Classic'}{c.active_stakes != null ? ` · ${c.active_stakes} staked` : ''}{paused ? ' · Paused' : ''}</p>
      <div className="badges">
        {rewards.length
          ? rewards.map((r) => <RewardBadge key={r.reward_token || r.token} reward={r} />)
          : <span className="badge">Rewards coming soon</span>}
      </div>
      <p className="addr-sm">{c.cw721}</p>
    </article>
  );
}

export default function CollectionsSection({ collections }) {
  if (!collections.length) {
    return (
      <section>
        <h2>Collections</h2>
        <div className="empty">
          <p className="big">No NFT collections yet 🎉</p>
          <p>Collections created on <strong>Miata</strong> or <strong>Garuda</strong> will appear here once the admin registers them. Stake a collection's NFTs and earn <strong>FUN</strong> — or any other reward token the admin adds to that collection.</p>
          <p className="muted">Token cross-staking pools don't need an NFT collection — check the Cross Stake Tokens tab.</p>
          {!isContractDeployed() && <p className="muted">The contract is being deployed now — this gallery goes live with it.</p>}
        </div>
      </section>
    );
  }
  return (
    <section>
      <h2>Collections</h2>
      <div className="grid">{collections.map((c) => <CollectionCard key={c.cw721} c={c} />)}</div>
    </section>
  );
}
