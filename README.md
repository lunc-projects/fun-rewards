# FUN Cross Staking — Frontend App

Standalone React/Vite dApp for the **FUN cross-staking** contract on
Terra Classic (columbus-5). Cloned-adapted from the proven
PIZZAB × ROTTI rewards app; **no PIZZAB / ROTTI / COFFEE / FRG tokens
or branding** — FUN is the home token, and cross staking means any
other token can join as a staking token or a reward.

- Home token: **FUN** — `terra1le9l8gpwl2f48xluphnwkqrnhwxqt27xhducfzqvncmsh9swavlqjpy7c9` (FUNTOKEN, 6 decimals, verified live)
- Wallets: Keplr + Station via Cosmos Kit (same as the base app)
- Reads: plain-fetch LCD queries against
  `https://terra-classic-lcd.publicnode.com`
  (`/cosmwasm/wasm/v1/contract/<addr>/smart/<base64>`)

## Status — CONTRACT LIVE on-chain ✅ (site publish pending GitHub repo)

- **Contract: `terra1gdrf4s4qlea8cpwnsrhwr50c6tew55mrad65fu9txd24q9nelyys52580s`**
  (code_id **11738**) — verified live on-chain 2026-10-21: config
  admin `terra1k4egh0fd7mlpllw73q040pcd9lj8we6m9d4lgw`, FUN address
  correct, stake fee 0, lock 0, unpaused. Full record in
  `~/workspace/fun-rewards/deployed.json`. Deployed well ahead of the
  proposal 12234 code-upload deadline (Oct 26, 6:52 PM ET).
- The contract address is wired into `src/config.js`
  (`CONTRACT_ADDRESS`), so the app no longer defaults to the Deploy
  Wizard — it opens on Collections, and staking / claiming / admin
  are live. The wizard remains in the code as a fallback only.
- **Site URL (target): https://lunc-projects.github.io/fun-rewards/**
  — repo `github.com/lunc-projects/fun-rewards` (source on `main`,
  built site on `gh-pages`, same layout as pizzab-rotti-rewards).
  ⚠️ Publish is **blocked on GitHub repo creation**: this VM's SSH
  keys are repo-scoped deploy keys (pizzab key = pizzab repo only,
  frg key = frg repo only) and `gh` is not logged in, so the VM
  cannot create the repo or push to it. Unblock = create the empty
  public repo `lunc-projects/fun-rewards` and add the VM's dedicated
  key `~/.ssh/fun_github_deploy.pub` ("muse-vm-push fun-rewards",
  fingerprint `SHA256:3/U3O+drwXcuW5HTwQwGet2r9A5l9vpxCChLqjnEkAg`)
  as a deploy key **with write access**, then push `main` +
  `gh-pages` from the ready local repos in `app/` and `../ghpages/`
  and enable Pages (source: `gh-pages` branch) if it doesn't
  auto-enable.
- No collections or staking pools exist yet — empty states in the
  app are correct. Registering them, adding rewards, setting rates,
  and funding pools are the admin's in-app steps; no rates were
  ever supplied or invented here.

## Sections

- **🚀 Deploy** — one-time wizard, the default view while
  `CONTRACT_ADDRESS` is empty (see below)
- **Collections** — registered NFT collections with their (any-token)
  reward badges: rate / NFT / day per reward token
- **Stake NFTs** — my NFTs by collection (CW721 `tokens{owner}`
  enumeration, same approach as the base app), stake / claim /
  unstake per NFT, pending rewards per NFT. If a stake fee is set,
  staking runs `PayStakeFee` as its own tx first, then the SendNft.
- **Cross Stake Tokens** — every registered staking pool: total
  staked, pool rewards (rate per token per day, pool balance),
  stake FUN (or any pool token), my position + pending, claim,
  unstake by amount
- **Rewards** — all my pending rewards aggregated by token across
  NFT stakes **and** token positions, Claim All (NFT stakes) +
  claim per NFT + claim per pool
- **Admin** — single-wallet admin only (no governance anywhere):
  register / pause / resume / remove collections; register /
  pause / resume staking pools; add **any CW20** as a reward to a
  collection or a pool, set rates, pause rewards, fund pools;
  set stake fee, set lock period, Pause All / Unpause; withdraw
  unspent (NFT pool + token pool) and collected stake fees;
  **Transfer Admin** card (2 signed steps — contract `TransferAdmin`
  then chain `MsgUpdateAdmin` — with a retry button if step 2 fails)

