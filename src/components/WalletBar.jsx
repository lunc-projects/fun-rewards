import { shortAddr } from '../lib/format.js';

export default function WalletBar({ chain }) {
  const { address, status } = chain;
  const connected = status === 'Connected' && address;
  return (
    <div className="walletbar">
      {connected ? (
        <>
          <span className="addr" title={address}>🦊 {shortAddr(address)}</span>
          <button className="btn ghost" onClick={() => chain.disconnect()}>Disconnect</button>
        </>
      ) : (
        <button className="btn primary" onClick={() => chain.connect()}>Connect Wallet</button>
      )}
    </div>
  );
}
