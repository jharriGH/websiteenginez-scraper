# WebsiteEnginez — Scraper

Playwright microservice. Takes a URL, returns structured JSON of the site's content for AI rewriting.

## Endpoints

- `GET /health` — liveness check
- `POST /scrape` (auth: `x-scraper-api-key` header) — body `{"url":"..."}` → structured JSON

## Deploy

Render Docker service `websiteenginez-scraper`, $7/mo Starter.
Auto-deploys from `main`.

## Env vars

- `PORT` (default 10000)
- `SCRAPER_API_KEY` — required for /scrape; stored in KJ Brain vault at `websiteenginez/SCRAPER_API_KEY`
