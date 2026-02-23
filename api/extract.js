import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = {
  maxDuration: 30, // secondes (nécessite plan Pro Vercel)
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let browser = null;
  let page = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    page = await browser.newPage();

    // Anti-bot
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    let networkVideo = null;
    let networkImages = [];

    await page.setRequestInterception(true);
    page.on('request', (r) => r.continue());
    page.on('response', async (response) => {
      try {
        const rUrl = response.url();
        const type = response.request().resourceType();
        const status = response.status();
        if (status < 200 || status >= 400) return;

        if (!networkVideo && (type === 'media' || rUrl.includes('.mp4')) && rUrl.startsWith('https')) {
          networkVideo = rUrl;
        }

        if (type === 'image' && status === 200) {
          const isFbCdn = rUrl.includes('fbcdn.net') || rUrl.includes('scontent');
          const isNotSmall = !rUrl.includes('_s.') && !rUrl.includes('_t.') && !rUrl.includes('emoji');
          const isNotProfile = !rUrl.includes('profile') && !rUrl.includes('avatar');
          
          // ✅ AJOUT : Exclure les images de l'UI Facebook (placeholder, branding)
          const isNotFbUI = !rUrl.includes('rsrc.php') && 
                            !rUrl.includes('safe_image') &&
                            !rUrl.includes('platform/') &&
                            !rUrl.includes('ads/image/'); // Placeholder snapshot

          // NOUVEAU : privilégier les images avec dimensions HD dans l'URL
          const isLikelyCreative = rUrl.includes('_n.') || rUrl.includes('_o.') 
                                 || rUrl.includes('p720x720') || rUrl.includes('p960x960')
                                 || rUrl.includes('p1080x') || rUrl.includes('s960x');

          if (isFbCdn && isNotSmall && isNotProfile && isNotFbUI) {
            if (isLikelyCreative) {
              // Mettre en priorité les images clairement créatives
              networkImages.unshift(rUrl);
            } else {
              networkImages.push(rUrl);
            }
          }
        }
      } catch (e) {}
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Attendre que le vrai contenu de la pub soit chargé
    // Facebook charge le créatif après un délai supplémentaire
    await new Promise((r) => setTimeout(r, 4000));

    // Scroller pour déclencher le lazy loading
    await page.evaluate(() => window.scrollBy(0, 300));
    await new Promise((r) => setTimeout(r, 1500));

    // Extraction DOM (même logique que ton server.js actuel)
    const domResult = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      for (const video of videos) {
        const src = video.src || video.querySelector('source')?.src;
        if (src && src.startsWith('https') && src.includes('.mp4')) {
          return { type: 'VIDEO', url: src, source: 'DOM_VIDEO' };
        }
      }

      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        const content = script.textContent || '';
        const videoPatterns = [
          /"video_hd_url":"(https:[^"]+\.mp4[^"]*)"/,
          /"playable_url":"(https:[^"]+\.mp4[^"]*)"/,
          /"playable_url_quality_hd":"(https:[^"]+\.mp4[^"]*)"/,
        ];
        for (const pat of videoPatterns) {
          const match = content.match(pat);
          if (match) {
            const videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
            if (videoUrl.startsWith('https')) return { type: 'VIDEO', url: videoUrl, source: 'DOM_JSON_VIDEO' };
          }
        }
        const imagePatterns = [
          /"original_image_url":"(https:[^"]+(?:jpg|jpeg|png|webp)[^"]*)"/,
          /"image_url":"(https:[^"]+(?:jpg|jpeg|png|webp)[^"]*)"/,
          /"uri":"(https:[^"]+(?:jpg|jpeg|png|webp)[^"]*fbcdn[^"]*)"/,
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

      const imgs = Array.from(document.querySelectorAll('img'))
        .filter((img) => {
          const src = img.src || '';
          return (
            (src.includes('fbcdn') || src.includes('scontent')) &&
            img.naturalWidth > 400 &&
            img.naturalHeight > 400 &&
            !src.includes('profile') &&
            !src.includes('emoji') &&
            !src.includes('_s.') &&
            !src.includes('rsrc.php')
          );
        })
        .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);

      if (imgs.length > 0) return { type: 'IMAGE', url: imgs[0].src, source: 'DOM_IMG' };
      return null;
    });

    if (networkVideo) return res.json({ type: 'VIDEO', url: networkVideo, source: 'NETWORK' });
    if (domResult?.type === 'VIDEO') return res.json(domResult);
    if (domResult?.type === 'IMAGE') return res.json(domResult);

    if (networkImages.length > 0) {
      const best = networkImages.sort((a, b) => b.length - a.length)[0];
      return res.json({ type: 'IMAGE', url: best, source: 'NETWORK_FALLBACK' });
    }

    return res.status(404).json({ error: 'Aucun média trouvé' });

  } catch (error) {
    console.error('[extract]', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
