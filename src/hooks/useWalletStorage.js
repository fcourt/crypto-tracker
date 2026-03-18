// Gestion des wallets sauvegardés dans localStorage
const STORAGE_KEY = 'perp_tracker_wallets';

export function getSavedWallets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function saveWallet(address, label = '') {
  const wallets = getSavedWallets();
  if (wallets.find(w => w.address.toLowerCase() === address.toLowerCase())) return;
  wallets.push({ address, label: label || address.slice(0, 6) + '...' + address.slice(-4) });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

export function removeWallet(address) {
  const wallets = getSavedWallets().filter(
    w => w.address.toLowerCase() !== address.toLowerCase()
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

export function updateWalletLabel(address, label) {
  const wallets = getSavedWallets().map(w =>
    w.address.toLowerCase() === address.toLowerCase() ? { ...w, label } : w
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}
