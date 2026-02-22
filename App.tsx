
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { AdEntity, AnalysisResult, AppState, Competitor, UserProfile, DashboardDateRange } from './types';
import { fetchCompetitorAds, fetchPageDetails, validateApiToken } from './services/facebookService';
import { analyzeAdsStrategy } from './services/geminiService';
import { authService } from './services/authService';
import { startOnboarding } from './services/tourService';
import { runFullSyncPipeline, checkApifyConnection, sanitizeToken } from './services/apifyService';
import { updateSupabaseConfig, getCurrentSupabaseConfig } from './services/supabaseClient';
import { AdCard } from './components/AdCard';
import { DashboardStats } from './components/DashboardStats';
import { AnalysisPanel } from './components/AnalysisPanel';
import { CompetitorStats } from './components/CompetitorStats';
import { TopAdsRanking } from './components/TopAdsRanking';
import { AuthScreen } from './components/AuthScreen';
import { 
  Search, Database, Bot, AlertCircle, Layers, ShieldAlert, Download, Filter, ArrowUpDown,
  LayoutDashboard, Users, Settings, Plus, X, BarChart3, RefreshCw, LogOut, User, Trophy, Flame, Menu,
  Video, Image as ImageIcon, Calendar, FolderPlus, Folder, Tag, Trash2, CheckCircle2, XCircle, ExternalLink, HelpCircle, ChevronLeft, ChevronRight, ChevronDown, Loader2, Save
} from 'lucide-react';

