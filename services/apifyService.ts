
import { supabase } from './supabaseClient';
import { AdEntity } from '../types';

const APIFY_API_URL = 'https://api.apify.com/v2';
// Utilisation de l'Actor "Facebook Ads Library Scraper" (Curious Coder) qui est très fiable
const ACTOR_ID = 'shu8hvrXbJbY3Eb9W'; 

/**
 * 1. Déclenche le Scraper sur Apify
 */
export const startApifyScrape = async (pageIds: string[], apifyToken: string, country: string = 'FR') => {
    if (!apifyToken) throw new Error("Token Apify manquant");

    // Construction des URLs de départ pour cibler précisément la bibliothèque pub
    const startUrls = pageIds.map(id => {
        return {
            url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&view_all_page_id=${id}`
        };
    });

    // Configuration de l'input spécifique pour cet Actor
    const input = {
        startUrls: startUrls,
        maxItems: 30, // Nombre max d'ads à récupérer par run
        includeAdDetails: true // Important pour avoir les médias HD
    };

    const response = await fetch(`${APIFY_API_URL}/acts/${ACTOR_ID}/runs?token=${apifyToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Apify Start Error: ${err.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data.id; // Run ID
};

/**
 * 2. Attend la fin du job (Polling)
 */
export const waitForApifyRun = async (runId: string, apifyToken: string): Promise<void> => {
    let status = 'RUNNING';
    
    // Timeout de sécurité (3 minutes)
    const startTime = Date.now();
    const MAX_DURATION = 180000; 

    while (status === 'RUNNING' || status === 'READY') {
        if (Date.now() - startTime > MAX_DURATION) {
            throw new Error("Timeout: Le scrape Apify prend trop de temps.");
        }

        await new Promise(r => setTimeout(r, 5000)); // Wait 5s
        
        const response = await fetch(`${APIFY_API_URL}/acts/${ACTOR_ID}/runs/${runId}?token=${apifyToken}`);
        const data = await response.json();
        status = data.data.status;
        
        console.log(`[Apify] Run Status: ${status}`);
    }

    if (status !== 'SUCCEEDED') {
        throw new Error(`Apify Run finished with status: ${status}`);
    }
};

/**
 * 3. Récupère les résultats JSON
 */
export const getApifyResults = async (runId: string, apifyToken: string) => {
    // Récupérer le dataset ID du run
    const runRes = await fetch(`${APIFY_API_URL}/acts/${ACTOR_ID}/runs/${runId}?token=${apifyToken}`);
    const runData = await runRes.json();
    const datasetId = runData.data.defaultDatasetId;

    // Fetch items (clean items only)
    const dataRes = await fetch(`${APIFY_API_URL}/datasets/${datasetId}/items?token=${apifyToken}&clean=true`);
    const items = await dataRes.json();
    return items;
};

/**
 * 4. Upload un fichier média (Image/Vidéo) vers Supabase Storage
 */
const uploadMediaToSupabase = async (url: string, adId: string, type: 'image' | 'video'): Promise<string | null> => {
    if (!url) return null;
    
    try {
        // Téléchargement du média
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const blob = await response.blob();
        
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const fileName = `${adId}_${Date.now()}.${ext}`;
        const path = `${fileName}`;

        // Upload
        const { data, error } = await supabase.storage
            .from('ads-media')
            .upload(path, blob, {
                contentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
                upsert: true
            });

        if (error) {
            console.error("Supabase Upload Error:", error);
            return null;
        }

        // Récupération URL publique
        const { data: { publicUrl } } = supabase.storage
            .from('ads-media')
            .getPublicUrl(path);

        return publicUrl;
    } catch (e) {
        console.error("Media Processing Error:", e);
        return null;
    }
};

/**
 * 5. Pipeline complet : Scrape -> Download -> Upload -> DB Insert
 * Returns a map of adId -> { mediaUrl, mediaType } for immediate UI update
 */
export const runFullSyncPipeline = async (pageIds: string[], apifyToken: string, onProgress?: (msg: string) => void) => {
    try {
        if (onProgress) onProgress("Démarrage du scraper Apify...");
        const runId = await startApifyScrape(pageIds, apifyToken);

        if (onProgress) onProgress("Scraping en cours (patientez ~1 min)...");
        await waitForApifyRun(runId, apifyToken);

        if (onProgress) onProgress("Récupération des résultats...");
        const rawItems = await getApifyResults(runId, apifyToken);

        if (onProgress) onProgress(`Traitement de ${rawItems.length} annonces...`);
        
        const resultMap = new Map<string, { media_url: string, media_type: string }>();

        // Traitement par lots
        let processedCount = 0;
        for (const item of rawItems) {
            // Mapping spécifique à l'Actor 'shu8hvrXbJbY3Eb9W' (Curious Coder)
            const adId = item.id || item.adArchiveID;
            const snapshotUrl = item.snapshotUrl || item.adSnapshotUrl || item.linkUrl;
            
            // Extraction Intelligente des Médias
            let mediaUrl = null;
            let mediaType = 'IMAGE'; // Default

            // Priorité Vidéo
            if (item.videos && item.videos.length > 0) {
                // item.videos peut être un tableau de strings ou d'objets {hd_src: ...}
                const vid = item.videos[0];
                mediaUrl = typeof vid === 'string' ? vid : (vid.hd_src || vid.sd_src || vid.url);
                mediaType = 'VIDEO';
            } 
            // Sinon Image
            else if (item.images && item.images.length > 0) {
                const img = item.images[0];
                mediaUrl = typeof img === 'string' ? img : (img.original_src || img.resized_src || img.url);
                mediaType = 'IMAGE';
            }

            const body = item.body || item.text || item.message;

            // 1. Sauvegarde du média sur Supabase (Pour pérenniser le lien)
            let finalMediaUrl = mediaUrl;
            if (mediaUrl) {
                const uploadedUrl = await uploadMediaToSupabase(mediaUrl, adId, mediaType === 'VIDEO' ? 'video' : 'image');
                if (uploadedUrl) finalMediaUrl = uploadedUrl;
            }

            if (finalMediaUrl) {
                resultMap.set(adId, { media_url: finalMediaUrl, media_type: mediaType });
            }

            // 2. Insertion en base de données Supabase
            // Note: On utilise le champ adId pour la clé primaire
            if (adId) {
                const { error } = await supabase.from('competitor_ads').upsert({
                    id: adId,
                    page_id: item.pageId || pageIds[0], // Fallback si non retourné
                    page_name: item.pageName || 'Unknown Page',
                    snapshot_url: snapshotUrl,
                    body: body,
                    media_type: mediaType,
                    media_url: finalMediaUrl,
                    ad_creation_time: item.startDate || item.creationTime || new Date().toISOString(),
                    eu_total_reach: item.reach || 0
                });

                if (error) console.warn(`DB Insert Error for ${adId}:`, error.message);
            }
            
            processedCount++;
            if (onProgress) onProgress(`Sauvegarde: ${processedCount}/${rawItems.length}`);
        }

        if (onProgress) onProgress("Synchronisation terminée avec succès !");
        return resultMap;

    } catch (e: any) {
        console.error("Pipeline Failed:", e);
        if (onProgress) onProgress(`Erreur: ${e.message}`);
        throw e;
    }
};
