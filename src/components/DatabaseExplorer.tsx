import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Search, Plus, Trash2, Edit, ChevronRight, RefreshCw, Save, X } from 'lucide-react';
import { collection, query, onSnapshot, getDocs, doc, setDoc, deleteDoc, serverTimestamp, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

export const DatabaseExplorer = () => {
  const [collections, setCollections] = useState<string[]>(['users', 'pharmacies', 'orders', 'prescriptions', 'transactions', 'withdrawals', 'system_logs', 'scripts', 'notifications']);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!selectedCollection) return;
    setLoading(true);
    const q = query(collection(db, selectedCollection), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      toast.error(`Erreur lors du chargement de ${selectedCollection}`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedCollection]);

  const handleSaveDoc = async () => {
    if (!selectedCollection || !selectedDoc) return;
    try {
      const { id, ...data } = selectedDoc;
      await setDoc(doc(db, selectedCollection, id), data);
      toast.success("Document mis à jour !");
      setIsEditing(false);
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement.");
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!selectedCollection) return;
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce document ?")) return;
    try {
      await deleteDoc(doc(db, selectedCollection, id));
      toast.success("Document supprimé !");
      setSelectedDoc(null);
    } catch (error) {
      toast.error("Erreur lors de la suppression.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-[calc(100vh-200px)]">
      {/* Sidebar: Collections List */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <Database size={18} className="text-blue-600" />
            Collections
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {collections.map(col => (
            <button
              key={col}
              onClick={() => { setSelectedCollection(col); setSelectedDoc(null); setIsEditing(false); }}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${selectedCollection === col ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="font-bold text-sm">{col}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </div>

      {/* Main: Documents List */}
      <div className="lg:col-span-3 flex flex-col gap-8 h-full overflow-hidden">
        {selectedCollection ? (
          <div className="flex flex-col h-full gap-8">
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="font-bold text-lg uppercase tracking-widest text-slate-400">{selectedCollection}</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Rechercher ID..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>
                <button onClick={() => setSelectedCollection(selectedCollection)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                      <th className="p-6 font-bold">Document ID</th>
                      <th className="p-6 font-bold">Aperçu des données</th>
                      <th className="p-6 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {documents
                      .filter(doc => doc.id.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-6 font-mono text-xs text-blue-600 font-bold">{doc.id}</td>
                        <td className="p-6">
                          <p className="text-xs text-slate-500 truncate max-w-md">
                            {JSON.stringify(doc).substring(0, 100)}...
                          </p>
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => { setSelectedDoc(doc); setIsEditing(true); }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Document Editor Modal */}
            {isEditing && selectedDoc && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-[2.5rem] p-8 max-w-4xl w-full shadow-2xl max-h-[90vh] flex flex-col"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold">Éditer Document: {selectedDoc.id}</h3>
                    <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                      <X size={24} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden relative bg-slate-900 rounded-2xl p-4">
                    <textarea 
                      value={JSON.stringify(selectedDoc, null, 2)}
                      onChange={e => {
                        try {
                          setSelectedDoc(JSON.parse(e.target.value));
                        } catch (err) {
                          // Allow typing invalid JSON temporarily
                        }
                      }}
                      className="w-full h-full bg-transparent text-emerald-400 font-mono text-sm outline-none resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-4 mt-8">
                    <button onClick={() => setIsEditing(false)} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold">Annuler</button>
                    <button onClick={handleSaveDoc} className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20">Enregistrer</button>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-[2.5rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
            <Database size={48} className="mb-4 opacity-20" />
            <p className="font-bold">Sélectionnez une collection pour explorer les données</p>
          </div>
        )}
      </div>
    </div>
  );
};
