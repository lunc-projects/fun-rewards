import { useEffect, useState } from 'react';
import { DEPLOY_PRESET, isContractDeployed } from '../config.js';
import { useWalletCtx } from './hooks.js';
import { isValidTerraAddress, shortAddr } from '../lib/format.js';

const LS_CODE = 'fun_deploy_code_id';
const LS_STORE_TX = 'fun_deploy_store_tx';
const LS_CONTRACT = 'fun_deploy_contract';
const LS_INST_TX = 'fun_deploy_inst_tx';
const LS_ADMIN = 'fun_deploy_admin';

const HASH_IS_PLACEHOLDER = !/^[0-9a-f]{64}$/.test(DEPLOY_PRESET.wasmSha256 || '');

async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function CopyBtn({ value }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn ghost sm" onClick={async () => {
      try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard unavailable */ }
    }}>{done ? 'Copied ✓' : 'Copy'}</button>
  );
}

export default function DeployWizard() {
  const { address, getSigningClient } = useWalletCtx();
  const deployed = isContractDeployed();

  const [adminInput, setAdminInput] = useState(() => localStorage.getItem(LS_ADMIN) || '');
  const [wasmState, setWasmState] = useState({ status: 'loading', hash: null, bytes: null });
  const [codeId, setCodeId] = useState(() => localStorage.getItem(LS_CODE) || '');
  const [storeTx, setStoreTx] = useState(() => localStorage.getItem(LS_STORE_TX) || '');
  const [contract, setContract] = useState(() => localStorage.getItem(LS_CONTRACT) || '');
  const [instTx, setInstTx] = useState(() => localStorage.getItem(LS_INST_TX) || '');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(null);

  const admin = adminInput.trim();
  const adminValid = isValidTerraAddress(admin);

  // Fetch the wasm from the app's own assets and verify its sha256 in-browser.
  useEffect(() => {
    let live = true;
    (async () => {
      if (HASH_IS_PLACEHOLDER) {
        if (live) setWasmState({ status: 'placeholder', hash: null, bytes: null });
        return;
      }
      try {
        const res = await fetch(DEPLOY_PRESET.wasmPath);
        if (!res.ok) throw new Error(`wasm fetch failed (${res.status})`);
        const buf = await res.arrayBuffer();
        const hash = await sha256Hex(buf);
        if (live) setWasmState({ status: hash === DEPLOY_PRESET.wasmSha256 ? 'ok' : 'mismatch', hash, bytes: new Uint8Array(buf) });
      } catch (e) {
        if (live) setWasmState({ status: 'error', hash: null, bytes: null, message: e.message });
      }
    })();
    return () => { live = false; };
  }, []);

  function persist(setter, key, value) {
    setter(value);
    if (value) localStorage.setItem(key, value); else localStorage.removeItem(key);
  }

  async function onStore() {
    setErr(null); setBusy('store');
    try {
      if (!address) throw new Error('Connect a wallet first — any funded LUNC wallet can deploy.');
      if (wasmState.status !== 'ok' || !wasmState.bytes) throw new Error('The contract file has not loaded and verified yet.');
      const client = await getSigningClient();
      if (!client.storeCode) throw new Error('This wallet connection cannot store code.');
      const res = await client.storeCode(address, wasmState.bytes, 'auto');
      persist(setCodeId, LS_CODE, String(res.codeId));
      persist(setStoreTx, LS_STORE_TX, res.transactionHash);
    } catch (e) { setErr(`Step 1 didn't go through: ${e.message}`); }
    setBusy('');
  }

  async function onInstantiate() {
    setErr(null); setBusy('inst');
    try {
      if (!address) throw new Error('Connect a wallet first.');
      if (!codeId) throw new Error('Step 1 (Store Code) has to finish first.');
      if (!adminValid) throw new Error('Enter the admin wallet address first — it cannot be changed by the deployer afterwards (only by the admin, via Transfer Admin).');
      const client = await getSigningClient();
      if (!client.instantiate) throw new Error('This wallet connection cannot instantiate contracts.');
      const msg = { admin, fun_address: DEPLOY_PRESET.fun_address };
      const res = await client.instantiate(address, Number(codeId), msg, DEPLOY_PRESET.label, 'auto', { admin });
      persist(setContract, LS_CONTRACT, res.contractAddress);
      persist(setInstTx, LS_INST_TX, res.transactionHash);
    } catch (e) { setErr(`Step 2 didn't go through: ${e.message}`); }
    setBusy('');
  }

  function resetAll() {
    persist(setCodeId, LS_CODE, ''); persist(setStoreTx, LS_STORE_TX, '');
    persist(setContract, LS_CONTRACT, ''); persist(setInstTx, LS_INST_TX, '');
    setErr(null);
  }

  if (deployed) {
    return (<section><h2>Deploy</h2><div className="empty"><p className="big">✅ Already deployed</p><p>The cross-staking contract is live and set in the app config — this one-time wizard is done.</p></div></section>);
  }

  return (
    <section>
      <h2>🚀 Deploy — one-time setup</h2>
      <div className="card wide">
        <p className="big"><strong>Whoever signs and pays for this upload is only the deployer.</strong></p>
        <p>Contract admin and control belong to the <strong>admin wallet you enter below</strong>, who logs in with that wallet afterwards. The deployer gets <strong>no</strong> privileges from deploying — you're just putting the code on-chain.</p>
        <p>💰 The deploying wallet needs <strong>LUNC available for gas</strong> (your wallet simulates and shows the real fee before you sign). Signing happens only in your wallet app/extension — <strong>never enter a seed phrase anywhere in this app.</strong></p>
        <p>⏰ Both steps must be finished <strong>before {DEPLOY_PRESET.deadlineText}</strong> — after that, uploading new contract code on Terra Classic requires a chain governance proposal.</p>
        {!address && <p className="notice">Connect a wallet (top of the page) to begin.</p>}
        <div className="form">
          <label>Admin wallet (will own the contract — collections, pools, rewards, everything)
            <input value={adminInput} onChange={(e) => persist(setAdminInput, LS_ADMIN, e.target.value)} placeholder="terra1… (no default — enter the admin's public address)" />
          </label>
          {adminInput && !adminValid && <p className="notice err">That doesn't look like a complete, valid terra1… address yet.</p>}
          {adminValid && <p className="notice">Admin will be: {admin}</p>}
        </div>
      </div>

      <div className="card wide">
        <h3>Contract file — served by this app</h3>
        <p className="addr-sm">fun_rewards.wasm</p>
        <p className="addr-sm">sha256 (expected): {DEPLOY_PRESET.wasmSha256}</p>
        <p>{wasmState.status === 'loading' && 'Loading and verifying the contract file…'}
          {wasmState.status === 'placeholder' && <>⚠️ <strong>The expected wasm sha256 is not set yet</strong> (see <span className="addr-sm">DEPLOY_PRESET.wasmSha256</span> in src/config.js — it must be filled in from the built fun_rewards.wasm, and the wasm placed at public/fun_rewards.wasm). Store Code stays locked until the hash is set and verifies in your browser.</>}
          {wasmState.status === 'ok' && <>✅ Verified in your browser — the file's actual sha256 matches: <span className="addr-sm">{wasmState.hash}</span></>}
          {wasmState.status === 'mismatch' && <>⛔ Mismatch — actual sha256 is <span className="addr-sm">{wasmState.hash}</span>. Do NOT deploy; the app copy of the contract is wrong.</>}
          {wasmState.status === 'error' && <>⚠️ Couldn't load the contract file from this app ({wasmState.message}). Reload the page and try again — deploying stays locked until it verifies.</>}</p>
        <h3>Preset settings</h3>
        <p className="addr-sm">FUN: {DEPLOY_PRESET.fun_address}</p>
        <p className="addr-sm">Admin: {adminValid ? admin : '(enter the admin wallet above)'}</p>
        <p className="addr-sm">Label: {DEPLOY_PRESET.label} · Chain admin on the contract will also be set to the admin entered above</p>
      </div>

      {err && <p className="notice err">{err}</p>}

      <div className="card wide">
        <h3>Step 1 — Store Code</h3>
        {codeId ? (
          <><p>✅ Code stored. <strong>code_id: {codeId}</strong> <CopyBtn value={codeId} /></p>
            <p className="addr-sm">tx: {storeTx} {storeTx && <CopyBtn value={storeTx} />}</p></>
        ) : (
          <button className="btn primary" disabled={!address || wasmState.status !== 'ok' || busy === 'store'} onClick={onStore}>
            {busy === 'store' ? 'Storing code — approve in your wallet…' : HASH_IS_PLACEHOLDER ? 'Store Code — waiting for the wasm hash to be set' : 'Store Code'}
          </button>
        )}
      </div>

      <div className="card wide">
        <h3>Step 2 — Instantiate</h3>
        {contract ? (
          <><p>✅ Contract created. <strong>{contract}</strong> <CopyBtn value={contract} /></p>
            <p className="addr-sm">tx: {instTx} {instTx && <CopyBtn value={instTx} />}</p></>
        ) : (
          <button className="btn primary" disabled={!address || !codeId || !adminValid || busy === 'inst'} onClick={onInstantiate}>
            {busy === 'inst' ? 'Instantiating — approve in your wallet…' : codeId ? (adminValid ? 'Instantiate Contract' : 'Instantiate — enter the admin wallet above first') : 'Instantiate — finish Step 1 first'}
          </button>
        )}
        {(codeId || contract) && <p><button className="btn ghost sm" onClick={resetAll}>Start over (clears saved progress)</button></p>}
      </div>

      {contract && (
        <div className="card wide success">
          <h3>🎉 Deployment complete</h3>
          <p><strong>Send the code_id and contract address back</strong> so the app config can be finalized:</p>
          <p>code_id: <strong>{codeId}</strong> <CopyBtn value={codeId} /></p>
          <p>contract: <strong>{contract}</strong> <CopyBtn value={contract} /></p>
          <p className="muted">Deployer's job is done — {shortAddr(admin)} just logs into the app with the admin wallet from here.</p>
        </div>
      )}
    </section>
  );
}
