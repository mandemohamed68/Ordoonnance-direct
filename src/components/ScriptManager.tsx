import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal as TerminalIcon, Play, Square, Save, Clock, Trash2, Plus, ChevronRight, X, CheckCircle2, HelpCircle } from 'lucide-react';
import { collection, query, onSnapshot, setDoc, doc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

interface Script {
  id: string;
  name: string;
  language: 'bash' | 'python' | 'node';
  content: string;
  status: 'idle' | 'running' | 'scheduled';
  lastRun?: any;
  schedule?: string; // Cron expression or human readable
  lastExecutionStatus?: 'success' | 'error';
  updatedAt?: any;
}

export const ScriptManager = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [runningScriptId, setRunningScriptId] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleBuilder, setScheduleBuilder] = useState<{
    type: 'minutes' | 'hours' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    value: string;
    time: string;
    days: number[];
    monthDay: string;
    month: string;
    excludeDays: number[];
  }>({
    type: 'daily',
    value: '30',
    time: '08:00',
    days: [1, 2, 3, 4, 5, 6, 0],
    monthDay: '1',
    month: '1',
    excludeDays: []
  });

  const terminalRef = useRef<HTMLDivElement>(null);
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'scripts'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setScripts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Script)));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const handleSave = async () => {
    if (!selectedScript) return;
    try {
      await setDoc(doc(db, 'scripts', selectedScript.id), {
        ...selectedScript,
        updatedAt: serverTimestamp()
      });
      toast.success("Script enregistré !");
      setIsEditing(false);
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement.");
    }
  };

  const handleRun = (script: Script) => {
    if (runningScriptId) {
      toast.error("Un script est déjà en cours d'exécution.");
      return;
    }

    setRunningScriptId(script.id);
    setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting ${script.name}...`]);
    setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Executing ${script.language} script...`]);
    
    // Simulate execution
    executionTimeoutRef.current = setTimeout(async () => {
      setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Output: Hello from ${script.name}!`]);
      setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Script finished successfully.`]);
      setRunningScriptId(null);
      
      // Update last run in Firestore
      try {
        await setDoc(doc(db, 'scripts', script.id), {
          ...script,
          lastRun: serverTimestamp(),
          lastExecutionStatus: 'success',
          status: script.schedule ? 'scheduled' : 'idle'
        });
      } catch (e) {}
    }, 3000);
  };

  const handleStop = () => {
    if (executionTimeoutRef.current) {
      clearTimeout(executionTimeoutRef.current);
      executionTimeoutRef.current = null;
    }
    setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Script stopped by user.`]);
    setRunningScriptId(null);
    toast.info("Script arrêté.");
  };

  const handleDelete = async (scriptId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce script ?")) return;
    try {
      await deleteDoc(doc(db, 'scripts', scriptId));
      if (selectedScript?.id === scriptId) setSelectedScript(null);
      toast.success("Script supprimé !");
    } catch (error) {
      toast.error("Erreur lors de la suppression.");
    }
  };

  const handleCreate = () => {
    const newScript: Script = {
      id: 'script_' + Date.now(),
      name: 'Nouveau Script',
      language: 'bash',
      content: '#!/bin/bash\necho "Hello World"',
      status: 'idle'
    };
    setSelectedScript(newScript);
    setIsEditing(true);
  };

  const getCronFromBuilder = () => {
    const [hours, minutes] = scheduleBuilder.time.split(':');
    const daysStr = scheduleBuilder.days.length === 7 ? '*' : scheduleBuilder.days.join(',');
    
    // Apply exclusions to the days string if type is not weekly/daily and days is '*'
    let finalDays = daysStr;
    if (scheduleBuilder.excludeDays.length > 0) {
        const remainingDays = (scheduleBuilder.days.length === 7 ? [0,1,2,3,4,5,6] : scheduleBuilder.days)
            .filter(d => !scheduleBuilder.excludeDays.includes(d));
        finalDays = remainingDays.length === 0 ? '*' : remainingDays.join(',');
    }

    switch (scheduleBuilder.type) {
      case 'minutes': return `*/${scheduleBuilder.value} * * * *`;
      case 'hours': return `0 */${scheduleBuilder.value} * * *`;
      case 'daily': return `${minutes} ${hours} * * ${finalDays}`;
      case 'weekly': return `${minutes} ${hours} * * ${finalDays}`;
      case 'monthly': return `${minutes} ${hours} ${scheduleBuilder.monthDay} * *`;
      case 'yearly': return `${minutes} ${hours} ${scheduleBuilder.monthDay} ${scheduleBuilder.month} *`;
      default: return '* * * * *';
    }
  };

  const getHumanDescription = () => {
    const [hours, minutes] = scheduleBuilder.time.split(':');
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthNames = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    let base = "";
    switch (scheduleBuilder.type) {
      case 'minutes': base = `Toutes les ${scheduleBuilder.value} minutes.`; break;
      case 'hours': base = `Toutes les ${scheduleBuilder.value} heures.`; break;
      case 'daily': base = `Chaque jour à ${hours}:${minutes}.`; break;
      case 'weekly': 
        if (scheduleBuilder.days.length === 7) base = `Chaque jour à ${hours}:${minutes}.`;
        else base = `Chaque ${scheduleBuilder.days.map(d => dayNames[d]).join(', ')} à ${hours}:${minutes}.`;
        break;
      case 'monthly': base = `Le ${scheduleBuilder.monthDay} de chaque mois à ${hours}:${minutes}.`; break;
      case 'yearly': base = `Le ${scheduleBuilder.monthDay} ${monthNames[parseInt(scheduleBuilder.month)]} à ${hours}:${minutes}.`; break;
    }

    if (scheduleBuilder.excludeDays.length > 0 && scheduleBuilder.type !== 'weekly') {
      base += ` Sauf les ${scheduleBuilder.excludeDays.map(d => dayNames[d]).join(', ')}.`;
    }

    return base;
  };

  useEffect(() => {
    if (showScheduleModal && selectedScript) {
      const currentCron = selectedScript.schedule;
      // Optionnel: Tenter de pré-remplir le builder si le cron correspond à un pattern simple
      // Pour l'instant on réinitialise pour plus de clarté
    }
  }, [showScheduleModal]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-200px)]">
      {/* Sidebar: Script List */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold">Scripts</h3>
          <button onClick={handleCreate} className="p-2 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-slate-900 border-b border-slate-100">
          {scripts.map(script => (
            <div key={script.id} className="group relative">
              <button
                onClick={() => { setSelectedScript(script); setIsEditing(false); }}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${selectedScript?.id === script.id ? 'bg-primary/5 border-primary text-primary' : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'}`}
              >
                <div className="flex items-center gap-3">
                  <TerminalIcon size={18} className={script.status === 'running' || (runningScriptId === script.id) ? 'text-emerald-500 animate-pulse' : ''} />
                  <div className="text-left">
                    <p className="font-bold text-sm truncate max-w-[120px]">{script.name}</p>
                    <div className="flex items-center gap-2">
                        <p className="text-[10px] uppercase font-black opacity-50">{script.language}</p>
                        {script.schedule && <Clock size={10} className="text-primary" />}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(script.id); }}
                className="absolute right-10 top-1/2 -translate-y-1/2 p-2 bg-rose-50 text-rose-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {scripts.length === 0 && (
            <div className="text-center py-10">
              <p className="text-xs text-slate-400">Aucun script configuré</p>
            </div>
          )}
        </div>
      </div>

      {/* Main: Editor & Terminal */}
      <div className="lg:col-span-2 flex flex-col gap-8 h-full">
        {selectedScript ? (
          <>
            {/* Editor */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <input 
                    type="text" 
                    value={selectedScript.name}
                    onChange={e => setSelectedScript({...selectedScript, name: e.target.value})}
                    className="font-bold text-lg bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/20 rounded-lg px-2"
                  />
                  <select 
                    value={selectedScript.language}
                    onChange={e => setSelectedScript({...selectedScript, language: e.target.value as any})}
                    className="text-xs font-black uppercase bg-slate-100 border-none rounded-lg px-3 py-1"
                  >
                    <option value="bash">BASH</option>
                    <option value="python">PYTHON</option>
                    <option value="node">NODE</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  {runningScriptId === selectedScript.id ? (
                    <button onClick={handleStop} className="p-3 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20">
                      <Square size={18} fill="currentColor" />
                    </button>
                  ) : (
                    <button onClick={() => handleRun(selectedScript)} className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20">
                      <Play size={18} />
                    </button>
                  )}
                  <button 
                    onClick={() => setShowScheduleModal(true)} 
                    className={`p-3 rounded-xl transition-colors shadow-lg ${selectedScript.schedule ? 'bg-amber-500 text-white shadow-amber-500/20' : 'bg-slate-100 text-slate-600 shadow-slate-100/20 hover:bg-slate-200'}`}
                    title="Planifier l'exécution"
                  >
                    <Clock size={18} />
                  </button>
                  <button onClick={handleSave} className="p-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20">
                    <Save size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 p-0 relative">
                <textarea 
                  value={selectedScript.content}
                  onChange={e => setSelectedScript({...selectedScript, content: e.target.value})}
                  className="w-full h-full p-6 font-mono text-sm bg-slate-900 text-emerald-400 border-none outline-none resize-none"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Terminal Output */}
            <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl p-6 h-48 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase ml-2">Terminal Output</span>
                </div>
                <button onClick={() => setTerminalOutput([])} className="text-slate-500 hover:text-white transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div ref={terminalRef} className="flex-1 overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
                {terminalOutput.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                {terminalOutput.length === 0 && <p className="text-slate-600">No output yet. Run a script to see results.</p>}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 bg-white rounded-[2.5rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
            <TerminalIcon size={48} className="mb-4 opacity-20" />
            <p className="font-bold">Sélectionnez ou créez un script pour commencer</p>
          </div>
        )}
      </div>

      {/* Schedule Modal */}
      <AnimatePresence>
        {showScheduleModal && selectedScript && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[3rem] p-8 md:p-10 max-w-4xl w-full shadow-2xl overflow-y-auto max-h-[95vh] border border-slate-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                   <div className="p-4 bg-primary/10 text-primary rounded-2xl">
                     <Clock size={24} />
                   </div>
                   <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Planificateur Intelligent</h3>
                    <p className="text-sm text-slate-500">Créez des règles d'exécution personnalisées sans limites.</p>
                   </div>
                </div>
                <button 
                  onClick={() => setShowScheduleModal(false)}
                  className="p-3 hover:bg-slate-100 rounded-2xl transition-colors"
                >
                  <X size={24} className="text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Configuration Panel */}
                <div className="lg:col-span-7 space-y-8">
                  
                  {/* Step 1: Frequency Type */}
                  <section>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">1. Type de fréquence</label>
                    <div className="grid grid-cols-3 gap-2">
                       {(['minutes', 'hours', 'daily', 'weekly', 'monthly', 'yearly'] as const).map((type) => (
                         <button
                           key={type}
                           onClick={() => setScheduleBuilder({...scheduleBuilder, type})}
                           className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider border-2 transition-all ${scheduleBuilder.type === type ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}
                         >
                           {type === 'minutes' ? 'Minutes' : type === 'hours' ? 'Heures' : type === 'daily' ? 'Quotidien' : type === 'weekly' ? 'Hebdo' : type === 'monthly' ? 'Mensuel' : 'Annuel'}
                         </button>
                       ))}
                    </div>
                  </section>

                  {/* Step 2: Dynamic Inputs */}
                  <section className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 space-y-6">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">2. Détails de temps</label>
                    
                    {/* Time Input for most types */}
                    {(['daily', 'weekly', 'monthly', 'yearly'].includes(scheduleBuilder.type)) && (
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-slate-600">À quelle heure ?</span>
                        <input 
                          type="time" 
                          value={scheduleBuilder.time}
                          onChange={e => setScheduleBuilder({...scheduleBuilder, time: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </div>
                    )}

                    {/* Value for minutes/hours */}
                    {(['minutes', 'hours'].includes(scheduleBuilder.type)) && (
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-slate-600">Toutes les combien de {scheduleBuilder.type === 'minutes' ? 'minutes' : 'heures'} ?</span>
                        <input 
                          type="number" 
                          min="1"
                          max={scheduleBuilder.type === 'minutes' ? 59 : 23}
                          value={scheduleBuilder.value}
                          onChange={e => setScheduleBuilder({...scheduleBuilder, value: e.target.value})}
                          className="w-24 bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </div>
                    )}

                    {/* Day selector for weekly */}
                    {scheduleBuilder.type === 'weekly' && (
                      <div className="space-y-3">
                        <span className="text-sm font-bold text-slate-600 block">Quels jours ?</span>
                        <div className="flex flex-wrap gap-2">
                          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, i) => {
                            const val = (i + 1) % 7;
                            const isActive = scheduleBuilder.days.includes(val);
                            return (
                              <button
                                key={day}
                                onClick={() => {
                                  const newDays = isActive 
                                    ? scheduleBuilder.days.filter(d => d !== val)
                                    : [...scheduleBuilder.days, val];
                                  setScheduleBuilder({...scheduleBuilder, days: newDays});
                                }}
                                className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all border-2 ${isActive ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-primary/30'}`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Date selector for monthly/yearly */}
                    {(['monthly', 'yearly'].includes(scheduleBuilder.type)) && (
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-slate-600">Quel jour du mois ?</span>
                        <input 
                          type="number" 
                          min="1"
                          max="31"
                          value={scheduleBuilder.monthDay}
                          onChange={e => setScheduleBuilder({...scheduleBuilder, monthDay: e.target.value})}
                          className="w-20 bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </div>
                    )}

                    {/* Month selector for yearly */}
                    {scheduleBuilder.type === 'yearly' && (
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-slate-600">Quel mois ?</span>
                        <select 
                          value={scheduleBuilder.month}
                          onChange={e => setScheduleBuilder({...scheduleBuilder, month: e.target.value})}
                          className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                          {['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((m, i) => (
                            <option key={m} value={i+1}>{m}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </section>

                  {/* Step 3: Exceptions */}
                  {scheduleBuilder.type !== 'weekly' && (
                  <section>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">3. Exceptions (Optionnel)</label>
                    <div className="flex flex-wrap gap-2">
                       <span className="text-xs font-medium text-slate-500 mr-2 self-center">Exclure :</span>
                       {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((day, i) => {
                         const val = (i + 1) % 7;
                         const isExcluded = scheduleBuilder.excludeDays.includes(val);
                         return (
                           <button
                             key={day}
                             onClick={() => {
                               const newExc = isExcluded 
                                ? scheduleBuilder.excludeDays.filter(d => d !== val)
                                : [...scheduleBuilder.excludeDays, val];
                               setScheduleBuilder({...scheduleBuilder, excludeDays: newExc});
                             }}
                             className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${isExcluded ? 'bg-rose-500 border-rose-500 text-white' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-rose-200'}`}
                           >
                             {day}
                           </button>
                         );
                       })}
                    </div>
                  </section>
                  )}
                </div>

                {/* Summary & Expert Panel */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-slate-900 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Clock size={120} className="text-white" />
                    </div>
                    
                    <div className="relative z-10 space-y-6">
                      <div>
                        <span className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-widest rounded-full border border-emerald-500/20 mb-4">Aperçu en temps réel</span>
                        <h4 className="text-xl font-bold text-white leading-tight">
                           {getHumanDescription()}
                        </h4>
                      </div>

                      <div className="pt-6 border-t border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Expression Cron</span>
                            <div className="flex gap-1">
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                            </div>
                        </div>
                        <div className="bg-black/40 rounded-2xl p-4 font-mono text-emerald-400 text-lg border border-white/5 break-all">
                           {getCronFromBuilder()}
                        </div>
                        <p className="text-[10px] text-slate-500 italic">L'expression Cron est générée automatiquement pour le système.</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200 border-dashed">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Note sur la largesse</h5>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Votre planification est stockée en tant qu'expression standard. Un robot d'automatisation surveille cette règle pour déclencher votre script précisément au moment voulu, même si vous n'êtes pas connecté.
                      </p>
                  </div>
                </div>
              </div>

              {/* Final Footer */}
              <div className="mt-12 flex flex-col md:flex-row gap-4 pt-8 border-t border-slate-100">
                <button 
                  onClick={() => { 
                    setSelectedScript({...selectedScript, schedule: undefined}); 
                    setShowScheduleModal(false); 
                    toast.info("Planification désactivée.");
                  }}
                  className="flex-1 py-5 bg-slate-50 text-slate-600 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-[0.98]"
                >
                  Désactiver / Réinitialiser
                </button>
                <button 
                  onClick={async () => {
                    const finalCron = getCronFromBuilder();
                    const updatedScript = { ...selectedScript, schedule: finalCron };
                    try {
                      await setDoc(doc(db, 'scripts', selectedScript.id), {
                        ...updatedScript,
                        updatedAt: serverTimestamp(),
                        status: 'scheduled'
                      });
                      setSelectedScript(updatedScript);
                      setShowScheduleModal(false);
                      toast.success("Planification Largo activée !");
                    } catch (e) {
                      toast.error("Erreur de sauvegarde.");
                    }
                  }}
                  className="flex-[2] py-5 bg-primary text-white rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-primary-dark transition-all shadow-2xl shadow-primary/30 active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <Save size={18} />
                  Enregistrer la planification
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
