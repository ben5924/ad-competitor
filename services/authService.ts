import { Competitor, UserData, UserProfile, AdEntity } from "../types";
import { supabase } from "./supabaseClient";

const STORAGE_KEY_USERS = 'adintel_users'; // Legacy/Demo only
const STORAGE_KEY_SESSION = 'adintel_session'; // Legacy/Demo only
const DEMO_EMAIL = 'demo@adintel.ai';

// Helper to simulate delay for realism in demo mode
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock Data Generator for Demo Mode
const generateMockData = (): UserData => {
  const today = new Date();
  
  // Helper to generate dates relative to today
  const getDate = (daysBack: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysBack);
    return d.toISOString();
  };

  const mockAds = (count: number, pageId: string, pageName: string, startId: number): AdEntity[] => {
    return Array.from({ length: count }).map((_, i) => {
      // Randomize reach - vary it to make charts interesting
      const baseReach = Math.random() > 0.8 ? 500000 : 50000; // Occasional viral ads
      const reach = Math.floor(Math.random() * baseReach) + 5000;
      
      // Randomize Demographics
      const ageRanges = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
      // Pick a dominant age group for this ad
      const dominantAgeIndex = Math.floor(Math.random() * 3); // Skew younger for demo
      const dominantAge = ageRanges[dominantAgeIndex];
      
      // Mock Breakdown structure
      const breakdown = [{
          country: 'FR',
          age_gender_breakdowns: [
              { age_range: dominantAge, gender: 'female', percentage: Math.random() * 30 + 20 },
              { age_range: dominantAge, gender: 'male', percentage: Math.random() * 20 + 5 },
              { age_range: ageRanges[(dominantAgeIndex + 1) % 6], gender: 'female', percentage: 10 } 
          ]
      }];

      // Distribute ads over the last 45 days to populate charts
      const daysAgo = Math.floor(Math.random() * 45);

      // Determine media type for variety
      // 30% Video, 50% Static Image, 20% Dynamic (Carousel)
      const rand = Math.random();
      let type: 'VIDEO' | 'IMAGE' | 'DYNAMIC_IMAGE' = 'IMAGE';
      if (rand > 0.7) type = 'VIDEO';
      else if (rand < 0.2) type = 'DYNAMIC_IMAGE';

      return {
        id: (startId + i).toString(),
        page_id: pageId,
        page_name: pageName,
        ad_creation_time: getDate(daysAgo), 
        ad_delivery_stop_time: Math.random() > 0.7 ? getDate(Math.max(0, daysAgo - 5)) : undefined, // 30% are stopped
        ad_creative_bodies: [
            [
            "Découvrez notre nouvelle collection éco-responsable. 🌿 Matières durables, design intemporel.",
            "Offre limitée : -20% sur votre première commande avec le code BIENVENUE20.",
            "La solution ultime pour booster votre productivité de 300% au quotidien.",
            "Les nouveautés de la saison sont arrivées. Shoppez le look maintenant !",
            "Plus qu'une marque, un mode de vie. Rejoignez le mouvement dès aujourd'hui.",
            "Livraison gratuite dès 50€ d'achat. Retours offerts sous 30 jours."
            ][Math.floor(Math.random() * 6)]
        ],
        ad_creative_link_titles: [
            [
            "Nouvelle Collection",
            "Rejoignez la Révolution",
            "Livraison Gratuite",
            "Best Sellers de retour",
            "Offre Spéciale Été",
            "Inscrivez-vous maintenant"
            ][Math.floor(Math.random() * 6)]
        ],
        ad_snapshot_url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=" + pageId,
        eu_total_reach: reach,
        age_country_gender_reach_breakdown: breakdown,
        media_type: type,
        // Mocking video vs image via URL hint for the card display
        extracted_video_url: type === 'VIDEO' ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" : undefined,
        extracted_image_url: type !== 'VIDEO' ? "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" : undefined
      };
    });
  };

  return {
    groups: ['Sportswear', 'Retail', 'Maison'],
    settings: {
      apiToken: '', // Empty token implies demo mode usually
      targetCountry: 'FR'
    },
    competitors: [
      {
        id: 'demo-1',
        name: 'Nike Sportswear',
        color: '#6366f1',
        lastUpdated: new Date().toISOString(),
        profilePicture: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
        ads: mockAds(65, 'demo-1', 'Nike Sportswear', 1000),
        groups: ['Sportswear', 'Retail']
      },
      {
        id: 'demo-2',
        name: 'Adidas Originals',
        color: '#10b981',
        lastUpdated: new Date().toISOString(),
        profilePicture: 'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
        ads: mockAds(42, 'demo-2', 'Adidas Originals', 2000),
        groups: ['Sportswear']
      },
      {
        id: 'demo-3',
        name: 'Conforama (Demo)',
        color: '#f59e0b',
        lastUpdated: new Date().toISOString(),
        profilePicture: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
        ads: mockAds(55, 'demo-3', 'Conforama (Demo)', 3000),
        groups: ['Maison', 'Retail']
      }
    ]
  };
};

