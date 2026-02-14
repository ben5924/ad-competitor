import React from 'react';
import { AdEntity } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DashboardStatsProps {
  ads: AdEntity[];
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ ads }) => {
  if (ads.length === 0) return null;

  // Simple calc for "Ads by Month"
  const adsByDate = ads.reduce((acc, ad) => {
    const date = new Date(ad.ad_creation_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(adsByDate).map(([date, count]) => ({
    date,
    count
  })).slice(0, 7); // Last 7 active dates

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
        <h4 className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">Total Active Ads</h4>
        <div className="text-3xl font-bold text-white">{ads.length}</div>
      </div>

      <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
        <h4 className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">Oldest Active Ad</h4>
        <div className="text-xl font-medium text-indigo-300 truncate">
            {new Date(ads[ads.length - 1].ad_creation_time).toLocaleDateString()}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex flex-col h-24 justify-between">
        <h4 className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Recent Activity</h4>
        <div className="w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                        itemStyle={{ color: '#818cf8' }}
                        cursor={{fill: '#334155', opacity: 0.4}}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]}>
                         {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#818cf8' : '#4f46e5'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
