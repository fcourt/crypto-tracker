// api/extended.js
export default async function handler(req, res) {
  const { endpoint } = req.query;
  const apiKey = req.headers['x-api-key'];

  if (!endpoint || !apiKey) {
    return res.status(400).json({ error: 'Missing endpoint or api key' });
  }

  try {
    const upstream = await fetch(
      `https://api.starknet.extended.exchange/api/v1${endpoint}`,
      {
        headers: {
          'X-Api-Key': apiKey,
          'User-Agent': 'PerpTracker/1.0',
        },
      }
    );
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
