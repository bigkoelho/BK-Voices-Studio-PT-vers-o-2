import React from 'react';
import { FolderOpen, Trash2, Clock, Edit3, Wand2 } from 'lucide-react';
import { ScriptProject } from '../types';

interface Props {
  projects: ScriptProject[];
  onLoadProject: (project: ScriptProject) => void;
  onDeleteProject: (id: string) => void;
}

export default function Projects({ projects, onLoadProject, onDeleteProject }: Props) {
  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-center bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <FolderOpen className="w-16 h-16 text-zinc-600 mb-4" />
        <h2 className="text-2xl font-semibold text-zinc-200 mb-2">Nenhum projeto guardado</h2>
        <p className="text-zinc-500 max-w-md">
          Os teus projetos do Modo Mágico aparecerão aqui. Podes guardar um projeto depois de analisares um guião no Estúdio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FolderOpen className="w-6 h-6 text-emerald-500" />
          Projetos Guardados
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(project => (
          <div key={project.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors group flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="text-lg font-medium text-zinc-200 truncate" title={project.name}>
                  {project.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                  <Clock className="w-3 h-3" />
                  {new Date(project.updatedAt).toLocaleString()}
                </div>
              </div>
              <button 
                onClick={() => onDeleteProject(project.id)}
                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                title="Eliminar Projeto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 mb-6">
              <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/50">
                <div className="text-xs font-medium text-zinc-500 mb-1">Voz do Projeto</div>
                <div className="text-sm text-zinc-300 truncate">{project.voiceProfile?.name || 'Voz Desconhecida'}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {project.voiceProfile?.gender || '-'} • {project.voiceProfile?.age || '-'}
                </div>
              </div>
              
              <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/50">
                <div className="text-xs font-medium text-zinc-500 mb-1">Estatísticas</div>
                <div className="text-sm text-zinc-300">
                  {project.segments?.length || 0} bloco(s) de áudio
                </div>
              </div>
            </div>

            <button 
              onClick={() => onLoadProject(project)}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-auto"
            >
              <Edit3 className="w-4 h-4" />
              Abrir no Estúdio
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
