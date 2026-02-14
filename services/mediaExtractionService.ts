
import { AdEntity } from '../types';

type MediaType = 'VIDEO' | 'IMAGE' | 'DYNAMIC_IMAGE' | 'SCREENSHOT' | 'UNKNOWN';

const BACKEND_URL = 'http://localhost:3001/api/extract';
const BACKEND_HEALTH = 'http://localhost:3001/health';

// Check if our local headless browser is running
export const checkBackendHealth = async (): Promise<boolean> => {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(BACKEND_HEALTH, { signal: controller.signal });
        clearTimeout(id);
        return res.ok;
    } catch (e) {
        return false;
    }
};

/**
 * Main extraction function.
 * It calls the Node.js backend which uses Puppeteer (Headless Browser)
 * to scrape the media or take a screenshot.
 */
export const extractMediaFromPage = async (snapshotUrl: string): Promise<{ type: MediaType, url: string, source: string } | null> => {
    
    // 1. Try the Headless Browser Backend
    try {
        const controller = new AbortController();
        // Give Puppeteer enough time (40s) to launch browser, load page and scrape
        const timeoutId = setTimeout(() => controller.abort(), 40000); 
        
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: snapshotUrl }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            if (data.url) {
                return { 
                    type: data.type as MediaType, 
                    url: data.url, 
                    source: data.source 
                };
            }
        }
    } catch (e) { 
        console.warn("Headless browser backend unavailable or timed out.", e);
    }

    // 2. Simple Fallback (if backend is down)
    // Checks for basic meta tags without rendering JS. Weak but fast.
    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(snapshotUrl)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
            const html = await res.text();
            // Try to find og:image
            const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
            if (match && match[1]) {
                // Decode HTML entities
                const url = match[1].replace(/&amp;/g, '&');
                return { type: 'IMAGE', url, source: 'META_TAG_FALLBACK' };
            }
        }
    } catch (e) {}

    return null;
};

// Batch processor for the UI
export const batchDetectMediaTypes = async (
  ads: AdEntity[], 
  onProgress?: (count: number, total: number) => void
): Promise<AdEntity[]> => {
  const results = [...ads];
  const isBackendUp = await checkBackendHealth();
  
  // If backend is up, process 1 by 1 to not crash the browser
  // If down, process faster
  const BATCH_SIZE = isBackendUp ? 1 : 3;

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (ad) => {
        if (ad.extracted_video_url || ad.extracted_image_url) return;

        const result = await extractMediaFromPage(ad.ad_snapshot_url);
        if (result) {
            ad.media_type = result.type as any;
            if (result.type === 'VIDEO') {
                ad.extracted_video_url = result.url;
            } else {
                ad.extracted_image_url = result.url;
            }
        }
    }));

    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, results.length), results.length);
    // Add delay between scraping requests to avoid IP bans
    if (isBackendUp) await new Promise(r => setTimeout(r, 1000));
  }
  return results;
};

export const detectDynamicCreativeByBody = (ads: AdEntity[]): AdEntity[] => {
    // Helper to group ads by text similarity
    return ads;
};
