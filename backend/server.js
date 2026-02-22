/**
 * SERVEUR AGENT FACEBOOK ADS (HEADLESS BROWSER SCRAPER)
 * Usage: node backend/server.js
 */

import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cors({ origin: '*' }));

let browserInstance = null;

const getBrowser = async () => {
    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--lang=fr-FR,fr',
                // Désactive les protections anti-bot
                '--disable-blink-features=AutomationControlled'
            ]
        });
        console.log('✅ Headless Browser Launched');
    }
    return browserInstance;
};

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', method: 'Headless Browser' });
});

app.post('/api/extract', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[Scraper] 🕷️ Processing: ${url}`);
    let page = null;

    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        // Masquer l'automatisation
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            window.chrome = { runtime: {} };
        });

        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

        // Intercepteur réseau pour capturer vidéos/images HD
        let networkVideo = null;
        let networkImages = [];

        await page.setRequestInterception(true);
        page.on('request', (req) => req.continue());

        page.on('response', async (response) => {
            try {
                const responseUrl = response.url();
                const type = response.request().resourceType();
                const status = response.status();

                if (status < 200 || status >= 400) return;

                // Capture vidéo .mp4
                if (!networkVideo && (type === 'media' || responseUrl.includes('.mp4')) && responseUrl.startsWith('https')) {
                    networkVideo = responseUrl;
                    console.log(`[Network] 🎬 Video: ${responseUrl.substring(0, 80)}...`);
                }

                // Capture images fbcdn/scontent (pas les icônes ou avatars)
                if (type === 'image' && status === 200) {
                    const isFbCdn = responseUrl.includes('fbcdn.net') || responseUrl.includes('scontent');
                    const isNotSmall = !responseUrl.includes('_s.') && !responseUrl.includes('_t.') && !responseUrl.includes('emoji');
                    const isNotProfile = !responseUrl.includes('profile') && !responseUrl.includes('avatar');

                    if (isFbCdn && isNotSmall && isNotProfile) {
                        networkImages.push(responseUrl);
                    }
                }
            } catch (e) {}
        });

        // Navigation
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Attendre que le contenu soit chargé
        await new Promise(r => setTimeout(r, 2000));

        // Fermer les popups Facebook si présents
        await page.evaluate(() => {
            try {
                // Sélecteurs courants pour les overlays Facebook
                const selectors = [
                    '[data-testid="cookie-policy-manage-dialog-accept-button"]',
                    '[aria-label="Fermer"]',
                    '[aria-label="Close"]',
                    'button[title="Fermer"]',
                    'div[role="dialog"] button',
                ];
                for (const sel of selectors) {
                    const btn = document.querySelector(sel);
                    if (btn) btn.click();
                }
                // Supprimer les overlays bloquants
                document.querySelectorAll('[role="dialog"], [data-nosnippet]').forEach(el => {
                    if (el.style) el.style.display = 'none';
                });
            } catch(e) {}
        });

        await new Promise(r => setTimeout(r, 1000));

        // Extraction DOM
        const domResult = await page.evaluate(() => {
            // A. Chercher une vidéo dans le DOM
            const videos = Array.from(document.querySelectorAll('video'));
            for (const video of videos) {
                const src = video.src || video.querySelector('source')?.src;
                if (src && src.startsWith('https') && src.includes('.mp4')) {
                    return { type: 'VIDEO', url: src, source: 'DOM_VIDEO' };
                }
            }

            // B. Chercher dans les données JSON embarquées (souvent dans les scripts)
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
                const content = script.textContent || '';

                // Patterns pour les URLs de vidéo dans le JSON
                const videoPatterns = [
                    /"video_hd_url":"(https:[^"]+\.mp4[^"]*)"/,
                    /"video_sd_url":"(https:[^"]+\.mp4[^"]*)"/,
                    /"playable_url":"(https:[^"]+\.mp4[^"]*)"/,
                    /"playable_url_quality_hd":"(https:[^"]+\.mp4[^"]*)"/,
                ];

                for (const pat of videoPatterns) {
                    const match = content.match(pat);
                    if (match) {
                        const videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
                        if (videoUrl.startsWith('https')) {
                            return { type: 'VIDEO', url: videoUrl, source: 'DOM_JSON_VIDEO' };
                        }
                    }
                }

                // Patterns pour les images HD dans le JSON
                const imagePatterns = [
                    /"original_image_url":"(https:[^"]+(?:jpg|jpeg|png|webp)[^"]*)"/,
                    /"image_url":"(https:[^"]+(?:jpg|jpeg|png|webp)[^"]*)"/,
                ];

                for (const pat of imagePatterns) {
                    const match = content.match(pat);
                    if (match) {
                        const imageUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
                        if (imageUrl.startsWith('https') && imageUrl.includes('fbcdn')) {
                            return { type: 'IMAGE', url: imageUrl, source: 'DOM_JSON_IMAGE' };
                        }
                    }
                }
            }

            // C. Chercher les images fbcdn dans le DOM (img tags)
            const imgs = Array.from(document.querySelectorAll('img'))
                .filter(img => {
                    const src = img.src || '';
                    return (src.includes('fbcdn') || src.includes('scontent')) &&
                           img.naturalWidth > 200 && img.naturalHeight > 200 &&
                           !src.includes('profile') && !src.includes('emoji') &&
                           !src.includes('_s.');
                })
                .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));

            if (imgs.length > 0) {
                return { type: 'IMAGE', url: imgs[0].src, source: 'DOM_IMG' };
            }

            return null;
        });

        await page.close();

        // Décision de priorité
        if (networkVideo) {
            console.log(`[Scraper] ✅ VIDEO via Network: ${networkVideo.substring(0, 60)}...`);
            return res.json({ type: 'VIDEO', url: networkVideo, source: 'NETWORK' });
        }

        if (domResult?.type === 'VIDEO') {
            console.log(`[Scraper] ✅ VIDEO via DOM: ${domResult.url.substring(0, 60)}...`);
            return res.json(domResult);
        }

        if (domResult?.type === 'IMAGE') {
            console.log(`[Scraper] ✅ IMAGE via DOM: ${domResult.url.substring(0, 60)}...`);
            return res.json(domResult);
        }

        // Fallback: meilleure image réseau
        if (networkImages.length > 0) {
            // Prendre l'image avec l'URL la plus longue (souvent HD)
            const bestImage = networkImages.sort((a, b) => b.length - a.length)[0];
            console.log(`[Scraper] ✅ IMAGE via Network Fallback: ${bestImage.substring(0, 60)}...`);
            return res.json({ type: 'IMAGE', url: bestImage, source: 'NETWORK_FALLBACK' });
        }

        console.warn(`[Scraper] ❌ No media found for: ${url}`);
        return res.status(404).json({ error: 'Aucun média trouvé' });

    } catch (error) {
        console.error('[Scraper] Error:', error.message);
        if (page) await page.close().catch(() => {});

        // Reset browser si crash
        if (error.message.includes('Target closed') || error.message.includes('Protocol error')) {
            browserInstance = null;
        }

        return res.status(500).json({ error: error.message });
    }
});

// Vite middleware for development
if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
    });
    app.use(vite.middlewares);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    if (browserInstance) await browserInstance.close();
    process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 Headless Browser Scraper running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
    console.log(`   Extract: POST http://localhost:${PORT}/api/extract { url: "..." }`);
});
