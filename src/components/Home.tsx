import React, { useRef } from 'react';
import { Plus, Upload, Play, Database } from 'lucide-react';
import { ProjectData } from '../types';

interface Props {
  onNewProject: () => void;
  onImportProject: (data: ProjectData) => void;
  onContinueProject: () => void;
  hasActiveProject: boolean;
}

export default function Home({ onNewProject, onImportProject, onContinueProject, hasActiveProject }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content) as ProjectData;
        
        if (data && data.voices && Array.isArray(data.voices)) {
          onImportProject(data);
        } else {
          alert("Ficheiro de projeto inválido.");
        }
      } catch (err) {
        alert("Erro ao ler o ficheiro. Certifica-te que é um ficheiro JSON válido do BK- voice studio PT.");
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-zinc-100 mb-4 tracking-tight">Bem-vindo ao BK- voice studio PT</h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
          O teu estúdio completo para geração de vozes em Português Europeu.
          Começa um novo projeto ou continua de onde paraste.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        <button 
          onClick={onNewProject}
          className="flex flex-col items-center justify-center gap-4 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
        >
          <div className="w-16 h-16 rounded-full bg-zinc-950 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
            <Plus className="w-8 h-8 text-zinc-300 group-hover:text-emerald-400" />
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-zinc-200 mb-2">Novo Projeto</div>
            <div className="text-sm text-zinc-500">Começar do zero com um novo guião e vozes</div>
          </div>
        </button>

        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-4 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
        >
          <div className="w-16 h-16 rounded-full bg-zinc-950 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
            <Upload className="w-8 h-8 text-zinc-300 group-hover:text-emerald-400" />
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-zinc-200 mb-2">Importar Projeto</div>
            <div className="text-sm text-zinc-500">Carregar um projeto guardado anteriormente (.json)</div>
          </div>
        </button>
        <input 
          type="file" 
          accept=".json" 
          className="hidden" 
          ref={fileInputRef}
          onChange={handleImport}
        />
      </div>

      {hasActiveProject && (
        <div className="mt-8 flex justify-center">
          <button 
            onClick={onContinueProject}
            className="flex items-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-emerald-900/20"
          >
            <Play className="w-5 h-5 fill-current" />
            Continuar com o projeto atual
          </button>
        </div>
      )}
    </div>
  );
}
