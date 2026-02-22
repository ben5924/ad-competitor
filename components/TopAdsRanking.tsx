
import React, { useState, useMemo } from 'react';
import { AdEntity } from '../types';
import { AdCard } from './AdCard';
import { Trophy, Video, Image as ImageIcon, Globe, TrendingUp, Medal, Filter, ChevronDown, Users, Target, Layers } from 'lucide-react';

interface TopAdsRankingProps {
  ads: AdEntity[];
}

type TimeRange = '7d' | '30d' | 'ALL';
type MediaFilter = 'ALL' | 'VIDEO' | 'IMAGE' | 'DYNAMIC' | 'IMAGE_DYNAMIC';

const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

export const TopAdsRanking: React.FC<TopAdsRankingProps> = ({ ads }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [ageFilter, setAgeFilter] = useState<string>('ALL');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('ALL');

  // --- Helper: Calculate Score based on Specific Audience Segment Reach ---
  const calculateAdScore = (ad: AdEntity, targetAge: string): { score: number, label: string } => {
    // Case 1: Global Ranking (Total Reach)
    if (targetAge === 'ALL') {
        return { 
            score: ad.eu_total_reach || 0, 
            label: 'Couverture Globale' 
        };
    }

    if (!ad.age_country_gender_reach_breakdown || ad.age_country_gender_reach_breakdown.length === 0) {
        return { score: 0, label: '-' };
    }

    // Case 2: Specific Age Segment Ranking
    let specificReachSum = 0;
    const normalize = (s: string) => s.replace(/[^0-9+]/g, '').trim(); // "55-64 ans" -> "5564"
    const normalizedTarget = normalize(targetAge);

    // Detect scale for percentages (sum > 1.5 implies 0-100 scale)
    let totalPctSum = 0;
    ad.age_country_gender_reach_breakdown.forEach(c => {
        c.age_gender_breakdowns?.forEach(b => {
             if (b.percentage !== undefined) totalPctSum += b.percentage;
        });
    });
    const isPercentageScale = totalPctSum > 1.5;

    // Iterate through data to sum up reach for the Target Age
    ad.age_country_gender_reach_breakdown.forEach(country => {
        if (country.age_gender_breakdowns && Array.isArray(country.age_gender_breakdowns)) {
            country.age_gender_breakdowns.forEach(breakdown => {
                const range = breakdown.age_range;
                if (!range) return;

                const normalizedRange = normalize(range);

                // Check for match (handle slight variations)
                if (normalizedRange === normalizedTarget || normalizedRange.includes(normalizedTarget) || normalizedTarget.includes(normalizedRange)) {
                    
                    // PRIORITY A: Direct Counts (Male + Female + Unknown)
                    // Example: "male": 28323, "female": 84460
                    if (breakdown.male !== undefined || breakdown.female !== undefined || breakdown.unknown !== undefined) {
                        specificReachSum += (breakdown.male || 0) + (breakdown.female || 0) + (breakdown.unknown || 0);
                    }
                    // PRIORITY B: Percentage Calculation
                    // Fallback if direct counts are missing but percentage exists
                    else if (breakdown.percentage !== undefined && ad.eu_total_reach) {
                        let pct = breakdown.percentage;
                        if (isPercentageScale) pct = pct / 100; // Normalize 15.5 -> 0.155
                        
                        specificReachSum += Math.round(ad.eu_total_reach * pct);
                    }
                }
            });
        }
    });

    return { 
        score: specificReachSum, 
        label: `Couverture ${targetAge}` 
    };
  };

  // --- Filtering & Sorting Logic ---
  const rankedAds = useMemo(() => {
    let filtered = [...ads];

    // 1. Time Filter
    const now = new Date();
    const cutoff = new Date();
    if (timeRange === '7d') cutoff.setDate(now.getDate() - 7);
    if (timeRange === '30d') cutoff.setDate(now.getDate() - 30);
    
    if (timeRange !== 'ALL') {
        filtered = filtered.filter(ad => new Date(ad.ad_creation_time) >= cutoff);
    }

    // 2. Media Filter
    if (mediaFilter === 'VIDEO') {
        filtered = filtered.filter(ad => ad.media_type === 'VIDEO' || ad.extracted_video_url);
    } else if (mediaFilter === 'IMAGE') {
        // Strict Static Image
        filtered = filtered.filter(ad => ad.media_type === 'IMAGE' || (!ad.media_type && !ad.extracted_video_url));
    } else if (mediaFilter === 'DYNAMIC') {
        // Strict Dynamic/Carousel
        filtered = filtered.filter(ad => ad.media_type === 'DYNAMIC_IMAGE');
    } else if (mediaFilter === 'IMAGE_DYNAMIC') {
        // Both Static and Dynamic (No Video)
        filtered = filtered.filter(ad => 
            ad.media_type === 'IMAGE' || 
            ad.media_type === 'DYNAMIC_IMAGE' || 
            (!ad.media_type && !ad.extracted_video_url)
        );
    }

    // 3. Age / Audience Filter & Scoring
    return filtered.map(ad => {
        const { score, label } = calculateAdScore(ad, ageFilter);
        return { ad, score, label };
    })
    .filter(item => item.score > 0) // Only show ads that reached this audience
    .sort((a, b) => b.score - a.score) // Sort by the specific calculated reach
    .slice(0, 20); // Limit to Top 20
  }, [ads, timeRange, ageFilter, mediaFilter]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Controls */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 sticky top-20 z-30 shadow-xl">
         <div className="flex items-center">
             <div className="p-3 bg-yellow-500/20 rounded-lg mr-4 border border-yellow-500/50">
                 <Trophy className="w-8 h-8 text-yellow-500" />
             </div>
             <div>
                 <h2 className="text-2xl font-bold text-white tracking-tight">Ad Hit Parade</h2>
                 <p className="text-slate-400 text-sm">Les 20 publicités les plus performantes classées par audience.</p>
             </div>
         </div>

         <div id="hitparade-filters" className="flex flex-wrap gap-3 justify-end items-center w-full xl:w-auto">
             
             {/* Age/Demographic Selector */}
             <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Users className="h-4 w-4 text-slate-400" />
                </div>
                <select
                    value={ageFilter}
                    onChange={(e) => setAgeFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white text-xs font-bold rounded-lg pl-9 pr-8 py-2.5 appearance-none hover:border-orange-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors cursor-pointer min-w-[140px]"
                >
                    <option value="ALL">Toutes Audiences</option>
                    {AGE_RANGES.map(age => (
                        <option key={age} value={age}>{age} ans</option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                </div>
             </div>
             
             {/* Media Type Selector */}
             <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 overflow-x-auto max-w-[100%]">
                <button 
                    onClick={() => setMediaFilter('ALL')}
                    className={`px-3 py-2 rounded-md text-xs font-bold flex items-center transition-all whitespace-nowrap ${mediaFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Tous formats"
                >
                    Tout
                </button>
                 <button 
                    onClick={() => setMediaFilter('VIDEO')}
                    className={`px-3 py-2 rounded-md text-xs font-bold flex items-center transition-all whitespace-nowrap ${mediaFilter === 'VIDEO' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    title="Vidéos uniquement"
                >
                    <Video className="w-4 h-4 mr-1.5" />
                    Vidéo
                </button>
                <button 
                    onClick={() => setMediaFilter('IMAGE')}
                    className={`px-3 py-2 rounded-md text-xs font-bold flex items-center transition-all whitespace-nowrap ${mediaFilter === 'IMAGE' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    title="Images statiques uniquement"
                >
                    <ImageIcon className="w-4 h-4 mr-1.5" />
                    Image
                </button>
                <button 
                    onClick={() => setMediaFilter('DYNAMIC')}
                    className={`px-3 py-2 rounded-md text-xs font-bold flex items-center transition-all whitespace-nowrap ${mediaFilter === 'DYNAMIC' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    title="Carrousels et Dynamiques uniquement"
                >
                    <Layers className="w-4 h-4 mr-1.5" />
                    Dynamique
                </button>
                <button 
                    onClick={() => setMediaFilter('IMAGE_DYNAMIC')}
                    className={`px-3 py-2 rounded-md text-xs font-bold flex items-center transition-all whitespace-nowrap ${mediaFilter === 'IMAGE_DYNAMIC' ? 'bg-slate-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    title="Images statiques et Dynamiques (Pas de vidéo)"
                >
                    Img + Dyn
                </button>
             </div>

             {/* Time Selector */}
             <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 shrink-0">
                <button onClick={() => setTimeRange('7d')} className={`px-3 py-2 rounded-md text-xs font-bold transition-all ${timeRange === '7d' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>7J</button>
                <button onClick={() => setTimeRange('30d')} className={`px-3 py-2 rounded-md text-xs font-bold transition-all ${timeRange === '30d' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>30J</button>
                <button onClick={() => setTimeRange('ALL')} className={`px-3 py-2 rounded-md text-xs font-bold transition-all ${timeRange === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>Tout</button>
             </div>
         </div>
      </div>

      {/* Results Grid - RESTRICTED TO 2 COLUMNS MAX */}
      {rankedAds.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 gap-y-12">
            {rankedAds.map((item, index) => (
                <div key={item.ad.id} className="relative group flex flex-col">
                    
                    {/* Rank Badge */}
                    <div className={`absolute -top-2 -left-3 z-20 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-4 border-slate-950 shadow-xl transform group-hover:scale-110 transition-transform duration-300
                        ${index === 0 ? 'bg-yellow-500 text-yellow-950' : 
                          index === 1 ? 'bg-slate-300 text-slate-900' : 
                          index === 2 ? 'bg-amber-700 text-amber-100' : 
                          'bg-slate-800 text-slate-400 border-slate-700'}`}
                    >
                        {index + 1}
                    </div>

                    {/* Performance Scorecard */}
                    <div className="ml-4 mb-2 flex items-center justify-between bg-slate-800/90 border-l-4 border-orange-500 rounded-r-lg px-3 py-2 shadow-md backdrop-blur-sm">
                        <div className="flex items-center">
                            {ageFilter === 'ALL' ? (
                                <Globe className="w-3.5 h-3.5 text-orange-500 mr-2" />
                            ) : (
                                <Target className="w-3.5 h-3.5 text-orange-500 mr-2" />
                            )}
                            <span className="text-xs font-medium text-slate-300 uppercase tracking-wide">
                                {item.label}
                            </span>
                        </div>
                        <span className="text-sm font-bold text-white font-mono bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                            {item.score.toLocaleString()}
                        </span>
                    </div>

                    {/* The Ad Card */}
                    <div className="transform transition-all duration-300 hover:-translate-y-1">
                        <AdCard ad={item.ad} autoLoad={true} />
                    </div>
                    
                    {/* Podium Effect for Top 3 */}
                    {index < 3 && (
                        <div className="absolute -bottom-4 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                            <div className="bg-gradient-to-t from-orange-600 to-transparent h-20 w-full opacity-20 rounded-b-xl blur-xl"></div>
                        </div>
                    )}
                </div>
            ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl">
            <Medal className="w-16 h-16 text-slate-700 mb-4" />
            <h3 className="text-xl font-bold text-slate-500">Aucun résultat</h3>
            <p className="text-slate-600 max-w-md mt-2">Aucune publicité ne correspond à ces critères. Essayez d'élargir la période ou de changer la tranche d'âge.</p>
        </div>
      )}
    </div>
  );
};
