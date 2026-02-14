
import { GoogleGenAI, Type } from "@google/genai";
import { AdEntity, AnalysisResult, SingleAdAnalysisResult } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const deduplicateAndJoin = (arr?: string[]): string => {
  if (!arr || arr.length === 0) return 'N/A';
  const seen = new Set<string>();
  const unique = arr
    .map(s => s.trim())
    .filter(s => s.length > 0 && !seen.has(s) && seen.add(s));
  return unique.length > 0 ? unique.join(' | ') : 'N/A';
};

export const analyzeAdsStrategy = async (ads: AdEntity[]): Promise<AnalysisResult> => {
  if (!ads || ads.length === 0) throw new Error("No ads provided");

  const adsTextData = ads.map(ad => ({
    body: deduplicateAndJoin(ad.ad_creative_bodies),
    headline: deduplicateAndJoin(ad.ad_creative_link_titles),
    media_type: ad.media_type
  }));

  const prompt = `Analyse la stratégie publicitaire de ce concurrent Meta basé sur ces données : ${JSON.stringify(adsTextData)}. Réponds en français structuré.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                summary: { type: Type.STRING },
                keyThemes: { type: Type.ARRAY, items: { type: Type.STRING } },
                targetAudience: { type: Type.STRING },
                toneOfVoice: { type: Type.STRING },
                recommendations: { type: Type.STRING }
            },
            required: ["summary", "keyThemes", "targetAudience", "toneOfVoice", "recommendations"]
        }
      }
    });

    return JSON.parse(response.text) as AnalysisResult;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Échec de l'analyse IA.");
  }
};

export const analyzeSingleAd = async (ad: AdEntity): Promise<SingleAdAnalysisResult> => {
    const prompt = `Analyse cette publicité Meta : ${JSON.stringify(ad)}. Réponds en JSON français.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        copyAnalysis: { type: Type.STRING },
                        visualHook: { type: Type.STRING },
                        visualStructure: { type: Type.STRING },
                        objectiveAlignment: { type: Type.STRING },
                        pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                        cons: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });

        return JSON.parse(response.text) as SingleAdAnalysisResult;
    } catch (error) {
        throw new Error("Analyse individuelle impossible.");
    }
};
