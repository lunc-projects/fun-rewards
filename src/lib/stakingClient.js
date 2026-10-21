// ─────────────────────────────────────────────────────────────
// ISOLATED cross-staking contract client.
// Every interaction with the FUN cross-staking contract lives in
// this one file, coded against the agreed contract API:
//   Instantiate: { admin, fun_address }
//   Queries:  Config{}, Collections{}, Rewards{collection},
//             PendingRewards{owner,collection,token_id},
//             Stakes{owner}, PoolBalances{},
//             StakingPools{}, PoolRewards{staking_token},
//             TokenStakes{owner}, TokenPoolBalances{}
//   NFT:      stake = CW721 SendNft (PayStakeFee first if fee > 0),
//             Claim{collection,token_id}, ClaimAll{},
//             Unstake{collection,token_id}
//   Tokens:   stake = CW20 Send of the staking token, hook {"stake":{}},
//             UnstakeTokens{staking_token,amount}, ClaimPool{staking_token}
//   Funding:  NFT reward  = CW20 Send, hook {"collection":"<cw721>"}
//             Pool reward = CW20 Send, hook {"staking_pool":"<staking token>"}
//   Admin:    RegisterCollection{cw721}, RemoveCollection{collection},
//             PauseCollection{collection}, UnpauseCollection{collection},
//             AddReward{collection,reward_token},
//             SetRewardRate{collection,reward_token,rate_per_nft_per_day},
//             PauseReward{collection,reward_token,paused},
//             RegisterStakingPool{staking_token},
//             PauseStakingPool{staking_token,paused},
//             AddPoolReward{staking_token,reward_token},
//             SetPoolRewardRate{staking_token,reward_token,rate_per_token_per_day},
//             PausePoolReward{staking_token,reward_token,paused},
//             SetStakeFee{amount_uluna}, SetLockPeriodSeconds{seconds},
//             WithdrawUnspent{collection,reward_token,amount,to},
//             WithdrawPoolUnspent{staking_token,reward_token,amount,to},
//             WithdrawStakeFees{amount,to}, PauseAll{}, Unpause{},
//             TransferAdmin{new_admin} (+ chain MsgUpdateAdmin)
// If message names shift when the contract report lands, adjust
// ONLY this file — no component touches the contract directly.
// ─────────────────────────────────────────────────────────────
import { CONTRACT_ADDRESS, isContractDeployed } from '../config.js';
import { lcdSmart, b64 } from './lcd.js';
import { normalizePending } from './tokenMeta.js';

export { isContractDeployed };
export const contractAddress = () => CONTRACT_ADDRESS;

function requireDeployed() {
  if (!isContractDeployed()) {
    throw new Error('Staking contract is not deployed yet — this action unlocks once its address is set in src/config.js.');
  }
}

const AUTO_FEE = 'auto';

// ── Queries (LCD reads, no wallet needed) ──
export async function queryConfig() {
  if (!isContractDeployed()) return null;
  return lcdSmart(CONTRACT_ADDRESS, { config: {} });
}
export async function queryCollections() {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { collections: {} });
  const list = Array.isArray(out) ? out : out?.collections || [];
  return list.map((c) => (typeof c === 'string' ? { cw721: c } : { cw721: c.cw721 || c.address || c.collection, ...c }));
}
export async function queryRewards(collection) {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { rewards: { collection } });
  return Array.isArray(out) ? out : out?.rewards || [];
}
export async function queryPendingRewards(owner, collection, tokenId) {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { pending_rewards: { owner, collection, token_id: tokenId } });
  return normalizePending(out);
}
export async function queryStakes(owner) {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { stakes: { owner } });
  const list = Array.isArray(out) ? out : out?.stakes || [];
  return list.map((s) => ({ ...s, pending: normalizePending(s.pending) }));
}
export async function queryPoolBalances() {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { pool_balances: {} });
  return Array.isArray(out) ? out : out?.pools || out?.balances || [];
}
export async function queryStakingPools() {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { staking_pools: {} });
  const list = Array.isArray(out) ? out : out?.pools || [];
  return list.map((p) => (typeof p === 'string'
    ? { staking_token: p, total_staked: '0' }
    : { staking_token: p.staking_token || p.token || p.address, total_staked: p.total_staked ?? '0', ...p }));
}
export async function queryPoolRewards(stakingToken) {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { pool_rewards: { staking_token: stakingToken } });
  return Array.isArray(out) ? out : out?.rewards || out?.pool_rewards || [];
}
export async function queryTokenStakes(owner) {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { token_stakes: { owner } });
  const list = Array.isArray(out) ? out : out?.positions || out?.stakes || [];
  return list.map((p) => ({ ...p, pending: normalizePending(p.pending) }));
}
export async function queryTokenPoolBalances() {
  if (!isContractDeployed()) return [];
  const out = await lcdSmart(CONTRACT_ADDRESS, { token_pool_balances: {} });
  return Array.isArray(out) ? out : out?.pools || out?.balances || [];
}

