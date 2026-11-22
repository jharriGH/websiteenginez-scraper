import express from 'express';
import { scrapeUrl } from './lib/scrape.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const API_KEY = process.env.SCRAPER_API_KEY;
const PORT = process.env.PORT || 10000;

function requireAuth(req, res, next) {
  const supplied = req.headers['x-scraper-api-key']
    || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!API_KEY) {
    return res.status(500).json({ error: 'server misconfigured: SCRAPER_API_KEY not set' });
  }
  if (supplied !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'websiteenginez-scraper',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

app.post('/scrape', requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url (string) required' });
  }
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) {
      return res.status(400).json({ error: 'only http/https URLs supported' });
    }
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  const startedAt = Date.now();
  try {
    const data = await scrapeUrl(url);
    res.json({
      status: 'ok',
      url,
      scraped_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      data,
    });
  } catch (err) {
    console.error('scrape error:', err);
    res.status(500).json({
      status: 'error',
      url,
      error: err.message,
      duration_ms: Date.now() - startedAt,
    });
  }
});

app.listen(PORT, () => {
  console.log(`websiteenginez-scraper v0.1.0 listening on port ${PORT}`);
});
