
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AdEntity, SingleAdAnalysisResult } from '../types';
import { extractMediaFromPage } from '../services/mediaExtractionService';
import { ExternalLink, Calendar, Image as ImageIcon, Loader2, AlertCircle, Film, Globe, Users, PlayCircle, ChevronDown, ChevronUp, Clock, Target, Database, X, Sparkles, ThumbsUp, ThumbsDown, Layers, Coins, Download, FileText, Magnet, Layout, Crosshair, Facebook, Server, EyeOff, Camera } from 'lucide-react';

interface AdCardProps {
  ad: AdEntity;
  autoLoad?: boolean;
}

type MediaType = 'VIDEO' | 'IMAGE' | 'DYNAMIC_IMAGE' | 'SCREENSHOT' | 'UNKNOWN';

const PlatformIcon: React.FC<{ platform: string }> = ({ platform }) => {
  const p = platform.toLowerCase();
  if (p.includes('facebook')) return <Facebook className="w-3.5 h-3.5 text-blue-500" />;
  return <Globe className="w-3.5 h-3.5 text-slate-500" />;
};

export const AdCard: React.FC<AdCardProps> = ({ ad, autoLoad = true }) => {
  const [mediaState, setMediaState] = useState<{
    status: 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';
    url?: string;
    type?: MediaType;
    source?: string;
    errorMessage?: string;
  }>({ status: 'IDLE' });

  const [isDownloading, setIsDownloading] = useState(false);
  const [showRawData, setShowRawData] = useState(false);

  const durationInfo = useMemo(() => {
      const start = new Date(ad.ad_creation_time).getTime();
      const end = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : new Date().getTime();
      const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      return { days, isActive: !ad.ad_delivery_stop_time };
  }, [ad]);

  const handleFetchMedia = useCallback(async () => {
    // If we already have the URL stored in the AdEntity, use it
    if (ad.extracted_video_url || ad.extracted_image_url) {
        const url = ad.extracted_video_url || ad.extracted_image_url;
        // Check if it's a base64 screenshot stored
        const isScreenshot = url?.startsWith('data:image');
        const type = isScreenshot ? 'SCREENSHOT' : (ad.extracted_video_url ? 'VIDEO' : 'IMAGE'); 
        
        setMediaState({ status: 'SUCCESS', url, type, source: isScreenshot ? 'AGENT_SNAPSHOT' : 'BACKEND' });
        return;
    }

    setMediaState({ status: 'LOADING' });
    try {
        const result = await extractMediaFromPage(ad.ad_snapshot_url);
        if (result && result.url) {
             setMediaState({ status: 'SUCCESS', url: result.url, type: result.type, source: result.source });
             
             // Cache result in the entity for this session
             ad.media_type = result.type;
             if (result.type === 'VIDEO' && (result.url.includes('.mp4') || result.url.includes('video'))) {
                 ad.extracted_video_url = result.url;
             } else {
                 ad.extracted_image_url = result.url;
             }
        } else {
             setMediaState({ status: 'ERROR', errorMessage: "Aperçu indisponible" });
        }
    } catch (err: any) {
        setMediaState({ status: 'ERROR', errorMessage: "Erreur de connexion" });
    }
  }, [ad]);

  useEffect(() => {
    if (autoLoad && mediaState.status === 'IDLE') {
        const timer = setTimeout(() => handleFetchMedia(), Math.random() * 2000); 
        return () => clearTimeout(timer);
    }
  }, [autoLoad, handleFetchMedia, mediaState.status]);

  const handleDownload = async () => {
      if (!mediaState.url) return;
      setIsDownloading(true);
      try {
          const a = document.createElement('a');
          a.href = mediaState.url;
          // Determine extension
          let ext = 'jpg';
          if (mediaState.type === 'VIDEO') ext = 'mp4';
          if (mediaState.url.startsWith('data:image/png')) ext = 'png';
          
          a.download = `meta-creative-${ad.id}.${ext}`;
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
      <div className="p-4 border-b border-slate-700 bg-slate-800/50">
        <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase">ID: {ad.id}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center ${durationInfo.isActive ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'bg-slate-700/30 text-slate-400'}`}>
                <Clock className="w-3 h-3 mr-1" /> {durationInfo.days}j
            </span>
        </div>
        <h3 className="text-sm font-bold text-white truncate">{ad.page_name}</h3>
      </div>

      <div className="p-4 flex-grow space-y-3">
        <div className="relative overflow-hidden rounded-lg bg-slate-950 min-h-[220px] flex items-center justify-center border border-slate-700/50">
             {mediaState.status === 'LOADING' && (
                 <div className="flex flex-col items-center">
                     <Loader2 className="w-6 h-6 text-orange-500 animate-spin mb-2" />
                     <p className="text-[10px] text-slate-500 font-medium">L'agent analyse...</p>
                 </div>
             )}

             {mediaState.status === 'SUCCESS' && mediaState.url && (
                 <div className="relative w-full h-full flex items-center justify-center group/media bg-black">
                     {mediaState.type === 'VIDEO' && mediaState.url.includes('.mp4') ? (
                         <video 
                            src={mediaState.url} 
                            controls 
                            className="max-h-[350px] w-full object-contain" 
                            onError={() => setMediaState({ status: 'ERROR', errorMessage: 'Lecture impossible' })}
                         />
                     ) : (
                         <>
                             <img 
                                src={mediaState.url} 
                                alt="Creative" 
                                className="max-h-[350px] w-full object-contain"
                                onError={() => setMediaState({ status: 'ERROR', errorMessage: 'Image introuvable' })} 
                            />
                             {/* Badge Logic */}
                             {mediaState.type === 'SCREENSHOT' ? (
                                 <div className="absolute bottom-2 left-2 bg-indigo-900/80 border border-indigo-500/30 px-2 py-1 rounded text-[10px] text-white flex items-center shadow-sm backdrop-blur-md">
                                     <Camera className="w-3 h-3 mr-1 text-indigo-300" /> Capture
                                 </div>
                             ) : ad.media_type === 'VIDEO' && (
                                 <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white flex items-center">
                                     <Film className="w-3 h-3 mr-1" /> Vidéo (Aperçu)
                                 </div>
                             )}
                         </>
                     )}
                     
                     <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity">
                        <button onClick={handleDownload} className="p-2 bg-black/70 text-white rounded-full hover:bg-orange-600 transition-colors backdrop-blur-sm">
                            {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        </button>
                     </div>
                 </div>
             )}
             
             {/* ERROR STATE */}
             {mediaState.status === 'ERROR' && (
                <div className="flex flex-col items-center p-4 text-center w-full">
                    <EyeOff className="w-8 h-8 text-slate-700 mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Aperçu indisponible</p>
                    <a 
                        href={ad.ad_snapshot_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-3 text-[10px] text-orange-400 hover:text-orange-300 flex items-center hover:underline"
                    >
                        Voir sur Facebook <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                </div>
             )}
        </div>

        {ad.ad_creative_bodies?.[0] && (
          <p className="text-slate-300 text-[11px] leading-relaxed line-clamp-3 italic px-3 py-2 bg-slate-900/50 rounded border-l-2 border-orange-500/50">
            "{ad.ad_creative_bodies[0]}"
          </p>
        )}
      </div>

      <div className="px-4 py-3 bg-slate-900/80 border-t border-slate-800 flex justify-between items-center">
        <span className="text-[10px] text-slate-500 flex items-center">
           {ad.ad_delivery_start_time?.slice(0, 10)}
        </span>
        <div className="flex items-center space-x-1">
            {ad.publisher_platforms?.map(p => <PlatformIcon key={p} platform={p} />)}
            <button onClick={() => setShowRawData(true)} className="ml-2 text-slate-600 hover:text-white p-1">
                <Database className="w-3 h-3" />
            </button>
        </div>
      </div>

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
