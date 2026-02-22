
import { supabase } from './supabaseClient';
import { AdEntity } from '../types';

const APIFY_API_URL = 'https://api.apify.com/v2';
const ACTOR_ID = 'shu8hvrXbJbY3Eb9W'; // Actor: Facebook Ads Library Scraper (Curious Coder)
const STATIC_DATASET_ID = '6UEFy3S7zfAmCvoNJ'; // Dataset de cache/backup

// Utilitaire pour attendre (sleep)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const sanitizeToken = (token: string): string => {
    if (!token) return '';
    let t = token.trim();
    if (t.toLowerCase().startsWith('bearer ')) {
        t = t.slice(7).trim();
    }
    return t.replace(/[^\x20-\x7E]/g, '');
};

const cleanUrl = (url: string | undefined | null): string | null => {
    if (!url) return null;
    try {
        let cleaned = url.replace(/&amp;/g, '&');
        if (cleaned.includes('%')) {
             try { cleaned = decodeURIComponent(cleaned); } catch(e) {}
        }
        return cleaned;
    } catch (e) {
        return url;
    }
};

/**
 * 0. TEST DE CONNEXION
 */
export const checkApifyConnection = async (apifyToken: string): Promise<{ valid: boolean, username?: string, error?: string }> => {
    const cleanToken = sanitizeToken(apifyToken);
    if (!cleanToken) return { valid: false, error: "Token vide" };

    try {
        const response = await fetch(`${APIFY_API_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${cleanToken}` }
        });
        if (response.ok) {
            const data = await response.json();
            return { valid: true, username: data.data.username || 'Utilisateur Apify' };
        } else {
            return { valid: false, error: `Erreur ${response.status} - Vérifiez vos crédits ou le token.` };
        }
    } catch (e: any) {
        return { valid: false, error: e.message || "Erreur réseau" };
    }
};

/**
 * 1. LIVE SCRAPING : DÉMARRAGE
 */
export const startApifyScrape = async (targets: string[], cleanToken: string, mode: 'PAGE_ID' | 'URL' = 'PAGE_ID') => {
    if (!targets || targets.length === 0) throw new Error("Aucune cible.");

    console.log(`[Apify] 🚀 Démarrage Scrape (${mode}) pour ${targets.length} cibles.`);

    const startUrls = targets.map(target => {
        // Mode URL directe (Single Ad)
        if (mode === 'URL') return { url: target };
        // Mode Page ID
        return { 
            url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${target}` 
        };
    });

    const maxItems = mode === 'URL' ? 5 : 30;

    // CONFIGURATION
    const inputBody = {
        startUrls: startUrls,
        urls: startUrls, // Doublon par sécurité
        maxItems: maxItems,
        includeAdDetails: true,
        scrapeAdDetails: true, 
        adActiveStatus: 'all',
        adType: 'all',
        country: 'ALL',
        // FIX: Utiliser le proxy automatique.
        // Forcer "RESIDENTIAL" fait planter les comptes gratuits/starter.
        proxyConfiguration: {
            useApifyProxy: true
        }
    };

    const response = await fetch(`${APIFY_API_URL}/acts/${ACTOR_ID}/runs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
        },
        body: JSON.stringify(inputBody)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err.error?.message || response.statusText;
        console.error(`[Apify] Start Error ${response.status}:`, msg);
        throw new Error(`Erreur Lancement Apify (${response.status}): ${msg}`);
    }

    const data = await response.json();
    console.log(`[Apify] Run ID: ${data.data.id}`);
    return data.data.id;
};

/**
 * 2. LIVE SCRAPING : ATTENTE
 */
export const waitForApifyRun = async (runId: string, cleanToken: string): Promise<string> => {
    let status = 'READY';
    const MAX_RETRIES = 30; // 2.5 minutes max (suffisant pour single ad)
    let attempts = 0;
    
    while ((status === 'READY' || status === 'RUNNING') && attempts < MAX_RETRIES) {
        await sleep(5000); 
        const response = await fetch(`${APIFY_API_URL}/actor-runs/${runId}`, {
            headers: { 'Authorization': `Bearer ${cleanToken}` }
        });
        const data = await response.json();
        status = data.data.status;
        
        console.log(`[Apify] Run ${runId}: ${status}`);

        if (status === 'SUCCEEDED') return data.data.defaultDatasetId;
        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
            throw new Error(`Le Run Apify a échoué (${status}). Vérifiez les logs sur Apify Console.`);
        }
        
        attempts++;
    }
    throw new Error('Timeout: Apify est trop lent à répondre.');
};

