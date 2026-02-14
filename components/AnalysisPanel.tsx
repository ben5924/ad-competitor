import React from 'react';
import { AnalysisResult } from '../types';
import { Sparkles, Target, MessageSquare, Lightbulb, TrendingUp, X } from 'lucide-react';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  onClose: () => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis, isAnalyzing, onClose }) => {
  if (isAnalyzing) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[300px] relative">
        <div className="relative w-16 h-16 mb-4">
             <div className="absolute inset-0 border-4 border-orange-500/30 rounded-full animate-pulse"></div>
             <div className="absolute inset-0 border-t-4 border-orange-500 rounded-full animate-spin"></div>
             <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-orange-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Gemini analyse la stratégie...</h3>
        <p className="text-slate-400 max-w-md">
          Nous traitons les textes, titres et descriptions pour extraire des insights stratégiques, le ciblage et le ton employé.
        </p>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      
      {/* Summary Hero */}
      <div className="bg-gradient-to-br from-orange-900/50 to-slate-900 border border-orange-500/30 rounded-xl p-6 shadow-lg relative overflow-hidden">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-slate-300 hover:text-white transition-colors z-10"
            title="Fermer l'analyse"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Sparkles className="w-24 h-24 text-white" />
        </div>
        <h3 className="text-xl font-bold text-white mb-3 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-orange-400" />
            Résumé Stratégique
        </h3>
        <p className="text-slate-300 leading-relaxed text-lg pr-8">
            {analysis.summary}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Key Themes */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center mb-4 text-emerald-400">
                <TrendingUp className="w-5 h-5 mr-2" />
                <h4 className="font-bold text-white">Thèmes Clés</h4>
            </div>
            <ul className="space-y-2">
                {analysis.keyThemes.map((theme, idx) => (
                    <li key={idx} className="flex items-start text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 mr-2.5 flex-shrink-0"></span>
                        {theme}
                    </li>
                ))}
            </ul>
        </div>

        {/* Target Audience */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center mb-4 text-amber-400">
                <Target className="w-5 h-5 mr-2" />
                <h4 className="font-bold text-white">Audience Cible Déduite</h4>
            </div>
            <p className="text-slate-300 leading-relaxed">
                {analysis.targetAudience}
            </p>
        </div>

        {/* Tone of Voice */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center mb-4 text-sky-400">
                <MessageSquare className="w-5 h-5 mr-2" />
                <h4 className="font-bold text-white">Ton de Voix</h4>
            </div>
             <p className="text-slate-300 leading-relaxed">
                {analysis.toneOfVoice}
            </p>
        </div>

         {/* Recommendations */}
         <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 md:col-span-2">
            <div className="flex items-center mb-4 text-purple-400">
                <Lightbulb className="w-5 h-5 mr-2" />
                <h4 className="font-bold text-white">Recommandations Tactiques</h4>
            </div>
            <div className="bg-purple-900/20 p-4 rounded-lg border border-purple-500/20">
                <p className="text-slate-200 leading-relaxed font-medium">
                    {analysis.recommendations}
                </p>
            </div>
        </div>

      </div>
    </div>
  );
};