// ── Executes (signed by the connected wallet via Cosmos Kit) ──
async function exec(signingClient, sender, contract, msg, funds) {
  requireDeployed();
  if (!signingClient) throw new Error('Connect a wallet first.');
  return signingClient.execute(sender, contract, msg, AUTO_FEE, undefined, funds);
}

// ── NFT staking ──
export function payStakeFee(signingClient, sender, collection, tokenId, amountUluna) {
  return exec(signingClient, sender, CONTRACT_ADDRESS,
    { pay_stake_fee: { collection, token_id: tokenId } },
    [{ denom: 'uluna', amount: String(amountUluna) }]);
}

export function sendNftToStake(signingClient, sender, cw721, tokenId) {
  // Standard CW721 SendNft: transfers the NFT to the staking contract,
  // whose ReceiveNft hook records the stake. The collection is
  // identified by the CW721 sender, so the hook msg is empty ({}).
  return exec(signingClient, sender, cw721, {
    send_nft: { contract: CONTRACT_ADDRESS, token_id: tokenId, msg: b64({}) },
  });
}

/** Full stake flow: if a stake fee is set, PayStakeFee runs first
 *  (its own signed tx), then the CW721 SendNft. Returns the SendNft
 *  result (plus feeTx when a fee was paid). */
export async function stakeNft(signingClient, sender, cw721, tokenId) {
  const cfg = await queryConfig();
  const fee = cfg?.stake_fee_uluna ?? cfg?.stake_fee ?? '0';
  let feeTx = null;
  if (fee && String(fee) !== '0') {
    const r = await payStakeFee(signingClient, sender, cw721, tokenId, fee);
    feeTx = r.transactionHash;
  }
  const res = await sendNftToStake(signingClient, sender, cw721, tokenId);
  return { ...res, feeTx };
}

export function claim(signingClient, sender, collection, tokenId) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { claim: { collection, token_id: tokenId } });
}
export function claimAll(signingClient, sender) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { claim_all: {} });
}
export function unstake(signingClient, sender, collection, tokenId) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { unstake: { collection, token_id: tokenId } });
}

// ── Token cross-staking ──
export function stakeTokens(signingClient, sender, stakingToken, amountBaseUnits) {
  // CW20 Send of the staking token into the contract, hook {"stake":{}}.
  return exec(signingClient, sender, stakingToken, {
    send: { contract: CONTRACT_ADDRESS, amount: String(amountBaseUnits), msg: b64({ stake: {} }) },
  });
}
export function unstakeTokens(signingClient, sender, stakingToken, amountBaseUnits) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    unstake_tokens: { staking_token: stakingToken, amount: String(amountBaseUnits) },
  });
}
export function claimPool(signingClient, sender, stakingToken) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { claim_pool: { staking_token: stakingToken } });
}

// ── Funding (CW20 Send hooks) ──
export function fundCollectionReward(signingClient, sender, rewardToken, amountBaseUnits, collection) {
  // Hook binary is exactly {"collection":"<cw721>"} per the API spec.
  return exec(signingClient, sender, rewardToken, {
    send: { contract: CONTRACT_ADDRESS, amount: String(amountBaseUnits), msg: b64({ collection }) },
  });
}
export function fundPoolReward(signingClient, sender, rewardToken, amountBaseUnits, stakingToken) {
  // Hook binary is exactly {"staking_pool":"<staking token>"} per the API spec.
  return exec(signingClient, sender, rewardToken, {
    send: { contract: CONTRACT_ADDRESS, amount: String(amountBaseUnits), msg: b64({ staking_pool: stakingToken }) },
  });
}

