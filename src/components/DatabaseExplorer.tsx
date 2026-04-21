import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Database, Search, Plus, Trash2, Edit, ChevronRight, RefreshCw, Save, X, Terminal as TerminalIcon, Download, Play, HelpCircle } from 'lucide-react';
import { collection, query, onSnapshot, getDocs, doc, setDoc, deleteDoc, serverTimestamp, orderBy, limit, where, query as firestoreQuery, WhereFilterOp } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

export const DatabaseExplorer = () => {
  const [activeMode, setActiveMode] = useState<'explorer' | 'terminal'>('explorer');
  const [collections, setCollections] = useState<string[]>(['users', 'pharmacies', 'orders', 'prescriptions', 'transactions', 'withdrawals', 'system_logs', 'scripts', 'notifications', 'support_messages', 'support_chats']);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Terminal state
  const [sqlQuery, setSqlQuery] = useState('SELECT users WHERE role == \'patient\' ORDER BY createdAt LIMIT 10');
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSqlHelp, setShowSqlHelp] = useState(false);

  useEffect(() => {
    if (!selectedCollection || activeMode === 'terminal') return;
    setLoading(true);
    const q = query(collection(db, selectedCollection), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      toast.error(`Erreur lors du chargement de ${selectedCollection}`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedCollection, activeMode]);

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

  const handleDeleteDoc = async (id: string, colOverride?: string) => {
    const col = colOverride || selectedCollection;
    if (!col) return;
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce document ?")) return;
    try {
      await deleteDoc(doc(db, col, id));
      toast.success("Document supprimé !");
      if (activeMode === 'explorer') setSelectedDoc(null);
      else setQueryResults(prev => prev.filter(d => d.id !== id));
    } catch (error) {
      toast.error("Erreur lors de la suppression.");
    }
  };

  const executeSqlQuery = async () => {
    setIsExecuting(true);
    try {
      // Robust SQL-like parser for Firestore
      const cleanSql = sqlQuery.trim()
        .replace(/\s*(=|==|!=|>|<|>=|<=)\s*/g, ' $1 ')
        .replace(/\s*,\s*/g, ', ');
      
      const parts = cleanSql.split(/\s+/);
      
      const selectIdx = parts.findIndex(p => p.toUpperCase() === 'SELECT');
      const deleteIdx = parts.findIndex(p => p.toUpperCase() === 'DELETE');

      if (selectIdx === -1 && deleteIdx === -1) {
        throw new Error("La requête doit commencer par SELECT ou DELETE");
      }

      const isDelete = deleteIdx !== -1;
      const collectionName = isDelete ? parts[deleteIdx + 1] : parts[selectIdx + 1];

      if (!collectionName) throw new Error("Collection manquante (SELECT <collection> ...)");

      let constraints = [];
      let limitVal = 50;
      let orderField: string | null = null;
      let orderDir: 'asc' | 'desc' = 'desc';

      const whereIndex = parts.findIndex(p => p.toUpperCase() === 'WHERE');
      const orderByIndex = parts.findIndex(p => p.toUpperCase() === 'ORDER');
      const limitIndex = parts.findIndex(p => p.toUpperCase() === 'LIMIT');

      // 1. Handle WHERE
      if (whereIndex !== -1 && parts.length > whereIndex + 3) {
        const field = parts[whereIndex + 1];
        let opRaw = parts[whereIndex + 2];
        
        // Translate SQL-like operators to Firestore operators
        if (opRaw === '=') opRaw = '==';
        
        const validOps = ['==', '!=', '<', '<=', '>', '>=', 'array-contains', 'in', 'not-in', 'array-contains-any'];
        if (!validOps.includes(opRaw)) {
          throw new Error(`Opérateur non valide: ${opRaw}. Utilisez ==, !=, >, <, etc.`);
        }
        
        const op = opRaw as WhereFilterOp;
        let valueStr = parts[whereIndex + 3];
        
        // Handle quotes for strings
        if (valueStr.startsWith("'") && !valueStr.endsWith("'")) {
            let fullValue = valueStr;
            let i = whereIndex + 4;
            while(i < parts.length && !parts[i].endsWith("'")) {
                fullValue += " " + parts[i];
                i++;
            }
            if(i < parts.length) fullValue += " " + parts[i];
            valueStr = fullValue;
        }

        let value: any = valueStr;
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        else if (value.toLowerCase() === 'true') value = true;
        else if (value.toLowerCase() === 'false') value = false;
        else if (value.toLowerCase() === 'null') value = null;
        else if (!isNaN(Number(value))) value = Number(value);

        constraints.push(where(field, op, value));
      }

      // 2. Handle ORDER BY
      if (orderByIndex !== -1 && parts[orderByIndex + 1]?.toUpperCase() === 'BY') {
        orderField = parts[orderByIndex + 2];
        const nextPart = parts[orderByIndex + 3]?.toUpperCase();
        if (nextPart === 'DESC') orderDir = 'desc';
        else if (nextPart === 'ASC') orderDir = 'asc';
      }

      // 3. Handle LIMIT
      if (limitIndex !== -1 && parts.length > limitIndex + 1) {
        limitVal = parseInt(parts[limitIndex + 1]) || 50;
      }

      const queryParams: any[] = [...constraints];
      if (orderField) queryParams.push(orderBy(orderField, orderDir));
      queryParams.push(limit(limitVal));

      const q = query(collection(db, collectionName), ...queryParams);
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, _collection: collectionName, ...d.data() }));
      
      if (isDelete) {
        if (!window.confirm(`Voulez-vous supprimer ${results.length} documents de ${collectionName} ?`)) {
            setIsExecuting(false);
            return;
        }
        let deletedCount = 0;
        for(const docSnap of snap.docs) {
          await deleteDoc(doc(db, collectionName, docSnap.id));
          deletedCount++;
        }
        toast.success(`${deletedCount} documents supprimés de ${collectionName}`);
        setQueryResults([]);
      } else {
        setQueryResults(results);
        toast.success(`${results.length} résultats trouvés`);
      }
    } catch (error: any) {
      toast.error(`Erreur de syntaxe: ${error.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const exportToCSV = (data: any[]) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row)
        .map(val => typeof val === 'object' ? JSON.stringify(val).replace(/,/g, ';') : String(val).replace(/,/g, ';'))
        .join(',')
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `export_${activeMode}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-200px)]">
      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveMode('explorer')}
          className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeMode === 'explorer' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Database size={14} />
          Explorateur
        </button>
        <button 
          onClick={() => setActiveMode('terminal')}
          className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeMode === 'terminal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <TerminalIcon size={14} />
          Terminal SQL (Interprété)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 flex-1 overflow-hidden">
        {activeMode === 'explorer' ? (
          <>
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
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => exportToCSV(documents)} 
                          className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                          title="Exporter en CSV"
                        >
                          <Download size={18} />
                        </button>
                        <button onClick={() => setSelectedCollection(selectedCollection)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                      </div>
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
                </div>
              ) : (
                <div className="flex-1 bg-white rounded-[2.5rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                  <Database size={48} className="mb-4 opacity-20" />
                  <p className="font-bold">Sélectionnez une collection pour explorer les données</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="lg:col-span-4 flex flex-col gap-6 overflow-hidden">
            <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-xl flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
                    <TerminalIcon size={20} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">Terminal de Requêtes Firestore</h3>
                    <p className="text-slate-400 text-xs">Syntaxe SQL-like : SELECT &lt;collection&gt; WHERE &lt;field&gt; &lt;op&gt; &lt;value&gt; LIMIT &lt;n&gt;</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowSqlHelp(true)}
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <HelpCircle size={20} />
                  </button>
                  <div className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                    <HelpCircle size={12} />
                    Base NoSQL (Firestore)
                  </div>
                  <button 
                    onClick={executeSqlQuery}
                    disabled={isExecuting || !sqlQuery}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-500 transition-all disabled:opacity-50"
                  >
                    <Play size={14} className={isExecuting ? 'animate-pulse' : ''} />
                    Exécuter
                  </button>
                </div>
              </div>

              <textarea 
                value={sqlQuery}
                onChange={e => setSqlQuery(e.target.value)}
                className="w-full h-32 bg-black/30 border border-slate-800 rounded-2xl p-6 text-emerald-400 font-mono text-sm resize-none outline-none focus:border-blue-500/50 transition-all"
                placeholder="Entrez votre requête ici..."
              />
            </div>

            <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-400 uppercase tracking-widest text-xs">Résultats de la requête ({queryResults.length})</h3>
                {queryResults.length > 0 && (
                  <button 
                    onClick={() => exportToCSV(queryResults)}
                    className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all"
                  >
                    <Download size={14} />
                    Extraire les données
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {queryResults.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                        <th className="p-6 font-bold">Document ID</th>
                        <th className="p-6 font-bold">Données</th>
                        <th className="p-6 font-bold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {queryResults.map(res => (
                        <tr key={res.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-6 font-mono text-xs text-blue-600 font-bold">{res.id}</td>
                          <td className="p-6">
                            <div className="max-w-xl overflow-x-auto">
                              <pre className="text-[10px] text-slate-500 p-2 bg-slate-50 rounded-lg">
                                {JSON.stringify(res, null, 2)}
                              </pre>
                            </div>
                          </td>
                          <td className="p-6 text-right">
                            <button 
                              onClick={() => handleDeleteDoc(res.id, res._collection)}
                              className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 p-12">
                    <TerminalIcon size={48} className="mb-4 opacity-10" />
                    <p className="font-bold italic">Aucun résultat à afficher. Exécutez une requête pour voir les données.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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

      {showSqlHelp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                  <Play size={20} />
                </div>
                <h3 className="text-2xl font-bold">Aide Syntaxe SQL (Interprétée)</h3>
              </div>
              <button onClick={() => setShowSqlHelp(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6 text-sm text-slate-600">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="font-bold text-slate-900 mb-2 font-mono">SELECT &lt;collection&gt; [WHERE &lt;champ&gt; &lt;op&gt; &lt;valeur&gt;] [ORDER BY &lt;champ&gt; [ASC|DESC]] [LIMIT &lt;n&gt;]</p>
                <p className="text-xs text-slate-500">Ex: SELECT orders WHERE status == 'paid' ORDER BY createdAt DESC LIMIT 20</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="font-bold text-slate-900 mb-2 font-mono">DELETE &lt;collection&gt; [WHERE &lt;champ&gt; &lt;op&gt; &lt;valeur&gt;]</p>
                <p className="text-xs text-slate-400">Attention: Cette action est irréversible après confirmation.</p>
              </div>

              <div>
                <p className="font-bold text-slate-900 mb-2">Opérateurs supportés :</p>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="bg-slate-100 p-2 rounded">== (Égal)</div>
                  <div className="bg-slate-100 p-2 rounded">!= (Différent)</div>
                  <div className="bg-slate-100 p-2 rounded">&gt;, &lt;, &gt;=, &lt;=</div>
                  <div className="bg-slate-100 p-2 rounded">array-contains</div>
                  <div className="bg-slate-100 p-2 rounded">in, not-in</div>
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-xs">
                <strong>Note :</strong> Les chaînes de caractères avec espaces doivent être entourées de simples guillemets (Ex: 'Jean Dupont'). Les booléens (true, false) et les nombres sont détectés automatiquement.
              </div>
            </div>

            <button 
              onClick={() => setShowSqlHelp(false)}
              className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl font-bold transition-all hover:bg-slate-800"
            >
              J'ai compris
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
