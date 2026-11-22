import { chromium } from 'playwright';

const NAV_TIMEOUT = 30000;
const IDLE_TIMEOUT = 10000;

export async function scrapeUrl(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; WebsiteEnginezBot/0.1; +https://websiteenginez.com/bot)',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const startedAt = Date.now();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {});

    const data = await page.evaluate(() => {
      const safeText = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return u; } };

      // --- Logo ---
      const extractLogo = () => {
        const og = document.querySelector('meta[property="og:image"]')?.content;
        if (og) return abs(og);
        const candidates = [
          'header img.logo', 'header .logo img', '.logo img', 'img.logo',
          'header img', 'nav img', '.navbar-brand img', '.site-logo img',
        ];
        for (const sel of candidates) {
          const img = document.querySelector(sel);
          if (img?.src) return abs(img.src);
        }
        const fav = document.querySelector('link[rel*="icon"]')?.href;
        return fav ? abs(fav) : null;
      };

      // --- Palette ---
      const extractPalette = () => {
        const styles = getComputedStyle(document.documentElement);
        const varNames = ['--primary', '--color-primary', '--primary-color', '--accent', '--color-accent',
                          '--brand', '--brand-color', '--main-color', '--theme-color'];
        const vars = {};
        for (const n of varNames) {
          const v = styles.getPropertyValue(n).trim();
          if (v) vars[n] = v;
        }
        const btn = document.querySelector('button, .btn, .button, a.cta, a.btn');
        const btnBg = btn ? getComputedStyle(btn).backgroundColor : null;
        const themeMeta = document.querySelector('meta[name="theme-color"]')?.content || null;
        return {
          css_vars: vars,
          button_bg: btnBg,
          theme_color: themeMeta,
          primary_hint: vars['--primary'] || vars['--color-primary'] || vars['--brand'] || themeMeta || btnBg || null,
        };
      };

      // --- Hero ---
      const extractHero = () => {
        const h1 = safeText(document.querySelector('h1'));
        const subhead = safeText(
          document.querySelector('h1 + p, h1 ~ p, .hero p, .hero-subtitle, .hero-text, header p')
        );
        return { headline: h1 || null, subhead: subhead || null };
      };

      // --- Services ---
      const extractServices = () => {
        const out = [];
        document.querySelectorAll('[itemtype*="Service"]').forEach(el => {
          const name = safeText(el.querySelector('[itemprop="name"]')) || safeText(el.querySelector('h2,h3,h4'));
          const description = safeText(el.querySelector('[itemprop="description"]')) || safeText(el.querySelector('p'));
          if (name) out.push({ name, description: description || null, source: 'schema_org' });
        });
        if (out.length === 0) {
          const containers = document.querySelectorAll('.services, #services, [class*="service"], [id*="service"]');
          containers.forEach(c => {
            c.querySelectorAll('h2, h3, h4').forEach(h => {
              const name = safeText(h);
              if (name && name.length < 60 && !/contact|about|home/i.test(name)) {
                const desc = safeText(h.nextElementSibling);
                out.push({ name, description: desc || null, source: 'heading_scan' });
              }
            });
          });
        }
        if (out.length === 0) {
          document.querySelectorAll('nav a, .menu a, .main-nav a').forEach(a => {
            const t = safeText(a);
            if (t && t.length > 3 && t.length < 40 &&
                !/^(home|about|contact|blog|faq|login|sign\s?in|sign\s?up|gallery|portfolio|reviews|cart|shop)$/i.test(t)) {
              out.push({ name: t, description: null, source: 'nav' });
            }
          });
        }
        const seen = new Set();
        return out.filter(s => (seen.has(s.name.toLowerCase()) ? false : seen.add(s.name.toLowerCase()))).slice(0, 10);
      };

      // --- Testimonials ---
      const extractTestimonials = () => {
        const out = [];
        document.querySelectorAll('[itemtype*="Review"]').forEach(el => {
          const name = safeText(el.querySelector('[itemprop="author"]'));
          const text = safeText(el.querySelector('[itemprop="reviewBody"], [itemprop="description"]'));
          const rating = safeText(el.querySelector('[itemprop="ratingValue"]'));
          if (text) out.push({ name: name || null, text, rating: rating || null, source: 'schema_org' });
        });
        if (out.length === 0) {
          document.querySelectorAll('blockquote, .testimonial, .review, [class*="testimonial"], [class*="review"]').forEach(el => {
            const text = safeText(el);
            if (text && text.length > 30 && text.length < 500) {
              out.push({ name: null, text, rating: null, source: 'pattern' });
            }
          });
        }
        return out.slice(0, 5);
      };

      // --- Contact ---
      const extractContact = () => {
        const bodyText = (document.body?.innerText || '').slice(0, 20000);
        const phoneMatch = bodyText.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const telLink = document.querySelector('a[href^="tel:"]')?.getAttribute('href')?.replace('tel:', '');
        const mailLink = document.querySelector('a[href^="mailto:"]')?.getAttribute('href')?.replace('mailto:', '');
        const schemaPhone = safeText(document.querySelector('[itemprop="telephone"]'));
        const schemaAddr = safeText(document.querySelector('[itemprop="address"], [itemtype*="PostalAddress"]'));
        return {
          phone: schemaPhone || telLink || phoneMatch?.[0] || null,
          email: mailLink || emailMatch?.[0] || null,
          address: schemaAddr || null,
        };
      };

      // --- Hours ---
      const extractHours = () => {
        const schemaHours = [];
        document.querySelectorAll('[itemprop="openingHours"], [itemprop="openingHoursSpecification"]').forEach(el => {
          const t = safeText(el) || el.getAttribute('content') || el.getAttribute('datetime');
          if (t) schemaHours.push(t);
        });
        if (schemaHours.length) return { source: 'schema_org', raw: schemaHours };
        const bodyText = (document.body?.innerText || '').slice(0, 10000);
        const m = bodyText.match(/(mon|tue|wed|thu|fri|sat|sun)[^.\n]{0,80}\d{1,2}(:\d{2})?\s*(am|pm)/i);
        return m ? { source: 'pattern', raw: m[0] } : null;
      };

      // --- Images ---
      const extractImages = () => {
        const out = [];
        document.querySelectorAll('img').forEach(img => {
          const src = img.currentSrc || img.src;
          const w = img.naturalWidth || img.width || 0;
          if (src && w >= 300 && !/logo|icon|avatar|favicon|sprite/i.test(src)) {
            out.push({ src: abs(src), alt: img.alt || null, width: w });
          }
        });
        return out.slice(0, 10);
      };

      // --- Meta ---
      const extractMeta = () => ({
        title: document.title || null,
        description: document.querySelector('meta[name="description"]')?.content || null,
        og_title: document.querySelector('meta[property="og:title"]')?.content || null,
        og_description: document.querySelector('meta[property="og:description"]')?.content || null,
        og_image: document.querySelector('meta[property="og:image"]')?.content || null,
        canonical: document.querySelector('link[rel="canonical"]')?.href || null,
        lang: document.documentElement.lang || null,
      });

      // --- Business name ---
      const extractName = () => {
        return document.querySelector('meta[property="og:site_name"]')?.content
          || safeText(document.querySelector('[itemprop="name"]'))
          || safeText(document.querySelector('header .logo, nav .brand, .site-title'))
          || (document.title || '').split(/[|\-–—]/)[0].trim()
          || null;
      };

      return {
        business_name: extractName(),
        logo_url: extractLogo(),
        palette: extractPalette(),
        hero: extractHero(),
        services: extractServices(),
        testimonials: extractTestimonials(),
        contact: extractContact(),
        hours: extractHours(),
        images: extractImages(),
        meta: extractMeta(),
      };
    });

    return {
      ...data,
      _meta: {
        duration_ms: Date.now() - startedAt,
        final_url: page.url(),
      },
    };
  } finally {
    await browser.close();
  }
}
