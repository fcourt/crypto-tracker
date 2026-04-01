async function placeExtendedOrder({ starkPrivateKey, l2Vault, extApiKey, order }) {
  const nonce             = generateNonce();
  const expiryEpochMillis = Date.now() + 3600 * 1000; // +1h en ms
  const sizeStr           = order.size.toFixed(order.szDecimals ?? 6);
  const priceStr          = order.limitPrice.toFixed(order.pxDecimals ?? 2);
  const side              = order.isBuy ? 'BUY' : 'SELL';
  const l2VaultStr        = l2Vault.toString();

  // Clé publique Stark depuis la clé privée
  const pubKeyBytes = ec.starkCurve.getPublicKey(starkPrivateKey, true);
  const starkKey    = '0x' + Array.from(pubKeyBytes.slice(1))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // ✅ expiresAt en MILLISECONDES dans la signature (cohérent avec expiryEpochMillis)
  const message = {
    market:      order.extKey,
    side,
    type:        'LIMIT',
    size:        sizeStr,
    price:       priceStr,
    timeInForce: 'GTT',
    nonce:       nonce.toString(),
    expiresAt:   expiryEpochMillis.toString(), // ✅ ms, pas secondes
    l2Vault:     l2VaultStr,
  };

  // ✅ accountAddress = l2Key (clé publique), pas le vault
  const msgHash = typedData.getMessageHash(
    { types: ORDER_TYPES, primaryType: 'Order', domain: STARKNET_DOMAIN, message },
    starkKey  // ✅ clé publique Stark
  );

  const { r, s } = ec.starkCurve.sign(msgHash, starkPrivateKey);

  const payload = {
    id:                generateOrderId(),
    market:            order.extKey,
    type:              'LIMIT',
    side,
    qty:               sizeStr,
    price:             priceStr,
    timeInForce:       'GTT',
    expiryEpochMillis, // ✅ number en ms
    fee:               '0.0005',
    nonce:             nonce.toString(),
    settlement: {
      signature: {
        r: '0x' + r.toString(16).padStart(64, '0'),
        s: '0x' + s.toString(16).padStart(64, '0'),
      },
      starkKey,
      collateralPosition: l2VaultStr, // ✅ champ attendu par l'API
    },
  };

  const res = await fetch(
    `${EXT_API_BASE}?endpoint=${encodeURIComponent('/api/v1/user/order')}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key':    extApiKey,
        'User-Agent':   'TrekApp/1.0', // ✅ OBLIGATOIRE sinon 400
      },
      body: JSON.stringify(payload),
    }
  );

  const rawText = await res.text();
  console.log('Extended raw response:', res.status, rawText);

  let data = {};
  try { data = JSON.parse(rawText); } catch { /* non-JSON */ }

  if (!res.ok || data?.status === 'ERROR') {
    throw new Error(
      data?.error?.message ||
      data?.message ||
      rawText ||
      `Extended HTTP ${res.status}`
    );
  }
  return data;
}