Pending rewards are always handled as a **generic list**
`[{reward_token, amount}]` — never fixed token fields. Every
token's symbol / decimals are resolved live from its CW20
`token_info` (cached in `src/lib/tokenMeta.js`); FUN is pre-known.

## Config — `src/config.js` is the only wiring file

| Constant | Value |
|---|---|
| `CONTRACT_ADDRESS` | `terra1gdrf4s4qlea8cpwnsrhwr50c6tew55mrad65fu9txd24q9nelyys52580s` (live, code_id 11738) |
| `DEPLOY_PRESET.wasmSha256` | `dd90c5a732278fb53a4ea7b74e15cda2544be72550d87680a734d13ade1b619a` (real hash, wasm in `public/`) |
| `ADMIN_PLACEHOLDER` | `''` — stays empty; admin is read from the contract's on-chain Config |
| `COLLECTIONS` | `[]` | optional static fallback; on-chain registry wins |

## Deploy Wizard (how it works)

Shown by default while `CONTRACT_ADDRESS` is empty:

1. **Admin input** — a plain input field, default **empty**. No
   admin is known or hardcoded; whoever deploys enters the admin's
   public address. The deployer/signer gets no privileges.
2. **Step 1 — Store Code.** The wizard fetches
   `public/fun_rewards.wasm` from the app's own assets and verifies
   its sha256 in the browser against `DEPLOY_PRESET.wasmSha256`
   before Store Code can be clicked. While the hash is still the
   placeholder, the wizard says so and **Store Code stays locked**.
   To arm it: put the real hash in `src/config.js` and copy the
   wasm to `public/fun_rewards.wasm`, then rebuild.
3. **Step 2 — Instantiate** with
   `{ admin: <entered admin>, fun_address: <verified FUN address> }`
   and the chain admin set to the same entered admin.

Progress (code_id, contract, txs, admin) is kept in localStorage
so an interrupted deploy can be resumed.

## Contract interface

All contract interaction is isolated in **`src/lib/stakingClient.js`**
— components never call the contract directly. Coded exactly to the
agreed API:

- Queries: `Config`, `Collections`, `Rewards{collection}`,
  `PendingRewards{owner,collection,token_id}`, `Stakes{owner}`,
  `PoolBalances`, `StakingPools`, `PoolRewards{staking_token}`,
  `TokenStakes{owner}`, `TokenPoolBalances`
- NFT stake: CW721 `SendNft` to the contract (hook msg `{}`;
  `PayStakeFee{collection,token_id}` with the exact uluna fee first
  when a fee is set)
- Token stake: CW20 `Send` of the staking token, hook `{"stake":{}}`
- Fund an NFT reward: CW20 `Send`, hook `{"collection":"<cw721>"}`
- Fund a pool reward: CW20 `Send`, hook `{"staking_pool":"<staking token>"}`
- Executes/admin: as listed in the header comment of
  `src/lib/stakingClient.js`

### Assumptions made (flagged for the contract report)

- `PausePoolReward` takes `{staking_token, reward_token, paused}`
  (mirrors `PauseReward`'s shape); the spec named the message
  without listing its fields.
- `RemoveCollection` takes `{collection}`; `PauseCollection` /
  `UnpauseCollection` take `{collection}`.
- Response wrappers are normalised flexibly (`{pools:[…]}` /
  `{positions:[…]}` / bare arrays), and pending inside stakes /
  positions is read from a `pending` list field.
- Pool reward rates entered in the UI are converted with the
  **reward token's** decimals (rate = reward per 1 whole staking
  token per day).
- NFT `SendNft` hook binary is `{}` — the spec doesn't define NFT
  hook contents (the collection is identified by the CW721 sender,
  as in the base app's contract).

## Run it

```bash
npm install
npm run dev       # dev server
npm run build     # production build → dist/
npm run preview   # serve the production build locally
```

## What remains

1. ~~Contract build + wasm hash + deploy~~ — done; contract is live
   (see Status above) and `CONTRACT_ADDRESS` is wired in.
2. Publish: create repo `lunc-projects/fun-rewards` + add the VM's
   dedicated deploy key (see Status), then push `main` (this folder)
   and `gh-pages` (`../ghpages/`) and confirm Pages serves
   https://lunc-projects.github.io/fun-rewards/ .
3. Admin then registers the first staking pool / collection and
   adds rewards + rates in-app (rates are never invented here).
