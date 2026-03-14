import React, { useState, useRef, useEffect } from 'react';
import { Upload, Mic, Play, Loader2, Check, Wand2, Trash2, Download, RefreshCw, Save, Pause, PlaySquare } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { VoiceProfile, AudioGeneration, ExtractionSegment, CloningProject } from '../types';
import { extractVoicesFromMedia, mergeAudioBuffers } from '../services/extraction';
import { cloneVoiceFromAudio } from '../services/gemini';
import { generateId } from '../utils';
import { sliceAudioBlob } from '../utils/audio';

interface Props {
  voices: VoiceProfile[];
  activeProject: CloningProject | null;
  onSaveGeneration: (gen: AudioGeneration) => void;
  onSaveProject: (project: CloningProject) => void;
  onClearActiveProject: () => void;
}

export default function VoiceCloning({ voices, activeProject, onSaveGeneration, onSaveProject, onClearActiveProject }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<ExtractionSegment[]>([]);
  const [speakerMapping, setSpeakerMapping] = useState<Record<string, string>>({});
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [playingOriginalId, setPlayingOriginalId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Nova Clonagem');
  const [projectId, setProjectId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeProject) {
      setProjectId(activeProject.id);
      setProjectName(activeProject.name);
      setSegments(activeProject.segments);
      setSpeakerMapping(activeProject.speakerMapping);
      setFile(null);
      setGeneratedAudio(null);
    } else {
      setProjectId(null);
      setProjectName('Nova Clonagem');
      setSegments([]);
      setSpeakerMapping({});
      setFile(null);
      setGeneratedAudio(null);
    }
  }, [activeProject]);

  const handleSaveToDatabase = () => {
    if (segments.length === 0) return;
    
    const project: CloningProject = {
      id: projectId || generateId(),
      name: projectName,
      segments,
      speakerMapping,
      updatedAt: Date.now()
    };
    
    setProjectId(project.id);
    onSaveProject(project);
    alert('Projeto de clonagem guardado no Banco de Dados!');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    
    setFile(selected);
    setSegments([]);
    setSpeakerMapping({});
    setGeneratedAudio(null);
    setError(null);

    if (originalAudioRef.current) {
      originalAudioRef.current.pause();
      originalAudioRef.current.src = '';
    }

    const url = URL.createObjectURL(selected);
    originalAudioRef.current = new Audio(url);

    const media = document.createElement(selected.type.startsWith('video') ? 'video' : 'audio');
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      setMediaDuration(media.duration);
    };
    media.src = url;
  };

  const handleExtract = () => {
    if (!file) return;

    setIsExtracting(true);
    setError(null);
    setProgress(0);
    setStatusText('A analisar o ficheiro e a preparar segmentos para clonagem...');

    const interval = setInterval(() => {
      setProgress(p => Math.min(p + 2, 90));
    }, 1000);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64 = (event.target?.result as string).split(',')[1];
        const extracted = await extractVoicesFromMedia(base64, file.type);
        
        const segmentsWithId = extracted.segments.map(s => ({ ...s, id: generateId(), selected: true }));
        setSegments(segmentsWithId);
        
        const uniqueSpeakers = Array.from(new Set(segmentsWithId.map(s => s.speaker)));
        const initialMapping: Record<string, string> = {};
        uniqueSpeakers.forEach(spk => {
          initialMapping[spk] = voices.length > 0 ? voices[0].id : '';
        });
        setSpeakerMapping(initialMapping);
        
        setProgress(100);
      } catch (err: any) {
        setError(err.message || 'Erro ao preparar ficheiro.');
      } finally {
        clearInterval(interval);
        setIsExtracting(false);
        setStatusText('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateSelected = async () => {
    const selectedSegments = segments.filter(s => s.selected);
    if (selectedSegments.length === 0 || !file) return;

    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStatusText('A aplicar máscara de voz aos blocos selecionados...');

    try {
      const totalSegs = selectedSegments.length;
      let generatedCount = 0;

      for (const seg of selectedSegments) {
        const voiceId = seg.forcedVoiceId || speakerMapping[seg.speaker];
        if (!voiceId) throw new Error(`Nenhuma voz selecionada para o locutor ${seg.speaker}`);
        
        const voice = voices.find(v => v.id === voiceId);
        if (!voice) throw new Error(`Voz não encontrada para o locutor ${seg.speaker}`);

        // Calculate end time (assuming next segment start time or media duration)
        const nextSeg = segments.find(s => s.startTime > seg.startTime);
        const endTime = nextSeg ? nextSeg.startTime : mediaDuration;
        
        const slicedBlob = await sliceAudioBlob(file, seg.startTime, endTime);
        const audioUri = await cloneVoiceFromAudio(voice, seg, slicedBlob);

        if (audioUri) {
          setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, audioDataUri: audioUri } : s));
        }
        
        generatedCount++;
        setProgress(Math.round((generatedCount / totalSegs) * 100));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao aplicar máscara de voz.');
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const generateSingleSegment = async (segmentId: string) => {
    const segIndex = segments.findIndex(s => s.id === segmentId);
    if (segIndex === -1 || !file) return;
    const seg = segments[segIndex];

    setIsGenerating(true);
    setError(null);
    setStatusText(`A aplicar máscara ao bloco ${seg.startTime.toFixed(1)}s...`);

    try {
      const voiceId = seg.forcedVoiceId || speakerMapping[seg.speaker];
      if (!voiceId) throw new Error(`Nenhuma voz selecionada para o locutor ${seg.speaker}`);
      
      const voice = voices.find(v => v.id === voiceId);
      if (!voice) throw new Error(`Voz não encontrada para o locutor ${seg.speaker}`);

      const nextSeg = segments.find(s => s.startTime > seg.startTime);
      const endTime = nextSeg ? nextSeg.startTime : mediaDuration;
      
      const slicedBlob = await sliceAudioBlob(file, seg.startTime, endTime);
      const audioUri = await cloneVoiceFromAudio(voice, seg, slicedBlob);

      if (audioUri) {
        setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, audioDataUri: audioUri } : s));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao aplicar máscara.');
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const handleGenerateFullAudio = async () => {
    if (segments.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStatusText('A preparar áudio final...');

    try {
      const audioSegments: { audioDataUri: string, startTime: number }[] = [];
      const totalSegs = segments.length;
      
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        
        if (seg.audioDataUri) {
          audioSegments.push({ audioDataUri: seg.audioDataUri, startTime: seg.startTime });
        } else {
          const voiceId = seg.forcedVoiceId || speakerMapping[seg.speaker];
          if (!voiceId) throw new Error(`Nenhuma voz selecionada para o locutor ${seg.speaker}`);
          
          const voice = voices.find(v => v.id === voiceId);
          if (!voice) throw new Error(`Voz não encontrada para o locutor ${seg.speaker}`);

          if (!file) throw new Error("Ficheiro de áudio não encontrado.");
          
          const nextSeg = segments.find(s => s.startTime > seg.startTime);
          const endTime = nextSeg ? nextSeg.startTime : mediaDuration;
          
          const slicedBlob = await sliceAudioBlob(file, seg.startTime, endTime);
          const audioUri = await cloneVoiceFromAudio(voice, seg, slicedBlob);

          if (audioUri) {
            audioSegments.push({ audioDataUri: audioUri, startTime: seg.startTime });
            setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, audioDataUri: audioUri } : s));
          }
        }
        setProgress(Math.round(((i + 1) / totalSegs) * 80));
      }

      setStatusText('A sincronizar e a juntar o áudio final...');
      
      const finalAudio = await mergeAudioBuffers(audioSegments, mediaDuration);
      setProgress(100);
      setGeneratedAudio(finalAudio);

      const newGen: AudioGeneration = {
        id: generateId(),
        voiceId: 'mixed',
        text: `Áudio clonado de: ${file?.name}`,
        audioData: finalAudio,
        timestamp: Date.now(),
        source: 'extraction'
      };
      onSaveGeneration(newGen);

    } catch (err: any) {
      setError(err.message || 'Erro ao gerar áudio final.');
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const updateSegmentVoice = (id: string, voiceId: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, forcedVoiceId: voiceId } : s));
  };

  const toggleSegmentSelection = (id: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const toggleAllSelection = () => {
    const allSelected = segments.every(s => s.selected !== false);
    setSegments(prev => prev.map(s => ({ ...s, selected: !allSelected })));
  };

  const playOriginalSegment = (segment: ExtractionSegment) => {
    if (!originalAudioRef.current) return;
    
    if (playingOriginalId === segment.id) {
      originalAudioRef.current.pause();
      setPlayingOriginalId(null);
      originalAudioRef.current.ontimeupdate = null;
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingSegmentId(null);
    }

    originalAudioRef.current.pause();
    originalAudioRef.current.currentTime = segment.startTime;
    
    const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
    const currentIndex = sortedSegments.findIndex(s => s.id === segment.id);
    const nextSegment = currentIndex !== -1 && currentIndex < sortedSegments.length - 1 
      ? sortedSegments[currentIndex + 1] 
      : null;
      
    const endTime = nextSegment ? nextSegment.startTime : mediaDuration;
    
    originalAudioRef.current.ontimeupdate = () => {
      if (originalAudioRef.current && originalAudioRef.current.currentTime >= endTime) {
        originalAudioRef.current.pause();
        setPlayingOriginalId(null);
        originalAudioRef.current.ontimeupdate = null;
      }
    };
    
    originalAudioRef.current.onended = () => {
      setPlayingOriginalId(null);
      if (originalAudioRef.current) originalAudioRef.current.ontimeupdate = null;
    };

    originalAudioRef.current.play().catch(e => console.error("Error playing original audio", e));
    setPlayingOriginalId(segment.id);
  };

  const playSegment = (segment: ExtractionSegment) => {
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

  const downloadSegment = (segment: ExtractionSegment) => {
    if (!segment.audioDataUri) return;
    saveAs(segment.audioDataUri, `clonagem_${segment.startTime.toFixed(1)}s.wav`);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    const selectedSegments = segments.filter(s => s.selected && s.audioDataUri);
    
    if (selectedSegments.length === 0) return;

    selectedSegments.forEach((seg, index) => {
      const base64Data = seg.audioDataUri!.split(',')[1];
      zip.file(`clonagem_${index + 1}_${seg.startTime.toFixed(1)}s.wav`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'clonagem_de_voz.zip');
  };

  const uniqueSpeakers: string[] = Array.from(new Set(segments.map(s => s.speaker)));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl relative">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <PlaySquare className="text-emerald-500" />
          {activeProject ? 'Editar Clonagem' : 'Clonagem de Voz (Máscara)'}
        </h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="Nome do Projeto"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all w-48"
          />
          <button
            onClick={handleSaveToDatabase}
            disabled={segments.length === 0}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            Guardar
          </button>
          {activeProject && (
             <button
               onClick={onClearActiveProject}
               className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
             >
               Novo
             </button>
          )}
        </div>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-medium text-zinc-400 mb-2">Upload de Áudio Base (Máscara)</label>
        <div 
          className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
          <p className="text-zinc-300 font-medium mb-1">Clica para fazer upload</p>
          <p className="text-xs text-zinc-500">Suporta MP4, MP3, WAV, etc. (Máx ~20MB para a API)</p>
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="audio/*,video/*"
            onChange={handleFileChange}
          />
        </div>
        {file && (
          <div className="mt-3 flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <div className="flex items-center gap-2 truncate pr-4">
              <Play className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-sm text-zinc-300 truncate">{file.name}</span>
            </div>
            <button 
              onClick={() => { setFile(null); setSegments([]); }}
              className="text-zinc-500 hover:text-red-400 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {file && segments.length === 0 && !isExtracting && (
        <button
          onClick={handleExtract}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mb-8"
        >
          <Wand2 className="w-5 h-5" />
          Preparar Áudio para Clonagem
        </button>
      )}

      {isExtracting && (
        <div className="mb-8 text-center py-8 bg-zinc-950 rounded-xl border border-zinc-800">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-zinc-300 font-medium">{statusText}</p>
          <div className="w-64 mx-auto mt-4 bg-zinc-900 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {segments.length > 0 && (
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Mapeamento de Vozes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uniqueSpeakers.map((speaker, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-24 text-sm font-medium text-zinc-400">{speaker}</div>
                  <select
                    value={speakerMapping[speaker] || ''}
                    onChange={(e) => setSpeakerMapping(prev => ({ ...prev, [speaker]: e.target.value }))}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="" disabled>Seleciona uma voz...</option>
                    {voices.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Blocos de Áudio</h3>
            <div className="flex gap-2">
              <button
                onClick={toggleAllSelection}
                className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                Selecionar Todos
              </button>
              <button
                onClick={handleGenerateSelected}
                disabled={isGenerating || segments.filter(s => s.selected).length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Aplicar Máscara Selecionados
              </button>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-3 border-b border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-400">
              <div className="col-span-1 text-center">Sel</div>
              <div className="col-span-1">Início</div>
              <div className="col-span-3">Voz (Máscara)</div>
              <div className="col-span-5">Texto Transcrito</div>
              <div className="col-span-2 text-right">Ações</div>
            </div>
            
            <div className="max-h-[400px] overflow-y-auto">
              {segments.map((seg, idx) => (
                <div key={seg.id} className={`grid grid-cols-12 gap-4 p-3 border-b border-zinc-800/50 items-center ${idx % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/30'}`}>
                  <div className="col-span-1 flex justify-center">
                    <input 
                      type="checkbox" 
                      checked={seg.selected !== false}
                      onChange={() => toggleSegmentSelection(seg.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
                    />
                  </div>
                  <div className="col-span-1 text-sm font-mono text-zinc-400">
                    {seg.startTime.toFixed(1)}s
                  </div>
                  <div className="col-span-3">
                    <select
                      value={seg.forcedVoiceId || speakerMapping[seg.speaker] || ''}
                      onChange={(e) => updateSegmentVoice(seg.id, e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="" disabled>Voz Padrão...</option>
                      {voices.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-5">
                    <div className="text-sm text-zinc-300 line-clamp-2" title={seg.text}>
                      {seg.text}
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <button
                      onClick={() => playOriginalSegment(seg)}
                      className={`p-1.5 rounded-md transition-colors ${playingOriginalId === seg.id ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
                      title="Ouvir Original"
                    >
                      {playingOriginalId === seg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    
                    {seg.audioDataUri ? (
                      <>
                        <button
                          onClick={() => playSegment(seg)}
                          className={`p-1.5 rounded-md transition-colors ${playingSegmentId === seg.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                          title="Ouvir Clonado"
                        >
                          {playingSegmentId === seg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => downloadSegment(seg)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
                          title="Descarregar Bloco"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => generateSingleSegment(seg.id)}
                        disabled={isGenerating}
                        className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                        title="Aplicar Máscara a este bloco"
                      >
                        <Wand2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <div className="text-sm text-zinc-400">
              {segments.filter(s => s.audioDataUri).length} de {segments.length} blocos clonados
            </div>
            <div className="flex gap-3">
              {segments.some(s => s.audioDataUri) && (
                <button
                  onClick={downloadZip}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Descarregar ZIP
                </button>
              )}
              <button
                onClick={handleGenerateFullAudio}
                disabled={isGenerating || segments.length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Juntar Áudio Final
              </button>
            </div>
          </div>

          {generatedAudio && (
            <div className="mt-8 bg-zinc-950 p-6 rounded-xl border border-emerald-500/30">
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <Check className="text-emerald-500" />
                Áudio Clonado Finalizado
              </h3>
              <audio controls src={generatedAudio} className="w-full mb-4" />
              <div className="flex justify-end">
                <button
                  onClick={() => saveAs(generatedAudio, 'audio_clonado_final.wav')}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Descarregar Áudio Completo
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
