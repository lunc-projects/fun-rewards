import { useMemo, useState } from 'react';
import { useChain } from '@cosmos-kit/react';
import { CHAIN_NAME, isContractDeployed, CONTRACT_ADDRESS } from './config.js';
import { useCollections, WalletCtx } from './components/hooks.js';
import WalletBar from './components/WalletBar.jsx';
import TokenCards from './components/TokenCards.jsx';
import DeployWizard from './components/DeployWizard.jsx';
import CollectionsSection from './components/CollectionsSection.jsx';
import StakeNFTsSection from './components/StakeNFTsSection.jsx';
import CrossStakeSection from './components/CrossStakeSection.jsx';
import RewardsSection from './components/RewardsSection.jsx';
import AdminSection from './components/AdminSection.jsx';
import { shortAddr } from './lib/format.js';

const BASE_TABS = [
  { id: 'collections', label: 'Collections' },
  { id: 'stake', label: 'Stake NFTs' },
  { id: 'cross', label: 'Cross Stake Tokens' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'admin', label: 'Admin' },
];

export default function App() {
  const chain = useChain(CHAIN_NAME);
  const notDeployed = !isContractDeployed();
  const TABS = notDeployed ? [{ id: 'deploy', label: '🚀 Deploy' }, ...BASE_TABS] : BASE_TABS;
  const [tab, setTab] = useState(notDeployed ? 'deploy' : 'collections');
  const collections = useCollections();

  const walletValue = useMemo(() => ({
    address: chain.address || null,
    getSigningClient: async () => {
      if (!chain.getSigningCosmWasmClient) throw new Error('Connect a wallet first.');
      return chain.getSigningCosmWasmClient();
    },
  }), [chain]);

  return (
    <WalletCtx.Provider value={walletValue}>
      <div className="app">
        <header className="hero">
          <div className="herotext solo">
            <h1>🎉 FUN Cross Staking</h1>
            <p className="tagline">Stake NFTs to earn <strong>FUN</strong>. Stake FUN — or any token — to earn <strong>any token</strong>.<br />Cross staking on Terra Classic.</p>
            <WalletBar chain={chain} />
          </div>
        </header>

        {notDeployed ? (
          <div className="banner">⏳ The cross-staking contract isn't deployed yet — <button className="linkbtn" onClick={() => setTab('deploy')}>open the one-time Deploy wizard</button> to put it on-chain, or browse everything below. Staking, claiming, and admin unlock the moment it goes live.</div>
        ) : (
          <div className="banner ok">✅ Cross-staking contract live: {shortAddr(CONTRACT_ADDRESS)}</div>
        )}

        <TokenCards />

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>

        <main>
          {tab === 'deploy' && <DeployWizard />}
          {tab === 'collections' && <CollectionsSection collections={collections} />}
          {tab === 'stake' && <StakeNFTsSection collections={collections} />}
          {tab === 'cross' && <CrossStakeSection />}
          {tab === 'rewards' && <RewardsSection />}
          {tab === 'admin' && <AdminSection collections={collections} />}
        </main>

        <footer>
          <p>FUN Cross Staking · Terra Classic (columbus-5) · NFT collections (Miata / Garuda) and token pools are registered by the admin — rewards can be any CW20.</p>
        </footer>
      </div>
    </WalletCtx.Provider>
  );
}