export const authService = {
  /**
   * Checks for an active session. 
   * Checks localStorage for Demo Mode, otherwise checks Supabase session.
   */
  getCurrentUser: async (): Promise<UserProfile | null> => {
    // 1. Check for Demo Session first (Local Storage)
    const localSession = localStorage.getItem(STORAGE_KEY_SESSION);
    if (localSession) {
      const parsed = JSON.parse(localSession);
      if (parsed.email === DEMO_EMAIL) return parsed;
    }

    // 2. Check Supabase Session
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) {
        // Fetch hasSeenOnboarding status from DB (JSONB content)
        const { data } = await supabase.from('user_data').select('content').eq('id', session.user.id).single();
        
        return {
            id: session.user.id,
            email: session.user.email!,
            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
            lastLogin: Date.now(),
            hasSeenOnboarding: data?.content?.hasSeenOnboarding || false
        };
    }
    
    return null;
  },

  register: async (email: string, password: string, name: string): Promise<UserProfile> => {
    // Supabase SignUp
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: name }
        }
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Registration failed");

    if (!data.session) {
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (loginError || !loginData.session) {
            throw new Error("Registration successful, but immediate login failed. Please disable 'Confirm Email' in your Supabase Dashboard > Auth > Providers > Email.");
        }
    }

    const { error: dbError } = await supabase.from('user_data').insert({
        id: data.user.id,
        content: { competitors: [], groups: [], settings: { apiToken: '', targetCountry: 'FR' }, hasSeenOnboarding: false }
    });

    if (dbError) console.warn("Could not init DB row", dbError);

    return {
        id: data.user.id,
        email: data.user.email!,
        name: name,
        lastLogin: Date.now(),
        hasSeenOnboarding: false
    };
  },

  login: async (email: string, password: string): Promise<UserProfile> => {
    // Supabase SignIn
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Login failed");

    // Fetch extra data from content
    const { data: userData } = await supabase.from('user_data').select('content').eq('id', data.user.id).single();
    const hasSeen = userData?.content?.hasSeenOnboarding || false;

    return {
        id: data.user.id,
        email: data.user.email!,
        name: data.user.user_metadata?.full_name || 'User',
        lastLogin: Date.now(),
        hasSeenOnboarding: hasSeen
    };
  },

  loginAsDemo: async (): Promise<UserProfile> => {
    await delay(600);
    // Local Storage Login logic
    const users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || '{}');
    const demoData = generateMockData();
    const demoProfile = { 
        id: 'demo-user', 
        email: DEMO_EMAIL, 
        name: 'Demo User', 
        lastLogin: Date.now(),
        hasSeenOnboarding: false // Always show tour for demo
    };
    
    users[DEMO_EMAIL] = {
        profile: demoProfile,
        password: 'demo',
        data: demoData
    };
    
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(demoProfile));
    
    return demoProfile;
  },

  logout: async () => {
    const localSession = localStorage.getItem(STORAGE_KEY_SESSION);
    if (localSession) {
        const parsed = JSON.parse(localSession);
        if (parsed.email === DEMO_EMAIL) {
            localStorage.removeItem(STORAGE_KEY_SESSION);
            return;
        }
    }
    await supabase.auth.signOut();
    localStorage.removeItem(STORAGE_KEY_SESSION);
  },

  loadUserData: async (email: string, userId?: string): Promise<UserData> => {
    if (email === DEMO_EMAIL) {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || '{}');
        return users[email]?.data || generateMockData();
    }

    let finalUserId = userId;
    if (!finalUserId) {
        const { data: { session } } = await supabase.auth.getSession();
        finalUserId = session?.user?.id;
    }

    if (!finalUserId) {
        return { competitors: [], groups: [], settings: { apiToken: '', targetCountry: 'FR' } };
    }

    const { data, error } = await supabase
        .from('user_data')
        .select('content')
        .eq('id', finalUserId)
        .single();

    if (error) {
        return { competitors: [], groups: [], settings: { apiToken: '', targetCountry: 'FR' } };
    }

    return data?.content as UserData;
  },

  saveUserData: async (email: string, data: UserData) => {
    if (email === DEMO_EMAIL) {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || '{}');
        if (users[email]) {
            users[email].data = data;
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
        }
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    let userId = session?.user?.id;
    if (!userId) return;

    const { error } = await supabase
        .from('user_data')
        .upsert({ 
            id: userId, 
            content: data, // We store full user data blob here
            updated_at: new Date().toISOString()
        });
    if (error) console.error("Failed to save user data", error);
  },

  completeOnboarding: async (userId: string) => {
      // Update the flag in the content JSONB in Supabase
      const { data } = await supabase.from('user_data').select('content').eq('id', userId).single();
      if (data) {
          const newContent = { ...data.content, hasSeenOnboarding: true };
          await supabase.from('user_data').update({ content: newContent }).eq('id', userId);
      }
  }
};