import React, { useState, useEffect, useRef } from 'react';
import { Save, Play, Square, Loader2, Volume2, Settings2, History, Trash2, Download, Upload, Mic } from 'lucide-react';
import { VoiceProfile, AudioGeneration } from '../types';
import { generateSpeech } from '../services/gemini';
import { generateId } from '../utils';

interface Props {
  onSave: (voice: VoiceProfile) => void;
  initialVoice?: VoiceProfile | null;
  generations?: AudioGeneration[];
  onSaveGeneration?: (gen: AudioGeneration) => void;
  onDeleteGeneration?: (id: string) => void;
}

const DEFAULT_TEST_TEXT = "Olá! Esta é uma voz de teste em Português de Portugal. Espero que gostes do resultado.";

export default function VoiceDesigner({ onSave, initialVoice, generations = [], onSaveGeneration, onDeleteGeneration }: Props) {
  const [profile, setProfile] = useState<Omit<VoiceProfile, 'id'>>({
    name: '',
    gender: 'Feminino',
    age: 'Adulto',
    style: 'Narrador',
    customPrompt: '',
    previewAudio: undefined
  });

  useEffect(() => {
    if (initialVoice) {
      setProfile({
        name: initialVoice.name,
        gender: initialVoice.gender,
        age: initialVoice.age,
        style: initialVoice.style,
        customPrompt: initialVoice.customPrompt || '',
        previewAudio: initialVoice.previewAudio
      });
    } else {
      setProfile({
        name: '',
        gender: 'Feminino',
        age: 'Adulto',
        style: 'Narrador',
        customPrompt: '',
        previewAudio: undefined
      });
    }
    setGeneratedAudio(null);
  }, [initialVoice]);

  const [testText, setTestText] = useState(DEFAULT_TEST_TEXT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Simulate progress bar while generating
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

  const handleGenerateVoice = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedAudio(null);
    setProgress(0);
    try {
      let currentProfile = { ...profile } as VoiceProfile;

      const audioDataUri = await generateSpeech(currentProfile, testText);
      setProgress(100);
      setGeneratedAudio(audioDataUri);
      
      if (onSaveGeneration) {
        onSaveGeneration({
          id: generateId(),
          voiceId: initialVoice ? initialVoice.id : 'temp-voice',
          text: testText,
          audioData: audioDataUri,
          timestamp: Date.now(),
          source: 'test',
          voiceProfile: {
            ...currentProfile,
            id: initialVoice ? initialVoice.id : generateId()
          }
        });
      }
    } catch (err: any) {
      setError(err.message || "Erro ao gerar voz de teste.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!profile.name.trim()) {
      setError("Por favor, dá um nome à voz antes de guardar.");
      return;
    }
    
    onSave({
      ...profile,
      id: initialVoice ? initialVoice.id : generateId(),
      previewAudio: generatedAudio || initialVoice?.previewAudio
    });
    setGeneratedAudio(null);
  };

  const handleSaveFromHistory = (gen: AudioGeneration) => {
    if (!gen.voiceProfile) return;
    
    setProfile({
      name: gen.voiceProfile.name || 'Nova Voz do Histórico',
      gender: gen.voiceProfile.gender,
      age: gen.voiceProfile.age,
      style: gen.voiceProfile.style,
      customPrompt: gen.voiceProfile.customPrompt,
      previewAudio: gen.audioData
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const testGenerations = generations.filter(g => g.source === 'test');

  const togglePreview = () => {
    if (!profile.previewAudio) return;

    if (isPlayingPreview && audioRef.current) {
      audioRef.current.pause();
      setIsPlayingPreview(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(profile.previewAudio.startsWith('data:') ? profile.previewAudio : `data:audio/wav;base64,${profile.previewAudio}`);
    audioRef.current = audio;
    
    audio.onended = () => setIsPlayingPreview(false);
    audio.play();
    setIsPlayingPreview(true);
  };

  return (
    <div className="space-y-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          <Settings2 className="text-emerald-500" />
          {initialVoice ? 'Editar Voz Profissional' : 'Criar Voz Profissional'}
        </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-zinc-400">Nome da Voz</label>
              {profile.previewAudio && (
                <button 
                  onClick={togglePreview}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  title={isPlayingPreview ? "Parar Preview" : "Ouvir Preview"}
                >
                  {isPlayingPreview ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                  {isPlayingPreview ? "Parar Preview" : "Ouvir Preview"}
                </button>
              )}
            </div>
            <input 
              type="text" 
              value={profile.name}
              onChange={e => setProfile({...profile, name: e.target.value})}
              placeholder="Ex: Narrador Épico"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Género</label>
              <select 
                value={profile.gender}
                onChange={e => setProfile({...profile, gender: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Idade</label>
              <select 
                value={profile.age}
                onChange={e => setProfile({...profile, age: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                <option value="Criança">Criança</option>
                <option value="Jovem">Jovem</option>
                <option value="Adulto">Adulto</option>
                <option value="Idoso">Idoso</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Estilo</label>
            <select 
              value={profile.style}
              onChange={e => setProfile({...profile, style: e.target.value})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="Narrador">Narrador</option>
              <option value="Cartoon">Cartoon</option>
              <option value="Conversacional">Conversacional</option>
              <option value="Notícias">Notícias</option>
              <option value="Áudio-livro">Áudio-livro</option>
              <option value="Publicidade">Publicidade</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Descrição / Notas (Opcional)</label>
            <textarea 
              value={profile.customPrompt}
              onChange={e => setProfile({...profile, customPrompt: e.target.value})}
              placeholder="Ex: Voz calma e profissional para vídeos corporativos."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none min-h-[100px]"
            />
          </div>
        </div>

        <div className="space-y-6 flex flex-col bg-zinc-950/50 p-6 rounded-xl border border-zinc-800/50">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Texto de Teste</label>
            <textarea 
              value={testText}
              onChange={e => setTestText(e.target.value)}
              placeholder="Escreve um texto para testar a voz..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors resize-none min-h-[100px]"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {isGenerating && (
            <div className="mb-2">
              <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                <span className="font-medium text-emerald-400">A gerar voz de teste...</span>
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
            onClick={handleGenerateVoice}
            disabled={isGenerating || !testText.trim()}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isGenerating ? 'A processar...' : 'Gerar Voz de Teste'}
          </button>

          {generatedAudio && (
            <div className="pt-6 border-t border-zinc-800 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <p className="text-sm font-medium text-emerald-400 mb-3 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Voz gerada com sucesso! Ouve o resultado:
                </p>
                <audio src={generatedAudio} controls className="w-full h-10" autoPlay />
              </div>
              
              <div className="pt-2">
                <button 
                  onClick={handleSave}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  <Save className="w-5 h-5" />
                  Guardar Voz e Ir para o Estúdio
                </button>
                <p className="text-xs text-zinc-500 text-center mt-3">
                  Se não gostaste do resultado, altera os parâmetros acima e clica em "Gerar Voz de Teste" novamente.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {testGenerations.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <History className="text-emerald-500" />
            Histórico de Testes
          </h2>
          <div className="space-y-4">
            {testGenerations.map(gen => (
              <div key={gen.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row justify-between gap-4 mb-3">
                  <div>
                    <p className="text-sm text-zinc-300 font-medium mb-1">
                      {gen.voiceProfile?.name || 'Voz de Teste'} 
                      <span className="text-xs text-zinc-500 font-normal ml-2">
                        {new Date(gen.timestamp).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-sm text-zinc-400 mt-2 italic">"{gen.text}"</p>
                  </div>
                  <div className="flex items-start gap-2 shrink-0">
                    {gen.voiceProfile && (
                      <button 
                        onClick={() => handleSaveFromHistory(gen)}
                        className="p-2 bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded-lg transition-colors"
                        title="Carregar esta voz para guardar"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    )}
                    <a 
                      href={gen.audioData} 
                      download={`teste_${gen.id}.wav`}
                      className="p-2 bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {onDeleteGeneration && (
                      <button 
                        onClick={() => onDeleteGeneration(gen.id)}
                        className="p-2 bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white rounded-lg transition-colors"
                        title="Apagar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <audio src={gen.audioData} controls className="w-full h-10" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
