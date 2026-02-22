
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AdEntity } from '../types';
import { extractMediaFromPage } from '../services/mediaExtractionService';
import { ExternalLink, Clock, Download, Database, X, Facebook, Globe, Loader2, EyeOff, CheckCircle2, RefreshCcw, Camera, PlayCircle, RefreshCw } from 'lucide-react';

interface AdCardProps {
  ad: AdEntity;
  autoLoad?: boolean;
  onAdUpdated?: (adId: string, mediaUrl: string, mediaType: string) => void;
}

type MediaType = 'VIDEO' | 'IMAGE' | 'DYNAMIC_IMAGE' | 'SCREENSHOT' | 'UNKNOWN';

const PlatformIcon: React.FC<{ platform: string }> = ({ platform }) => {
  const p = platform.toLowerCase();
  if (p.includes('facebook')) return <Facebook className="w-3.5 h-3.5 text-blue-500" />;
  return <Globe className="w-3.5 h-3.5 text-slate-500" />;
};

export const AdCard: React.FC<AdCardProps> = ({ ad, autoLoad = false, onAdUpdated }) => {
  // --- STATE INITIALIZATION ---
  const [mediaState, setMediaState] = useState<{
    status: 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';
    url?: string;
    type?: MediaType;
    source?: string;
    errorMessage?: string;
  }>(() => {
    // 1. PRIORITÉ : Données déjà présentes (via Batch Sync ou DB)
    if (ad.media_url && ad.media_type) {
        return { 
            status: 'SUCCESS', 
            url: ad.media_url, 
            type: ad.media_type as MediaType, 
            source: 'BACKEND_SYNC' 
        };
    }
    // 2. LEGACY : Données extraites précédemment (si existantes)
    if (ad.extracted_video_url || ad.extracted_image_url) {
        const url = ad.extracted_video_url || ad.extracted_image_url;
        return { 
            status: 'SUCCESS', 
            url, 
            type: (ad.extracted_video_url ? 'VIDEO' : 'IMAGE') as MediaType, 
            source: 'LEGACY' 
        };
    }
    return { status: 'IDLE' };
  });

  const [isDownloading, setIsDownloading] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  
  // --- EFFECT: SYNC PROPS TO STATE ---
  useEffect(() => {
    if (ad.media_url && ad.media_type) {
        // Only update if we are not currently loading or if the URL actually changed
        if (mediaState.status !== 'LOADING' && mediaState.url !== ad.media_url) {
            setMediaState({
                status: 'SUCCESS',
                url: ad.media_url,
                type: ad.media_type as MediaType,
                source: 'BACKEND_SYNC'
            });
        }
    }
  }, [ad.media_url, ad.media_type, mediaState.status, mediaState.url]);

  const durationInfo = useMemo(() => {
      const start = new Date(ad.ad_creation_time).getTime();
      const end = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : new Date().getTime();
      const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      return { days, isActive: !ad.ad_delivery_stop_time };
  }, [ad]);

  // --- PROXY EXTRACTION ---
  const handleFetchMedia = useCallback(async (forceRefresh = false) => {
    if (mediaState.status === 'LOADING') return;
    setMediaState(prev => ({ ...prev, status: 'LOADING', errorMessage: undefined }));

    try {
        // ÉTAPE 1 : Tentative rapide via proxy CORS (gratuit, pas de token requis)
        console.log(`[AdCard] Trying proxy extraction for ${ad.id}`);
        const proxyResult = await extractMediaFromPage(ad.ad_snapshot_url);
        
        if (proxyResult?.url) {
            console.log(`[AdCard] ✅ Proxy success for ${ad.id}`);
            setMediaState({ 
                status: 'SUCCESS', 
                url: proxyResult.url, 
                type: proxyResult.type as MediaType, 
                source: 'PROXY_SINGLE' 
            });
            
            if (onAdUpdated) {
                onAdUpdated(ad.id, proxyResult.url, proxyResult.type);
            }
            
            // Fallback local mutation
            ad.media_url = proxyResult.url;
            ad.media_type = proxyResult.type as any;
            return;
        } else {
             console.warn(`[AdCard] Proxy failed for ${ad.id}`);
             setMediaState({ status: 'ERROR', errorMessage: "Aucun média trouvé via le proxy." });
        }
    } catch (err: any) {
        console.warn("Proxy Extraction Error", err);
        setMediaState({ status: 'ERROR', errorMessage: "Erreur lors de l'extraction." });
    }
  }, [ad, mediaState.status, onAdUpdated]);

  // Trigger autoLoad ONLY if explicitly enabled (disabled by default to save credits)
  useEffect(() => {
    if (autoLoad && mediaState.status === 'IDLE' && !ad.media_url) {
        handleFetchMedia();
    }
  }, [autoLoad, handleFetchMedia, mediaState.status, ad.media_url]);

  const handleDownload = async () => {
      if (!mediaState.url) return;
      setIsDownloading(true);
      try {
          const a = document.createElement('a');
          a.href = mediaState.url;
          let ext = 'jpg';
          if (mediaState.type === 'VIDEO') ext = 'mp4';
          
          a.download = `ad-media-${ad.id}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      } catch (e) {
          window.open(mediaState.url, '_blank');
      } finally {
          setIsDownloading(false);
      }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col shadow-lg hover:shadow-xl transition-all duration-300 relative group h-full">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-700 bg-slate-800/50">
        <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase">ID: {ad.id}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center ${durationInfo.isActive ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'bg-slate-700/30 text-slate-400'}`}>
                <Clock className="w-3 h-3 mr-1" /> {durationInfo.days}j
            </span>
        </div>
        <h3 className="text-sm font-bold text-white truncate">{ad.page_name}</h3>
      </div>

      {/* Media Content */}
      <div className="p-4 flex-grow space-y-3">
        <div className="relative overflow-hidden rounded-lg bg-slate-950 min-h-[220px] flex items-center justify-center border border-slate-700/50">
             
             {/* Source Indicator */}
             {(mediaState.source === 'BACKEND_SYNC' || mediaState.source === 'PROXY_SINGLE') && (
                 <div className="absolute top-2 left-2 bg-emerald-600 text-white text-[9px] px-2 py-1 rounded shadow-lg z-10 font-bold flex items-center">
                     <CheckCircle2 className="w-3 h-3 mr-1" /> HD
                 </div>
             )}

             {/* LOADING STATE */}
             {mediaState.status === 'LOADING' && (
                 <div className="flex flex-col items-center p-4 text-center z-20">
                     <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-3" />
                     <p className="text-xs text-slate-400 font-medium">Extraction en cours...</p>
                     <p className="text-[10px] text-slate-600 mt-1">Scan Live Facebook...</p>
                 </div>
             )}

             {/* SUCCESS STATE */}
             {mediaState.status === 'SUCCESS' && mediaState.url && (
                 <div className="relative w-full h-full flex items-center justify-center group/media bg-black">
                     {mediaState.type === 'VIDEO' ? (
                         <div className="relative w-full h-full">
                            <video 
                                src={mediaState.url} 
                                controls 
                                playsInline
                                crossOrigin="anonymous" 
                                className="max-h-[350px] w-full object-contain" 
                                onError={() => setMediaState({ status: 'ERROR', errorMessage: 'Lecture vidéo impossible (lien expiré ?)' })}
                            />
                            <div className="absolute top-2 right-2 pointer-events-none">
                                <PlayCircle className="w-6 h-6 text-white/50" />
                            </div>
                         </div>
                     ) : (
                         <img 
                            src={mediaState.url} 
                            alt="Creative" 
                            referrerPolicy="no-referrer"
                            className="max-h-[350px] w-full object-contain"
                            onError={() => setMediaState({ status: 'ERROR', errorMessage: 'Image introuvable (lien expiré ?)' })} 
                        />
                     )}
                     
                     {/* Actions Overlay */}
                     <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity z-20">
                        {/* REFRESH BUTTON - CRITICAL FIX */}
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleFetchMedia(true);
                            }}
                            className="p-2 bg-black/70 text-white rounded-full hover:bg-orange-600 transition-colors backdrop-blur-sm"
                            title="Forcer une nouvelle extraction"
                        >
                            <RefreshCw className="w-3 h-3" />
                        </button>
                        <button 
                            onClick={handleDownload} 
                            className="p-2 bg-black/70 text-white rounded-full hover:bg-emerald-600 transition-colors backdrop-blur-sm"
                            title="Télécharger"
                        >
                            {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        </button>
                     </div>
                 </div>
             )}
             
             {/* IDLE / ERROR STATE */}
             {(mediaState.status === 'IDLE' || mediaState.status === 'ERROR') && (
                <div className="flex flex-col items-center p-6 text-center w-full">
                    {mediaState.status === 'ERROR' ? (
                        <EyeOff className="w-8 h-8 text-red-400/50 mb-3" />
                    ) : (
                        <Database className="w-8 h-8 text-slate-700 mb-3" />
                    )}
                    
                    <p className="text-xs text-slate-500 font-medium mb-4 max-w-[200px]">
                        {mediaState.errorMessage || "Média non chargé"}
                    </p>
                    
                    <button 
                        onClick={() => handleFetchMedia(false)}
                        className={`text-xs font-bold px-4 py-2 rounded-lg flex items-center transition-all shadow-lg bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/20`}
                        title="Lancer une extraction temps réel"
                    >
                        {mediaState.status === 'ERROR' ? <RefreshCcw className="w-3.5 h-3.5 mr-2" /> : <Download className="w-3.5 h-3.5 mr-2" />}
                        {mediaState.status === 'ERROR' ? 'Réessayer' : 'Charger Média'}
                    </button>

                    <a 
                        href={ad.ad_snapshot_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-4 text-[10px] text-slate-500 hover:text-white flex items-center hover:underline"
                    >
                        Voir sur Facebook <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                </div>
             )}
        </div>

        {/* Text Body */}
        {ad.ad_creative_bodies?.[0] && (
          <p className="text-slate-300 text-[11px] leading-relaxed line-clamp-3 italic px-3 py-2 bg-slate-900/50 rounded border-l-2 border-orange-500/50">
            "{ad.ad_creative_bodies[0]}"
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-slate-900/80 border-t border-slate-800 flex justify-between items-center">
        <span className="text-[10px] text-slate-500 flex items-center">
           {ad.ad_delivery_start_time?.slice(0, 10)}
        </span>
        <div className="flex items-center space-x-1">
            {ad.publisher_platforms?.map(p => <PlatformIcon key={p} platform={p} />)}
            <button onClick={() => setShowRawData(true)} className="ml-2 text-slate-600 hover:text-white p-1" title="Voir JSON">
                <Database className="w-3 h-3" />
            </button>
        </div>
      </div>

      {/* JSON Modal */}
      {showRawData && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
             <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl h-[70vh] flex flex-col shadow-2xl">
                 <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-950">
                     <h3 className="text-white font-bold text-sm">Inspecteur JSON</h3>
                     <button onClick={() => setShowRawData(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
                 </div>
                 <pre className="p-4 overflow-auto flex-1 font-mono text-[10px] text-emerald-400 bg-slate-950">
                     {JSON.stringify(ad, null, 2)}
                 </pre>
             </div>
          </div>
      )}
    </div>
  );
};
