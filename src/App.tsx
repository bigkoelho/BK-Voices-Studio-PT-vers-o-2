import React, { useState, useEffect } from 'react';
import { Mic, PlaySquare, Database as DbIcon, Key, Plus, Wand2, Home as HomeIcon, Lock } from 'lucide-react';
import VoiceDesigner from './components/VoiceDesigner';
import Studio from './components/Studio';
import Database from './components/Database';
import Home from './components/Home';
import VoiceExtraction from './components/VoiceExtraction';
import VoiceCloning from './components/VoiceCloning';
import { VoiceProfile, AudioGeneration, ProjectData, ScriptProject, ExtractionProject, CloningProject } from './types';
import { setApiKey } from './services/config';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'designer' | 'studio' | 'database' | 'extraction' | 'cloning'>('home');
  const [voiceToEdit, setVoiceToEdit] = useState<VoiceProfile | null>(null);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [generations, setGenerations] = useState<AudioGeneration[]>([]);
  const [savedScripts, setSavedScripts] = useState<ScriptProject[]>([]);
  const [savedExtractions, setSavedExtractions] = useState<ExtractionProject[]>([]);
  const [savedClonings, setSavedClonings] = useState<CloningProject[]>([]);
  const [activeExtraction, setActiveExtraction] = useState<ExtractionProject | null>(null);
  const [activeCloning, setActiveCloning] = useState<CloningProject | null>(null);
  const [activeScript, setActiveScript] = useState<ScriptProject | null>(null);
  const [studioKey, setStudioKey] = useState(0);
  const [manualApiKey, setManualApiKey] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(true);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const handleSetApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setManualApiKey(apiKeyInput.trim());
      setShowApiKeyModal(false);
    }
  };

  const handleSaveVoice = (voice: VoiceProfile) => {
    setVoices(prev => {
      const exists = prev.findIndex(v => v.id === voice.id);
      if (exists >= 0) {
        const newVoices = [...prev];
        newVoices[exists] = voice;
        return newVoices;
      }
      return [...prev, voice];
    });
    // Don't switch tab automatically if we are just saving
  };

  const handleUpdateVoice = (voice: VoiceProfile) => {
    setVoices(prev => prev.map(v => v.id === voice.id ? voice : v));
  };

  const handleDeleteVoice = (id: string) => {
    setVoices(prev => prev.filter(v => v.id !== id));
  };

  const handleSaveGeneration = (gen: AudioGeneration) => {
    setGenerations(prev => {
      const newGens = [gen, ...prev];
      const result: AudioGeneration[] = [];
      const counts: Record<string, number> = {};
      
      for (const g of newGens) {
        const source = g.source || 'unknown';
        counts[source] = (counts[source] || 0) + 1;
        if (counts[source] <= 10) {
          result.push(g);
        }
      }
      return result;
    });
  };

  const handleUpdateGeneration = (gen: AudioGeneration) => {
    setGenerations(prev => prev.map(g => g.id === gen.id ? gen : g));
  };

  const handleDeleteGeneration = (id: string) => {
    setGenerations(prev => prev.filter(g => g.id !== id));
  };

  const handleLoadProject = (data: ProjectData) => {
    setVoices(data.voices || []);
    
    const loadedGens = [...(data.generations || [])].sort((a, b) => b.timestamp - a.timestamp);
    const resultGens: AudioGeneration[] = [];
    const counts: Record<string, number> = {};
    for (const g of loadedGens) {
      const source = g.source || 'unknown';
      counts[source] = (counts[source] || 0) + 1;
      if (counts[source] <= 10) {
        resultGens.push(g);
      }
    }
    setGenerations(resultGens);
    
    setSavedScripts(data.projects || []);
    setSavedExtractions(data.extractions || []);
    setSavedClonings(data.clonings || []);
    setActiveTab('studio');
  };

  const handleSaveScriptProject = (project: ScriptProject) => {
    setSavedScripts(prev => {
      const exists = prev.find(p => p.id === project.id);
      if (exists) {
        return prev.map(p => p.id === project.id ? project : p);
      }
      return [project, ...prev];
    });
  };

  const handleUpdateScriptProject = (project: ScriptProject) => {
    setSavedScripts(prev => prev.map(p => p.id === project.id ? project : p));
  };

  const handleDeleteScriptProject = (id: string) => {
    setSavedScripts(prev => prev.filter(p => p.id !== id));
  };

  const handleLoadScriptProject = (project: ScriptProject) => {
    setActiveScript(project);
    setActiveTab('studio');
  };

  const handleSaveExtraction = (project: ExtractionProject) => {
    setSavedExtractions(prev => {
      const exists = prev.find(p => p.id === project.id);
      if (exists) {
        return prev.map(p => p.id === project.id ? project : p);
      }
      return [project, ...prev];
    });
  };

  const handleUpdateExtraction = (project: ExtractionProject) => {
    setSavedExtractions(prev => prev.map(p => p.id === project.id ? project : p));
  };

  const handleDeleteExtraction = (id: string) => {
    setSavedExtractions(prev => prev.filter(p => p.id !== id));
  };

  const handleLoadExtraction = (project: ExtractionProject) => {
    setActiveExtraction(project);
    setActiveTab('extraction');
  };

  const handleSaveCloning = (project: CloningProject) => {
    setSavedClonings(prev => {
      const exists = prev.find(p => p.id === project.id);
      if (exists) {
        return prev.map(p => p.id === project.id ? project : p);
      }
      return [project, ...prev];
    });
  };

  const handleUpdateCloning = (project: CloningProject) => {
    setSavedClonings(prev => prev.map(p => p.id === project.id ? project : p));
  };

  const handleDeleteCloning = (id: string) => {
    setSavedClonings(prev => prev.filter(p => p.id !== id));
  };

  const handleLoadCloning = (project: CloningProject) => {
    setActiveCloning(project);
    setActiveTab('cloning');
  };

  const handleNewVoice = () => {
    setVoiceToEdit(null);
    setActiveTab('designer');
  };

  const handleEditVoice = (voice: VoiceProfile) => {
    setVoiceToEdit(voice);
    setActiveTab('designer');
  };

  const handleNewStudio = () => {
    setActiveScript(null);
    setStudioKey(prev => prev + 1);
    setActiveTab('studio');
  };

  if (!manualApiKey) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 relative">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center shadow-xl">
          <Lock className="w-12 h-12 text-emerald-500 mx-auto mb-6" />
          <h2 className="text-2xl font-semibold mb-2">Bem-vindo ao BK- Voices Studio V1.6</h2>
          <p className="text-zinc-400 mb-8">
            Para iniciar a aplicação, por favor introduz a tua chave de API da Google Gemini.
          </p>
          
          <form onSubmit={handleSetApiKey} className="space-y-4">
            <div className="text-left">
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Google Gemini API Key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Introduz a tua API Key (AIzaSy...)"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!apiKeyInput.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-4"
            >
              <Key className="w-4 h-4" />
              Entrar no Estúdio
            </button>
          </form>
          
          <p className="text-xs text-zinc-500 mt-6">
            As tuas chaves não são guardadas nos nossos servidores. Ficam apenas na memória do teu browser durante esta sessão.
          </p>
        </div>
        <div className="absolute bottom-4 left-4 text-xs font-mono text-zinc-600">v1.6</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('home')}>
          <Mic className="w-6 h-6 text-emerald-500" />
          <h1 className="text-xl font-semibold tracking-tight">BK- voice studio PT V1.6</h1>
        </div>
        <nav className="flex gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setActiveTab('home')}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'home' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="Menu Inicial"
          >
            <HomeIcon className="w-4 h-4" />
            Início
          </button>
          <div className="w-px h-6 bg-zinc-800 mx-1 self-center"></div>
          <button
            onClick={handleNewVoice}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'designer' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="Criar Voz"
          >
            <Plus className="w-4 h-4" />
            Criar Voz
          </button>
          <button
            onClick={() => setActiveTab('studio')}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'studio' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="Estúdio"
          >
            <Wand2 className="w-4 h-4" />
            Estúdio
          </button>
          <button
            onClick={() => setActiveTab('extraction')}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'extraction' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="Extração de Voz"
          >
            <Mic className="w-4 h-4" />
            Extração
          </button>
          <button
            onClick={() => setActiveTab('cloning')}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'cloning' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="Clonagem de Voz"
          >
            <PlaySquare className="w-4 h-4" />
            Clonagem
          </button>
          <div className="w-px h-6 bg-zinc-800 mx-1 self-center"></div>
          <button
            onClick={() => setActiveTab('database')}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'database' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="Banco de Dados"
          >
            <DbIcon className="w-4 h-4" />
            Banco de Dados
          </button>
          <div className="w-px h-6 bg-zinc-800 mx-1 self-center"></div>
          <button
            onClick={() => {
              setApiKeyInput(manualApiKey);
              setShowApiKeyModal(true);
            }}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            title="Configurar Chaves API"
          >
            <Key className="w-4 h-4" />
            APIs
          </button>
        </nav>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {showApiKeyModal && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md w-full shadow-2xl">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Key className="text-emerald-500" />
                  Chaves de API
                </h3>
                <p className="text-zinc-400 text-sm mb-6">
                  Podes visualizar ou alterar as tuas chaves de API atuais abaixo.
                </p>
                <form onSubmit={handleSetApiKey} className="space-y-4">
                  <div className="text-left">
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                      Google Gemini API Key
                    </label>
                    <input
                      type="text"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="Introduz a tua API Key (AIzaSy...)"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-mono text-sm"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowApiKeyModal(false)}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 rounded-lg font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg font-medium transition-colors"
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'home' && (
            <Home 
              onNewProject={handleNewStudio}
              onImportProject={handleLoadProject}
              onContinueProject={() => setActiveTab('studio')}
              hasActiveProject={!!activeScript || voices.length > 0 || generations.length > 0}
            />
          )}
          {activeTab === 'designer' && (
            <VoiceDesigner 
              initialVoice={voiceToEdit}
              generations={generations}
              onSaveGeneration={handleSaveGeneration}
              onDeleteGeneration={handleDeleteGeneration}
              onSave={(voice) => { handleSaveVoice(voice); setActiveTab('studio'); }} 
            />
          )}
          {activeTab === 'extraction' && (
            <VoiceExtraction 
              voices={voices}
              activeProject={activeExtraction}
              onSaveGeneration={handleSaveGeneration}
              onSaveVoice={handleSaveVoice}
              onSaveProject={handleSaveExtraction}
              onClearActiveProject={() => setActiveExtraction(null)}
            />
          )}
          {activeTab === 'cloning' && (
            <VoiceCloning 
              voices={voices}
              activeProject={activeCloning}
              onSaveGeneration={handleSaveGeneration}
              onSaveProject={handleSaveCloning}
              onClearActiveProject={() => setActiveCloning(null)}
            />
          )}
          {activeTab === 'studio' && (
            <Studio 
              key={studioKey}
              voices={voices} 
              generations={generations} 
              activeProject={activeScript}
              onSaveGeneration={handleSaveGeneration}
              onDeleteGeneration={handleDeleteGeneration}
              onDeleteVoice={handleDeleteVoice}
              onSaveVoice={handleSaveVoice}
              onSaveProject={handleSaveScriptProject}
              onClearActiveProject={() => setActiveScript(null)}
            />
          )}
          {activeTab === 'database' && (
            <Database 
              projectData={{ voices, generations, projects: savedScripts, extractions: savedExtractions, clonings: savedClonings }} 
              onLoadProject={handleLoadProject}
              onUpdateScript={handleUpdateScriptProject}
              onDeleteScript={handleDeleteScriptProject}
              onLoadScript={handleLoadScriptProject}
              onUpdateExtraction={handleUpdateExtraction}
              onDeleteExtraction={handleDeleteExtraction}
              onLoadExtraction={handleLoadExtraction}
              onUpdateCloning={handleUpdateCloning}
              onDeleteCloning={handleDeleteCloning}
              onLoadCloning={handleLoadCloning}
              onUpdateVoice={handleUpdateVoice}
              onDeleteVoice={handleDeleteVoice}
              onUpdateGeneration={handleUpdateGeneration}
              onDeleteGeneration={handleDeleteGeneration}
              onEditVoice={handleEditVoice}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