/**
 * 3. RÉCUPÉRATION
 */
export const getApifyResults = async (datasetId: string, cleanToken: string) => {
    const response = await fetch(`${APIFY_API_URL}/datasets/${datasetId}/items?format=json&clean=true`, {
        headers: { 'Authorization': `Bearer ${cleanToken}` }
    });
    if (!response.ok) throw new Error("Impossible de récupérer les données du dataset.");
    const items = await response.json();
    console.log(`[Apify] 📥 Reçu ${Array.isArray(items) ? items.length : 0} items.`);
    return items;
};

/**
 * HELPER EXTRACTION
 */
const getVal = (obj: any, keys: string[]) => {
    if (!obj) return undefined;
    for (const key of keys) {
        if (obj[key]) return obj[key];
    }
    return undefined;
};

/**
 * PROCESS ITEMS
 */
async function processAndSaveItems(rawItems: any[], pageIds: string[], onProgress?: (msg: string) => void) {
    if (!Array.isArray(rawItems)) return new Map();

    const resultMap = new Map<string, { media_url: string, media_type: string }>();

    for (const item of rawItems) {
        if (!item) continue;

        const rawId = getVal(item, ['ad_archive_id', 'adArchiveID', 'id', 'adId']);
        const adId = rawId ? String(rawId) : null;
        
        const snap = getVal(item, ['snapshot', 'adSnapshot']) || {};
        const cards = getVal(snap, ['cards', 'collage_cards']) || getVal(item, ['cards']) || [];
        const videos = getVal(item, ['videos']) || getVal(snap, ['videos']) || [];
        const images = getVal(item, ['images']) || getVal(snap, ['images']) || [];
        
        let mediaUrl = null;
        let mediaType = 'IMAGE';

        // 1. VIDEO
        let vid = getVal(snap, ['video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl']) || 
                  getVal(item, ['video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl']);
        
        if (!vid && Array.isArray(videos)) {
            const bestVid = videos.find((v:any) => getVal(v, ['video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl']));
            if (bestVid) vid = getVal(bestVid, ['video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl']);
        }
        
        if (!vid && Array.isArray(cards)) {
             const vCard = cards.find((c: any) => getVal(c, ['video_hd_url', 'videoHdUrl']));
             if (vCard) vid = getVal(vCard, ['video_hd_url', 'videoHdUrl']);
        }

        if (vid) {
            mediaUrl = vid;
            mediaType = 'VIDEO';
        }

        // 2. IMAGE
        if (!mediaUrl) {
            let img = getVal(snap, ['original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl']) ||
                      getVal(item, ['original_image_url', 'originalImageUrl', 'image_url', 'imageUrl']);

            if (!img && Array.isArray(images) && images.length > 0) {
                 const bestImg = images[0];
                 if (typeof bestImg === 'string') img = bestImg;
                 else img = getVal(bestImg, ['original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl']);
            }
            
            if (!img && Array.isArray(cards) && cards.length > 0) {
                 const iCard = cards[0];
                 img = getVal(iCard, ['original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl']);
            }

            if (img) {
                mediaUrl = img;
                mediaType = 'IMAGE';
            }
        }

        if (mediaUrl) {
            const cleanMediaUrl = cleanUrl(mediaUrl);
            if (cleanMediaUrl) {
                if (adId) resultMap.set(adId, { media_url: cleanMediaUrl, media_type: mediaType });
                
                // Si on trouve un média mais qu'on a peu d'items, on le stocke en résultat par défaut
                if (!resultMap.has('SINGLE_RESULT')) {
                     resultMap.set('SINGLE_RESULT', { media_url: cleanMediaUrl, media_type: mediaType });
                }
            }
        } else {
             console.warn(`[Apify] Item ${adId} trouvé mais sans URL média exploitable.`);
        }
        
        // Sauvegarde Supabase (ignorer erreurs)
        if (adId && mediaUrl) {
             const body = getVal(snap, ['caption', 'body']) || getVal(item, ['body', 'caption']) || '';
             const pageName = getVal(snap, ['page_name', 'pageName']) || getVal(item, ['pageName', 'page_name']) || 'Unknown Page';
             const snapshotUrl = item.postUrl || `https://www.facebook.com/ads/library/?id=${adId}`;
 
             supabase.from('competitor_ads').upsert({
                 id: adId,
                 page_id: item.pageId || (pageIds[0] || 'unknown'),
                 page_name: pageName,
                 snapshot_url: snapshotUrl,
                 body: body,
                 media_type: mediaType,
                 media_url: cleanUrl(mediaUrl),
                 ad_creation_time: item.startDate || new Date().toISOString(),
                 eu_total_reach: item.reach || 0
             }).then(({ error }) => {
                 if(error) console.log("Supabase save error", error.message);
             });
         }
    }

    return resultMap;
}

