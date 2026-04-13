import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Terminal as TerminalIcon, Play, Square, Save, Clock, Trash2, Plus, ChevronRight } from 'lucide-react';
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
  schedule?: string;
}

export const ScriptManager = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

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
    setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting ${script.name}...`]);
    setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Executing ${script.language} script...`]);
    
    // Simulate execution
    setTimeout(() => {
      setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Output: Hello from ${script.name}!`]);
      setTerminalOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] Script finished successfully.`]);
    }, 1500);
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
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {scripts.map(script => (
            <button
              key={script.id}
              onClick={() => { setSelectedScript(script); setIsEditing(false); }}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${selectedScript?.id === script.id ? 'bg-primary/5 border-primary text-primary' : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'}`}
            >
              <div className="flex items-center gap-3">
                <TerminalIcon size={18} />
                <div className="text-left">
                  <p className="font-bold text-sm">{script.name}</p>
                  <p className="text-[10px] uppercase font-black opacity-50">{script.language}</p>
                </div>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
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
                  <button onClick={() => handleRun(selectedScript)} className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20">
                    <Play size={18} />
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
    </div>
  );
};
