
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Competitor, DashboardDateRange, AdEntity } from '../types';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Cell
} from 'recharts';
import { Trophy, Users, Globe, Activity, Video, ScanSearch, RefreshCw, Coins, Menu, CheckSquare, Square, Check } from 'lucide-react';

interface CompetitorStatsProps {
  competitors: Competitor[];
  onExplore: (competitorId: string) => void;
  syncingCompetitors: Set<string>;
  dateFilter: DashboardDateRange;
  customStartDate?: Date;
  customEndDate?: Date;
}

// Shared Chart Styles
const tooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    backdropFilter: 'blur(10px)',
    borderColor: '#334155',
    color: '#f8fafc',
    borderRadius: '8px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
};

// --- Reusable Chart Filter Menu Component ---
const ChartFilterMenu = ({ 
    competitors, 
    visibleIds, 
    setVisibleIds, 
    title 
}: { 
    competitors: Competitor[], 
    visibleIds: Set<string>, 
    setVisibleIds: React.Dispatch<React.SetStateAction<Set<string>>>,
    title: string
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const toggleId = (id: string) => {
        setVisibleIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = (select: boolean) => {
        if (select) setVisibleIds(new Set(competitors.map(c => c.id)));
        else setVisibleIds(new Set());
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`p-2 rounded-lg transition-colors ${isOpen ? 'bg-orange-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title={`Filtrer ${title}`}
            >
                <Menu className="w-5 h-5" />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                        <span className="text-xs font-bold text-slate-300 uppercase">Afficher/Masquer</span>
                        <div className="flex space-x-1">
                            <button onClick={() => toggleAll(true)} className="p-1 hover:bg-slate-800 rounded text-emerald-500" title="Tout afficher">
                                <CheckSquare className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => toggleAll(false)} className="p-1 hover:bg-slate-800 rounded text-slate-500" title="Tout masquer">
                                <Square className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {competitors.map(comp => {
                             const isSelected = visibleIds.has(comp.id);
                             return (
                                <button
                                    key={comp.id}
                                    onClick={() => toggleId(comp.id)}
                                    className={`w-full flex items-center px-2 py-2 rounded-lg text-xs font-medium transition-colors ${isSelected ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-800/50'}`}
                                >
                                    <div 
                                        className={`w-2.5 h-2.5 rounded-full mr-2 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-30'}`} 
                                        style={{ backgroundColor: comp.color }}
                                    ></div>
                                    <span className="truncate flex-1 text-left">{comp.name}</span>
                                    {isSelected && <Check className="w-3 h-3 text-orange-500 ml-2" />}
                                </button>
                             );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const CompetitorStats: React.FC<CompetitorStatsProps> = ({ competitors, onExplore, syncingCompetitors, dateFilter, customStartDate, customEndDate }) => {
  
  // --- Independent Visibility States for each Chart ---
  const [visReach, setVisReach] = useState<Set<string>>(new Set());
  const [visActivity, setVisActivity] = useState<Set<string>>(new Set());
  const [visMedia, setVisMedia] = useState<Set<string>>(new Set());
  const [visDemo, setVisDemo] = useState<Set<string>>(new Set());
  const [visBudget, setVisBudget] = useState<Set<string>>(new Set());

  // Initialize visibility when competitors change
  useEffect(() => {
      const allIds = new Set(competitors.map(c => c.id));
      
      const merge = (prev: Set<string>) => {
          const next = new Set(prev);
          competitors.forEach(c => {
             if (prev.size === 0 || (!prev.has(c.id) && !Array.from(prev).includes(c.id))) {
                 next.add(c.id);
             }
          });
          return next;
      };

      setVisReach(prev => merge(prev));
      setVisActivity(prev => merge(prev));
      setVisMedia(prev => merge(prev));
      setVisDemo(prev => merge(prev));
      setVisBudget(prev => merge(prev));

  }, [competitors.length]);

  // Legend Formatter
  const formatLegend = (value: string) => {
      return value.length > 15 ? value.substring(0, 12) + '...' : value;
  };

  // --- Date Calculation Logic ---
  const { startDate, endDate, allDates } = useMemo(() => {
      let start = new Date();
      let end = new Date();
      end.setHours(23,59,59,999);

      if (dateFilter === 'CUSTOM' && customStartDate && customEndDate) {
          // Use specific custom range
          start = new Date(customStartDate);
          start.setHours(0,0,0,0);
          end = new Date(customEndDate);
          end.setHours(23,59,59,999);
      } else {
          // Use Presets
          switch (dateFilter) {
              case 'TODAY':
                  start.setHours(0,0,0,0);
                  break;
              case 'YESTERDAY':
                  start.setDate(start.getDate() - 1);
                  start.setHours(0,0,0,0);
                  end.setDate(end.getDate() - 1);
                  end.setHours(23,59,59,999);
                  break;
              case 'LAST_7_DAYS':
                  start.setDate(start.getDate() - 6);
                  start.setHours(0,0,0,0);
                  break;
              case 'LAST_30_DAYS':
                  start.setDate(start.getDate() - 29);
                  start.setHours(0,0,0,0);
                  break;
              case 'THIS_MONTH':
                  start.setDate(1);
                  start.setHours(0,0,0,0);
                  break;
              case 'LAST_MONTH':
                  start.setMonth(start.getMonth() - 1);
                  start.setDate(1);
                  start.setHours(0,0,0,0);
                  
                  const tempEnd = new Date(start);
                  tempEnd.setMonth(tempEnd.getMonth() + 1);
                  tempEnd.setDate(0);
                  end.setTime(tempEnd.getTime());
                  end.setHours(23,59,59,999);
                  break;
              case 'ALL_TIME':
                  start.setFullYear(2000, 0, 1); // Way back
                  break;
              default:
                  // Default fallback
                  start.setDate(start.getDate() - 29);
          }
      }

      const dates: string[] = [];
      const curr = new Date(start);
      
      // Safety break to prevent infinite loops if dates are invalid
      if (curr > end) return { startDate: start, endDate: end, allDates: [] };

      while (curr <= end) {
          dates.push(curr.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }));
          curr.setDate(curr.getDate() + 1);
      }

      return { startDate: start, endDate: end, allDates: dates };
  }, [dateFilter, customStartDate, customEndDate]);

  // --- FILTER COMPETITORS' ADS BASED ON DATE RANGE ---
  // We create a filtered dataset of competitors where 'ads' only contains ads active during the selected period.
  // This derived dataset drives ALL downstream charts and rankings.
  const filteredCompetitors = useMemo(() => {
      return competitors.map(comp => {
          const activeAdsInRange = comp.ads.filter(ad => {
              const created = new Date(ad.ad_creation_time).getTime();
              const stopped = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : new Date().getTime();
              
              // Ad is relevant if its lifespan overlaps with the selected range [startDate, endDate]
              // i.e. Ad Start <= Range End AND Ad End >= Range Start
              return created <= endDate.getTime() && stopped >= startDate.getTime();
          });
          
          return {
              ...comp,
              ads: activeAdsInRange
          };
      });
  }, [competitors, startDate, endDate]);


  // --- 1. Activity Over Time ---
  const activityData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    allDates.forEach(d => {
        dateMap[d] = {};
        filteredCompetitors.forEach(c => dateMap[d][c.name] = 0);
    });

    filteredCompetitors.forEach(comp => {
      comp.ads.forEach(ad => {
        const adDate = new Date(ad.ad_creation_time);
        // Only count creations within the range
        if (adDate >= startDate && adDate <= endDate) {
             const dateStr = adDate.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
             if (dateMap[dateStr]) {
                 dateMap[dateStr][comp.name] = (dateMap[dateStr][comp.name] || 0) + 1;
             }
        }
      });
    });

    return Object.entries(dateMap).map(([date, counts]) => ({ date, ...counts }));
  }, [filteredCompetitors, startDate, endDate, allDates]);

  // --- 2. EU Reach Evolution (Daily Average Distribution) ---
  const reachData = useMemo(() => {
    const result = [];
    const curr = new Date(startDate);
    const today = new Date();

    while (curr <= endDate) {
        const dateLabel = curr.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
        const dayPoint: any = { date: dateLabel };
        const dayStart = curr.getTime();
        const dayEnd = dayStart + 86400000;

        filteredCompetitors.forEach(comp => {
            const dailyReachSum = comp.ads.reduce((sum, ad) => {
                if (!ad.eu_total_reach) return sum;
                
                const created = new Date(ad.ad_creation_time).getTime();
                const stopped = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : today.getTime();
                
                // Check if ad was active on this specific day
                const isStarted = created < dayEnd; 
                const isNotStopped = stopped > dayStart;

                if (isStarted && isNotStopped) {
                    // Calculate Daily Reach Intensity
                    // Duration in ms, min 1 day (86400000 ms)
                    const durationMs = Math.max(86400000, stopped - created);
                    const durationDays = durationMs / 86400000;
                    
                    const dailyReach = ad.eu_total_reach / durationDays;
                    return sum + dailyReach;
                }
                return sum;
            }, 0);
            dayPoint[comp.name] = Math.round(dailyReachSum);
        });
        result.push(dayPoint);
        curr.setDate(curr.getDate() + 1);
    }
    return result;
  }, [filteredCompetitors, startDate, endDate]);

  // --- 3. Media Type Split ---
  const mediaSplitData = useMemo(() => {
      return filteredCompetitors.map(comp => {
          const videoCount = comp.ads.filter(ad => 
            ad.media_type === 'VIDEO' ||
            (!ad.media_type && (ad.extracted_video_url || ad.ad_snapshot_url.includes('video')))
          ).length;

          const dynamicCount = comp.ads.filter(ad => ad.media_type === 'DYNAMIC_IMAGE').length;
          const total = comp.ads.length;
          const staticCount = total - videoCount - dynamicCount;
          
          const videoPct = total ? Math.round((videoCount / total) * 100) : 0;
          const dynamicPct = total ? Math.round((dynamicCount / total) * 100) : 0;
          const staticPct = total ? 100 - videoPct - dynamicPct : 0;

          return {
              id: comp.id,
              name: comp.name,
              color: comp.color,
              videoCount,
              staticCount,
              dynamicCount,
              videoPct,
              staticPct,
              dynamicPct,
              total
          };
      });
  }, [filteredCompetitors]);

  // --- 4. Demographics ---
  const demographicsData = useMemo(() => {
      const ageRanges = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
      const dataPoints = ageRanges.map(age => {
          const point: any = { age };
          filteredCompetitors.forEach(comp => {
              point[comp.name] = 0;
          });
          return point;
      });

      filteredCompetitors.forEach(comp => {
          comp.ads.forEach(ad => {
              if (!ad.age_country_gender_reach_breakdown) return;
              ad.age_country_gender_reach_breakdown.forEach(countryData => {
                  countryData.age_gender_breakdowns?.forEach(breakdown => {
                      const age = breakdown.age_range;
                      const point = dataPoints.find(p => p.age === age);
                      if (!point) return;

                      let countToAdd = 0;
                      if (breakdown.male !== undefined || breakdown.female !== undefined || breakdown.unknown !== undefined) {
                          countToAdd = (breakdown.male || 0) + (breakdown.female || 0) + (breakdown.unknown || 0);
                      } else if (breakdown.percentage !== undefined && ad.eu_total_reach) {
                          let pct = breakdown.percentage;
                          if (pct > 1) pct = pct / 100;
                          countToAdd = Math.round(pct * ad.eu_total_reach);
                      }
                      point[comp.name] += isNaN(countToAdd) ? 0 : countToAdd;
                  });
              });
          });
      });
      return dataPoints;
  }, [filteredCompetitors]);

  // --- 5. Estimated Budget Evolution ---
  const budgetEvolutionData = useMemo(() => {
    const result = [];
    const curr = new Date(startDate);
    const today = new Date();

    while (curr <= endDate) {
        const dateLabel = curr.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
        const dayPoint: any = { date: dateLabel };
        const dayStart = curr.getTime();
        const dayEnd = dayStart + 86400000;

        filteredCompetitors.forEach(comp => {
            const activeBudgetSum = comp.ads.reduce((sum, ad) => {
                if (!ad.eu_total_reach) return sum;
                
                const created = new Date(ad.ad_creation_time).getTime();
                const stopped = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : today.getTime();
                
                const isStarted = created < dayEnd; 
                const isNotStopped = stopped > dayStart;

                if (isStarted && isNotStopped) {
                    // Daily Reach Calculation
                    const durationMs = Math.max(86400000, stopped - created);
                    const durationDays = durationMs / 86400000;
                    const dailyReach = ad.eu_total_reach / durationDays;

                    // Daily Cost = (Daily Reach / 1000) * 5.50€
                    const dailyCost = (dailyReach / 1000) * 5.50;
                    return sum + dailyCost;
                }
                return sum;
            }, 0);
            dayPoint[comp.name] = Math.round(activeBudgetSum);
        });
        result.push(dayPoint);
        curr.setDate(curr.getDate() + 1);
    }
    return result;
  }, [filteredCompetitors, startDate, endDate]);

  // --- Rankings (Table Data) ---
  const rankings = useMemo(() => {
    return filteredCompetitors.map(comp => {
        const videoCount = comp.ads.filter(ad => ad.media_type === 'VIDEO' || (!ad.media_type && ad.extracted_video_url)).length;
        const dynamicCount = comp.ads.filter(ad => ad.media_type === 'DYNAMIC_IMAGE').length;
        const total = comp.ads.length;
        const staticCount = total - videoCount - dynamicCount;
        
        const videoPct = total ? Math.round((videoCount / total) * 100) : 0;
        const dynamicPct = total ? Math.round((dynamicCount / total) * 100) : 0;
        const staticPct = total ? 100 - videoPct - dynamicPct : 0;
        
        const activeCount = comp.ads.length;
        const totalEUReach = comp.ads.reduce((acc, ad) => acc + (ad.eu_total_reach || 0), 0);
        
        // Updated Budget Range: 5.00€ - 6.50€
        const minBudget = Math.round((totalEUReach / 1000) * 5.0);
        const maxBudget = Math.round((totalEUReach / 1000) * 6.5);

        const totalDuration = comp.ads.reduce((acc, ad) => {
            const created = new Date(ad.ad_creation_time).getTime();
            const now = new Date().getTime();
            return acc + (now - created);
        }, 0);
        const avgDurationDays = activeCount ? Math.floor((totalDuration / activeCount) / (1000 * 60 * 60 * 24)) : 0;
        
        return {
            ...comp,
            activeCount,
            avgDurationDays,
            totalEUReach,
            budget: { min: minBudget, max: maxBudget },
            mediaStats: { videoPct, staticPct, dynamicPct },
            score: activeCount * (1 + avgDurationDays * 0.1) + (totalEUReach / 10000)
        };
    }).sort((a, b) => b.score - a.score);
  }, [filteredCompetitors]);


  if (competitors.length === 0) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* ... KPIs ... */}
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex items-center shadow-sm hover:border-slate-600 transition-colors">
            <div className="p-3 bg-orange-900/50 rounded-lg mr-4">
                <Trophy className="w-6 h-6 text-orange-400" />
            </div>
            <div className="overflow-hidden">
                <p className="text-slate-400 text-xs uppercase font-bold">Top Performer</p>
                <p className="text-white font-bold text-lg truncate">{rankings[0]?.name || '-'}</p>
            </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex items-center shadow-sm hover:border-slate-600 transition-colors">
            <div className="p-3 bg-emerald-900/50 rounded-lg mr-4">
                <Activity className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
                <p className="text-slate-400 text-xs uppercase font-bold">Ads dans la période</p>
                <p className="text-white font-bold text-lg">
                    {filteredCompetitors.reduce((acc, c) => acc + c.ads.length, 0)}
                </p>
            </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex items-center shadow-sm hover:border-slate-600 transition-colors">
            <div className="p-3 bg-blue-900/50 rounded-lg mr-4">
                <Globe className="w-6 h-6 text-blue-400" />
            </div>
            <div>
                <p className="text-slate-400 text-xs uppercase font-bold">Reach Période</p>
                <p className="text-white font-bold text-lg truncate">
                    {rankings.reduce((acc, r) => acc + r.totalEUReach, 0).toLocaleString()}
                </p>
            </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex items-center shadow-sm hover:border-slate-600 transition-colors">
            <div className="p-3 bg-amber-900/50 rounded-lg mr-4">
                <Users className="w-6 h-6 text-amber-400" />
            </div>
            <div>
                <p className="text-slate-400 text-xs uppercase font-bold">Competitors</p>
                <p className="text-white font-bold text-lg">{competitors.length}</p>
            </div>
        </div>
      </div>

      {/* Ranking Table - UPDATED WITH DYNAMIC COLUMN */}
      <div id="competitor-ranking-table" className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
          <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
             <div>
                 <h3 className="text-white font-bold text-lg">Classement Concurrentiel</h3>
                 <p className="text-slate-400 text-xs">Basé sur le volume, la portée et la durée d'activité durant la période sélectionnée.</p>
             </div>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                      <tr>
                          <th className="px-6 py-3 font-semibold">Rang</th>
                          <th className="px-6 py-3 font-semibold">Concurrent</th>
                          <th className="px-6 py-3 text-center font-semibold">Ads Actives</th>
                          <th className="px-6 py-3 text-center font-semibold">Vidéo %</th>
                          <th className="px-6 py-3 text-center font-semibold">Image %</th>
                          <th className="px-6 py-3 text-center font-semibold">Dyn. %</th>
                          <th className="px-6 py-3 text-right font-semibold">Couverture UE</th>
                          <th className="px-6 py-3 text-center font-semibold">Budget Est.</th>
                          <th className="px-6 py-3 text-center font-semibold">Action</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                      {rankings.map((comp, idx) => {
                          const media = comp.mediaStats;
                          const isSyncing = syncingCompetitors.has(comp.id);
                          return (
                            <tr key={comp.id} className="hover:bg-slate-700/30 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-300">
                                    {idx === 0 && <Trophy className="w-4 h-4 text-yellow-500 inline mr-1" />}
                                    #{idx + 1}
                                </td>
                                <td className="px-6 py-4 flex items-center text-white font-medium">
                                    <div className="w-2 h-8 rounded-full mr-3" style={{backgroundColor: comp.color}}></div>
                                    {comp.profilePicture && (
                                        <img src={comp.profilePicture} alt={comp.name} className="w-8 h-8 rounded-full mr-3 object-cover shadow-sm" />
                                    )}
                                    {comp.name}
                                </td>
                                <td className="px-6 py-4 text-center text-slate-300">
                                    {comp.activeCount}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${media && media.videoPct > 50 ? 'bg-rose-900/30 text-rose-300' : 'bg-slate-700 text-slate-400'}`}>
                                        {media ? `${media.videoPct}%` : '0%'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span 
                                        className={`px-2 py-1 rounded text-xs font-bold ${media && media.staticPct > 50 ? 'bg-indigo-900/30 text-indigo-300' : 'bg-slate-700 text-slate-400'}`}>
                                        {media ? `${media.staticPct}%` : '0%'}
                                    </span>
                                </td>
                                 <td className="px-6 py-4 text-center">
                                    <span 
                                        className={`px-2 py-1 rounded text-xs font-bold ${media && media.dynamicPct > 20 ? 'bg-purple-900/30 text-purple-300' : 'bg-slate-700 text-slate-400'}`}>
                                        {media ? `${media.dynamicPct}%` : '0%'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right text-emerald-400 font-mono font-medium">
                                    {comp.totalEUReach > 0 ? comp.totalEUReach.toLocaleString() : '-'}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {comp.budget.max > 0 ? (
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-xs font-bold text-amber-400 font-mono bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/30 whitespace-nowrap">
                                                Max {comp.budget.max.toLocaleString()} €
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                                                Min {comp.budget.min.toLocaleString()} €
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-slate-600 font-mono">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center flex justify-center space-x-2">
                                    <button 
                                        onClick={() => onExplore(comp.id)}
                                        className="p-2 bg-slate-800 hover:bg-orange-600 text-slate-400 hover:text-white rounded-lg transition-all"
                                        title="Explorer les Ads"
                                    >
                                        <ScanSearch className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>

      {/* EU Reach Impact */}
      <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-lg relative">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 pr-12">
              <div>
                <h3 className="text-white font-bold flex items-center text-lg">
                    <Globe className="w-5 h-5 mr-2 text-blue-400" />
                    Estimation Couverture Quotidienne
                </h3>
                <p className="text-slate-400 text-xs">Moyenne de portée journalière basée sur la durée de vie des publicités actives.</p>
              </div>
          </div>
          
          <div className="absolute top-6 right-6 z-10">
              <ChartFilterMenu competitors={competitors} visibleIds={visReach} setVisibleIds={setVisReach} title="Couverture" />
          </div>

          <div className="h-[350px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reachData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 12, fontWeight: 500 }} formatter={(value: number) => [value.toLocaleString(), 'Reach Journalier Est.']} />
                    <Legend verticalAlign="top" height={36} iconType="circle" formatter={formatLegend} />
                    {filteredCompetitors.map(comp => (
                        visReach.has(comp.id) && (
                            <Line 
                                key={comp.id}
                                type="monotone" 
                                dataKey={comp.name} 
                                stroke={comp.color} 
                                strokeWidth={3}
                                dot={{ r: 4, strokeWidth: 2, fill: '#0f172a' }}
                                activeDot={{ r: 6, strokeWidth: 0, fill: comp.color }}
                            />
                        )
                    ))}
                </LineChart>
            </ResponsiveContainer>
          </div>
      </div>
      
      {/* Charts Row (Velocity + Media) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-lg relative">
              <div className="mb-6 pr-12">
                  <h3 className="text-white font-bold flex items-center text-lg">
                      <Activity className="w-5 h-5 mr-2 text-emerald-400" />
                      Fréquence de Publication
                  </h3>
                  <p className="text-slate-400 text-xs">Nouvelles publicités lancées par jour</p>
              </div>
              
              <div className="absolute top-6 right-6 z-10">
                  <ChartFilterMenu competitors={competitors} visibleIds={visActivity} setVisibleIds={setVisActivity} title="Fréquence" />
              </div>

              <div className="h-[250px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData}>
                        <defs>
                            {filteredCompetitors.map((c) => (
                                <linearGradient key={c.id} id={`colorAct${c.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={c.color} stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor={c.color} stopOpacity={0}/>
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend verticalAlign="top" height={36} iconType="circle" formatter={formatLegend} />
                        {filteredCompetitors.map(comp => (
                            visActivity.has(comp.id) && (
                                <Area key={comp.id} type="monotone" dataKey={comp.name} stroke={comp.color} fill={`url(#colorAct${comp.id})`} strokeWidth={2} />
                            )
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
              </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-lg relative">
             <div className="mb-6 pr-12">
                <h3 className="text-white font-bold flex items-center text-lg">
                    <Video className="w-5 h-5 mr-2 text-rose-400" />
                    Répartition des Formats
                </h3>
                <p className="text-slate-400 text-xs">Vidéo vs Image vs Dynamique</p>
             </div>
             
             <div className="absolute top-6 right-6 z-10">
                  <ChartFilterMenu competitors={competitors} visibleIds={visMedia} setVisibleIds={setVisMedia} title="Formats" />
             </div>

             <div className="space-y-6 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
                 {mediaSplitData.filter(d => visMedia.has(d.id)).map(data => (
                     <div key={data.name}>
                         <div className="flex justify-between text-sm mb-1">
                             <span className="font-medium text-slate-200 flex items-center">
                                <div className="w-2 h-2 rounded-full mr-2" style={{backgroundColor: data.color}}></div>
                                {data.name}
                             </span>
                             <span className="text-slate-500 text-xs">{data.total} ads</span>
                         </div>
                         <div className="flex h-3 rounded-full overflow-hidden bg-slate-900 border border-slate-700/50">
                             <div 
                                style={{ width: `${data.videoPct}%` }} 
                                className="bg-rose-500 hover:bg-rose-400 transition-colors" 
                                title={`Video: ${data.videoPct}%`}
                             ></div>
                             <div 
                                style={{ width: `${data.staticPct}%` }} 
                                className="bg-indigo-500 hover:bg-indigo-400 transition-colors" 
                                title={`Image: ${data.staticPct}%`}
                             ></div>
                             <div 
                                style={{ width: `${data.dynamicPct}%` }} 
                                className="bg-purple-500 hover:bg-purple-400 transition-colors" 
                                title={`Dynamique: ${data.dynamicPct}%`}
                             ></div>
                         </div>
                     </div>
                 ))}
                 {mediaSplitData.filter(d => visMedia.has(d.id)).length === 0 && (
                     <div className="text-center text-slate-500 text-sm py-10">Aucun concurrent sélectionné</div>
                 )}
             </div>
          </div>
      </div>
      
      {/* Bottom Row: Demographics & Budget Evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Demographics */}
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-lg relative">
              <div className="mb-6 pr-12">
                  <h3 className="text-white font-bold flex items-center text-lg">
                      <Users className="w-5 h-5 mr-2 text-amber-400" />
                      Cible Démographique
                  </h3>
                  <p className="text-slate-400 text-xs">Estimation de la portée par tranche d'âge</p>
              </div>

              <div className="absolute top-6 right-6 z-10">
                  <ChartFilterMenu competitors={competitors} visibleIds={visDemo} setVisibleIds={setVisDemo} title="Démographie" />
              </div>

              <div className="h-[300px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={demographicsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="age" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                        <Legend verticalAlign="top" height={36} formatter={formatLegend} />
                        {filteredCompetitors.map(comp => (
                            visDemo.has(comp.id) && (
                                <Bar key={comp.id} dataKey={comp.name} fill={comp.color} stackId="a" barSize={50} />
                            )
                        ))}
                    </BarChart>
                </ResponsiveContainer>
              </div>
          </div>

          {/* Estimated Budget Evolution Chart (Area Chart) */}
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-lg relative">
              <div className="mb-6 pr-12">
                  <h3 className="text-white font-bold flex items-center text-lg">
                      <Coins className="w-5 h-5 mr-2 text-yellow-500" />
                      Évolution du Budget Estimé
                  </h3>
                  <p className="text-slate-400 text-xs">Dépenses journalières estimées (CPM moy. 5.50€)</p>
              </div>

              <div className="absolute top-6 right-6 z-10">
                  <ChartFilterMenu competitors={competitors} visibleIds={visBudget} setVisibleIds={setVisBudget} title="Budget" />
              </div>

              <div className="h-[300px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={budgetEvolutionData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                        <defs>
                            {filteredCompetitors.map((c) => (
                                <linearGradient key={c.id} id={`colorBudget${c.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={c.color} stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor={c.color} stopOpacity={0}/>
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                        <Tooltip 
                            contentStyle={tooltipStyle}
                            formatter={(value: number, name: string) => [`${value.toLocaleString()} €`, name]}
                        />
                        <Legend verticalAlign="top" height={36} iconType="circle" formatter={formatLegend} />
                         {filteredCompetitors.map(comp => (
                            visBudget.has(comp.id) && (
                                <Area 
                                    key={comp.id} 
                                    type="monotone" 
                                    dataKey={comp.name} 
                                    stroke={comp.color} 
                                    fill={`url(#colorBudget${comp.id})`}
                                    strokeWidth={2}
                                />
                            )
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
              </div>
          </div>
      </div>
    </div>
  );
};