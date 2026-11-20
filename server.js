import express from 'express';
const app = express();
app.use(express.json());
app.get('/health', (_, res) => res.json({ ok: true, service: 'websiteenginez-scraper' }));
app.post('/scrape', async (_, res) => res.json({ status: 'not_implemented', phase: 1 }));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`scraper on ${PORT}`));
