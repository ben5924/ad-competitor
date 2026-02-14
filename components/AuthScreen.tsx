import React, { useState } from 'react';
import { Flame, Lock, Mail, User, ArrowRight, Loader2, TestTube } from 'lucide-react';
import { authService } from '../services/authService';

interface AuthScreenProps {
  onLoginSuccess: (user: any) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let user;
      if (isLogin) {
        user = await authService.login(formData.email, formData.password);
      } else {
        user = await authService.register(formData.email, formData.password, formData.name);
      }
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
      setError(null);
      setIsDemoLoading(true);
      try {
          const user = await authService.loginAsDemo();
          onLoginSuccess(user);
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsDemoLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-600/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="text-center mb-8">
            <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-900/20 mx-auto mb-4">
               <Flame className="text-white w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
                {isLogin ? "MetaScan by la Digit'Cave" : 'Rejoindre La Cave'}
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
                {isLogin ? 'Accédez à votre tableau de bord Ad Intelligence.' : "L'outil ultime d'analyse publicitaire."}
            </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
                <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-400 ml-1">Nom Complet</label>
                    <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input 
                            type="text" 
                            required
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                            placeholder="John Doe"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                </div>
            )}

            <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400 ml-1">Adresse Email</label>
                <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                        type="email" 
                        required
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                        placeholder="name@company.com"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400 ml-1">Mot de passe</label>
                <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                        type="password" 
                        required
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg text-center">
                    {error}
                </div>
            )}

            <button 
                type="submit"
                disabled={isLoading || isDemoLoading}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-orange-900/20 flex items-center justify-center transition-all transform active:scale-95 mt-6"
            >
                {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <>
                        {isLogin ? 'Se Connecter' : "S'inscrire"}
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                )}
            </button>
        </form>

        <div className="my-6 flex items-center">
            <div className="flex-1 h-px bg-slate-800"></div>
            <span className="px-4 text-slate-600 text-xs uppercase tracking-wider">Ou</span>
            <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        <button
            onClick={handleDemoLogin}
            disabled={isLoading || isDemoLoading}
            className="w-full bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 hover:border-amber-500/30 font-medium py-3 rounded-xl flex items-center justify-center transition-all"
        >
             {isDemoLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
                <>
                    <TestTube className="w-4 h-4 mr-2" />
                    Compte Démo Gratuit
                </>
            )}
        </button>

        <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
                {isLogin ? "Pas encore de compte ?" : "Déjà inscrit ?"}
                <button 
                    onClick={() => setIsLogin(!isLogin)}
                    className="ml-2 text-orange-400 hover:text-orange-300 font-medium transition-colors"
                >
                    {isLogin ? "Créer un compte" : 'Se connecter'}
                </button>
            </p>
        </div>
      </div>
      
      <div className="mt-8 text-slate-600 text-xs">
         &copy; 2024 MetaScan by la Digit'Cave.
      </div>
    </div>
  );
};