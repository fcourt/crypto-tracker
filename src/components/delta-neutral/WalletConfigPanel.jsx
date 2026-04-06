import { useState } from 'react';
import { enableAgentDexAbstraction } from '../../hooks/usePlaceOrder';

export default function WalletConfigPanel({
  hlAddress, onHlChange,
  hlVaultAddress, onVaultChange,  // ← hlVaultAddress est maintenant une prop
  extApiKey, onExtChange,
}) {
  const [open, setOpen] = useState(!hlAddress && !extApiKey);

  const [hlAgentPk,      setHlAgentPk]      = useState(() => localStorage.getItem('hl_agent_pk')      || '');
  //const [hlVaultAddress, setHlVaultAddress]  = useState(() => localStorage.getItem('hl_vault_address') || '');
  const [extStarkPk,     setExtStarkPk]      = useState(() => localStorage.getItem('ext_stark_pk')     || '');
  const [extL2Vault,     setExtL2Vault]      = useState(() => localStorage.getItem('ext_l2_vault')     || '');

  const [dexStatus, setDexStatus] = useState('');  // ← à ajouter avec les autres useState

  const saveHlAgentPk = v => {
    setHlAgentPk(v);
    localStorage.setItem('hl_agent_pk', v);
  };
  //const saveHlVaultAddress = v => {
  //  setHlVaultAddress(v);
  //  localStorage.setItem('hl_vault_address', v);
  //  onVaultChange?.(v);
  //};
  const saveExtStarkPk = v => {
    setExtStarkPk(v);
    localStorage.setItem('ext_stark_pk', v);
  };
  const saveExtL2Vault = v => {
    setExtL2Vault(v);
    localStorage.setItem('ext_l2_vault', v);
  };

  const canTradeHL  = !!hlAgentPk;
  const canTradeExt = !!extStarkPk && !!extL2Vault;

  const hlFields = [
    { label: 'Adresse compte principal', val: hlAddress,      setter: onHlChange,    type: 'text',     hint: 'Lecture positions & marge' },
    { label: 'Clé privée Agent Wallet',  val: hlAgentPk,      setter: saveHlAgentPk, type: 'password', hint: '⚠️ Une seule fois à la création — ne peut que trader' },
    { label: 'Adresse sous-compte',      val: hlVaultAddress, setter: onVaultChange, type: 'text',     hint: 'Optionnel — laisser vide pour compte principal' },
    //                                       ↑ prop          ↑ callback parent direct
  ];
  const extFields = [
    { label: 'Clé API (lecture)',     val: extApiKey,  setter: onExtChange,    type: 'password', hint: 'Marge, positions, funding rates' },
    { label: 'Stark Private Key',     val: extStarkPk, setter: saveExtStarkPk, type: 'password', hint: '⚠️ Une seule fois à la création — ne peut que trader' },
    { label: 'l2Vault (ID position)', val: extL2Vault, setter: saveExtL2Vault, type: 'text',     hint: 'Extended › Account › API Management' },
  ];

  const handleReset = () => {
  if (!confirm('Effacer toutes les clés sauvegardées ?')) return;
  ['hl_address','hl_agent_pk','hl_vault_address','ext_stark_pk','ext_l2_vault','extended_api_keys','ext_api_key']
    .forEach(k => localStorage.removeItem(k));
  onHlChange('');
  onVaultChange('');    // ← callback parent (plus setHlVaultAddress local)
  onExtChange('');
  saveHlAgentPk('');
  saveExtStarkPk('');
  saveExtL2Vault('');
};

const handleEnableDex = async () => {
  const agentPk = localStorage.getItem('hl_agent_pk');
  if (!agentPk) { setDexStatus('error'); return; }
  try {
    setDexStatus('loading');
    await enableAgentDexAbstraction(agentPk);
    setDexStatus('ok');
  } catch (e) {
    console.error(e);
    setDexStatus('error');
  }
};
  
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <span className="font-semibold flex items-center gap-2 flex-wrap">
          🔑 Wallets &amp; API Keys
          {hlAddress   ? <span className="text-green-400">● HL connecté</span>   : <span className="text-red-400">● HL non configuré</span>}
          {canTradeHL  ? <span className="text-green-400">● HL trading ✓</span>  : <span className="text-yellow-500">● HL trading ⚠</span>}
          {extApiKey   ? <span className="text-green-400">● EXT connecté</span>  : <span className="text-yellow-500">● EXT non configuré</span>}
          {canTradeExt ? <span className="text-green-400">● EXT trading ✓</span> : <span className="text-yellow-500">● EXT trading ⚠</span>}
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-5 border-t border-gray-700/60">

          {/* Hyperliquid */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-blue-400 border-b border-gray-700 pb-1">
              Hyperliquid / trade.xyz / HyENA
            </p>
            {hlFields.map(({ label, val, setter, type, hint }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{label}</label>
                <div className="flex gap-2">
                  <input
                    type={type} value={val}
                    onChange={e => setter(e.target.value)}
                    placeholder="0x..."
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  {val && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
                </div>
                <p className="text-gray-600 text-xs">{hint}</p>
              </div>
            ))}
          </div>
          
            <button
              onClick={handleEnableDex}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors"
              >
              ⚡ Activer HIP-3 (xyz / hyna) sur cet agent
            </button>
          
          {/* ← AJOUTER CES 3 LIGNES */}
          {dexStatus === 'ok'      && <p className="text-xs text-green-400 text-center">✓ HIP-3 activé pour cet agent</p>}
          {dexStatus === 'error'   && <p className="text-xs text-red-400 text-center">✗ Erreur — vérifier la clé agent HL</p>}
          {dexStatus === 'loading' && <p className="text-xs text-gray-400 text-center">Activation en cours…</p>}
          
          {/* Extended */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-purple-400 border-b border-gray-700 pb-1">
              Extended Exchange
            </p>
            {extFields.map(({ label, val, setter, type, hint }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{label}</label>
                <div className="flex gap-2">
                  <input
                    type={type} value={val}
                    onChange={e => setter(e.target.value)}
                    placeholder="..."
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  {val && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
                </div>
                <p className="text-gray-600 text-xs">{hint}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-700 pt-3">
            <button
              onClick={handleReset}
              className="w-full bg-red-900/30 hover:bg-red-800/50 border border-red-700 text-red-400 text-xs font-medium py-2 rounded-lg transition-colors"
            >
              🗑️ Effacer toutes les clés
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
