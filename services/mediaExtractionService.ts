
import { AdEntity } from '../types';

/**
 * DEPRECATED SERVICE
 * This file previously handled weak extraction methods (AllOrigins, Puppeteer).
 * It is now replaced by Apify integration.
 * Functions kept as placeholders to avoid breaking imports if any remain, but they do nothing.
 */

export const checkBackendHealth = async (): Promise<boolean> => {
    return false;
};

export const extractMediaFromPage = async (snapshotUrl: string): Promise<{ type: any, url: string, source: string } | null> => {
    // This method is deprecated and disabled.
    return null;
};

export const batchDetectMediaTypes = async (
  ads: AdEntity[], 
  onProgress?: (count: number, total: number) => void
): Promise<AdEntity[]> => {
  return ads;
};

export const detectDynamicCreativeByBody = (ads: AdEntity[]): AdEntity[] => {
    return ads;
};
