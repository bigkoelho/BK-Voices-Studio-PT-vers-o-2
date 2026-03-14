import React, { useState } from 'react';
import { Database as DbIcon, FolderOpen, Mic, PlaySquare, Trash2, Edit3, Download, Upload, Check, X, Wand2, Play, Square } from 'lucide-react';
import { ProjectData, ScriptProject, VoiceProfile, AudioGeneration, ExtractionProject, CloningProject } from '../types';

interface Props {
  projectData: ProjectData;
  onLoadProject: (data: ProjectData) => void;
  onUpdateScript: (script: ScriptProject) => void;
  onDeleteScript: (id: string) => void;
  onLoadScript: (script: ScriptProject) => void;
  onUpdateExtraction: (project: ExtractionProject) => void;
  onDeleteExtraction: (id: string) => void;
  onLoadExtraction: (project: ExtractionProject) => void;
  onUpdateCloning: (project: CloningProject) => void;
  onDeleteCloning: (id: string) => void;
  onLoadCloning: (project: CloningProject) => void;
  onUpdateVoice: (voice: VoiceProfile) => void;
  onDeleteVoice: (id: string) => void;
  onUpdateGeneration: (gen: AudioGeneration) => void;
  onDeleteGeneration: (id: string) => void;
  onEditVoice: (voice: VoiceProfile) => void;
}