/**
 * 4. SINGLE AD
 */
export const extractSingleAd = async (adId: string, apifyToken: string, facebookToken?: string): Promise<{ media_url: string, media_type: string } | null> => {
    try {
        const cleanToken = sanitizeToken(apifyToken);
        if (!cleanToken) throw new Error("Token Apify manquant");

        console.log(`[Apify] Single Scrape: ${adId}`);
        const targetUrl = `https://www.facebook.com/ads/library/?id=${adId}`;
        
        const runId = await startApifyScrape([targetUrl], cleanToken, 'URL');
        const datasetId = await waitForApifyRun(runId, cleanToken);
        const items = await getApifyResults(datasetId, cleanToken);
        
        if (!items || items.length === 0) {
            console.warn(`[Apify] ⚠️ 0 résultats. Facebook a peut-être bloqué la requête ou l'Ad ID est invalide.`);
            return null;
        }

        const liveMap = await processAndSaveItems(items, [], () => {});
        
        const exactMatch = liveMap.get(adId);
        const fallbackMatch = liveMap.get('SINGLE_RESULT');
        
        if (exactMatch) return exactMatch;
        if (fallbackMatch) {
            console.log(`[Apify] Match exact non trouvé, utilisation du premier résultat.`);
            return fallbackMatch;
        }

        return null;

    } catch (e: any) {
        console.error("[Apify Single Error]", e.message);
        throw e; // Renvoyer l'erreur pour que l'UI l'affiche
    }
};

/**
 * 5. BATCH PIPELINE
 */
export const runFullSyncPipeline = async (pageIds: string[], apifyToken: string, onProgress?: (msg: string) => void) => {
    try {
        const cleanToken = sanitizeToken(apifyToken);
        if (onProgress) onProgress(`🚀 Start Apify...`);
        const runId = await startApifyScrape(pageIds, cleanToken, 'PAGE_ID');
        if (onProgress) onProgress(`⏳ Waiting Apify...`);
        const datasetId = await waitForApifyRun(runId, cleanToken);
        if (onProgress) onProgress(`📥 Downloading...`);
        const items = await getApifyResults(datasetId, cleanToken);
        return processAndSaveItems(items, pageIds, onProgress);
    } catch (e: any) {
        console.error("[Apify Pipeline Error]", e);
        throw e;
    }
};