// Pre-defined colors for competitors (Updated palette)
const CHART_COLORS = ['#f97316', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

type TimeRange = '7d' | '30d' | 'ALL';
type MediaFilter = 'ALL' | 'VIDEO' | 'IMAGE' | 'DYNAMIC' | 'IMAGE_DYNAMIC';

const ADS_PER_PAGE = 10;
// No default token - User must provide their own
const DEFAULT_APIFY_TOKEN = '';

const App: React.FC = () => {
  // --- Auth State ---
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // --- UI State ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- Global Settings ---
  const [token, setToken] = useState('');
  const [apifyToken, setApifyToken] = useState(DEFAULT_APIFY_TOKEN);
  const [country, setCountry] = useState('FR');
  const [showSettings, setShowSettings] = useState(false);

  // --- Supabase Settings State ---
  const [customSupabaseUrl, setCustomSupabaseUrl] = useState('');
  const [customSupabaseKey, setCustomSupabaseKey] = useState('');
  
  // --- Token Validation State ---
  const [tokenStatus, setTokenStatus] = useState<'IDLE' | 'VALIDATING' | 'VALID' | 'INVALID'>('IDLE');
  const [apifyTokenStatus, setApifyTokenStatus] = useState<'IDLE' | 'VALIDATING' | 'VALID' | 'INVALID'>('IDLE');

  // --- Competitor State ---
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [groups, setGroups] = useState<string[]>([]); // User defined categories
  const [newPageId, setNewPageId] = useState('');
  const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
  const [syncingCompetitors, setSyncingCompetitors] = useState<Set<string>>(new Set());
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  
  // --- Group Management State ---
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [newGroupName, setNewGroupName] = useState('');
  const [isManagingGroups, setIsManagingGroups] = useState(false);

  // --- Dashboard Filter State ---
  const [dashboardDateRange, setDashboardDateRange] = useState<DashboardDateRange>('LAST_30_DAYS');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // --- View State ---
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'ADS' | 'COMPETITORS' | 'HIT_PARADE'>('DASHBOARD');
  
  // --- Data & Analysis State ---
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // --- Filter/Sort State (Global for Ads View) ---
  const [selectedCompetitorFilter, setSelectedCompetitorFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'NEWEST' | 'OLDEST'>('NEWEST');
  const [explorerTimeRange, setExplorerTimeRange] = useState<TimeRange>('ALL');
  const [explorerMediaFilter, setExplorerMediaFilter] = useState<MediaFilter>('ALL');

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState(1);

  // ----------------------------------------------------------------
  // 1. Initialization & Auth
  // ----------------------------------------------------------------
  useEffect(() => {
    const init = async () => {
      try {
        // Init Supabase Config UI State
        const sbConfig = getCurrentSupabaseConfig();
        setCustomSupabaseUrl(sbConfig.url);
        setCustomSupabaseKey(sbConfig.key);

        const currentUser = await authService.getCurrentUser();
        if (currentUser) {
          try {
             const data = await authService.loadUserData(currentUser.email, currentUser.id);
             setUser(currentUser);
             setCompetitors(data.competitors || []);
             setGroups(data.groups || []);
             setToken(data.settings.apiToken || '');
             setApifyToken(data.settings.apifyToken || DEFAULT_APIFY_TOKEN);
             setCountry(data.settings.targetCountry || 'FR');
             
             if (!data.settings.apiToken && currentUser.email !== 'demo@adintel.ai') {
                 setShowSettings(true);
             } else {
                 setShowSettings(false);
             }
          } catch (e: any) {
             console.warn("Failed to load user data on init, resetting session", e);
             await authService.logout();
             setUser(null);
          }
        }
      } catch (e) {
        console.error("Auth init error", e);
        setUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    };
    init();
  }, []);

  // ----------------------------------------------------------------
  // Onboarding Tour Trigger
  // ----------------------------------------------------------------
  useEffect(() => {
      if (user && !user.hasSeenOnboarding && !isAuthLoading && competitors.length > 0) {
          setTimeout(() => {
              startOnboarding({
                  navigate: (view) => setCurrentView(view),
                  markComplete: async () => {
                      if (user.email !== 'demo@adintel.ai') {
                          await authService.completeOnboarding(user.id);
                      }
                      setUser(prev => prev ? {...prev, hasSeenOnboarding: true} : null);
                  }
              });
          }, 1000);
      }
  }, [user, isAuthLoading, competitors.length]);


  // ----------------------------------------------------------------
  // 2. Auto-Save Data Effect
  // ----------------------------------------------------------------
  useEffect(() => {
    if (user) {
      const timeoutId = setTimeout(() => {
        authService.saveUserData(user.email, {
          competitors,
          groups,
          settings: { apiToken: token, targetCountry: country, apifyToken },
          hasSeenOnboarding: user.hasSeenOnboarding
        });
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [competitors, groups, token, apifyToken, country, user]);


  // ----------------------------------------------------------------
  // 3. Handlers
  // ----------------------------------------------------------------

  const handleLoginSuccess = async (loggedInUser: UserProfile) => {
      setUser(loggedInUser);
      try {
        const data = await authService.loadUserData(loggedInUser.email, loggedInUser.id);
        setCompetitors(data.competitors || []);
        setGroups(data.groups || []);
        setToken(data.settings.apiToken || '');
        setApifyToken(data.settings.apifyToken || DEFAULT_APIFY_TOKEN);
        setCountry(data.settings.targetCountry || 'FR');
        
        if (!data.settings.apiToken && loggedInUser.email !== 'demo@adintel.ai') {
            setShowSettings(true);
        } else {
            setShowSettings(false);
            setCurrentView('DASHBOARD');
        }
      } catch (e) {
        console.warn("Initial data load failed, starting with empty state", e);
        setCompetitors([]);
        setGroups([]);
        if (loggedInUser.email !== 'demo@adintel.ai') {
            setShowSettings(true);
        } else {
            setShowSettings(false);
            setCurrentView('DASHBOARD');
        }
      }
  };

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    setCompetitors([]);
    setGroups([]);
    setToken('');
    setApifyToken(DEFAULT_APIFY_TOKEN);
    setAnalysis(null);
    setCurrentView('DASHBOARD');
  };

  // --- Settings Handlers ---
  const handleSaveSupabaseConfig = () => {
      if (confirm("Changer la configuration Supabase rechargera la page. Voulez-vous continuer ?")) {
          updateSupabaseConfig(customSupabaseUrl, customSupabaseKey);
      }
  };

  const handleValidateToken = async () => {
      if (!token) return;
      setTokenStatus('VALIDATING');
      try {
          const isValid = await validateApiToken(token);
          setTokenStatus(isValid ? 'VALID' : 'INVALID');
          if (isValid) {
              setTimeout(() => setShowSettings(false), 1500);
          }
      } catch (e) {
          setTokenStatus('INVALID');
      }
  };

  const handleTestApifyToken = async () => {
      if (!apifyToken) return;
      setApifyTokenStatus('VALIDATING');
      const result = await checkApifyConnection(apifyToken);
      if (result.valid) {
          setApifyTokenStatus('VALID');
          alert(`Connexion Apify réussie ! Connecté en tant que : ${result.username}`);
      } else {
          setApifyTokenStatus('INVALID');
          alert(`Erreur connexion Apify : ${result.error}`);
      }
  };

  // --- Group Management Handlers ---

  const handleCreateGroup = () => {
      const name = newGroupName.trim();
      if (!name) return;
      if (groups.includes(name)) {
          setErrorMsg("La catégorie existe déjà.");
          return;
      }
      setGroups([...groups, name]);
      setNewGroupName('');
  };

  const handleDeleteGroup = (groupName: string) => {
      setGroups(groups.filter(g => g !== groupName));
      setCompetitors(competitors.map(c => ({
          ...c,
          groups: c.groups?.filter(g => g !== groupName)
      })));
      if (selectedGroupFilter === groupName) setSelectedGroupFilter('ALL');
  };

  const handleAddGroupToCompetitor = (competitorId: string, groupName: string) => {
      if (!groupName) return;
      setCompetitors(competitors.map(c => {
          if (c.id === competitorId) {
              const currentGroups = c.groups || [];
              if (currentGroups.includes(groupName)) return c;
              return { ...c, groups: [...currentGroups, groupName] };
          }
          return c;
      }));
  };

  const handleRemoveGroupFromCompetitor = (competitorId: string, groupName: string) => {
      setCompetitors(competitors.map(c => {
          if (c.id === competitorId) {
              return { ...c, groups: c.groups?.filter(g => g !== groupName) };
          }
          return c;
      }));
  };

  // --- Single Ad Update Handler (Called by AdCard) ---
  const handleAdUpdated = useCallback((adId: string, mediaUrl: string, mediaType: string) => {
      setCompetitors(prev => prev.map(comp => ({
          ...comp,
          ads: comp.ads.map(ad => {
              if (ad.id === adId) {
                  return { ...ad, media_url: mediaUrl, media_type: mediaType as any };
              }
              return ad;
          })
      })));
  }, []);

  /**
   * CORE LOGIC: SYNC MEDIA FROM APIFY
   */
  const performMediaSync = async (comp: Competitor, currentApifyToken: string) => {
      setSyncingCompetitors(prev => new Set(prev).add(comp.id));
      setSyncMessage(`Synchro médias pour ${comp.name}...`);
      
      try {
          let updatedAds = [...comp.ads];

          // 1. Run Apify Pipeline
          const resultMap = await runFullSyncPipeline([comp.id], currentApifyToken, (msg) => setSyncMessage(msg));
          
          // 2. Merge Results
          updatedAds = updatedAds.map(ad => {
              if (resultMap.has(ad.id)) {
                  const data = resultMap.get(ad.id)!;
                  return {
                      ...ad,
                      media_type: data.media_type as any,
                      media_url: data.media_url, 
                      extracted_video_url: data.media_type === 'VIDEO' ? data.media_url : undefined,
                      extracted_image_url: data.media_type === 'IMAGE' ? data.media_url : undefined
                  };
              }
              return ad;
          });

          // 3. Update State safely
          setCompetitors(prevCompetitors => {
              return prevCompetitors.map(c => {
                  if (c.id === comp.id) {
                      return { ...c, ads: updatedAds, lastUpdated: new Date().toISOString() };
                  }
                  return c;
              });
          });

          setSyncMessage(null);
          return updatedAds;

      } catch (e: any) {
          console.error("Sync failed", e);
          let msg = e.message;
          if (msg.includes('401')) {
              msg = "Token Apify invalide (401).";
              setShowSettings(true);
          } else if (msg.includes('ISO-8859-1')) {
              msg = "Le token contient des caractères invalides.";
              setShowSettings(true);
          }
          setErrorMsg("Échec de la synchronisation média: " + msg);
          setSyncMessage(null);
          return comp.ads;
      } finally {
          setSyncingCompetitors(prev => {
              const next = new Set(prev);
              next.delete(comp.id);
              return next;
          });
      }
  };

  const handleSyncCompetitorButton = async (competitorId: string) => {
      const comp = competitors.find(c => c.id === competitorId);
      if (comp && apifyToken) {
          await performMediaSync(comp, apifyToken);
      } else {
          setErrorMsg("Token Apify requis.");
          setShowSettings(true);
      }
  };
  
  const handleBatchSync = async () => {
      if (!apifyToken) {
          setErrorMsg("Token Apify requis.");
          setShowSettings(true);
          return;
      }

      const targets = selectedCompetitorFilter === 'ALL' 
          ? visibleCompetitors 
          : visibleCompetitors.filter(c => c.id === selectedCompetitorFilter);

      if (targets.length === 0) return;

      for (const comp of targets) {
          await performMediaSync(comp, apifyToken);
      }
  };

  const handleAddCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPageId || !token) {
        setErrorMsg("Page ID and Token are required.");
        return;
    }
    
    setIsAddingCompetitor(true);
    setErrorMsg(null);

    try {
        const pageDetails = await fetchPageDetails(newPageId, token);
        const ads = await fetchCompetitorAds(newPageId, token, country);

        if (ads.length === 0 && !pageDetails) {
             throw new Error("Aucune publicité trouvée ou ID incorrect.");
        }

        const resolvedName = pageDetails?.name || ads[0]?.page_name || `Page ${newPageId}`;
        const resolvedId = pageDetails?.id || ads[0]?.page_id || newPageId;
        const resolvedPic = pageDetails?.picture?.data?.url;

        const newCompetitor: Competitor = {
            id: resolvedId,
            name: resolvedName,
            profilePicture: resolvedPic,
            ads: ads,
            color: CHART_COLORS[competitors.length % CHART_COLORS.length],
            lastUpdated: new Date().toISOString(),
            groups: []
        };

        if (competitors.some(c => c.id === newCompetitor.id)) {
            throw new Error("Ce concurrent est déjà suivi.");
        }

        setCompetitors(prev => [...prev, newCompetitor]);
        setNewPageId('');
        
        if (competitors.length === 0) {
            setCurrentView('DASHBOARD');
            setShowSettings(false);
        }

        // AUTO-TRIGGER MEDIA SYNC via APIFY
        if (apifyToken && apifyToken.length > 5) {
            setTimeout(() => {
                performMediaSync(newCompetitor, apifyToken);
            }, 500); 
        }

    } catch (err: any) {
        setErrorMsg(err.message);
    } finally {
        setIsAddingCompetitor(false);
    }
  };

  const removeCompetitor = (id: string) => {
      setCompetitors(prev => prev.filter(c => c.id !== id));
  };

  const refreshAllData = async () => {
      if (!token || competitors.length === 0) return;
      setAppState(AppState.LOADING_ADS);
      
      try {
          const updatedCompetitors = await Promise.all(competitors.map(async (comp) => {
              const freshAds = await fetchCompetitorAds(comp.id, token, country);
              const existingAdMap = new Map<string, AdEntity>(comp.ads.map(ad => [ad.id, ad]));
              
              const mergedAds = freshAds.map(newAd => {
                  const existing = existingAdMap.get(newAd.id);
                  if (existing && (existing.extracted_video_url || existing.extracted_image_url || existing.media_url)) {
                      return {
                          ...newAd,
                          media_type: existing.media_type,
                          media_url: existing.media_url,
                          extracted_video_url: existing.extracted_video_url,
                          extracted_image_url: existing.extracted_image_url
                      };
                  }
                  return newAd;
              });

              return { 
                  ...comp, 
                  ads: mergedAds, 
                  lastUpdated: new Date().toISOString() 
              };
          }));
          setCompetitors(updatedCompetitors);
          setAppState(AppState.ADS_LOADED);
      } catch (err: any) {
          setErrorMsg("Failed to refresh data: " + err.message);
          setAppState(AppState.ERROR);
      }
  };

  const handleExploreCompetitor = (competitorId: string) => {
      setSelectedCompetitorFilter(competitorId);
      setCurrentView('ADS');
      setIsMobileMenuOpen(false);
  };

  // --- Derived Data ---
  const visibleCompetitors = useMemo(() => {
      if (selectedGroupFilter === 'ALL') return competitors;
      if (selectedGroupFilter === 'UNCATEGORIZED') return competitors.filter(c => !c.groups || c.groups.length === 0);
      return competitors.filter(c => c.groups?.includes(selectedGroupFilter));
  }, [competitors, selectedGroupFilter]);

  const allAds = useMemo(() => {
      return visibleCompetitors.flatMap(c => c.ads.map(ad => ({...ad, competitorName: c.name, competitorColor: c.color})));
  }, [visibleCompetitors]);

  const filteredAds = useMemo(() => {
    let result = [...allAds];
    
    if (selectedCompetitorFilter !== 'ALL') {
        result = result.filter(ad => ad.page_id === selectedCompetitorFilter);
    }
    
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(ad => 
        ad.ad_creative_bodies?.some(b => b.toLowerCase().includes(lowerTerm)) ||
        ad.ad_creative_link_titles?.some(t => t.toLowerCase().includes(lowerTerm)) ||
        ad.page_name.toLowerCase().includes(lowerTerm)
      );
    }

    const now = new Date();
    const cutoff = new Date();
    if (explorerTimeRange === '7d') cutoff.setDate(now.getDate() - 7);
    if (explorerTimeRange === '30d') cutoff.setDate(now.getDate() - 30);
    
    if (explorerTimeRange !== 'ALL') {
        result = result.filter(ad => new Date(ad.ad_creation_time) >= cutoff);
    }

    if (explorerMediaFilter === 'VIDEO') {
        result = result.filter(ad => ad.media_type === 'VIDEO' || ad.extracted_video_url);
    } else if (explorerMediaFilter === 'IMAGE') {
        result = result.filter(ad => ad.media_type === 'IMAGE' || (!ad.media_type && !ad.extracted_video_url));
    } else if (explorerMediaFilter === 'DYNAMIC') {
        result = result.filter(ad => ad.media_type === 'DYNAMIC_IMAGE');
    } else if (explorerMediaFilter === 'IMAGE_DYNAMIC') {
        result = result.filter(ad => 
            ad.media_type === 'IMAGE' || 
            ad.media_type === 'DYNAMIC_IMAGE' || 
            (!ad.media_type && !ad.extracted_video_url)
        );
    }

    result.sort((a, b) => {
      const dateA = new Date(a.ad_creation_time).getTime();
      const dateB = new Date(b.ad_creation_time).getTime();
      return sortOrder === 'NEWEST' ? dateB - dateA : dateA - dateB;
    });
    return result;
  }, [allAds, searchTerm, sortOrder, selectedCompetitorFilter, explorerTimeRange, explorerMediaFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCompetitorFilter, searchTerm, explorerTimeRange, explorerMediaFilter, sortOrder]);

  const { displayedAds, totalPages } = useMemo(() => {
      const totalPages = Math.ceil(filteredAds.length / ADS_PER_PAGE);
      const start = (currentPage - 1) * ADS_PER_PAGE;
      const displayedAds = filteredAds.slice(start, start + ADS_PER_PAGE);
      return { displayedAds, totalPages };
  }, [filteredAds, currentPage]);


  const handleAnalyze = async () => {
      if (filteredAds.length === 0) return;
      setAppState(AppState.ANALYZING);
      try {
          const result = await analyzeAdsStrategy(filteredAds.slice(0, 50));
          setAnalysis(result);
          setAppState(AppState.ADS_LOADED);
      } catch (err: any) {
          setAppState(AppState.ADS_LOADED);
          setErrorMsg(err.message);
      }
  };

  const handleClearAnalysis = () => {
      setAnalysis(null);
      setAppState(AppState.ADS_LOADED);
  };

  const handleExport = () => {
    if (filteredAds.length === 0) return;
    const headers = ['Competitor', 'ID', 'Date', 'Headline', 'Body', 'Snapshot URL', 'EU Reach'];
    const csvRows = [headers.join(',')];
    filteredAds.forEach(ad => {
        const row = [
            `"${ad.page_name}"`,
            ad.id,
            ad.ad_creation_time,
            `"${(ad.ad_creative_link_titles?.[0] || '').replace(/"/g, '""')}"`,
            `"${(ad.ad_creative_bodies?.[0] || '').replace(/"/g, '""')}"`,
            ad.ad_snapshot_url,
            ad.eu_total_reach || 'N/A'
        ];
        csvRows.push(row.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ad-export-${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const CategoryTabs = () => (
      <div id="category-tabs" className="flex items-center gap-4 mb-6 flex-wrap">
         <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 overflow-x-auto max-w-full">
            <button 
                onClick={() => setSelectedGroupFilter('ALL')}
                className={`px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap flex items-center ${selectedGroupFilter === 'ALL' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                <LayoutDashboard className="w-3 h-3 mr-2" />
                Vue d'ensemble
            </button>
            {groups.map(group => (
                <button 
                    key={group}
                    onClick={() => setSelectedGroupFilter(group)}
                    className={`px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap flex items-center ${selectedGroupFilter === group ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                    <Folder className="w-3 h-3 mr-2" />
                    {group}
                </button>
            ))}
            <button 
                onClick={() => setSelectedGroupFilter('UNCATEGORIZED')}
                className={`px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap ${selectedGroupFilter === 'UNCATEGORIZED' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                Non classés ({competitors.filter(c => !c.groups || c.groups.length === 0).length})
            </button>
         </div>
         <div className="ml-auto flex items-center gap-2">
             <div className="relative">
                 <Calendar className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-orange-500 z-10 pointer-events-none" />
                 <select 
                    value={dashboardDateRange}
                    onChange={(e) => setDashboardDateRange(e.target.value as DashboardDateRange)}
                    className="bg-slate-900 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg pl-9 pr-4 py-2.5 focus:border-orange-500 outline-none appearance-none cursor-pointer hover:bg-slate-800"
                 >
                     <option value="TODAY">Aujourd'hui</option>
                     <option value="YESTERDAY">Hier</option>
                     <option value="LAST_7_DAYS">7 derniers jours</option>
                     <option value="LAST_30_DAYS">30 derniers jours</option>
                     <option value="THIS_MONTH">Ce mois-ci</option>
                     <option value="LAST_MONTH">Mois précédent</option>
                     <option value="ALL_TIME">Tout l'historique</option>
                     <option value="CUSTOM">Personnalisé</option>
                 </select>
                 <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 pointer-events-none" />
             </div>
             
             {dashboardDateRange === 'CUSTOM' && (
                 <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                     <input 
                        type="date" 
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-2.5 focus:border-orange-500 outline-none"
                        max={customEnd}
                     />
                     <span className="text-slate-500 text-xs">à</span>
                     <input 
                        type="date" 
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-2.5 focus:border-orange-500 outline-none"
                        min={customStart}
                     />
                 </div>
             )}
         </div>
      </div>
  );

  if (isAuthLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-t-2 border-orange-500 rounded-full"></div>
    </div>
  );

  if (!user) return <AuthScreen onLoginSuccess={handleLoginSuccess} />;

  const Sidebar = () => (
      <>
        {isMobileMenuOpen && (
            <div 
                className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm transition-opacity"
                onClick={() => setIsMobileMenuOpen(false)}
            />
        )}
        <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen transition-transform duration-300 lg:translate-x-0 lg:transform-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div id="sidebar-logo" className="p-6 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-900/20">
                    <Flame className="text-white w-5 h-5" />
                    </div>
                    <h1 className="text-sm font-bold text-white tracking-tight leading-tight">MetaScan<br/><span className="text-xs text-slate-400 font-normal">by la Digit'Cave</span></h1>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="p-4">
                <div className="flex items-center p-3 bg-slate-800 rounded-xl border border-slate-700 mb-2">
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center mr-3 shrink-0">
                        <User className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-bold text-white truncate">{user.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                            {user.email === 'demo@adintel.ai' ? 'Demo Account' : 'SaaS Plan'}
                        </p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                <button 
                    id="sidebar-dashboard"
                    onClick={() => { setCurrentView('DASHBOARD'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${currentView === 'DASHBOARD' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                    <LayoutDashboard className="w-5 h-5 mr-3 shrink-0" />
                    Overview
                </button>
                <button 
                    id="sidebar-ads"
                    onClick={() => { setCurrentView('ADS'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${currentView === 'ADS' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                    <Database className="w-5 h-5 mr-3 shrink-0" />
                    Ad Explorer
                    <span className="ml-auto bg-slate-800 text-xs py-0.5 px-2 rounded-full text-slate-300">{allAds.length}</span>
                </button>
                <button 
                    id="sidebar-hitparade"
                    onClick={() => { setCurrentView('HIT_PARADE'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${currentView === 'HIT_PARADE' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                    <Trophy className="w-5 h-5 mr-3 shrink-0 text-yellow-500" />
                    Hit Parade
                </button>
                <button 
                    id="sidebar-competitors"
                    onClick={() => { setCurrentView('COMPETITORS'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${currentView === 'COMPETITORS' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                    <Users className="w-5 h-5 mr-3 shrink-0" />
                    Competitors
                    <span className="ml-auto bg-slate-800 text-xs py-0.5 px-2 rounded-full text-slate-300">{competitors.length}</span>
                </button>
            </nav>

            <div className="p-4 border-t border-slate-800 space-y-2">
                <button 
                    onClick={() => { setShowSettings(!showSettings); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center px-4 py-3 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                >
                    <Settings className="w-5 h-5 mr-3 shrink-0" />
                    API Settings
                </button>
                <button 
                    onClick={handleLogout}
                    className="w-full flex items-center px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded-xl transition-all"
                >
                    <LogOut className="w-5 h-5 mr-3 shrink-0" />
                    Sign Out
                </button>
            </div>
        </div>
      </>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 lg:pl-64 transition-all duration-300">
      <Sidebar />

      {/* Top Bar */}
      <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
         <div className="flex items-center">
             <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="mr-4 text-slate-400 hover:text-white lg:hidden p-1 rounded-md hover:bg-slate-800"
             >
                 <Menu className="w-6 h-6" />
             </button>
             <h2 className="text-base lg:text-lg font-semibold text-white truncate">
                 {currentView === 'DASHBOARD' && 'Market Overview'}
                 {currentView === 'ADS' && 'Ad Creative Explorer'}
                 {currentView === 'HIT_PARADE' && 'Top Performance Ranking'}
                 {currentView === 'COMPETITORS' && 'Competitor Management'}
             </h2>
         </div>
         <div className="flex items-center space-x-3 lg:space-x-4">
             {syncMessage && (
                 <div className="hidden sm:flex items-center text-xs text-orange-300 bg-orange-900/20 px-3 py-1.5 rounded-full border border-orange-900/30 animate-pulse">
                     <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                     {syncMessage}
                 </div>
             )}
             {token && competitors.length > 0 && (
                 <button 
                    onClick={refreshAllData}
                    disabled={appState === AppState.LOADING_ADS}
                    className="p-2 text-slate-400 hover:text-orange-400 transition-colors rounded-full hover:bg-slate-800"
                    title="Refresh Data"
                 >
                    <RefreshCw className={`w-5 h-5 ${appState === AppState.LOADING_ADS ? 'animate-spin' : ''}`} />
                 </button>
             )}
             <div className="hidden sm:flex items-center text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
               <ShieldAlert className="w-3 h-3 mr-2 text-emerald-500" />
               <span>Data Saved</span>
             </div>
         </div>
      </header>

      <main className="p-4 lg:p-8 max-w-7xl mx-auto">
        
        {/* Settings Modal - Identical to previous */}
        {showSettings && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
                    <div className="flex-1 p-8 flex flex-col overflow-y-auto">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center">
                                    <Settings className="w-5 h-5 mr-2 text-orange-500" />
                                    Configuration API
                                </h3>
                                <p className="text-slate-400 text-sm mt-1">Connectez vos services tiers.</p>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white md:hidden">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Meta Access Token</label>
                                <div className="relative">
                                    <input 
                                        type="password" 
                                        value={token} 
                                        onChange={(e) => {
                                            setToken(e.target.value);
                                            setTokenStatus('IDLE');
                                        }}
                                        className={`w-full bg-slate-950 border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 transition-all pr-12 ${
                                            tokenStatus === 'INVALID' ? 'border-red-500 focus:ring-red-500/20' : 
                                            tokenStatus === 'VALID' ? 'border-emerald-500 focus:ring-emerald-500/20' : 
                                            'border-slate-700 focus:border-orange-500 focus:ring-orange-500/20'
                                        }`}
                                        placeholder="Collez votre token Meta ici..."
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        {tokenStatus === 'VALIDATING' && <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />}
                                        {tokenStatus === 'VALID' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                        {tokenStatus === 'INVALID' && <XCircle className="w-5 h-5 text-red-500" />}
                                    </div>
                                </div>
                                {tokenStatus === 'INVALID' && (
                                    <p className="text-xs text-red-400 mt-2 flex items-center">
                                        <AlertCircle className="w-3 h-3 mr-1" /> Token invalide ou expiré.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Apify API Token (Auto-Scraping)</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input 
                                            type="password" 
                                            value={apifyToken} 
                                            onChange={(e) => {
                                                setApifyToken(sanitizeToken(e.target.value));
                                                setApifyTokenStatus('IDLE');
                                            }}
                                            className={`w-full bg-slate-950 border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 transition-all ${
                                                apifyTokenStatus === 'INVALID' ? 'border-red-500 focus:ring-red-500/20' : 
                                                apifyTokenStatus === 'VALID' ? 'border-emerald-500 focus:ring-emerald-500/20' : 
                                                'border-slate-700 focus:border-orange-500 focus:ring-orange-500/20'
                                            }`}
                                            placeholder="Token Apify..."
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {apifyTokenStatus === 'VALID' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                            {apifyTokenStatus === 'INVALID' && <XCircle className="w-5 h-5 text-red-500" />}
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleTestApifyToken}
                                        disabled={!apifyToken || apifyTokenStatus === 'VALIDATING'}
                                        className="bg-slate-800 hover:bg-slate-700 text-white px-4 rounded-lg border border-slate-700 font-medium text-sm disabled:opacity-50"
                                        title="Vérifier le token"
                                    >
                                        {apifyTokenStatus === 'VALIDATING' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tester'}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-800 space-y-4">
                                <h4 className="text-sm font-bold text-white flex items-center">
                                    <Database className="w-4 h-4 mr-2 text-emerald-500" />
                                    Configuration Supabase (Stockage)
                                </h4>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Project URL</label>
                                    <input 
                                        type="text" 
                                        value={customSupabaseUrl} 
                                        onChange={(e) => setCustomSupabaseUrl(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                                        placeholder="https://xyz.supabase.co"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Anon Key</label>
                                    <input 
                                        type="password" 
                                        value={customSupabaseKey} 
                                        onChange={(e) => setCustomSupabaseKey(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                                        placeholder="eyJh..."
                                    />
                                </div>
                                <button 
                                    onClick={handleSaveSupabaseConfig}
                                    className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 flex items-center"
                                >
                                    <Save className="w-3 h-3 mr-2" />
                                    Enregistrer Config Supabase (Rechargement requis)
                                </button>
                            </div>

                            <div>
                                 <label className="block text-sm font-medium text-slate-300 mb-2">Pays Cible</label>
                                 <select 
                                    value={country} 
                                    onChange={(e) => setCountry(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-orange-500 outline-none"
                                >
                                    <option value="FR">France</option>
                                    <option value="US">États-Unis</option>
                                    <option value="GB">Royaume-Uni</option>
                                    <option value="DE">Allemagne</option>
                                    <option value="ES">Espagne</option>
                                    <option value="IT">Italie</option>
                                </select>
                            </div>

                            <button 
                                onClick={handleValidateToken}
                                disabled={!token || tokenStatus === 'VALIDATING'}
                                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-orange-900/20 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {tokenStatus === 'VALIDATING' ? 'Vérification...' : 'Valider & Sauvegarder'}
                            </button>
                        </div>
                    </div>
                    <div className="bg-slate-950 border-l border-slate-800 p-8 flex-1 overflow-y-auto">
                         <div className="flex items-center mb-6">
                             <HelpCircle className="w-5 h-5 text-blue-400 mr-2" />
                             <h4 className="text-lg font-bold text-white">Guide de Configuration</h4>
                         </div>
                         <div className="space-y-6 text-sm text-slate-400">
                             <div className="relative pl-6 border-l-2 border-slate-800">
                                 <span className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-slate-700"></span>
                                 <h5 className="text-slate-200 font-bold mb-1">Meta Access Token</h5>
                                 <p className="mb-2">Requis pour lire la bibliothèque publicitaire.</p>
                                 <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline inline-flex items-center">
                                     Portail Développeur <ExternalLink className="w-3 h-3 ml-1" />
                                 </a>
                             </div>
                             <div className="relative pl-6 border-l-2 border-slate-800">
                                 <span className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-slate-700"></span>
                                 <h5 className="text-slate-200 font-bold mb-1">Apify & Supabase</h5>
                                 <p>L'intégration Apify permet de télécharger automatiquement les vidéos et images de haute qualité.</p>
                                 <p className="mt-2 text-xs text-emerald-400">Status: {apifyToken ? 'Actif' : 'Inactif'}</p>
                             </div>
                         </div>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white hidden md:block">
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
             <div className="mb-6 p-4 bg-red-950/50 border border-red-900/50 text-red-200 rounded-xl flex items-center animate-in slide-in-from-top-2">
                 <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                 {errorMsg}
                 <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-white"><X className="w-4 h-4" /></button>
             </div>
        )}

        {/* VIEW: DASHBOARD */}
        {currentView === 'DASHBOARD' && (
            <>
                {competitors.length > 0 && <CategoryTabs />}
                {visibleCompetitors.length > 0 ? (
                    <div id="chart-section">
                    <CompetitorStats 
                        competitors={visibleCompetitors} 
                        onExplore={handleExploreCompetitor}
                        onSync={handleSyncCompetitorButton}
                        syncingCompetitors={syncingCompetitors}
                        dateFilter={dashboardDateRange}
                        customStartDate={customStart ? new Date(customStart) : undefined}
                        customEndDate={customEnd ? new Date(customEnd) : undefined}
                    />
                    </div>
                ) : (
                    <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-xl">
                        {competitors.length > 0 ? (
                            <>
                                <Folder className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-white">Aucun concurrent dans cette catégorie</h3>
                                <p className="text-slate-400 max-w-md mx-auto mt-2 mb-6">Ajoutez des concurrents à ce groupe pour voir les statistiques.</p>
                            </>
                        ) : (
                             <>
                                <LayoutDashboard className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-white">Dashboard Empty</h3>
                                <p className="text-slate-400 max-w-md mx-auto mt-2 mb-6">Add competitors to visualize their performance, reach, and active ad strategies.</p>
                                <button 
                                    onClick={() => setCurrentView('COMPETITORS')}
                                    className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                                >
                                    Add Your First Competitor
                                </button>
                             </>
                        )}
                    </div>
                )}
            </>
        )}

        {/* VIEW: ADS EXPLORER */}
        {currentView === 'ADS' && (
             <div className="space-y-6 animate-in fade-in">
                 <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between sticky top-20 z-20 shadow-lg">
                     <div className="flex items-center gap-2 w-full md:w-auto flex-1">
                         <div className="relative flex-1 md:max-w-xs">
                             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                             <input 
                                type="text" 
                                placeholder="Search content, brands..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-orange-500 outline-none"
                             />
                         </div>
                         <div className="relative">
                            <select 
                                value={selectedCompetitorFilter}
                                onChange={(e) => setSelectedCompetitorFilter(e.target.value)}
                                className="bg-slate-950 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg px-3 py-2 outline-none max-w-[150px] truncate"
                            >
                                <option value="ALL">All Competitors</option>
                                {visibleCompetitors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                         </div>
                     </div>
                     <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 md:pb-0">
                         <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700">
                             <button onClick={() => setExplorerTimeRange('7d')} className={`px-2 py-1 rounded text-xs font-bold ${explorerTimeRange === '7d' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>7d</button>
                             <button onClick={() => setExplorerTimeRange('30d')} className={`px-2 py-1 rounded text-xs font-bold ${explorerTimeRange === '30d' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>30d</button>
                             <button onClick={() => setExplorerTimeRange('ALL')} className={`px-2 py-1 rounded text-xs font-bold ${explorerTimeRange === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>All</button>
                         </div>
                         <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700">
                             <button onClick={() => setExplorerMediaFilter('ALL')} className={`p-1.5 rounded ${explorerMediaFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-500'}`} title="All"><Layers className="w-3.5 h-3.5" /></button>
                             <button onClick={() => setExplorerMediaFilter('VIDEO')} className={`p-1.5 rounded ${explorerMediaFilter === 'VIDEO' ? 'bg-rose-900/50 text-rose-400' : 'text-slate-500'}`} title="Video"><Video className="w-3.5 h-3.5" /></button>
                             <button onClick={() => setExplorerMediaFilter('IMAGE')} className={`p-1.5 rounded ${explorerMediaFilter === 'IMAGE' ? 'bg-indigo-900/50 text-indigo-400' : 'text-slate-500'}`} title="Image"><ImageIcon className="w-3.5 h-3.5" /></button>
                             <button onClick={() => setExplorerMediaFilter('DYNAMIC')} className={`p-1.5 rounded ${explorerMediaFilter === 'DYNAMIC' ? 'bg-purple-900/50 text-purple-400' : 'text-slate-500'}`} title="Dynamic"><Layers className="w-3.5 h-3.5" /></button>
                         </div>
                         {apifyToken && competitors.length > 0 && (
                            <button
                                onClick={handleBatchSync}
                                disabled={syncingCompetitors.size > 0}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-slate-700 ${
                                    syncingCompetitors.size > 0 
                                        ? 'bg-slate-800 text-orange-400 border-orange-500/30' 
                                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                                }`}
                                title="Lancer l'analyse Apify pour les concurrents affichés"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${syncingCompetitors.size > 0 ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">Synchroniser Médias HD</span>
                            </button>
                         )}
                         <button 
                             onClick={handleAnalyze}
                             disabled={filteredAds.length === 0 || appState === AppState.ANALYZING}
                             className="flex items-center gap-1 bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg shadow-orange-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                             {appState === AppState.ANALYZING ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                             <span className="hidden sm:inline">Analyze Strategy</span>
                         </button>
                         <button 
                             onClick={handleExport}
                             disabled={filteredAds.length === 0}
                             className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
                             title="Export CSV"
                         >
                             <Download className="w-4 h-4" />
                         </button>
                     </div>
                 </div>

                 <AnalysisPanel analysis={analysis} isAnalyzing={appState === AppState.ANALYZING} onClose={handleClearAnalysis} />

                 {displayedAds.length > 0 ? (
                     <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {displayedAds.map(ad => (
                                <AdCard 
                                    key={ad.id} 
                                    ad={ad} 
                                    apifyToken={apifyToken} 
                                    facebookToken={token} 
                                    autoLoad={false}
                                    onAdUpdated={handleAdUpdated}
                                />
                            ))}
                        </div>
                        {totalPages > 1 && (
                            <div className="flex justify-center items-center gap-4 py-8">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <span className="text-sm text-slate-400">Page {currentPage} of {totalPages}</span>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                     </>
                 ) : (
                     <div className="text-center py-20 text-slate-500">
                         <Filter className="w-12 h-12 mx-auto mb-2 opacity-20" />
                         <p>No ads found matching your criteria.</p>
                     </div>
                 )}
             </div>
        )}

        {/* VIEW: HIT PARADE */}
        {currentView === 'HIT_PARADE' && (
             <TopAdsRanking ads={allAds} apifyToken={apifyToken} facebookToken={token} />
        )}

        {/* VIEW: COMPETITORS MANAGEMENT */}
        {currentView === 'COMPETITORS' && (
             <div className="space-y-6 animate-in fade-in">
                 <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                     <div className="flex justify-between items-center mb-4">
                         <h3 className="text-white font-bold flex items-center">
                             <Folder className="w-5 h-5 mr-2 text-blue-400" />
                             Manage Categories
                         </h3>
                         <button 
                            onClick={() => setIsManagingGroups(!isManagingGroups)}
                            className="text-xs text-slate-400 hover:text-white underline"
                         >
                             {isManagingGroups ? 'Done' : 'Edit Groups'}
                         </button>
                     </div>
                     
                     {isManagingGroups ? (
                         <div className="space-y-4 bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                             <div className="flex gap-2">
                                 <input 
                                    type="text" 
                                    placeholder="New Category Name (e.g. Retail)" 
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white"
                                 />
                                 <button onClick={handleCreateGroup} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold">Add</button>
                             </div>
                             <div className="flex flex-wrap gap-2">
                                 {groups.map(g => (
                                     <div key={g} className="bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 flex items-center gap-2 text-sm text-slate-300">
                                         {g}
                                         <button onClick={() => handleDeleteGroup(g)} className="text-slate-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                                     </div>
                                 ))}
                             </div>
                         </div>
                     ) : (
                         <div className="flex flex-wrap gap-2">
                             {groups.map(g => (
                                 <span key={g} className="bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700 text-xs text-slate-400">
                                     {g}
                                 </span>
                             ))}
                             {groups.length === 0 && <span className="text-slate-500 text-sm italic">No categories defined.</span>}
                         </div>
                     )}
                 </div>

                 <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                     <h3 className="text-white font-bold flex items-center mb-4">
                         <Plus className="w-5 h-5 mr-2 text-orange-400" />
                         Add New Competitor
                     </h3>
                     <form onSubmit={handleAddCompetitor} id="add-competitor-form" className="flex flex-col md:flex-row gap-4">
                         <div className="flex-1">
                             <input 
                                type="text" 
                                placeholder="Facebook Page ID (e.g. 123456789)" 
                                value={newPageId}
                                onChange={(e) => setNewPageId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-orange-500 outline-none"
                             />
                             <p className="text-xs text-slate-500 mt-2">Find the Page ID in 'About' section of a Facebook Page.</p>
                         </div>
                         <button 
                            type="submit" 
                            disabled={isAddingCompetitor || !newPageId}
                            className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg shadow-orange-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
                         >
                             {isAddingCompetitor ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Add'}
                         </button>
                     </form>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {competitors.map(comp => (
                         <div key={comp.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex justify-between items-start group">
                             <div className="flex items-center gap-4">
                                 {comp.profilePicture ? (
                                     <img src={comp.profilePicture} alt={comp.name} className="w-12 h-12 rounded-full object-cover border border-slate-700" />
                                 ) : (
                                     <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 font-bold">?</div>
                                 )}
                                 <div>
                                     <h4 className="text-white font-bold">{comp.name}</h4>
                                     <p className="text-xs text-slate-500 font-mono">ID: {comp.id}</p>
                                     <div className="flex flex-wrap gap-1 mt-2">
                                         {comp.groups?.map(g => (
                                             <span key={g} className="bg-slate-900 px-2 py-0.5 rounded text-[10px] text-slate-400 border border-slate-800 flex items-center">
                                                 {g}
                                                 <button onClick={() => handleRemoveGroupFromCompetitor(comp.id, g)} className="ml-1 hover:text-red-400"><X className="w-3 h-3" /></button>
                                             </span>
                                         ))}
                                         <div className="relative group/add">
                                             <button className="bg-slate-900 hover:bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-400 border border-slate-800 flex items-center">
                                                 <Plus className="w-3 h-3" />
                                             </button>
                                             <div className="absolute top-full left-0 mt-1 w-32 bg-slate-900 border border-slate-700 rounded shadow-xl hidden group-hover/add:block z-10">
                                                 {groups.filter(g => !comp.groups?.includes(g)).map(g => (
                                                     <button 
                                                        key={g} 
                                                        onClick={() => handleAddGroupToCompetitor(comp.id, g)}
                                                        className="w-full text-left px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
                                                     >
                                                         {g}
                                                     </button>
                                                 ))}
                                                 {groups.length === 0 && <div className="px-2 py-1 text-[10px] text-slate-600">No groups</div>}
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                             
                             <div className="flex items-center gap-1">
                                <button 
                                   onClick={() => handleSyncCompetitorButton(comp.id)}
                                   disabled={syncingCompetitors.has(comp.id)}
                                   className={`p-2 rounded-lg transition-colors ${
                                       syncingCompetitors.has(comp.id) 
                                       ? 'text-orange-400 bg-orange-900/20' 
                                       : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                   }`}
                                   title="Forcer la synchronisation Apify (Récupération HD)"
                                >
                                    <RefreshCw className={`w-5 h-5 ${syncingCompetitors.has(comp.id) ? 'animate-spin' : ''}`} />
                                </button>
                                <button 
                                   onClick={() => removeCompetitor(comp.id)}
                                   className="text-slate-600 hover:text-red-500 p-2 transition-colors hover:bg-slate-700 rounded-lg"
                                   title="Remove Competitor"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
        )}

      </main>
    </div>
  );
};

export default App;
