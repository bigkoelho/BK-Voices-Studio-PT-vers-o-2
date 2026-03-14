import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Download, Loader2, Trash2, Mic2, Copy, Check, Wand2, Settings2, Edit3, ArrowLeft, RefreshCw, Archive } from 'lucide-react';
import { VoiceProfile, AudioGeneration, ScriptProject } from '../types';
import { generateSpeech, parseScriptIntoSegments, generateSpeechFromSegments, ScriptSegment } from '../services/gemini';
import { mergeAudioBuffers } from '../services/extraction';
import { generateId } from '../utils';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface Props {
  key?: React.Key;
  voices: VoiceProfile[];
  generations: AudioGeneration[];
  activeProject?: ScriptProject | null;
  onSaveGeneration: (gen: AudioGeneration) => void;
  onDeleteGeneration: (id: string) => void;
  onDeleteVoice: (id: string) => void;
  onSaveVoice: (voice: VoiceProfile) => void;
  onSaveProject: (project: ScriptProject) => void;
  onClearActiveProject: () => void;
}

export default function Studio({ voices, generations, activeProject, onSaveGeneration, onDeleteVoice, onSaveVoice, onSaveProject, onClearActiveProject }: Props) {
  const [mode, setMode] = useState<'classic' | 'magic'>('classic');
  const [magicStep, setMagicStep] = useState<'input' | 'review'>('input');
  const [magicPrompt, setMagicPrompt] = useState('');
  const [magicSegments, setMagicSegments] = useState<ScriptSegment[]>([]);
  const [magicVoiceProfile, setMagicVoiceProfile] = useState<VoiceProfile | null>(null);
  const [projectName, setProjectName] = useState('');
  
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>((voices || [])[0]?.id || '');
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  
  const [classicGeneratedAudio, setClassicGeneratedAudio] = useState<string | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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

  useEffect(() => {
    if (activeProject) {
      setMode('magic');
      setMagicStep('review');
      setMagicSegments(activeProject.segments || []);
      setMagicVoiceProfile(activeProject.voiceProfile || null);
      setProjectName(activeProject.name);
    }
  }, [activeProject]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      interval = setInterval(() => {
        setProgress(p => Math.min(p + (Math.random() * 5 + 2), 95));
      }, 800);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleAnalyzeScript = async () => {
    if (!magicPrompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStatusText('A analisar o guião e a separar as falas das instruções...');

    try {
      const parsed = await parseScriptIntoSegments(magicPrompt);
      
      const newVoiceId = generateId();
      const tempVoice: VoiceProfile = {
        id: newVoiceId,
        name: `Voz Mágica (${parsed.voiceProfile.gender}, ${parsed.voiceProfile.age})`,
        ...parsed.voiceProfile
      };
      
      setMagicVoiceProfile(tempVoice);
      setMagicSegments(parsed.segments.map(s => ({ ...s, id: generateId(), selected: true })));
      setProjectName(`Projeto Mágico ${new Date().toLocaleDateString()}`);
      setMagicStep('review');
    } catch (err: any) {
      setError(err.message || "Erro ao analisar o guião.");
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const handleUpdateSegment = (id: string, field: keyof ScriptSegment, value: any) => {
    setMagicSegments(prev => (prev || []).map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const toggleAllSelection = () => {
    const allSelected = magicSegments.every(s => s.selected !== false);
    setMagicSegments(prev => prev.map(s => ({ ...s, selected: !allSelected })));
  };

  const handleSaveProject = () => {
    if (!magicVoiceProfile) return;
    const projectToSave: ScriptProject = {
      id: activeProject?.id || generateId(),
      name: projectName || 'Projeto sem nome',
      voiceProfile: magicVoiceProfile,
      segments: magicSegments,
      updatedAt: Date.now()
    };
    onSaveProject(projectToSave);
    onSaveVoice(magicVoiceProfile);
    alert('Projeto guardado com sucesso!');
  };

  const generateSingleSegment = async (segmentId: string) => {
    const segIndex = magicSegments.findIndex(s => s.id === segmentId);
    if (segIndex === -1 || !magicVoiceProfile) return;
    const seg = magicSegments[segIndex];

    setIsGenerating(true);
    setError(null);
    setStatusText(`A gerar bloco ${seg.timestamp}...`);

    try {
      const voiceId = seg.voiceId || magicVoiceProfile.id;
      const voice = voices.find(v => v.id === voiceId) || magicVoiceProfile;

      const audioUris = await generateSpeechFromSegments(voice, [seg], voices);

      if (audioUris[0]) {
        setMagicSegments(prev => prev.map(s => s.id === segmentId ? { ...s, audioDataUri: audioUris[0] } : s));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar bloco.');
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const handleGenerateSelected = async () => {
    const selectedSegments = magicSegments.filter(s => s.selected !== false);
    if (!magicVoiceProfile || selectedSegments.length === 0) return;
    
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStatusText(`A gerar ${selectedSegments.length} bloco(s)...`);

    try {
      onSaveVoice(magicVoiceProfile);
      setSelectedVoiceId(magicVoiceProfile.id);

      let generatedCount = 0;
      const totalSegs = selectedSegments.length;

      for (const seg of selectedSegments) {
        const voiceId = seg.voiceId || magicVoiceProfile.id;
        const voice = voices.find(v => v.id === voiceId) || magicVoiceProfile;

        const audioUris = await generateSpeechFromSegments(voice, [seg], voices);

        if (audioUris[0]) {
          setMagicSegments(prev => prev.map(s => s.id === seg.id ? { ...s, audioDataUri: audioUris[0] } : s));
        }
        
        generatedCount++;
        setProgress(Math.round((generatedCount / totalSegs) * 100));
      }
    } catch (err: any) {
      setError(err.message || "Erro ao gerar áudio.");
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const parseTimestamp = (ts: string): number => {
    const match = ts.match(/\[?(\d+):(\d+)\]?/);
    if (match) {
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    }
    return 0;
  };

  const handleGenerateFullAudio = async () => {
    if (magicSegments.length === 0 || !magicVoiceProfile) return;

    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStatusText('A preparar áudio para cada bloco...');

    try {
      const audioSegments: { audioDataUri: string, startTime: number }[] = [];
      const totalSegs = magicSegments.length;
      
      for (let i = 0; i < magicSegments.length; i++) {
        const seg = magicSegments[i];
        const startTime = parseTimestamp(seg.timestamp);
        
        if (seg.audioDataUri) {
          audioSegments.push({ audioDataUri: seg.audioDataUri, startTime });
        } else {
          const voiceId = seg.voiceId || magicVoiceProfile.id;
          const voice = voices.find(v => v.id === voiceId) || magicVoiceProfile;

          const audioUris = await generateSpeechFromSegments(voice, [seg], voices);

          if (audioUris[0]) {
            audioSegments.push({ audioDataUri: audioUris[0], startTime });
            setMagicSegments(prev => prev.map(s => s.id === seg.id ? { ...s, audioDataUri: audioUris[0] } : s));
          }
        }
        setProgress(Math.round(((i + 1) / totalSegs) * 80));
      }

      setStatusText('A sincronizar e a juntar o áudio final...');
      
      let maxTime = 0;
      for (const seg of audioSegments) {
        if (seg.startTime > maxTime) maxTime = seg.startTime;
      }
      const mediaDuration = maxTime + 10;

      const finalAudio = await mergeAudioBuffers(audioSegments, mediaDuration);
      setProgress(100);

      const newGen: AudioGeneration = {
        id: generateId(),
        voiceId: magicVoiceProfile.id,
        text: `Áudio completo do projeto: ${projectName}`,
        audioData: finalAudio,
        timestamp: Date.now(),
        projectId: activeProject?.id || undefined,
        source: 'script'
      };
      onSaveGeneration(newGen);
      
      downloadAudio(finalAudio, `projeto_${projectName.replace(/\s+/g, '_')}`);

    } catch (err: any) {
      setError(err.message || 'Erro ao gerar áudio final.');
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const handleGenerateClassic = async () => {
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setClassicGeneratedAudio(null);

    try {
      if (!selectedVoiceId) {
        throw new Error("Por favor, seleciona uma voz.");
      }
      if (!text.trim()) {
        throw new Error("Por favor, introduz o texto a ser lido.");
      }

      const voice = (voices || []).find(v => v.id === selectedVoiceId);
      if (!voice) throw new Error("Voz não encontrada.");

      setStatusText('A gravar o áudio...');
      const audioDataUri = await generateSpeech(voice, text);
      setProgress(100);
      
      setClassicGeneratedAudio(audioDataUri);
    } catch (err: any) {
      setError(err.message || "Erro ao gerar áudio.");
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const downloadAudio = (audioData: string, filename: string) => {
    const link = document.createElement('a');
    link.href = audioData.startsWith('data:') ? audioData : `data:audio/wav;base64,${audioData}`;
    link.download = `${filename}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const playSegment = (segment: ScriptSegment) => {
    if (!segment.audioDataUri) return;
    
    if (playingSegmentId === segment.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingSegmentId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(segment.audioDataUri);
    audioRef.current = audio;
    
    audio.onended = () => setPlayingSegmentId(null);
    audio.play();
    setPlayingSegmentId(segment.id);
  };

  const downloadSegment = (segment: ScriptSegment) => {
    if (!segment.audioDataUri) return;
    saveAs(segment.audioDataUri, `bloco_${segment.timestamp.replace(':', '_')}.wav`);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    const selectedSegments = magicSegments.filter(s => s.selected !== false && s.audioDataUri);
    
    if (selectedSegments.length === 0) return;

    selectedSegments.forEach((seg, index) => {
      const base64Data = seg.audioDataUri!.split(',')[1];
      zip.file(`bloco_${index + 1}_${seg.timestamp.replace(':', '_')}.wav`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'blocos_de_voz.zip');
  };

  if ((voices || []).length === 0 && mode === 'classic') {
    return (
      <div className="text-center py-20 bg-zinc-900 border border-zinc-800 rounded-xl max-w-5xl mx-auto">
        <Mic2 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
        <h3 className="text-xl font-medium text-zinc-300 mb-2">Nenhuma voz disponível</h3>
        <p className="text-zinc-500 mb-6">Cria uma voz no separador "Criar Voz" para começares a gerar áudio no modo clássico.</p>
        <button 
          onClick={() => setMode('magic')}
          className="inline-flex items-center gap-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 px-4 py-2 rounded-lg transition-colors"
        >
          <Wand2 className="w-4 h-4" />
          Experimentar Modo Mágico
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Gerar Áudio</h2>
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setMode('classic')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${mode === 'classic' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Settings2 className="w-4 h-4" />
              Clássico
            </button>
            <button
              onClick={() => {
                setMode('magic');
                setMagicStep('input');
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${mode === 'magic' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Wand2 className="w-4 h-4" />
              Mágico
            </button>
          </div>
        </div>
        
        {mode === 'classic' ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Selecionar Voz</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(voices || []).map(v => (
                  <div 
                    key={v.id}
                    onClick={() => setSelectedVoiceId(v.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all relative group ${selectedVoiceId === v.id ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'}`}
                  >
                    <div className="font-medium pr-12 flex items-center gap-2">
                      {v.name}
                      <button 
                        onClick={(e) => playVoicePreview(v.id, e)} 
                        className={`${playingVoiceId === v.id ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'}`} 
                        title={playingVoiceId === v.id ? "Parar Preview" : "Ouvir Preview"}
                      >
                        {playingVoiceId === v.id ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                      </button>
                    </div>
                    <div className="text-xs opacity-70 mt-1">{v.gender} • {v.age} • {v.style}</div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteVoice(v.id); }}
                      className="absolute top-2 right-2 p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Eliminar Voz"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Texto</label>
              <textarea 
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Escreve aqui o texto que queres que a voz leia..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none min-h-[150px]"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {isGenerating && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                  <span className="font-medium text-emerald-400">{statusText}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-zinc-950 border border-zinc-800 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <button 
              onClick={handleGenerateClassic}
              disabled={isGenerating || !text.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {isGenerating ? 'A gerar áudio...' : 'Gerar Áudio'}
            </button>

            {classicGeneratedAudio && (
              <div className="mt-6 pt-6 border-t border-zinc-800 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <p className="text-sm font-medium text-emerald-400 mb-3">Áudio gerado com sucesso:</p>
                <audio src={classicGeneratedAudio} controls className="w-full h-10 mb-4" autoPlay />
                <button 
                  onClick={() => downloadAudio(classicGeneratedAudio, `audio_${generateId().slice(0,6)}`)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Transferir Áudio
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {magicStep === 'input' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-400 mb-2">Guião / Pedido Mágico</label>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 mb-4 text-sm text-emerald-200/80">
                  Cola aqui o teu guião completo. A IA vai separar as falas das instruções de direção (emoção, tom, etc) e preparar tudo para ti!
                </div>
                <textarea 
                  value={magicPrompt}
                  onChange={e => setMagicPrompt(e.target.value)}
                  placeholder="Ex: [0:00] (Tom grave e misterioso) Era uma vez, numa floresta escura..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none min-h-[250px] mb-4"
                />
                
                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {isGenerating && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                      <span className="font-medium text-emerald-400">{statusText}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <button 
                  onClick={handleAnalyzeScript}
                  disabled={isGenerating || !magicPrompt.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                  {isGenerating ? 'A analisar guião...' : 'Analisar Guião'}
                </button>
              </div>
            )}

            {magicStep === 'review' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-zinc-200">Rever e Editar Guião</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleSaveProject}
                      className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-md transition-colors"
                    >
                      Guardar Projeto
                    </button>
                    <button 
                      onClick={() => {
                        onClearActiveProject();
                        setMagicStep('input');
                      }}
                      className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1 px-2"
                    >
                      <ArrowLeft className="w-4 h-4" /> Voltar
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Nome do Projeto</label>
                    <input 
                      type="text" 
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="Ex: Anúncio de Verão"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Nome da Voz Principal</label>
                    <input 
                      type="text" 
                      value={magicVoiceProfile?.name || ''}
                      onChange={(e) => setMagicVoiceProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="Ex: Voz Mágica (Masculino, Adulto)"
                    />
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden mb-6">
                  <div className="grid grid-cols-12 gap-4 p-3 bg-zinc-900 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    <div className="col-span-1 flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        checked={magicSegments.length > 0 && magicSegments.every(s => s.selected !== false)}
                        onChange={toggleAllSelection}
                        className="w-4 h-4 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-900 cursor-pointer"
                        title="Selecionar todos"
                      />
                    </div>
                    <div className="col-span-2">Tempo</div>
                    <div className="col-span-2">Voz</div>
                    <div className="col-span-4">Texto a Ler</div>
                    <div className="col-span-3 text-center">Ações</div>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {(magicSegments || []).map((seg, idx) => (
                      <div key={seg.id} className={`grid grid-cols-12 gap-4 p-3 border-b border-zinc-800/50 items-center ${idx % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/30'}`}>
                        <div className="col-span-1 flex items-center justify-center">
                          <input 
                            type="checkbox" 
                            checked={seg.selected !== false} 
                            onChange={(e) => handleUpdateSegment(seg.id, 'selected', e.target.checked)}
                            className="w-4 h-4 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-900 cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2">
                          <input 
                            type="text" 
                            value={seg.timestamp}
                            onChange={(e) => handleUpdateSegment(seg.id, 'timestamp', e.target.value)}
                            className="w-full bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none transition-colors"
                            placeholder="0:00"
                          />
                        </div>
                        <div className="col-span-2 flex items-center gap-1">
                          <select
                            value={seg.voiceId || ''}
                            onChange={(e) => handleUpdateSegment(seg.id, 'voiceId', e.target.value)}
                            className="w-full bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none transition-colors"
                          >
                            <option value="">Principal</option>
                            {(voices || []).map(v => (
                              <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                          </select>
                          {seg.voiceId && getPreviewAudio(seg.voiceId) && (
                            <button 
                              onClick={(e) => playVoicePreview(seg.voiceId!, e)}
                              className={`${playingVoiceId === seg.voiceId ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'}`}
                              title={playingVoiceId === seg.voiceId ? "Parar Preview" : "Ouvir Preview"}
                            >
                              {playingVoiceId === seg.voiceId ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                            </button>
                          )}
                        </div>
                        <div className="col-span-4">
                          <textarea 
                            value={seg.text}
                            onChange={(e) => handleUpdateSegment(seg.id, 'text', e.target.value)}
                            className="w-full bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none transition-colors resize-none min-h-[40px]"
                            placeholder="Texto a ser lido..."
                          />
                        </div>
                        <div className="col-span-3 flex items-center justify-center gap-2">
                          {seg.audioDataUri ? (
                            <>
                              <button 
                                onClick={() => playSegment(seg)}
                                className={`p-2 rounded-lg transition-colors ${playingSegmentId === seg.id ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-emerald-600 hover:text-white'}`}
                                title={playingSegmentId === seg.id ? "Pausar" : "Ouvir"}
                              >
                                <Play className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => downloadSegment(seg)}
                                className="p-2 bg-zinc-800 text-zinc-300 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => generateSingleSegment(seg.id)}
                                className="p-2 bg-zinc-800 text-zinc-300 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors"
                                title="Gerar Novamente"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-zinc-500">Por gerar</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {isGenerating && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                      <span className="font-medium text-emerald-400">{statusText}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <button 
                    onClick={handleGenerateSelected}
                    disabled={isGenerating || (magicSegments || []).filter(s => s.selected !== false).length === 0}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                    {isGenerating ? 'A gerar vozes...' : `Gerar Vozes (Blocos Selecionados)`}
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                      onClick={handleGenerateFullAudio}
                      disabled={isGenerating || magicSegments.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Play className="w-5 h-5" />
                      Geração de Áudio Total
                    </button>
                    
                    <button 
                      onClick={downloadZip}
                      disabled={isGenerating || magicSegments.filter(s => s.selected !== false && s.audioDataUri).length === 0}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Archive className="w-5 h-5" />
                      Download de Blocos (ZIP)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
