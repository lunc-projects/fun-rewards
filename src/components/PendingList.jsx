import { useTokenMeta } from './hooks.js';
import { normalizePending } from '../lib/tokenMeta.js';
import { formatAmount } from '../lib/format.js';

function PendingRow({ entry }) {
  const meta = useTokenMeta(entry.reward_token);
  const sym = meta?.symbol || '…';
  const dec = meta?.decimals ?? 6;
  return (
    <p className="pendingrow">
      <span>{formatAmount(entry.amount, dec)} {sym}</span>
      <span className="muted"> pending</span>
    </p>
  );
}

/** Render a generic pending-rewards list [{reward_token, amount}]
 *  for ANY token — symbols/decimals resolved per token on-chain. */
export default function PendingList({ pending, emptyText = 'No rewards pending yet' }) {
  const list = normalizePending(pending).filter((p) => {
    try { return BigInt(p.amount || 0) > 0n; } catch { return p.amount && p.amount !== '0'; }
  });
  if (!list.length) return <p className="muted">{emptyText}</p>;
  return <div>{list.map((p) => <PendingRow key={p.reward_token} entry={p} />)}</div>;
}

/** Aggregated totals box row for one token across many pending lists. */
export function TotalRow({ token, amount }) {
  const meta = useTokenMeta(token);
  return (
    <div className="totalbox">
      <span>Pending {meta?.symbol || '…'}</span>
      <strong>{formatAmount(amount, meta?.decimals ?? 6)} {meta?.symbol || ''}</strong>
    </div>
  );
}
