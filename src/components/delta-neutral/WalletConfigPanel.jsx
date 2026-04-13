import { useState } from 'react';
import { enableAgentDexAbstraction } from '../../hooks/usePlaceOrder';

export default function WalletConfigPanel({
  hlAddress, onHlChange,
  hlVaultAddress, onVaultChange,
  extApiKey, onExtChange,
  nadoAddress, onNadoAddressChange,       // ← nouvelles props
  nadoAgentPk, onNadoAgentPkChange,
  nadoSubaccount, onNadoSubaccountChange,
}) {
  const [open, setOpen] = useState(!hlAddress && !extApiKey && !nadoAddress);

  const [hlAgentPk,  setHlAgentPk]  = useState(() => localStorage.getItem('hl_agent_pk')  || '');
  const [extStarkPk, setExtStarkPk] = useState(() => localStorage.getItem('ext_stark_pk') || '');
  const [extL2Vault, setExtL2Vault] = useState(() => localStorage.getItem('ext_l2_vault') || '');

  const [dexStatus, setDexStatus] = useState('');

  const saveHlAgentPk = v => { setHlAgentPk(v);  localStorage.setItem('hl_agent_pk',  v); };
  const saveExtStarkPk = v => { setExtStarkPk(v); localStorage.setItem('ext_stark_pk', v); };
  const saveExtL2Vault = v => { setExtL2Vault(v); localStorage.setItem('ext_l2_vault', v); };

  const saveNadoAddress    = v => { onNadoAddressChange?.(v);    localStorage.setItem('nado_address',    v); };
  const saveNadoAgentPk    = v => { onNadoAgentPkChange?.(v);    localStorage.setItem('nado_agent_pk',   v); };
  const saveNadoSubaccount = v => { onNadoSubaccountChange?.(v); localStorage.setItem('nado_subaccount', v); };

  const canTradeHL   = !!hlAgentPk;
  const canTradeExt  = !!extStarkPk && !!extL2Vault;
  const canTradeNado = !!nadoAddress && !!nadoAgentPk;

  const hlFields = [
    { label: 'Adresse compte principal', val: hlAddress,      setter: onHlChange,    type: 'text',     hint: 'Lecture positions & marge' },
    { label: 'Clé privée Agent Wallet',  val: hlAgentPk,      setter: saveHlAgentPk, type: 'password', hint: '⚠️ Une seule fois à la création — ne peut que trader' },
    { label: 'Adresse sous-compte',      val: hlVaultAddress, setter: onVaultChange, type: 'text',     hint: 'Optionnel — laisser vide pour compte principal' },
  ];

  const extFields = [
    { label: 'Clé API (lecture)',     val: extApiKey,  setter: onExtChange,    type: 'password', hint: 'Marge, positions, funding rates' },
    { label: 'Stark Private Key',     val: extStarkPk, setter: saveExtStarkPk, type: 'password', hint: '⚠️ Une seule fois à la création — ne peut que trader' },
    { label: 'l2Vault (ID position)', val: extL2Vault, setter: saveExtL2Vault, type: 'text',     hint: 'Extended › Account › API Management' },
  ];

  const nadoFields = [
    { label: 'Adresse compte principal', val: nadoAddress,    setter: saveNadoAddress,    type: 'text',     hint: 'Lecture positions & marge disponible' },
    { label: 'Clé privée Linked Signer', val: nadoAgentPk,   setter: saveNadoAgentPk,    type: 'password', hint: '⚠️ Nado › Settings › 1-Click Trading — ne peut que trader' },
    { label: 'Nom du sous-compte',       val: nadoSubaccount, setter: saveNadoSubaccount, type: 'text',     hint: 'Laisser "default" pour le compte principal' },
  ];

  const handleReset = () => {
    if (!confirm('Effacer toutes les clés sauvegardées ?')) return;
    [
      'hl_address', 'hl_agent_pk', 'hl_vault_address',
      'ext_stark_pk', 'ext_l2_vault', 'extended_api_keys', 'ext_api_key',
      'nado_address', 'nado_agent_pk', 'nado_subaccount',
    ].forEach(k => localStorage.removeItem(k));
    onHlChange('');
    onVaultChange?.('');
    onExtChange('');
    saveHlAgentPk('');
    saveExtStarkPk('');
    saveExtL2Vault('');
    saveNadoAddress('');
    saveNadoAgentPk('');
    saveNadoSubaccount('default');
  };

  const handleEnableDex = async () => {
    const agentPk = localStorage.getItem('hl_agent_pk');
    const vault   = localStorage.getItem('hl_vault_address')?.trim() || null;
    if (!agentPk) { setDexStatus('error'); return; }
    try {
      setDexStatus('loading');
      await enableAgentDexAbstraction(agentPk, vault);
      setDexStatus('ok');
    } catch (e) {
      console.error(e);
      setDexStatus('error');
    }
  };

  const FieldGroup = ({ fields, accentColor }) =>
    fields.map(({ label, val, setter, type, hint }) => (
      <div key={label} className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">{label}</label>
        <div className="flex gap-2">
          <input
            type={type}
            value={val || ''}
            onChange={e => setter(e.target.value)}
            placeholder={type === 'text' ? '0x...' : '••••••'}
            className={`flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-${accentColor}-500`}
          />
          {val && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
        </div>
        <p className="text-gray-600 text-xs">{hint}</p>
      </div>
    ));

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <span className="font-semibold flex items-center gap-2 flex-wrap">
          🔑 Wallets &amp; API Keys
          {hlAddress    ? <span className="text-green-400">● HL connecté</span>    : <span className="text-red-400">● HL ✗</span>}
          {canTradeHL   ? <span className="text-green-400">● HL trading ✓</span>  : <span className="text-yellow-500">● HL trading ⚠</span>}
          {extApiKey    ? <span className="text-green-400">● EXT connecté</span>   : <span className="text-yellow-500">● EXT ✗</span>}
          {canTradeExt  ? <span className="text-green-400">● EXT trading ✓</span> : <span className="text-yellow-500">● EXT trading ⚠</span>}
          {nadoAddress  ? <span className="text-green-400">● Nado connecté</span>  : <span className="text-gray-500">● Nado ✗</span>}
          {canTradeNado ? <span className="text-green-400">● Nado trading ✓</span>: <span className="text-gray-500">● Nado trading ⚠</span>}
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
            <FieldGroup fields={hlFields} accentColor="blue" />
          </div>

          <button
            onClick={handleEnableDex}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors"
          >
            ⚡ Activer HIP-3 (xyz / hyna) sur cet agent
          </button>
          {dexStatus === 'ok'      && <p className="text-xs text-green-400 text-center">✓ HIP-3 activé pour cet agent</p>}
          {dexStatus === 'error'   && <p className="text-xs text-red-400 text-center">✗ Erreur — vérifier la clé agent HL</p>}
          {dexStatus === 'loading' && <p className="text-xs text-gray-400 text-center">Activation en cours…</p>}

          {/* Extended */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-purple-400 border-b border-gray-700 pb-1">
              Extended Exchange
            </p>
            <FieldGroup fields={extFields} accentColor="purple" />
          </div>

          {/* Nado */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-green-400 border-b border-gray-700 pb-1">
              Nado Exchange
            </p>
            <FieldGroup fields={nadoFields} accentColor="green" />
          </div>

          {/* Reset */}
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
