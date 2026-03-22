// api/extended.js
export default async function handler(req, res) {
  const { endpoint } = req.query;
  const apiKey = req.headers['x-api-key'];

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  // ✅ Clé API requise seulement pour les endpoints /user/
  if (endpoint.startsWith('/user/') && !apiKey) {
    return res.status(400).json({ error: 'Missing api key' });
  }

  try {
    const headers = { 'User-Agent': 'PerpTracker/1.0' };
    if (apiKey) headers['X-Api-Key'] = apiKey;

    const upstream = await fetch(
      `https://api.starknet.extended.exchange/api/v1${endpoint}`,
      { headers }
    );
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
