
import { AdEntity } from '../types';

const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/'
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Tente de fetcher une URL via plusieurs proxies CORS
 */
const fetchWithProxy = async (targetUrl: string): Promise<string | null> => {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(`${proxy}${encodeURIComponent(targetUrl)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        return await res.text();
      }
    } catch (e) {
      console.warn(`[Proxy] ${proxy} failed`, e);
    }
  }
  return null;
};

/**
 * Extrait l'URL média (video/image) depuis le HTML d'un snapshot Facebook Ads
 */
const extractMediaFromHtml = (html: string): { type: 'VIDEO' | 'IMAGE', url: string } | null => {
  if (!html) return null;

  // 1. Chercher une vidéo MP4
  const videoPatterns = [
    /["']([^"']+\.mp4[^"']*?)["']/g,
    /"video_sd_url":"([^"]+)"/g,
    /"video_hd_url":"([^"]+)"/g,
    /src="(https:\/\/[^"]+\.mp4[^"]*)"/g,
  ];

  for (const pattern of videoPatterns) {
    const matches = [...html.matchAll(pattern)];
    for (const match of matches) {
      const url = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      if (url.startsWith('http') && url.includes('.mp4')) {
        return { type: 'VIDEO', url };
      }
    }
  }

  // 2. Chercher une image HD (fbcdn / scontent)
  const imagePatterns = [
    /"original_image_url":"([^"]+)"/g,
    /"resized_image_url":"([^"]+)"/g,
    /["'](https:\/\/(?:scontent|fbcdn)[^"']+\.(?:jpg|jpeg|png|webp)[^"']*?)["']/g,
  ];

  let bestImageUrl: string | null = null;
  let bestImageScore = 0;

  for (const pattern of imagePatterns) {
    const matches = [...html.matchAll(pattern)];
    for (const match of matches) {
      const url = match[1].replace(/\\u0026/g, '&').replace(/\\u002F/g, '/').replace(/\\/g, '');
      if (!url.startsWith('http')) continue;
      if (url.includes('profile') || url.includes('avatar') || url.includes('logo')) continue;
      
      // Score basé sur les dimensions dans l'URL (plus grand = mieux)
      const dimMatch = url.match(/(\d{3,4})x(\d{3,4})/);
      const score = dimMatch ? parseInt(dimMatch[1]) * parseInt(dimMatch[2]) : 1;
      
      if (score > bestImageScore) {
        bestImageScore = score;
        bestImageUrl = url;
      }
    }
  }

  if (bestImageUrl) {
    return { type: 'IMAGE', url: bestImageUrl };
  }

  return null;
};

/**
 * Extrait le média d'une publicité Facebook via son snapshot URL
 */
export const extractMediaFromPage = async (
  snapshotUrl: string
): Promise<{ type: 'VIDEO' | 'IMAGE', url: string, source: string } | null> => {
  if (!snapshotUrl) return null;

  try {
    const html = await fetchWithProxy(snapshotUrl);
    if (!html) return null;

    const result = extractMediaFromHtml(html);
    if (result) {
      return { ...result, source: 'PROXY_SCRAPE' };
    }
  } catch (e) {
    console.error('[MediaExtraction] Error:', e);
  }

  return null;
};

/**
 * Extraction batch avec rate limiting
 */
export const batchExtractMedia = async (
  ads: AdEntity[],
  onProgress?: (count: number, total: number) => void
): Promise<Map<string, { type: string, url: string }>> => {
  const results = new Map<string, { type: string, url: string }>();
  const toProcess = ads.filter(ad => !ad.media_url && ad.ad_snapshot_url);

  for (let i = 0; i < toProcess.length; i++) {
    const ad = toProcess[i];
    if (onProgress) onProgress(i + 1, toProcess.length);

    const result = await extractMediaFromPage(ad.ad_snapshot_url);
    if (result) {
      results.set(ad.id, { type: result.type, url: result.url });
    }

    // Rate limiting : 500ms entre chaque requête
    if (i < toProcess.length - 1) await sleep(500);
  }

  return results;
};
