import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingUp, Users, Package, DollarSign, Calendar, Download, Filter, RefreshCw } from 'lucide-react';
import { collection, query, onSnapshot, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Order, Transaction } from '../types';
import { formatDate } from '../App';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export const DataAnalyst = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const uSnap = await getDocs(collection(db, 'users'));
        const oSnap = await getDocs(collection(db, 'orders'));
        const tSnap = await getDocs(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(100)));
        
        setUsers(uSnap.docs.map(doc => doc.data() as UserProfile));
        setOrders(oSnap.docs.map(doc => doc.data() as Order));
        setTransactions(tSnap.docs.map(doc => doc.data()));
      } catch (error) {
        console.error("Error fetching data for analysis", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  const roleDistribution = [
    { name: 'Patients', value: users.filter(u => u.role === 'patient').length },
    { name: 'Pharmaciens', value: users.filter(u => u.role === 'pharmacist').length },
    { name: 'Livreurs', value: users.filter(u => u.role === 'delivery').length },
    { name: 'Admins', value: users.filter(u => u.role === 'admin' || u.role === 'super-admin').length },
  ];

  const orderStatusDistribution = [
    { name: 'Complétées', value: orders.filter(o => o.status === 'completed').length },
    { name: 'En cours', value: orders.filter(o => ['paid', 'preparing', 'ready', 'delivering', 'pending_quote'].includes(o.status)).length },
    { name: 'Rejetées', value: orders.filter(o => o.status === 'quote_rejected').length },
  ];

  const revenueByDay = () => {
    const data: any = {};
    orders.filter(o => o.status === 'completed').forEach(o => {
      const date = formatDate(o.createdAt, 'short');
      data[date] = (data[date] || 0) + (o.totalAmount || 0);
    });
    return Object.entries(data).map(([name, value]) => ({ name, value })).slice(-7);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Revenu Total', value: orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + (o.totalAmount || 0), 0), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', suffix: ' FCFA' },
          { label: 'Panier Moyen', value: Math.round(orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + (o.totalAmount || 0), 0) / Math.max(orders.filter(o => o.status === 'completed').length, 1)), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', suffix: ' FCFA' },
          { label: 'Taux de Conversion', value: Math.round((orders.length / Math.max(users.filter(u => u.role === 'patient').length, 1)) * 100), icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50', suffix: '%' },
          { label: 'Utilisateurs Actifs', value: users.filter(u => u.status === 'active').length, icon: Users, color: 'text-rose-600', bg: 'bg-rose-50', suffix: '' },
        ].map(stat => (
          <div key={stat.label} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center mb-4`}>
              <stat.icon size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-2xl font-black text-slate-900">{stat.value.toLocaleString()}{stat.suffix}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Trend */}
        <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-500" />
            Évolution du Chiffre d'Affaires
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueByDay()}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold mb-6">Répartition des Rôles</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={roleDistribution}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {roleDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {roleDistribution.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold mb-6">Statut des Commandes</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orderStatusDistribution}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {orderStatusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {orderStatusDistribution.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(index + 2) % COLORS.length] }}></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xl font-bold">Mouvements de Comptes</h3>
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors">
            <Download size={14} />
            Exporter CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                <th className="p-6 font-bold">Date</th>
                <th className="p-6 font-bold">Utilisateur</th>
                <th className="p-6 font-bold">Type</th>
                <th className="p-6 font-bold">Montant</th>
                <th className="p-6 font-bold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6 text-xs text-slate-500">{formatDate(tx.createdAt)}</td>
                  <td className="p-6">
                    <p className="text-sm font-bold text-slate-900">{tx.userName}</p>
                    <p className="text-[10px] font-black uppercase text-slate-400">{tx.userRole}</p>
                  </td>
                  <td className="p-6">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${tx.type === 'credit' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className={`p-6 font-bold ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{tx.amount.toLocaleString()} FCFA
                  </td>
                  <td className="p-6 text-sm text-slate-500">{tx.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
