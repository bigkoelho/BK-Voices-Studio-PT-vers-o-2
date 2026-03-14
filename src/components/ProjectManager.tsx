import React, { useRef } from 'react';
import { Download, Upload, FileJson } from 'lucide-react';
import { ProjectData } from '../types';

interface Props {
  projectData: ProjectData;
  onLoadProject: (data: ProjectData) => void;
}

export default function ProjectManager({ projectData, onLoadProject }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const dataStr = JSON.stringify(projectData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `lusavoice_project_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content) as ProjectData;
        
        if (data && data.voices && Array.isArray(data.voices)) {
          onLoadProject(data);
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
    <div className="max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-xl text-center">
      <FileJson className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
      <h2 className="text-2xl font-semibold mb-2">Gestão de Projetos</h2>
      <p className="text-zinc-400 mb-8">
        Guarda as tuas vozes e histórico de áudios gerados num ficheiro local, ou importa um projeto anterior.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button 
          onClick={handleExport}
          className="flex flex-col items-center justify-center gap-3 p-6 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
        >
          <div className="w-12 h-12 rounded-full bg-zinc-900 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
            <Download className="w-6 h-6 text-zinc-300 group-hover:text-emerald-400" />
          </div>
          <div>
            <div className="font-medium text-zinc-200">Exportar Projeto</div>
            <div className="text-xs text-zinc-500 mt-1">Guardar como .json</div>
          </div>
        </button>

        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 p-6 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
        >
          <div className="w-12 h-12 rounded-full bg-zinc-900 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
            <Upload className="w-6 h-6 text-zinc-300 group-hover:text-emerald-400" />
          </div>
          <div>
            <div className="font-medium text-zinc-200">Importar Projeto</div>
            <div className="text-xs text-zinc-500 mt-1">Carregar ficheiro .json</div>
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

      <div className="mt-8 pt-8 border-t border-zinc-800 text-left">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Estatísticas do Projeto Atual</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
            <div className="text-2xl font-semibold text-emerald-400">{projectData.voices?.length || 0}</div>
            <div className="text-sm text-zinc-500">Vozes Guardadas</div>
          </div>
          <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
            <div className="text-2xl font-semibold text-emerald-400">{projectData.generations?.length || 0}</div>
            <div className="text-sm text-zinc-500">Áudios Gerados</div>
          </div>
        </div>
      </div>
    </div>
  );
}