export default function Database({ 
  projectData, 
  onLoadProject, 
  onUpdateScript, 
  onDeleteScript, 
  onLoadScript,
  onUpdateExtraction,
  onDeleteExtraction,
  onLoadExtraction,
  onUpdateCloning,
  onDeleteCloning,
  onLoadCloning,
  onUpdateVoice, 
  onDeleteVoice, 
  onUpdateGeneration,
  onDeleteGeneration,
  onEditVoice
}: Props) {
  const [activeTab, setActiveTab] = useState<'scripts' | 'extractions' | 'clonings' | 'voices' | 'audios' | 'backup'>('scripts');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const { projects = [], extractions = [], clonings = [], voices = [], generations = [] } = projectData;

  const getPreviewAudio = (voiceId: string) => {
    const voice = voices.find(v => v.id === voiceId);
    if (voice?.previewAudio) return voice.previewAudio;
    const gen = generations.find(g => g.voiceId === voiceId);
    return gen?.audioData;
  };

  const playVoicePreview = (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const audioData = getPreviewAudio(voiceId);
    if (!audioData) {
      alert("Não há áudio de teste disponível para esta voz.");
      return;
    }

    if (playingVoiceId === voiceId && audioRef.current) {
      audioRef.current.pause();
      setPlayingVoiceId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(audioData.startsWith('data:') ? audioData : `data:audio/wav;base64,${audioData}`);
    audioRef.current = audio;
    
    audio.onended = () => setPlayingVoiceId(null);
    audio.play();
    setPlayingVoiceId(voiceId);
  };

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const saveEditScript = (script: ScriptProject) => {
    onUpdateScript({ ...script, name: editName });
    setEditingId(null);
  };

  const saveEditExtraction = (project: ExtractionProject) => {
    onUpdateExtraction({ ...project, name: editName });
    setEditingId(null);
  };

  const saveEditCloning = (project: CloningProject) => {
    onUpdateCloning({ ...project, name: editName });
    setEditingId(null);
  };

  const saveEditVoice = (voice: VoiceProfile) => {
    onUpdateVoice({ ...voice, name: editName });
    setEditingId(null);
  };

  const saveEditAudio = (gen: AudioGeneration) => {
    onUpdateGeneration({ ...gen, name: editName });
    setEditingId(null);
  };

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
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <DbIcon className="w-6 h-6 text-emerald-500" />
          Banco de Dados
        </h2>
        <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setActiveTab('scripts')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'scripts' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <FolderOpen className="w-4 h-4" /> Guiões
          </button>
          <button
            onClick={() => setActiveTab('extractions')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'extractions' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <Mic className="w-4 h-4" /> Extrações
          </button>
          <button
            onClick={() => setActiveTab('clonings')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'clonings' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <Wand2 className="w-4 h-4" /> Clonagens
          </button>
          <button
            onClick={() => setActiveTab('voices')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'voices' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <Mic className="w-4 h-4" /> Vozes
          </button>
          <button
            onClick={() => setActiveTab('audios')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'audios' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <PlaySquare className="w-4 h-4" /> Áudios
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'backup' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <Download className="w-4 h-4" /> Backup
          </button>
        </div>
      </div>

      {activeTab === 'scripts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length === 0 && <p className="text-zinc-500 col-span-full text-center py-8">Nenhum guião guardado.</p>}
          {projects.map(project => (
            <div key={project.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 pr-4">
                  {editingId === project.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-zinc-950 border border-emerald-500 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                        autoFocus
                      />
                      <button onClick={() => saveEditScript(project)} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <h3 className="text-lg font-medium text-zinc-200 truncate flex items-center gap-2">
                      {project.name}
                      <button onClick={() => startEdit(project.id, project.name)} className="text-zinc-500 hover:text-emerald-400"><Edit3 className="w-3 h-3" /></button>
                    </h3>
                  )}
                  <div className="text-xs text-zinc-500 mt-1">{new Date(project.updatedAt).toLocaleString()}</div>
                </div>
                <button onClick={() => onDeleteScript(project.id)} className="p-1.5 text-zinc-500 hover:text-red-400 rounded-md transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 text-sm text-zinc-400 mb-4">
                {project.segments?.length || 0} blocos de áudio
              </div>
              <button onClick={() => onLoadScript(project)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-auto">
                <Edit3 className="w-4 h-4" /> Abrir no Estúdio
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'extractions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {extractions.length === 0 && <p className="text-zinc-500 col-span-full text-center py-8">Nenhuma extração guardada.</p>}
          {extractions.map(project => (
            <div key={project.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 pr-4">
                  {editingId === project.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-zinc-950 border border-emerald-500 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                        autoFocus
                      />
                      <button onClick={() => saveEditExtraction(project)} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <h3 className="text-lg font-medium text-zinc-200 truncate flex items-center gap-2">
                      {project.name}
                      <button onClick={() => startEdit(project.id, project.name)} className="text-zinc-500 hover:text-emerald-400"><Edit3 className="w-3 h-3" /></button>
                    </h3>
                  )}
                  <div className="text-xs text-zinc-500 mt-1">{new Date(project.updatedAt).toLocaleString()}</div>
                </div>
                <button onClick={() => onDeleteExtraction(project.id)} className="p-1.5 text-zinc-500 hover:text-red-400 rounded-md transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 text-sm text-zinc-400 mb-4">
                {project.segments?.length || 0} segmentos extraídos
              </div>
              <button onClick={() => onLoadExtraction(project)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-auto">
                <Edit3 className="w-4 h-4" /> Abrir na Extração
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'clonings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clonings.length === 0 && <p className="text-zinc-500 col-span-full text-center py-8">Nenhuma clonagem guardada.</p>}
          {clonings.map(project => (
            <div key={project.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 pr-4">
                  {editingId === project.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-zinc-950 border border-emerald-500 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                        autoFocus
                      />
                      <button onClick={() => saveEditCloning(project)} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <h3 className="text-lg font-medium text-zinc-200 truncate flex items-center gap-2">
                      {project.name}
                      <button onClick={() => startEdit(project.id, project.name)} className="text-zinc-500 hover:text-emerald-400"><Edit3 className="w-3 h-3" /></button>
                    </h3>
                  )}
                  <div className="text-xs text-zinc-500 mt-1">{new Date(project.updatedAt).toLocaleString()}</div>
                </div>
                <button onClick={() => onDeleteCloning(project.id)} className="p-1.5 text-zinc-500 hover:text-red-400 rounded-md transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 text-sm text-zinc-400 mb-4">
                {project.segments?.length || 0} segmentos clonados
              </div>
              <button onClick={() => onLoadCloning(project)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-auto">
                <Edit3 className="w-4 h-4" /> Abrir na Clonagem
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'voices' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {voices.length === 0 && <p className="text-zinc-500 col-span-full text-center py-8">Nenhuma voz guardada.</p>}
          {voices.map(voice => (
            <div key={voice.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 pr-4">
                  {editingId === voice.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-zinc-950 border border-emerald-500 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                        autoFocus
                      />
                      <button onClick={() => saveEditVoice(voice)} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <h3 className="text-lg font-medium text-zinc-200 truncate flex items-center gap-2">
                      {voice.name}
                      <button onClick={(e) => playVoicePreview(voice.id, e)} className={`${playingVoiceId === voice.id ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'}`} title={playingVoiceId === voice.id ? "Parar Preview" : "Ouvir Preview"}>
                        {playingVoiceId === voice.id ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                      </button>
                      <button onClick={() => startEdit(voice.id, voice.name)} className="text-zinc-500 hover:text-emerald-400" title="Editar Nome"><Edit3 className="w-3 h-3" /></button>
                      <button onClick={() => onEditVoice(voice)} className="text-zinc-500 hover:text-emerald-400" title="Abrir no Designer"><Wand2 className="w-3 h-3" /></button>
                    </h3>
                  )}
                  <div className="text-xs text-zinc-500 mt-1">{voice.gender} • {voice.age} • {voice.style}</div>
                </div>
                <button onClick={() => onDeleteVoice(voice.id)} className="p-1.5 text-zinc-500 hover:text-red-400 rounded-md transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'audios' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {generations.length === 0 && <p className="text-zinc-500 col-span-full text-center py-8">Nenhum áudio guardado.</p>}
          {generations.map(gen => {
            const voice = voices.find(v => v.id === gen.voiceId);
            const project = projects.find(p => p.id === gen.projectId);
            return (
              <div key={gen.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0 pr-4">
                    {editingId === gen.id ? (
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={editName} 
                          onChange={e => setEditName(e.target.value)}
                          className="w-full bg-zinc-950 border border-emerald-500 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                          autoFocus
                          placeholder="Nome do áudio"
                        />
                        <button onClick={() => saveEditAudio(gen)} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <h3 className="text-sm font-medium text-emerald-400 truncate flex items-center gap-2">
                        {gen.name || voice?.name || 'Áudio sem nome'}
                        <button onClick={() => startEdit(gen.id, gen.name || '')} className="text-zinc-500 hover:text-emerald-400" title="Editar Nome"><Edit3 className="w-3 h-3" /></button>
                      </h3>
                    )}
                    <div className="text-xs text-zinc-500 mt-1">
                      {new Date(gen.timestamp).toLocaleString()}
                      {project && ` • Projeto: ${project.name}`}
                    </div>
                  </div>
                  <button onClick={() => onDeleteGeneration(gen.id)} className="p-1.5 text-zinc-500 hover:text-red-400 rounded-md transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-zinc-300 mb-4 line-clamp-3">"{gen.text}"</p>
                <audio src={gen.audioData.startsWith('data:') ? gen.audioData : `data:audio/wav;base64,${gen.audioData}`} controls className="w-full h-8 mt-auto" />
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center mt-8">
          <h3 className="text-xl font-medium mb-6">Backup do Banco de Dados</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={handleExport} className="flex flex-col items-center justify-center gap-3 p-6 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group">
              <div className="w-12 h-12 rounded-full bg-zinc-900 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
                <Download className="w-6 h-6 text-zinc-300 group-hover:text-emerald-400" />
              </div>
              <div>
                <div className="font-medium text-zinc-200">Exportar Tudo</div>
                <div className="text-xs text-zinc-500 mt-1">Guardar como .json</div>
              </div>
            </button>
            <label className="flex flex-col items-center justify-center gap-3 p-6 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group cursor-pointer">
              <div className="w-12 h-12 rounded-full bg-zinc-900 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
                <Upload className="w-6 h-6 text-zinc-300 group-hover:text-emerald-400" />
              </div>
              <div>
                <div className="font-medium text-zinc-200">Importar Backup</div>
                <div className="text-xs text-zinc-500 mt-1">Carregar ficheiro .json</div>
              </div>
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
