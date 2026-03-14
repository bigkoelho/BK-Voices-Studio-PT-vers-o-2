import React, { useState, useRef, useEffect } from 'react';
import { Upload, Mic, Play, Loader2, Check, Wand2, Trash2, Download, RefreshCw, Save, Pause } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { VoiceProfile, AudioGeneration, ExtractionSegment, ExtractionProject } from '../types';
import { extractVoicesFromMedia, mergeAudioBuffers } from '../services/extraction';
import { generateSpeechFromSegments } from '../services/gemini';
import { generateId } from '../utils';
import { sliceAudioBlob } from '../utils/audio';

interface Props {
  voices: VoiceProfile[];
  activeProject: ExtractionProject | null;
  onSaveGeneration: (gen: AudioGeneration) => void;
  onSaveVoice: (voice: VoiceProfile) => void;
  onSaveProject: (project: ExtractionProject) => void;
  onClearActiveProject: () => void;
}

export default function VoiceExtraction({ voices, activeProject, onSaveGeneration, onSaveVoice, onSaveProject, onClearActiveProject }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<ExtractionSegment[]>([]);
  const [extractedSpeakers, setExtractedSpeakers] = useState<Record<string, Omit<VoiceProfile, 'id' | 'name'>>>({});
  const [speakerMapping, setSpeakerMapping] = useState<Record<string, string>>({});
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [playingOriginalId, setPlayingOriginalId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Nova Extração');
  const [projectId, setProjectId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeProject) {
      setProjectId(activeProject.id);
      setProjectName(activeProject.name);
      setSegments(activeProject.segments);
      setExtractedSpeakers(activeProject.speakers);
      setSpeakerMapping(activeProject.speakerMapping);
      setFile(null);
      setGeneratedAudio(null);
    } else {
      setProjectId(null);
      setProjectName('Nova Extração');
      setSegments([]);
      setExtractedSpeakers({});
      setSpeakerMapping({});
      setFile(null);
      setGeneratedAudio(null);
    }
  }, [activeProject]);

  const handleSaveToDatabase = () => {
    if (segments.length === 0) return;
    
    const project: ExtractionProject = {
      id: projectId || generateId(),
      name: projectName,
      segments,
      speakers: extractedSpeakers,
      speakerMapping,
      updatedAt: Date.now()
    };
    
    setProjectId(project.id);
    onSaveProject(project);
    alert('Projeto de extração guardado no Banco de Dados!');
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

    // Get duration
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
    setStatusText('A analisar o ficheiro e a extrair vozes...');

    // Simulate progress
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
        setExtractedSpeakers(extracted.speakers || {});
        
        // Initialize speaker mapping and names
        const uniqueSpeakers = Array.from(new Set(segmentsWithId.map(s => s.speaker)));
        const initialMapping: Record<string, string> = {};
        const initialNames: Record<string, string> = {};
        uniqueSpeakers.forEach(spk => {
          initialMapping[spk] = voices.length > 0 ? voices[0].id : '';
          initialNames[spk] = spk;
        });
        setSpeakerMapping(initialMapping);
        setSpeakerNames(initialNames);
        
        setProgress(100);
      } catch (err: any) {
        setError(err.message || 'Erro ao extrair vozes.');
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
    if (selectedSegments.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStatusText('A gerar vozes para os blocos selecionados...');

    try {
      const totalSegs = selectedSegments.length;
      let generatedCount = 0;

      for (const seg of selectedSegments) {
        const voiceId = seg.forcedVoiceId || speakerMapping[seg.speaker];
        if (!voiceId) throw new Error(`Nenhuma voz selecionada para o locutor ${seg.speaker}`);
        
        const voice = voices.find(v => v.id === voiceId);
        if (!voice) throw new Error(`Voz não encontrada para o locutor ${seg.speaker}`);

        const audioUris = await generateSpeechFromSegments(voice, [{
          id: seg.id,
          timestamp: seg.startTime.toString(),
          direction: seg.direction,
          text: seg.text
        }], voices);

        if (audioUris[0]) {
          setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, audioDataUri: audioUris[0] } : s));
        }
        
        generatedCount++;
        setProgress(Math.round((generatedCount / totalSegs) * 100));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar vozes.');
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const generateSingleSegment = async (segmentId: string) => {
    const segIndex = segments.findIndex(s => s.id === segmentId);
    if (segIndex === -1) return;
    const seg = segments[segIndex];

    setIsGenerating(true);
    setError(null);
    setStatusText(`A gerar bloco ${seg.startTime.toFixed(1)}s...`);

    try {
      const voiceId = seg.forcedVoiceId || speakerMapping[seg.speaker];
      if (!voiceId) throw new Error(`Nenhuma voz selecionada para o locutor ${seg.speaker}`);
      
      const voice = voices.find(v => v.id === voiceId);
      if (!voice) throw new Error(`Voz não encontrada para o locutor ${seg.speaker}`);

      const audioUris = await generateSpeechFromSegments(voice, [{
        id: seg.id,
        timestamp: seg.startTime.toString(),
        direction: seg.direction,
        text: seg.text
      }], voices);

      if (audioUris[0]) {
        setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, audioDataUri: audioUris[0] } : s));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar bloco.');
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
    setStatusText('A preparar áudio para cada bloco...');

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

          const audioUris = await generateSpeechFromSegments(voice, [{
            id: seg.id,
            timestamp: seg.startTime.toString(),
            direction: seg.direction,
            text: seg.text
          }], voices);

          if (audioUris[0]) {
            audioSegments.push({ audioDataUri: audioUris[0], startTime: seg.startTime });
            setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, audioDataUri: audioUris[0] } : s));
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
        text: `Áudio extraído e dobrado de: ${file?.name}`,
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

  const updateSegmentText = (id: string, text: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, text } : s));
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
    
    // Find next segment to know when to stop
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
    saveAs(segment.audioDataUri, `bloco_${segment.startTime.toFixed(1)}s.wav`);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    const selectedSegments = segments.filter(s => s.selected && s.audioDataUri);
    
    if (selectedSegments.length === 0) return;

    selectedSegments.forEach((seg, index) => {
      const base64Data = seg.audioDataUri!.split(',')[1];
      zip.file(`bloco_${index + 1}_${seg.startTime.toFixed(1)}s.wav`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'blocos_de_voz.zip');
  };

  const handleSaveNewVoice = async (speaker: string) => {
    const name = speakerNames[speaker] || speaker;
    const speakerProfile = extractedSpeakers[speaker] || {
      gender: 'Feminino',
      age: 'Adulto',
      style: 'Narrador',
      customPrompt: ''
    };
    
    const newVoice: VoiceProfile = {
      id: generateId(),
      name: name,
      ...speakerProfile
    };
    onSaveVoice(newVoice);
    setSpeakerMapping(prev => ({ ...prev, [speaker]: newVoice.id }));
    alert(`Voz "${name}" guardada com sucesso!`);
  };

  const uniqueSpeakers: string[] = Array.from(new Set(segments.map(s => s.speaker)));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl relative">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Mic className="text-emerald-500" />
          {activeProject ? 'Editar Extração' : 'Nova Extração'}
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
        <label className="block text-sm font-medium text-zinc-400 mb-2">Upload de Vídeo ou Áudio</label>
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

      {file && segments.length === 0 && (
        <button 
          onClick={handleExtract}
          disabled={isExtracting}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isExtracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
          {isExtracting ? 'A extrair vozes...' : 'Extrair Vozes'}
        </button>
      )}

      {(isExtracting || isGenerating) && (
        <div className="mt-4 mb-6">
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

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {segments.length > 0 && (
        <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Mapeamento de Locutores</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {uniqueSpeakers.map(speaker => (
                <div key={speaker} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-sm font-medium text-emerald-400 min-w-[60px]">{speaker}</span>
                    <input
                      type="text"
                      value={speakerNames[speaker] || ''}
                      onChange={(e) => setSpeakerNames(prev => ({ ...prev, [speaker]: e.target.value }))}
                      placeholder="Nome da voz"
                      className="w-32 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      onClick={() => handleSaveNewVoice(speaker)}
                      className="p-1.5 bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded-lg transition-colors"
                      title="Guardar como nova voz no Banco de Dados"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  </div>
                  <select
                    value={speakerMapping[speaker] || ''}
                    onChange={(e) => setSpeakerMapping(prev => ({ ...prev, [String(speaker)]: e.target.value }))}
                    className="flex-1 w-full sm:w-auto bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="" disabled>Selecionar Voz...</option>
                    {voices.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-3 bg-zinc-900 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wider items-center">
              <div className="col-span-1 flex justify-center">
                <input 
                  type="checkbox" 
                  checked={segments.length > 0 && segments.every(s => s.selected !== false)}
                  onChange={toggleAllSelection}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
                  title="Selecionar todos"
                />
              </div>
              <div className="col-span-1">Tempo</div>
              <div className="col-span-2">Locutor</div>
              <div className="col-span-2">Forçar Voz</div>
              <div className="col-span-4">Texto</div>
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
                  <div className="col-span-1 text-sm text-zinc-400 font-mono">
                    {seg.startTime.toFixed(1)}s
                  </div>
                  <div className="col-span-2 flex items-center gap-2 text-sm font-medium text-emerald-400">
                    <button
                      onClick={() => playOriginalSegment(seg)}
                      className="p-1 bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded transition-colors"
                      title="Ouvir original"
                    >
                      {playingOriginalId === seg.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                    {seg.speaker}
                  </div>
                  <div className="col-span-2">
                    <select
                      value={seg.forcedVoiceId || ''}
                      onChange={(e) => updateSegmentVoice(seg.id, e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500 transition-colors"
                    >
                      <option value="">Usar Mapeamento ({voices.find(v => v.id === speakerMapping[seg.speaker])?.name || 'Nenhuma'})</option>
                      {voices.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 text-sm text-zinc-300">
                    {seg.direction && <span className="text-zinc-500 italic mr-1 block mb-1">({seg.direction})</span>}
                    <textarea
                      value={seg.text}
                      onChange={(e) => updateSegmentText(seg.id, e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-emerald-500 resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    {seg.audioDataUri && (
                      <>
                        <button 
                          onClick={() => playSegment(seg)}
                          className="p-1.5 bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded-lg transition-colors"
                          title="Ouvir"
                        >
                          {playingSegmentId === seg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => downloadSegment(seg)}
                          className="p-1.5 bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => generateSingleSegment(seg.id)}
                          className="p-1.5 bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded-lg transition-colors"
                          title="Gerar Novamente"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button 
            onClick={handleGenerateSelected}
            disabled={isGenerating || segments.filter(s => s.selected).length === 0}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
            {isGenerating ? 'A gerar vozes...' : 'Gerar Vozes (Blocos Selecionados)'}
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={handleGenerateFullAudio}
              disabled={isGenerating || Object.values(speakerMapping).some(v => !v)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {isGenerating ? 'A gerar áudio total...' : 'Geração de Áudio Total'}
            </button>
            <button 
              onClick={downloadZip}
              disabled={isGenerating || segments.filter(s => s.selected && s.audioDataUri).length === 0}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              Download de Blocos (ZIP)
            </button>
          </div>

          {generatedAudio && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mt-4 text-center">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-medium text-emerald-400 mb-2">Áudio Sincronizado Gerado!</h3>
              <p className="text-sm text-zinc-400 mb-4">O áudio tem a mesma duração do ficheiro original para facilitar o sincronismo.</p>
              <audio src={generatedAudio} controls className="w-full h-10" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
