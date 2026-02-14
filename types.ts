

export interface AdEntity {
  id: string;
  ad_creation_time: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_snapshot_url: string;
  page_id: string;
  page_name: string;
  // EU Transparency Data
  eu_total_reach?: number; 
  age_country_gender_reach_breakdown?: Array<{
    country: string;
    age_gender_breakdowns: Array<{
      age_range: string;
      gender?: string; // Optional now
      percentage?: number; // Optional now
      // Direct Count Fields
      male?: number;
      female?: number;
      unknown?: number;
    }>;
  }>;
  // Global/Political Transparency Data
  demographic_distribution?: Array<{
    percentage: string;
    age: string;
    gender: string;
  }>;
  delivery_by_region?: Array<{
    percentage: string;
    region: string;
  }>;
  // Targeting Data (Fallback)
  target_ages?: number[];
  target_gender?: string;
  target_locations?: Array<{
    name: string;
    country_code: string;
    type?: string;
  }>;
  // Delivery Data
  publisher_platforms?: string[];
  currency?: string;
  spend?: {
    lower_bound: string;
    upper_bound: string;
  };
  impressions?: {
    lower_bound: string;
    upper_bound: string;
  };
  // Backend/Scraped fields
  extracted_image_url?: string;
  extracted_video_url?: string;
  media_type?: 'VIDEO' | 'IMAGE' | 'DYNAMIC_IMAGE' | 'UNKNOWN' | 'SCREENSHOT';
}

export interface Competitor {
  id: string;
  name: string;
  profilePicture?: string;
  ads: AdEntity[];
  color: string; 
  lastUpdated: string | null;
  groups?: string[]; // Changed from single string to array of strings
}

export interface FacebookAPIResponse {
  data: AdEntity[];
  paging: {
    cursors: {
      before: string;
      after: string;
    };
    next: string;
  };
}

export interface PageInfoResponse {
  id: string;
  name: string;
  picture?: {
    data: {
      url: string;
    }
  }
}

export interface AnalysisResult {
  summary: string;
  keyThemes: string[];
  targetAudience: string;
  toneOfVoice: string;
  recommendations: string;
}

export interface SingleAdAnalysisResult {
  copyAnalysis: string;      // "Copy (texte de l'ad, titre et description/CTA)"
  visualHook: string;        // "Hook de la vidéo ou capacité à être impactante"
  visualStructure: string;   // "Structure globale de la vidéo" (ou composition pour image)
  objectiveAlignment: string; // "Analyse vs objectif recherché"
  pros: string[];            // "Les choses positives à retirer"
  cons: string[];            // "Les côtés négatifs à ne pas faire"
}

export enum AppState {
  IDLE,
  LOADING_ADS,
  ADS_LOADED,
  ANALYZING,
  ERROR
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  lastLogin: number;
  hasSeenOnboarding?: boolean;
}

export interface UserData {
  competitors: Competitor[];
  groups?: string[]; // List of available categories
  settings: {
    apiToken: string;
    targetCountry: string;
    apifyToken?: string; // New field for Apify integration
  };
  hasSeenOnboarding?: boolean;
}

export type DashboardDateRange = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'THIS_MONTH' | 'LAST_MONTH' | 'ALL_TIME' | 'CUSTOM';