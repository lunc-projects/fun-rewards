import { useEffect, useState } from 'react';
import { isContractDeployed } from '../config.js';
import { useWalletCtx, useStakingPools } from './hooks.js';
import {
  queryConfig,
  adminRegisterCollection, adminRemoveCollection, adminPauseCollection, adminUnpauseCollection,
  adminAddReward, adminSetRewardRate, adminPauseReward,
  adminRegisterStakingPool, adminPauseStakingPool, adminAddPoolReward, adminSetPoolRewardRate, adminPausePoolReward,
  adminSetStakeFee, adminSetLockPeriodSeconds, adminWithdrawUnspent, adminWithdrawPoolUnspent, adminWithdrawStakeFees,
  adminPauseAll, adminUnpause, adminTransferAdmin, chainUpdateAdmin,
  fundCollectionReward, fundPoolReward,
} from '../lib/stakingClient.js';
import { cw721ContractInfo, cw20TokenInfo, lcdContractInfo } from '../lib/lcd.js';
import { resolveTokenMeta } from '../lib/tokenMeta.js';
import { isValidTerraAddress, toBaseUnits } from '../lib/format.js';

export default function AdminSection({ collections }) {
  const { address, getSigningClient } = useWalletCtx();
  const pools = useStakingPools();
  const [config, setConfig] = useState(null);
  const [msg, setMsg] = useState(null);

  // collections form
  const [newCw721, setNewCw721] = useState('');
  const [verify, setVerify] = useState(null);
  const [coll, setColl] = useState('');
  // NFT reward form (any token)
  const [rewardToken, setRewardToken] = useState('');
  const [rewardMeta, setRewardMeta] = useState(null);
  const [rate, setRate] = useState('');
  const [fundAmt, setFundAmt] = useState('');
  // pool form (any tokens)
  const [newPoolToken, setNewPoolToken] = useState('');
  const [poolVerify, setPoolVerify] = useState(null);
  const [pool, setPool] = useState('');
  const [poolRewardToken, setPoolRewardToken] = useState('');
  const [poolRewardMeta, setPoolRewardMeta] = useState(null);
  const [poolRate, setPoolRate] = useState('');
  const [poolFundAmt, setPoolFundAmt] = useState('');
  // settings / withdraw
  const [feeLunc, setFeeLunc] = useState('');
  const [lockDays, setLockDays] = useState('');
  const [wdCollAmt, setWdCollAmt] = useState(''); const [wdCollTo, setWdCollTo] = useState('');
  const [wdPoolAmt, setWdPoolAmt] = useState(''); const [wdPoolTo, setWdPoolTo] = useState('');
  const [wdFeesAmt, setWdFeesAmt] = useState(''); const [wdFeesTo, setWdFeesTo] = useState('');
  // transfer admin
  const [newAdmin, setNewAdmin] = useState('');
  const [confirmArm, setConfirmArm] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferMsg, setTransferMsg] = useState(null);
  const [chainPending, setChainPending] = useState(null);
  const [lastTransfer, setLastTransfer] = useState(null);

  useEffect(() => { (async () => { try { setConfig(await queryConfig()); } catch { setConfig(null); } })(); }, []);
  const adminAddr = config?.admin || config?.owner || null;
  const isAdmin = Boolean(address && adminAddr && address === adminAddr);
  const deployed = isContractDeployed();
  const activeColl = coll || collections[0]?.cw721 || '';
  const activePool = pool || pools[0]?.staking_token || '';

  async function run(label, fn) {
    setMsg(null);
    try { const client = await getSigningClient(); const res = await fn(client); setMsg(`${label} — tx ${res.transactionHash}`); }
    catch (e) { setMsg(e.message); }
  }

  // ── Transfer admin (2 signed steps, retry for step 2) ──
  async function runTransfer() {
    const target = newAdmin.trim();
    if (!isValidTerraAddress(target) || target === adminAddr || transferBusy) return;
    if (!confirmArm) { setConfirmArm(true); return; }
    setTransferBusy(true); setTransferMsg(null);
    try {
      const client = await getSigningClient();
      const r1 = await adminTransferAdmin(client, address, target);
      setTransferMsg(`Step 1 done — app admin is now ${target} (tx ${r1.transactionHash}). Now moving the contract's upgrade admin…`);
      try {
        const r2 = await chainUpdateAdmin(client, address, target);
        setLastTransfer({ target, appTx: r1.transactionHash, chainTx: r2.transactionHash });
        setChainPending(null);
        setTransferMsg(`✅ Admin fully transferred to ${target}. App admin tx ${r1.transactionHash} · Upgrade admin tx ${r2.transactionHash}.`);
        try { setConfig(await queryConfig()); } catch { /* panel locks on next load either way */ }
      } catch (e2) {
        setChainPending(target);
        setTransferMsg(`⚠️ App admin moved to ${target} (tx ${r1.transactionHash}), but the contract's upgrade admin did NOT move: ${e2.message} — this wallet still holds upgrade rights. Use the retry button below to finish the handover.`);
      }
    } catch (e) {
      setTransferMsg(`Transfer failed — nothing changed: ${e.message}`);
    }
    setTransferBusy(false); setConfirmArm(false);
  }

  async function retryChainSync() {
    if (!chainPending || transferBusy) return;
    setTransferBusy(true);
    try {
      const client = await getSigningClient();
      const r2 = await chainUpdateAdmin(client, address, chainPending);
      setLastTransfer({ target: chainPending, appTx: lastTransfer?.appTx || '(earlier)', chainTx: r2.transactionHash });
      setTransferMsg(`✅ Upgrade admin moved to ${chainPending} (tx ${r2.transactionHash}). Admin handover is now complete.`);
      setChainPending(null);
      try { setConfig(await queryConfig()); } catch { /* ignore */ }
    } catch (e) { setTransferMsg(`Retry failed: ${e.message}`); }
    setTransferBusy(false);
  }

  async function verifyCollection() {
    setVerify(null);
    if (!isValidTerraAddress(newCw721)) { setVerify({ err: 'That does not look like a valid terra1… contract address.' }); return; }
    try {
      const ci = await cw721ContractInfo(newCw721);
      const meta = await lcdContractInfo(newCw721).catch(() => null);
      setVerify({ name: ci?.name, symbol: ci?.symbol, codeId: meta?.code_id });
    } catch { setVerify({ err: 'Could not read that contract on-chain — check the address.' }); }
  }

  async function checkToken(addr, setter) {
    setter(null);
    if (!isValidTerraAddress(addr)) { setter({ err: 'That does not look like a valid terra1… token address.' }); return null; }
    try {
      const ti = await cw20TokenInfo(addr.trim());
      const m = { name: ti?.name, symbol: ti?.symbol, decimals: ti?.decimals ?? 6 };
      setter(m);
      return m;
    } catch { setter({ err: 'Could not read that CW20 on-chain — check the address.' }); return null; }
  }

  async function resolveReward(addr, setMeta) {
    if (!isValidTerraAddress(addr)) { setMeta(null); return null; }
    const m = await resolveTokenMeta(addr.trim());
    setMeta(m);
    return m;
  }

  if (!deployed) {
    return (
      <section>
        <h2>Admin</h2>
        <div className="empty">
          <p className="big">🔒 Admin unlocks at deployment</p>
          <p>The admin panel is controlled by <strong>one owner wallet only</strong> — no governance, no voting. Once the cross-staking contract is deployed and its address is set in the app config, the admin wallet will see: register collections & staking pools, add <strong>any token</strong> as a reward, set rates, fund pools, stake fee, lock period, pause / resume, withdrawals, and Transfer Admin.</p>
          <div className="form">
            <label>Preview a future collection (CW721 address)
              <input value={newCw721} onChange={(e) => setNewCw721(e.target.value)} placeholder="terra1…" />
            </label>
            <button className="btn" onClick={verifyCollection}>Verify on-chain</button>
            {verify && <p className="notice">{verify.err || `Found: ${verify.name || '—'} (${verify.symbol || '—'})${verify.codeId ? ` · code_id ${verify.codeId}` : ''}`}</p>}
          </div>
        </div>
      </section>
    );
  }

  if (!address) return (<section><h2>Admin</h2><div className="empty"><p>Connect the owner wallet to use the admin panel.</p></div></section>);
  if (adminAddr && !isAdmin) return (
    <section><h2>Admin</h2>
      <div className="empty"><p>🔒 This wallet is not the admin for this app. Admin: {adminAddr}</p>
      {lastTransfer && <p className="notice">✅ You transferred admin to {lastTransfer.target}. App admin tx {lastTransfer.appTx} · Upgrade admin tx {lastTransfer.chainTx}. Connect the new admin wallet to manage the app.</p>}
      {chainPending && <>
        <p className="notice">⚠️ One step is unfinished: the contract's upgrade admin has not moved to {chainPending} yet, and this wallet still holds it. Finish the handover:</p>
        <button className="btn primary" disabled={transferBusy} onClick={retryChainSync}>{transferBusy ? 'Working…' : 'Retry upgrade-admin transfer'}</button>
        {transferMsg && <p className="notice">{transferMsg}</p>}
      </>}
      </div>
    </section>);

  const rewardDec = rewardMeta?.decimals ?? 6;
  const poolRewardDec = poolRewardMeta?.decimals ?? 6;

  return (
    <section>
      <h2>Admin</h2>
      {config && <p className="muted">Paused: {config.paused ? 'YES (all)' : 'no'} · Stake fee: {config.stake_fee_uluna ?? '0'} uluna · Lock: {config.lock_period_seconds ?? 0}s</p>}
      {msg && <p className="notice">{msg}</p>}

      <div className="form card wide">
        <h3>Collections</h3>
        <label>New CW721 address <input value={newCw721} onChange={(e) => setNewCw721(e.target.value)} placeholder="terra1…" /></label>
        <div className="row">
          <button className="btn" onClick={verifyCollection}>Verify on-chain</button>
          <button className="btn primary" disabled={!isValidTerraAddress(newCw721)} onClick={() => run('Collection registered', (c) => adminRegisterCollection(c, address, newCw721.trim()))}>Register Collection</button>
        </div>
        {verify && <p className="notice">{verify.err || `Found: ${verify.name || '—'} (${verify.symbol || '—'})`}</p>}
        <label>Registered collection
          <select value={activeColl} onChange={(e) => setColl(e.target.value)}>
            {collections.map((c) => <option key={c.cw721} value={c.cw721}>{c.name || c.cw721}</option>)}
          </select>
        </label>
        <div className="row">
          <button className="btn ghost" disabled={!activeColl} onClick={() => run('Collection paused', (c) => adminPauseCollection(c, address, activeColl))}>Pause Collection</button>
          <button className="btn ghost" disabled={!activeColl} onClick={() => run('Collection resumed', (c) => adminUnpauseCollection(c, address, activeColl))}>Resume Collection</button>
          <button className="btn ghost" disabled={!activeColl} onClick={() => run('Collection removed', (c) => adminRemoveCollection(c, address, activeColl))}>Remove Collection</button>
        </div>
      </div>

      <div className="form card wide">
        <h3>NFT Rewards — any token</h3>
        <p className="muted">Add ANY CW20 as a reward for the selected collection. No whitelist — the address you enter is the reward.</p>
        <label>Collection
          <select value={activeColl} onChange={(e) => setColl(e.target.value)}>
            {collections.map((c) => <option key={c.cw721} value={c.cw721}>{c.name || c.cw721}</option>)}
          </select>
        </label>
        <label>Reward token (CW20 address) <input value={rewardToken} onChange={(e) => { setRewardToken(e.target.value); setRewardMeta(null); }} placeholder="terra1… (FUN or any other CW20)" /></label>
        <div className="row">
          <button className="btn" disabled={!isValidTerraAddress(rewardToken)} onClick={() => resolveReward(rewardToken, setRewardMeta)}>Check token</button>
          <button className="btn primary" disabled={!activeColl || !isValidTerraAddress(rewardToken)} onClick={() => run('Reward added', (c) => adminAddReward(c, address, activeColl, rewardToken.trim()))}>Add Reward</button>
          <button className="btn ghost" disabled={!activeColl || !isValidTerraAddress(rewardToken)} onClick={() => run('Reward paused', (c) => adminPauseReward(c, address, activeColl, rewardToken.trim(), true))}>Pause</button>
          <button className="btn ghost" disabled={!activeColl || !isValidTerraAddress(rewardToken)} onClick={() => run('Reward resumed', (c) => adminPauseReward(c, address, activeColl, rewardToken.trim(), false))}>Resume</button>
        </div>
        {rewardMeta && <p className="notice">Token: {rewardMeta.name} (${rewardMeta.symbol}) · {rewardMeta.decimals} decimals</p>}
        <label>Rate per NFT per day ({rewardMeta?.symbol || 'reward token'}) <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 10" /></label>
        <button className="btn primary" disabled={!rate || !isValidTerraAddress(rewardToken) || !activeColl} onClick={() => run('Rate set', (c) => adminSetRewardRate(c, address, activeColl, rewardToken.trim(), toBaseUnits(rate, rewardDec)))}>Set Rate</button>
        <label>Fund this collection's pool — amount of the reward token <input inputMode="decimal" value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} placeholder="e.g. 100000" /></label>
        <button className="btn primary" disabled={!fundAmt || !isValidTerraAddress(rewardToken) || !activeColl} onClick={() => run('Pool funded', (c) => fundCollectionReward(c, address, rewardToken.trim(), toBaseUnits(fundAmt, rewardDec), activeColl))}>Fund Pool</button>
        <label>Withdraw unspent — amount <input inputMode="decimal" value={wdCollAmt} onChange={(e) => setWdCollAmt(e.target.value)} placeholder="0" /></label>
        <label>Withdraw to <input value={wdCollTo} onChange={(e) => setWdCollTo(e.target.value)} placeholder="terra1…" /></label>
        <button className="btn" disabled={!wdCollAmt || !isValidTerraAddress(wdCollTo) || !isValidTerraAddress(rewardToken) || !activeColl} onClick={() => run('Unspent withdrawn', (c) => adminWithdrawUnspent(c, address, activeColl, rewardToken.trim(), toBaseUnits(wdCollAmt, rewardDec), wdCollTo.trim()))}>Withdraw Unspent (NFT pool)</button>
      </div>

      <div className="form card wide">
        <h3>Token Staking Pools — cross staking</h3>
        <label>New staking token (CW20 address) <input value={newPoolToken} onChange={(e) => setNewPoolToken(e.target.value)} placeholder="terra1… (e.g. FUN itself)" /></label>
        <div className="row">
          <button className="btn" disabled={!isValidTerraAddress(newPoolToken)} onClick={() => checkToken(newPoolToken, setPoolVerify)}>Verify token</button>
          <button className="btn primary" disabled={!isValidTerraAddress(newPoolToken)} onClick={() => run('Staking pool registered', (c) => adminRegisterStakingPool(c, address, newPoolToken.trim()))}>Register Staking Pool</button>
        </div>
        {poolVerify && <p className="notice">{poolVerify.err || `Found: ${poolVerify.name || '—'} (${poolVerify.symbol || '—'}) · ${poolVerify.decimals} decimals`}</p>}
        <label>Registered pool
          <select value={activePool} onChange={(e) => setPool(e.target.value)}>
            {pools.map((p) => <option key={p.staking_token} value={p.staking_token}>{p.staking_token}</option>)}
          </select>
        </label>
        <div className="row">
          <button className="btn ghost" disabled={!activePool} onClick={() => run('Pool paused', (c) => adminPauseStakingPool(c, address, activePool, true))}>Pause Pool</button>
          <button className="btn ghost" disabled={!activePool} onClick={() => run('Pool resumed', (c) => adminPauseStakingPool(c, address, activePool, false))}>Resume Pool</button>
        </div>
        <label>Pool reward token (any CW20) <input value={poolRewardToken} onChange={(e) => { setPoolRewardToken(e.target.value); setPoolRewardMeta(null); }} placeholder="terra1…" /></label>
        <div className="row">
          <button className="btn" disabled={!isValidTerraAddress(poolRewardToken)} onClick={() => resolveReward(poolRewardToken, setPoolRewardMeta)}>Check token</button>
          <button className="btn primary" disabled={!activePool || !isValidTerraAddress(poolRewardToken)} onClick={() => run('Pool reward added', (c) => adminAddPoolReward(c, address, activePool, poolRewardToken.trim()))}>Add Pool Reward</button>
          <button className="btn ghost" disabled={!activePool || !isValidTerraAddress(poolRewardToken)} onClick={() => run('Pool reward paused', (c) => adminPausePoolReward(c, address, activePool, poolRewardToken.trim(), true))}>Pause</button>
          <button className="btn ghost" disabled={!activePool || !isValidTerraAddress(poolRewardToken)} onClick={() => run('Pool reward resumed', (c) => adminPausePoolReward(c, address, activePool, poolRewardToken.trim(), false))}>Resume</button>
        </div>
        {poolRewardMeta && <p className="notice">Token: {poolRewardMeta.name} (${poolRewardMeta.symbol}) · {poolRewardMeta.decimals} decimals</p>}
        <label>Rate per 1 staked token per day ({poolRewardMeta?.symbol || 'reward token'}) <input inputMode="decimal" value={poolRate} onChange={(e) => setPoolRate(e.target.value)} placeholder="e.g. 0.5" /></label>
        <button className="btn primary" disabled={!poolRate || !activePool || !isValidTerraAddress(poolRewardToken)} onClick={() => run('Pool rate set', (c) => adminSetPoolRewardRate(c, address, activePool, poolRewardToken.trim(), toBaseUnits(poolRate, poolRewardDec)))}>Set Pool Rate</button>
        <label>Fund this pool's reward — amount of the reward token <input inputMode="decimal" value={poolFundAmt} onChange={(e) => setPoolFundAmt(e.target.value)} placeholder="e.g. 100000" /></label>
        <button className="btn primary" disabled={!poolFundAmt || !activePool || !isValidTerraAddress(poolRewardToken)} onClick={() => run('Pool reward funded', (c) => fundPoolReward(c, address, poolRewardToken.trim(), toBaseUnits(poolFundAmt, poolRewardDec), activePool))}>Fund Pool Reward</button>
        <label>Withdraw pool unspent — amount <input inputMode="decimal" value={wdPoolAmt} onChange={(e) => setWdPoolAmt(e.target.value)} placeholder="0" /></label>
        <label>Withdraw to <input value={wdPoolTo} onChange={(e) => setWdPoolTo(e.target.value)} placeholder="terra1…" /></label>
        <button className="btn" disabled={!wdPoolAmt || !isValidTerraAddress(wdPoolTo) || !isValidTerraAddress(poolRewardToken) || !activePool} onClick={() => run('Pool unspent withdrawn', (c) => adminWithdrawPoolUnspent(c, address, activePool, poolRewardToken.trim(), toBaseUnits(wdPoolAmt, poolRewardDec), wdPoolTo.trim()))}>Withdraw Unspent (token pool)</button>
      </div>

      <div className="form card wide">
        <h3>Settings</h3>
        <label>Stake fee (LUNC, per NFT stake) <input inputMode="decimal" value={feeLunc} onChange={(e) => setFeeLunc(e.target.value)} placeholder="0" /></label>
        <button className="btn" disabled={feeLunc === ''} onClick={() => run('Stake fee set', (c) => adminSetStakeFee(c, address, toBaseUnits(feeLunc, 6)))}>Set Stake Fee</button>
        <label>Lock period (days, NFT stakes) <input inputMode="numeric" value={lockDays} onChange={(e) => setLockDays(e.target.value)} placeholder="0 = unstake anytime" /></label>
        <button className="btn" disabled={lockDays === ''} onClick={() => run('Lock period set', (c) => adminSetLockPeriodSeconds(c, address, Number(lockDays) * 86400))}>Set Lock Period</button>
        <label>Withdraw collected stake fees — amount (LUNC) <input inputMode="decimal" value={wdFeesAmt} onChange={(e) => setWdFeesAmt(e.target.value)} placeholder="0" /></label>
        <label>Withdraw fees to <input value={wdFeesTo} onChange={(e) => setWdFeesTo(e.target.value)} placeholder="terra1…" /></label>
        <button className="btn" disabled={!wdFeesAmt || !isValidTerraAddress(wdFeesTo)} onClick={() => run('Stake fees withdrawn', (c) => adminWithdrawStakeFees(c, address, toBaseUnits(wdFeesAmt, 6), wdFeesTo.trim()))}>Withdraw Stake Fees</button>
        <div className="row">
          <button className="btn" onClick={() => run('Contract paused', (c) => adminPauseAll(c, address))}>Pause All</button>
          <button className="btn" onClick={() => run('Contract unpaused', (c) => adminUnpause(c, address))}>Unpause</button>
        </div>
      </div>

      <div className="form card wide">
        <h3>Transfer Admin</h3>
        <p>Current admin: <strong>{adminAddr}</strong></p>
        <p>Hand the app over to a different wallet, any time. This moves <strong>both</strong> the app admin (collections, pools, rewards, rates, fees — everything in this panel) <strong>and</strong> the contract's on-chain upgrade admin, in two signed steps. The new wallet becomes admin immediately and this wallet loses admin — it can't be undone by this wallet afterwards, so double-check the address.</p>
        <label>New admin wallet <input value={newAdmin} onChange={(e) => { setNewAdmin(e.target.value); setConfirmArm(false); }} placeholder="terra1…" /></label>
        {transferMsg && <p className="notice">{transferMsg}</p>}
        {chainPending && <button className="btn primary" disabled={transferBusy} onClick={retryChainSync}>{transferBusy ? 'Working…' : `Retry upgrade-admin transfer to ${chainPending.slice(0, 12)}…`}</button>}
        <button className="btn" disabled={!isValidTerraAddress(newAdmin.trim()) || newAdmin.trim() === adminAddr || transferBusy}
          onClick={runTransfer}>
          {transferBusy ? 'Working…' : confirmArm ? `⚠️ Click again to confirm — transfer admin to ${newAdmin.trim().slice(0, 12)}…` : 'Transfer Admin'}
        </button>
      </div>
    </section>
  );
}
