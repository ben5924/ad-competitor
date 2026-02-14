
/**
 * SERVEUR AGENT FACEBOOK ADS (HEADLESS BROWSER SCRAPER)
 * 
 * Usage: node backend/server.js
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3001;

// Augmentation de la limite pour les screenshots Base64
app.use(express.json({ limit: '50mb' }));
app.use(cors({ origin: '*' }));

let browserInstance = null;

// Lance une instance persistante pour la rapidité
const getBrowser = async () => {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: "new", // Mode headless (sans interface)
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
                '--lang=fr-FR,fr'
            ]
        });
        console.log('✅ Headless Browser Launched');
    }
    return browserInstance;
};

app.get('/health', (req, res) => {
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

        // 1. Masquer l'automatisation (Stealth)
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
        
        // 2. Network Sniffer (Ecoute le réseau pour choper le .mp4 ou le .jpg HD)
        let networkVideo = null;
        let networkImage = null;

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['font', 'stylesheet'].includes(req.resourceType())) {
                 req.continue(); // On laisse passer mais on pourrait bloquer pour la vitesse
            } else {
                req.continue();
            }
        });

        page.on('response', async (response) => {
            try {
                const type = response.request().resourceType();
                const responseUrl = response.url();
                
                // Détection Vidéo (.mp4)
                if ((type === 'media' || responseUrl.includes('.mp4')) && responseUrl.startsWith('http')) {
                    if (!networkVideo) networkVideo = responseUrl;
                }
                
                // Détection Image HD (fbcdn / scontent)
                if (type === 'image' && (responseUrl.includes('fbcdn') || responseUrl.includes('scontent')) && !responseUrl.includes('profile')) {
                    // On garde la plus grosse URL (souvent la meilleure qualité)
                    if (!networkImage || responseUrl.length > networkImage.length) {
                        networkImage = responseUrl;
                    }
                }
            } catch (e) {}
        });

        // 3. Navigation vers le Snapshot
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Nettoyage des popups/overlays Facebook
        await page.evaluate(() => {
            try {
                const overlays = document.querySelectorAll('[role="dialog"], .uiLayer, [aria-modal="true"], .cwj9ozl2');
                overlays.forEach(el => el.remove());
            } catch(e) {}
        });

        // 4. Extraction via DOM (Comme votre script Python)
        // On cherche l'élément visuel principal
        const extractionResult = await page.evaluate(async () => {
            const result = { type: null, url: null, rect: null };

            // A. Chercher une vidéo
            const video = document.querySelector('video');
            if (video && video.src && video.src.startsWith('http')) {
                return { type: 'VIDEO', url: video.src };
            }

            // B. Chercher une image (scontent ou fbcdn)
            // On cherche l'image la plus pertinente (grande taille)
            const images = Array.from(document.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]'));
            const bestImage = images.find(img => img.naturalWidth > 300 && img.naturalHeight > 200);
            
            if (bestImage) {
                return { type: 'IMAGE', url: bestImage.src };
            }

            // C. Si pas d'URL propre, on identifie le conteneur pour le screenshot
            // Sélecteurs courants des conteneurs de pub Facebook
            const selectors = [
                'div[data-testid="ad_creative_container"]',
                '.uiScaledImageContainer',
                'div[role="img"]',
                'video'
            ];

            for (let sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    // On renvoie un marqueur pour dire à Puppeteer de screener cet élément
                    return { type: 'SCREENSHOT_TARGET', selector: sel };
                }
            }
            
            return null;
        });

        // 5. Prise de décision
        let finalResponse = { type: 'UNKNOWN', url: null };

        // Priorité 1: Vidéo réseau (Souvent la meilleure qualité)
        if (networkVideo) {
            console.log(`[Scraper] ✅ Video Found (Network)`);
            finalResponse = { type: 'VIDEO', url: networkVideo, source: 'NETWORK' };
        }
        // Priorité 2: Élément trouvé dans le DOM (URL propre)
        else if (extractionResult && extractionResult.type === 'VIDEO') {
            console.log(`[Scraper] ✅ Video Found (DOM)`);
            finalResponse = { type: 'VIDEO', url: extractionResult.url, source: 'DOM' };
        }
        else if (extractionResult && extractionResult.type === 'IMAGE') {
             console.log(`[Scraper] ✅ Image Found (DOM)`);
             finalResponse = { type: 'IMAGE', url: extractionResult.url, source: 'DOM' };
        }
        // Priorité 3: Screenshot ciblé (Si on a trouvé un conteneur mais pas d'URL propre)
        else if (extractionResult && extractionResult.type === 'SCREENSHOT_TARGET') {
            console.log(`[Scraper] 📸 Taking Screenshot of ${extractionResult.selector}`);
            try {
                const element = await page.$(extractionResult.selector);
                const b64 = await element.screenshot({ encoding: 'base64' });
                finalResponse = { type: 'SCREENSHOT', url: `data:image/jpeg;base64,${b64}`, source: 'SCREENSHOT' };
            } catch (e) {
                console.log("Element screenshot failed");
            }
        }

        // Fallback Ultime: Screenshot du viewport si rien n'a marché mais que le réseau a vu une image
        if (!finalResponse.url && networkImage) {
             // Si on a vu une image passer dans le réseau mais qu'on ne peut pas l'afficher,
             // on renvoie l'URL réseau (parfois elle fonctionne en direct)
             finalResponse = { type: 'IMAGE', url: networkImage, source: 'NETWORK_FALLBACK' };
        } else if (!finalResponse.url) {
            // Dernier recours : Screenshot global croppé
            console.log(`[Scraper] 📸 Fallback Viewport Screenshot`);
            const b64 = await page.screenshot({ 
                encoding: 'base64',
                clip: { x: 0, y: 0, width: 1080, height: 1080 } 
            });
            finalResponse = { type: 'SCREENSHOT', url: `data:image/jpeg;base64,${b64}`, source: 'VIEWPORT' };
        }

        await page.close();
        
        if (finalResponse.url) {
            return res.json(finalResponse);
        } else {
            return res.status(404).json({ error: 'Media not found' });
        }

    } catch (error) {
        console.error('[Scraper] Error:', error.message);
        if (page) await page.close().catch(() => {});
        return res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🤖 Headless Browser Scraper running on http://localhost:${PORT}`);
});
