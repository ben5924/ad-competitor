import { GoogleGenAI, Type } from "@google/genai";
import { AdEntity, AnalysisResult, SingleAdAnalysisResult } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Nettoie et déduplique les données provenant d'Apify
 */
const cleanText = (text: string | null | undefined): string => {
  if (!text) return 'N/A';
  return text.trim().length > 0 ? text.trim() : 'N/A';
};

/**
 * ANALYSE STRATÉGIE GLOBALE
 * Accepte les données brutes d'Apify et les analyse
 */
export const analyzeAdsStrategy = async (ads: AdEntity[]): Promise<AnalysisResult> => {
  if (!ads || ads.length === 0) throw new Error("No ads provided");

  // ✅ CORRECTION: Mapper vers la structure AdEntity (types.ts)
  const adsTextData = ads.map(ad => {
    // Utilisation des champs disponibles dans AdEntity
    const bodyText = ad.ad_creative_bodies?.[0] || 'N/A';
    
    // Récupérer le titre
    const titleText = ad.ad_creative_link_titles?.[0] || 'N/A';
    
    // AdEntity ne contient pas la structure 'cards' détaillée du snapshot, on utilise des tableaux vides par défaut
    // ou on pourrait mapper les tableaux link_titles/descriptions si on considère que c'est un carrousel.
    const cardDetails = (ad.ad_creative_link_captions || []).map((caption, idx) => ({
      body: cleanText(caption),
      title: cleanText(ad.ad_creative_link_titles?.[idx]),
      link_description: cleanText(ad.ad_creative_link_descriptions?.[idx])
    }));

    return {
      page_name: cleanText(ad.page_name),
      body: cleanText(bodyText),
      title: cleanText(titleText),
      cards_count: cardDetails.length,
      cards_preview: cardDetails.slice(0, 3),
      media_type: ad.media_type || 'IMAGE',
      start_date: ad.ad_creation_time || 'N/A'
    };
  });

  const prompt = `Analyse la stratégie publicitaire Meta de ce concurrent basé sur ces ${ads.length} annonces récentes :

${JSON.stringify(adsTextData, null, 2)}

Fais une analyse structurée en français au format JSON avec :
- Un résumé de la stratégie globale
- Les thèmes clés identifiés
- L'audience cible probable
- Le ton de voice utilisé
- 3 recommandations pour améliorer sa stratégie`;

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
            keyThemes: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
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

/**
 * ANALYSE ANNONCE INDIVIDUELLE
 * Analyse en détail une seule annonce
 */
export const analyzeSingleAd = async (ad: AdEntity): Promise<SingleAdAnalysisResult> => {
  // Préparer les données
  const adData = {
    page_name: ad.page_name || 'Unknown',
    body: ad.ad_creative_bodies?.[0] || 'N/A',
    title: ad.ad_creative_link_titles?.[0] || 'N/A',
    media_type: ad.media_type || 'IMAGE',
    cards: (ad.ad_creative_link_captions || []).slice(0, 5).map((caption, idx) => ({
      title: ad.ad_creative_link_titles?.[idx] || '',
      body: caption,
      link_description: ad.ad_creative_link_descriptions?.[idx] || '',
      cta_text: 'En savoir plus'
    })),
    cta_type: 'UNKNOWN',
    start_date: ad.ad_creation_time || 'N/A',
    reach: ad.eu_total_reach || 'N/A'
  };

  const prompt = `Analyse cette annonce Meta en détail :

${JSON.stringify(adData, null, 2)}

Fournir une analyse structurée en français au format JSON avec :
- Analyse du copy (tone, structure, force du message)
- L'accroche visuelle identifiée
- La structure du contenu
- Alignement avec l'objectif marketing
- Points forts (tableau)
- Points à améliorer (tableau)`;

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
            pros: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
            cons: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            }
          },
          required: ["copyAnalysis", "visualHook", "visualStructure", "objectiveAlignment", "pros", "cons"]
        }
      }
    });

    return JSON.parse(response.text) as SingleAdAnalysisResult;
  } catch (error) {
    console.error("Gemini Single Ad Error:", error);
    throw new Error("Analyse individuelle impossible.");
  }
};