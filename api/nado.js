// api/nado.js — si proxy toujours nécessaire
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const response = await fetch('https://gateway.prod.nado.xyz/v1/query', {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify(req.body),
    });
    const text = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
