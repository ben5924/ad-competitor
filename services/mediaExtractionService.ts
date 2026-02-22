import { AdEntity } from '../types';

// URL de votre backend Puppeteer local (backend/server.js)
const BACKEND_URL = ''; // Relative path since frontend and backend are on same port

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Appelle le backend Puppeteer pour extraire le média d'un snapshot Facebook
 */
const fetchViaBackend = async (snapshotUrl: string): Promise<{ type: 'VIDEO' | 'IMAGE' | 'SCREENSHOT', url: string, source: string } | null> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: snapshotUrl }),
      signal: AbortSignal.timeout(35000) // 35s timeout pour laisser Puppeteer charger la page
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn(`[Backend] HTTP ${res.status}:`, err);
      return null;
    }

    const data = await res.json();

    if (data?.url && data?.type) {
      return {
        type: data.type as 'VIDEO' | 'IMAGE' | 'SCREENSHOT',
        url: data.url,
        source: data.source || 'PUPPETEER'
      };
    }

    return null;
  } catch (e: any) {
    if (e.name === 'TimeoutError') {
      console.warn('[Backend] Timeout - Puppeteer a pris trop de temps');
    } else if (e.message?.includes('Failed to fetch') || e.message?.includes('ECONNREFUSED')) {
      console.warn('[Backend] Serveur Puppeteer non démarré. Lancez: node backend/server.js');
    } else {
      console.warn('[Backend] Erreur:', e.message);
    }
    return null;
  }
};

/**
 * Vérifie si le backend Puppeteer est disponible
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, {
      signal: AbortSignal.timeout(2000)
    });
    return res.ok;
  } catch {
    return false;
  }
};

/**
 * Extrait le média d'une publicité Facebook via son snapshot URL
 * Utilise le backend Puppeteer (headless browser) pour contourner les protections Facebook
 */
export const extractMediaFromPage = async (
  snapshotUrl: string
): Promise<{ type: 'VIDEO' | 'IMAGE' | 'SCREENSHOT', url: string, source: string } | null> => {
  if (!snapshotUrl) return null;

  // Appel direct au backend Puppeteer
  const result = await fetchViaBackend(snapshotUrl);
  if (result) return result;

  return null;
};

/**
 * Extraction batch avec rate limiting
 * Affiche un warning si le backend n'est pas démarré
 */
export const batchExtractMedia = async (
  ads: AdEntity[],
  onProgress?: (count: number, total: number) => void
): Promise<Map<string, { type: string, url: string }>> => {
  const results = new Map<string, { type: string, url: string }>();
  const toProcess = ads.filter(ad => !ad.media_url && ad.ad_snapshot_url);

  if (toProcess.length === 0) return results;

  // Vérifier que le backend est bien lancé avant de commencer
  const isAlive = await checkBackendHealth();
  if (!isAlive) {
    console.error(
      '[BatchExtract] ❌ Backend Puppeteer non disponible.\n' +
      'Assurez-vous que le serveur tourne bien sur le port 3000 avec le backend activé.'
    );
    // On tente quand même - le message d'erreur sera dans fetchViaBackend
  }

  for (let i = 0; i < toProcess.length; i++) {
    const ad = toProcess[i];
    if (onProgress) onProgress(i + 1, toProcess.length);

    const result = await extractMediaFromPage(ad.ad_snapshot_url);
    if (result) {
      results.set(ad.id, { type: result.type, url: result.url });
    }

    // Rate limiting : 1s entre chaque requête (Puppeteer est plus lent)
    if (i < toProcess.length - 1) await sleep(1000);
  }

  return results;
};
