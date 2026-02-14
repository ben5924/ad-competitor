import { AdEntity, FacebookAPIResponse, PageInfoResponse } from '../types';

const BASE_URL = 'https://graph.facebook.com/v19.0';

// Helper to clean token
const sanitizeToken = (token: string) => {
  let clean = token.trim();
  if (clean.toLowerCase().startsWith('bearer ')) clean = clean.slice(7).trim();
  return clean.replace(/^["']|["']$/g, '');
};

/**
 * Validates the API Token by making a lightweight request to the Ads Archive.
 * Returns true if the token works, false otherwise.
 */
export const validateApiToken = async (token: string): Promise<boolean> => {
    const cleanToken = sanitizeToken(token);
    if (!cleanToken) return false;

    // We try to fetch 1 ad with a generic search term to test access permissions
    const testUrl = `${BASE_URL}/ads_archive?access_token=${cleanToken}&search_terms=test&ad_active_status=ACTIVE&ad_reached_countries=['FR']&limit=1`;

    try {
        const response = await fetch(testUrl);
        const data = await response.json();
        
        if (!response.ok) {
            console.warn("Token validation failed:", data.error);
            return false;
        }
        
        // If we get here, the API accepted the token
        return true;
    } catch (e) {
        console.error("Token validation network error:", e);
        return false;
    }
};

export const fetchPageDetails = async (pageId: string, accessToken: string): Promise<PageInfoResponse | null> => {
    const cleanToken = sanitizeToken(accessToken);
    const params = new URLSearchParams({
        access_token: cleanToken,
        fields: 'id,name,picture{url}'
    });

    try {
        const response = await fetch(`${BASE_URL}/${pageId}?${params.toString()}`);
        const data = await response.json();
        
        if (!response.ok) {
            // Log warning but don't throw, return null to allow fallback to Ad Data
            console.warn("Page details fetch failed (likely permissions), falling back to Ad data:", data.error);
            return null;
        }
        return data as PageInfoResponse;
    } catch (e) {
        console.warn("Page info network error, attempting fallback", e);
        return null;
    }
};

export const fetchCompetitorAds = async (
  pageId: string,
  accessToken: string,
  country: string = 'FR'
): Promise<AdEntity[]> => {
  const cleanToken = sanitizeToken(accessToken);
  const cleanPageId = pageId.trim();

  if (!cleanPageId || !cleanToken) {
    throw new Error('Page ID and Access Token are required');
  }

  // Calculate date 3 months ago (YYYY-MM-DD) to fetch history
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  const minDate = date.toISOString().split('T')[0];

  const fields = [
    'id',
    'ad_creation_time',
    'ad_delivery_start_time',
    'ad_delivery_stop_time',
    'ad_creative_bodies',
    'ad_creative_link_captions',
    'ad_creative_link_titles',
    'ad_creative_link_descriptions',
    'ad_snapshot_url',
    'page_id',
    'page_name',
    'publisher_platforms',
    'eu_total_reach',
    'age_country_gender_reach_breakdown',
    'target_ages',
    'target_gender',
    'target_locations',
    'currency'
  ].join(',');

  let allAds: AdEntity[] = [];
  // Changed ad_active_status to ALL to get stopped ads for history
  // Added ad_delivery_date_min to limit to recent history (performance optimization)
  let nextUrl: string | null = `${BASE_URL}/ads_archive?access_token=${cleanToken}&search_page_ids=${cleanPageId}&ad_active_status=ALL&ad_reached_countries=['${country}']&ad_delivery_date_min=${minDate}&fields=${fields}&limit=100`;
  
  const MAX_ADS = 1500; // Increased safety cap slightly to accommodate history

  try {
    do {
        const response = await fetch(nextUrl);
        const data = await response.json();

        if (!response.ok) {
            console.error("FB API Error Details:", JSON.stringify(data, null, 2));
            if (allAds.length > 0) {
                console.warn("Partial fetch returned due to error on next page");
                return allAds;
            }
            const errorMsg = data.error?.message || data.error?.user_title;
            throw new Error(errorMsg || 'Failed to fetch ads from Facebook API');
        }

        const pageData = (data as FacebookAPIResponse).data;
        allAds = [...allAds, ...pageData];

        if (data.paging && data.paging.next && allAds.length < MAX_ADS) {
            nextUrl = data.paging.next;
        } else {
            nextUrl = null;
        }

    } while (nextUrl);

    return allAds;

  } catch (error: any) {
    console.error("Error fetching ads:", error);
    throw new Error(error.message || "An unexpected error occurred while fetching ads.");
  }
};