// ── Admin: collections ──
export function adminRegisterCollection(signingClient, sender, cw721) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { register_collection: { cw721 } });
}
export function adminRemoveCollection(signingClient, sender, collection) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { remove_collection: { collection } });
}
export function adminPauseCollection(signingClient, sender, collection) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { pause_collection: { collection } });
}
export function adminUnpauseCollection(signingClient, sender, collection) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { unpause_collection: { collection } });
}

// ── Admin: NFT rewards (ANY token) ──
export function adminAddReward(signingClient, sender, collection, rewardToken) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { add_reward: { collection, reward_token: rewardToken } });
}
export function adminSetRewardRate(signingClient, sender, collection, rewardToken, rateBaseUnitsPerDay) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    set_reward_rate: { collection, reward_token: rewardToken, rate_per_nft_per_day: String(rateBaseUnitsPerDay) },
  });
}
export function adminPauseReward(signingClient, sender, collection, rewardToken, paused) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    pause_reward: { collection, reward_token: rewardToken, paused: Boolean(paused) },
  });
}

// ── Admin: token staking pools (ANY token) ──
export function adminRegisterStakingPool(signingClient, sender, stakingToken) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { register_staking_pool: { staking_token: stakingToken } });
}
export function adminPauseStakingPool(signingClient, sender, stakingToken, paused) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    pause_staking_pool: { staking_token: stakingToken, paused: Boolean(paused) },
  });
}
export function adminAddPoolReward(signingClient, sender, stakingToken, rewardToken) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    add_pool_reward: { staking_token: stakingToken, reward_token: rewardToken },
  });
}
export function adminSetPoolRewardRate(signingClient, sender, stakingToken, rewardToken, rateBaseUnitsPerDay) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    set_pool_reward_rate: { staking_token: stakingToken, reward_token: rewardToken, rate_per_token_per_day: String(rateBaseUnitsPerDay) },
  });
}
export function adminPausePoolReward(signingClient, sender, stakingToken, rewardToken, paused) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    pause_pool_reward: { staking_token: stakingToken, reward_token: rewardToken, paused: Boolean(paused) },
  });
}

// ── Admin: settings / withdrawals / global pause ──
export function adminSetStakeFee(signingClient, sender, amountUluna) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { set_stake_fee: { amount_uluna: String(amountUluna) } });
}
export function adminSetLockPeriodSeconds(signingClient, sender, seconds) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { set_lock_period_seconds: { seconds: Number(seconds) } });
}
export function adminWithdrawUnspent(signingClient, sender, collection, rewardToken, amount, to) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    withdraw_unspent: { collection, reward_token: rewardToken, amount: String(amount), to },
  });
}
export function adminWithdrawPoolUnspent(signingClient, sender, stakingToken, rewardToken, amount, to) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    withdraw_pool_unspent: { staking_token: stakingToken, reward_token: rewardToken, amount: String(amount), to },
  });
}
export function adminWithdrawStakeFees(signingClient, sender, amountUluna, to) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, {
    withdraw_stake_fees: { amount: String(amountUluna), to },
  });
}
export function adminPauseAll(signingClient, sender) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { pause_all: {} });
}
export function adminUnpause(signingClient, sender) {
  return exec(signingClient, sender, CONTRACT_ADDRESS, { unpause: {} });
}

// ── Admin transfer (2 steps, same pattern as the base app) ──
export function adminTransferAdmin(signingClient, sender, newAdmin) {
  // Step 1: the contract's own admin (controls everything in this app).
  return exec(signingClient, sender, CONTRACT_ADDRESS, { transfer_admin: { new_admin: newAdmin } });
}
export function chainUpdateAdmin(signingClient, sender, newAdmin) {
  // Step 2: chain-level contract admin (migration / upgrade rights) —
  // MsgUpdateAdmin, kept in sync so a transfer hands over FULL control.
  requireDeployed();
  if (!signingClient) throw new Error('Connect a wallet first.');
  return signingClient.updateAdmin(sender, CONTRACT_ADDRESS, newAdmin, AUTO_FEE);
}
