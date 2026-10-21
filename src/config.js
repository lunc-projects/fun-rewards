// ─────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the FUN Cross Staking app.
// Post-deploy wiring is a one-file change: set CONTRACT_ADDRESS
// (and DEPLOY_PRESET.wasmSha256 once fun_rewards.wasm is built).
// ─────────────────────────────────────────────────────────────

export const CHAIN_ID = 'columbus-5';
export const CHAIN_NAME = 'terraclassic'; // Cosmos Kit lookup key (see chainDef.js)
export const LCD_URL = 'https://terra-classic-lcd.publicnode.com';
export const RPC_URL = 'https://terra-classic-rpc.publicnode.com';

// FUN — the home token of this app (verified live on-chain).
export const FUN = {
  symbol: 'FUN',
  name: 'FUNTOKEN',
  address: 'terra1le9l8gpwl2f48xluphnwkqrnhwxqt27xhducfzqvncmsh9swavlqjpy7c9',
  decimals: 6,
};

// Cross staking is open: ANY CW20 can be a staking token or a reward
// token. FUN is pre-known; every other token's symbol/decimals are
// resolved on-chain from its token_info query (see lib/tokenMeta.js).
export const KNOWN_TOKENS = [FUN];

// Cross-staking contract — empty string until it is deployed.
// Every contract read/write in the app checks this and degrades
// gracefully (browse-only mode) while it is empty.
export const CONTRACT_ADDRESS = 'terra1gdrf4s4qlea8cpwnsrhwr50c6tew55mrad65fu9txd24q9nelyys52580s';

// No admin is known yet. The admin address is entered in the Deploy
// Wizard at instantiate time — it is NEVER hardcoded here.
export const ADMIN_PLACEHOLDER = '';

// NFT collections registered in the app as a static fallback.
// Empty until the first collection is created and registered by
// the admin. Once the contract is live, collections are read
// on-chain via the Collections{} query and merged with this list.
// Entries: { cw721: 'terra1…', name?: string }
export const COLLECTIONS = [];

export const isContractDeployed = () => Boolean(CONTRACT_ADDRESS);

// ── One-time Deploy Wizard preset ──
// fun_address is locked to the verified FUN CW20. The admin comes
// from an input field in the wizard (default empty) — whoever signs
// / pays in the wizard is only the deployer; contract admin and
// control belong to the wallet entered as admin.
export const DEPLOY_PRESET = {
  fun_address: FUN.address,
  label: 'FUN Cross Staking',
  wasmPath: './fun_rewards.wasm',
  // sha256 of fun_rewards.wasm (526,353 bytes, built + tested
  // 2026-10-21, 13/13 tests) — wasm file ships at public/fun_rewards.wasm
  // and the wizard verifies it in-browser before Store Code unlocks.
  wasmSha256: 'dd90c5a732278fb53a4ea7b74e15cda2544be72550d87680a734d13ade1b619a',
  deadlineText: 'Mon Oct 26, 6:52 PM ET',
};
