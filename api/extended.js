export default async function handler(req, res) {
  const { endpoint } = req.query;
  const apiKey = req.headers['x-api-key'];

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  if (endpoint.startsWith('/user/') && !apiKey) {
    return res.status(400).json({ error: 'Missing api key' });
  }

  try {
    const headers = {
      'User-Agent':   'PerpTracker/1.0',
      'Content-Type': 'application/json',
    };
    if (apiKey) headers['X-Api-Key'] = apiKey;

    const fetchOptions = { method: req.method, headers };
    if (req.method === 'POST' || req.method === 'PUT') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    // ── URL intelligente : évite le double /api/v1 ──
    const BASE = 'https://api.starknet.extended.exchange';
    const path = endpoint.startsWith('/api/') ? endpoint : `/api/v1${endpoint}`;
    const upstream = await fetch(`${BASE}${path}`, fetchOptions);

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
