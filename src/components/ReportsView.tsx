import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, UserProfile } from '../types';
import { Download, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

export const ReportsView = ({ profile }: { profile: UserProfile }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'all' | 'month' | 'week'>('month');

  useEffect(() => {
    let q = query(
      collection(db, 'transactions'),
      where('userId', '==', profile.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      txs.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setTransactions(txs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile.uid]);

  const parseDate = (date: any): Date => {
    if (!date) return new Date(0);
    if (date?.toDate && typeof date.toDate === 'function') return date.toDate();
    if (date instanceof Date) return date;
    if (date?.seconds !== undefined) return new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  const filteredTransactions = transactions.filter(tx => {
    if (dateRange === 'all') return true;
    const txDate = parseDate(tx.createdAt);
    const now = new Date();
    if (dateRange === 'month') {
      return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
    }
    if (dateRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return txDate >= weekAgo;
    }
    return true;
  });

  const totalGains = filteredTransactions
    .filter(tx => tx.type === 'credit')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalWithdrawals = filteredTransactions
    .filter(tx => tx.type === 'debit')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Montant (FCFA)', 'Description', 'Référence'];
    const csvData = filteredTransactions.map(tx => [
      parseDate(tx.createdAt).toLocaleString('fr-FR'),
      tx.type === 'credit' ? 'Crédit' : 'Débit',
      tx.amount,
      tx.description,
      tx.referenceId || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rapport_${profile.role}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Chargement des rapports...</div>;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">Rapports & Analyses</h2>
        <div className="flex items-center gap-4">
          <select 
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="week">7 derniers jours</option>
            <option value="month">Ce mois</option>
            <option value="all">Tout l'historique</option>
          </select>
          <button 
            onClick={exportCSV}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
          >
            <Download size={16} />
            Exporter CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-6">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <TrendingUp size={32} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Total Gains</p>
            <p className="text-3xl font-black text-slate-900">{totalGains.toLocaleString()} FCFA</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-6">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
            <TrendingDown size={32} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Total Retraits</p>
            <p className="text-3xl font-black text-slate-900">{totalWithdrawals.toLocaleString()} FCFA</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-100">
          <h3 className="text-xl font-bold">Historique des Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                <th className="p-6 font-bold">Date</th>
                <th className="p-6 font-bold">Description</th>
                <th className="p-6 font-bold text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6 text-slate-500 text-sm">
                    {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : new Date(tx.createdAt).toLocaleString()}
                  </td>
                  <td className="p-6 font-bold text-slate-900">{tx.description}</td>
                  <td className={`p-6 text-right font-black ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{tx.amount.toLocaleString()} FCFA
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-400">Aucune transaction trouvée pour cette période.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};
