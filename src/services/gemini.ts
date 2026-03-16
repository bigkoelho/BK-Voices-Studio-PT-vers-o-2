import { GoogleGenAI, Type } from "@google/genai";
import { VoiceProfile, ExtractionSegment } from "../types";
import { getApiKey } from "./config";

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function createWavDataUri(base64PcmList: string | string[], sampleRate: number = 24000): string {
  const pcmList = Array.isArray(base64PcmList) ? base64PcmList : [base64PcmList];
  
  const pcmBuffers = pcmList.map(base64Pcm => {
    try {
      const binaryString = atob(base64Pcm);
      const pcmData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        pcmData[i] = binaryString.charCodeAt(i);
      }
      return pcmData;
    } catch (e) {
      console.error("Error decoding base64 audio data", e);
      return new Uint8Array(0);
    }
  });

  const totalLength = pcmBuffers.reduce((acc, buf) => acc + buf.length, 0);
  const combinedPcm = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of pcmBuffers) {
    combinedPcm.set(buf, offset);
    offset += buf.length;
  }

  const wavBuffer = new ArrayBuffer(44 + combinedPcm.length);
  const view = new DataView(wavBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + combinedPcm.length, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, 'data');
  view.setUint32(40, combinedPcm.length, true);

  const wavData = new Uint8Array(wavBuffer);
  wavData.set(combinedPcm, 44);

  return `data:audio/wav;base64,${encodeBase64(wavData)}`;
}

export async function parseFreeformPrompt(prompt: string): Promise<{ voiceProfile: Omit<VoiceProfile, 'id' | 'name'>, text: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analisa o seguinte pedido de geração de voz.
O utilizador forneceu um texto que pode conter instruções de direção (ex: "lê com voz grossa", "estilo épico"), timestamps (ex: [0:00]), e o próprio guião/texto a ser lido.
1. Extrai as características da voz (género, idade, estilo).
2. Coloca TODAS as dicas de locução, emoções e notas de direção no campo 'customPrompt'.
3. Extrai APENAS as palavras que devem ser efetivamente faladas/lidas para o campo 'text'. Remove timestamps (ex: [0:00 - 0:15]), nomes de personagens antes das falas (ex: "Narração:"), e notas de direção (ex: "(Tom grave)"). O 'text' deve ser um texto limpo, pronto a ser lido por um locutor.

Pedido: "${prompt}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gender: { type: Type.STRING, description: "O género da voz. Deve ser 'Masculino' ou 'Feminino'. Se não for especificado, assume 'Feminino'." },
            age: { type: Type.STRING, description: "A idade da voz. Deve ser 'Criança', 'Jovem', 'Adulto' ou 'Idoso'. Se não for especificado, assume 'Adulto'." },
            style: { type: Type.STRING, description: "O estilo da voz. Deve ser 'Narrador', 'Cartoon', 'Conversacional', 'Notícias', 'Áudio-livro' ou 'Publicidade'. Se não for especificado, assume 'Narrador'." },
            customPrompt: { type: Type.STRING, description: "Qualquer instrução adicional sobre a voz (emoção, sotaque, tom). Pode ser vazio." },
            text: { type: Type.STRING, description: "O texto exato que deve ser lido/falado pela voz." }
          },
          required: ["gender", "age", "style", "customPrompt", "text"]
        }
      }
    });

    let result = JSON.parse(response.text || "{}");
    if (!result || typeof result !== 'object') result = {};
    return {
      voiceProfile: {
        gender: result.gender || 'Feminino',
        age: result.age || 'Adulto',
        style: result.style || 'Narrador',
        customPrompt: result.customPrompt || ''
      },
      text: result.text || ''
    };
  } catch (error: any) {
    const errorMessage = error.message || "";
    if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Limite de utilização atingido (Quota Excedida). A API da Google limitou os pedidos temporariamente. Por favor, aguarda um minuto antes de tentar novamente.");
    }
    throw new Error("Erro ao interpretar o pedido mágico. Tenta ser mais claro nas instruções.");
  }
}

export interface ScriptSegment {
  id: string;
  timestamp: string;
  direction: string;
  text: string;
  selected?: boolean;
  voiceId?: string;
  audioDataUri?: string;
}

export async function parseScriptIntoSegments(prompt: string): Promise<{
  voiceProfile: Omit<VoiceProfile, 'id' | 'name'>,
  segments: Omit<ScriptSegment, 'id'>[]
}> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview", // Use a more capable model for complex parsing
      contents: `Analisa o seguinte guião/pedido de geração de voz.
O utilizador forneceu um texto que contém instruções de direção (ex: "lê com voz grossa", "estilo épico"), timestamps (ex: [0:00]), e o texto a ser lido.
1. Extrai as características GERAIS da voz principal (género, idade, estilo).
2. Divide o guião em segmentos lógicos (por exemplo, baseados nos timestamps ou mudanças de tom).
3. Para cada segmento, extrai o timestamp (se existir), as notas de direção/emoção/ação para esse momento específico, e o texto exato a ser lido.

Pedido: "${prompt}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            voiceProfile: {
              type: Type.OBJECT,
              properties: {
                gender: { type: Type.STRING, description: "Masculino ou Feminino" },
                age: { type: Type.STRING, description: "Criança, Jovem, Adulto ou Idoso" },
                style: { type: Type.STRING, description: "Narrador, Cartoon, Conversacional, Notícias, Áudio-livro ou Publicidade" },
                customPrompt: { type: Type.STRING, description: "Instrução geral" }
              },
              required: ["gender", "age", "style", "customPrompt"]
            },
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING, description: "Ex: 0:00 - 0:15. Vazio se não houver." },
                  direction: { type: Type.STRING, description: "Instruções de voz, emoção ou ação para este trecho." },
                  text: { type: Type.STRING, description: "O texto exato a ser falado." }
                },
                required: ["timestamp", "direction", "text"]
              }
            }
          },
          required: ["voiceProfile", "segments"]
        }
      }
    });

    let result = JSON.parse(response.text || "{}");
    if (!result || typeof result !== 'object') result = {};
    if (!result.segments) result.segments = [];
    if (!result.voiceProfile) {
      result.voiceProfile = {
        gender: "Feminino",
        age: "Adulto",
        style: "Narrador",
        customPrompt: ""
      };
    }
    return result;
  } catch (error: any) {
    const errorMessage = error.message || "";
    if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Limite de utilização atingido (Quota Excedida). A API da Google limitou os pedidos temporariamente. Por favor, aguarda um minuto antes de tentar novamente.");
    }
    throw new Error("Erro ao analisar o guião. Tenta simplificar o texto.");
  }
}

import { Modality } from "@google/genai";

function getGeminiVoiceName(profile: VoiceProfile): string {
  if (profile.gender === 'Masculino') {
    if (profile.age === 'Idoso') return 'Charon';
    if (profile.age === 'Jovem' || profile.age === 'Criança') return 'Puck';
    return 'Fenrir';
  } else {
    if (profile.age === 'Criança' || profile.age === 'Jovem') return 'Zephyr';
    return 'Kore';
  }
}

export async function generateSpeechFromSegments(voiceProfile: VoiceProfile, segments: ScriptSegment[], allVoices: VoiceProfile[] = []): Promise<string[]> {
  const audioChunks: string[] = [];
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!(seg.text || '').trim()) {
      audioChunks.push("");
      continue;
    }

    const currentVoiceProfile = seg.voiceId ? (allVoices.find(v => v.id === seg.voiceId) || voiceProfile) : voiceProfile;
    const voiceName = getGeminiVoiceName(currentVoiceProfile);

    try {
      let prompt = seg.direction ? `Lê estritamente em Português de Portugal (PT-PT, sotaque europeu) com a seguinte direção (${seg.direction}): ${seg.text}` : `Lê estritamente em Português de Portugal (PT-PT, sotaque europeu): ${seg.text}`;
      
      const parts: any[] = [];
      
      if (currentVoiceProfile.previewAudio) {
        const [meta, base64Data] = currentVoiceProfile.previewAudio.split(',');
        const mimeType = meta.split(':')[1].split(';')[0];
        
        prompt = `Ouve o áudio fornecido. Lê estritamente em Português de Portugal (PT-PT, sotaque europeu). O teu objetivo é replicar a mesma entoação, emoção, ritmo, pausas e estilo do áudio original, mas usando a tua própria voz. O texto a ler é: "${seg.text}"`;
        if (seg.direction) {
          prompt += ` Considera também esta direção: ${seg.direction}.`;
        }
        
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType || 'audio/wav'
          }
        });
      }
      
      parts.push({ text: prompt });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        audioChunks.push(createWavDataUri(base64Audio));
      } else {
        throw new Error("Nenhum áudio retornado pela API.");
      }
    } catch (error: any) {
      throw new Error(`Falha no segmento ${i + 1}: ${error.message}`);
    }
  }

  if (audioChunks.filter(c => c !== "").length === 0) {
    throw new Error("Nenhum áudio foi gerado. Verifica se os segmentos têm texto.");
  }

  return audioChunks;
}

export async function generateSpeech(voiceProfile: VoiceProfile, text: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });
  const voiceName = getGeminiVoiceName(voiceProfile);

  try {
    let prompt = voiceProfile.customPrompt ? `Lê estritamente em Português de Portugal (PT-PT, sotaque europeu) com a seguinte direção (${voiceProfile.customPrompt}): ${text}` : `Lê estritamente em Português de Portugal (PT-PT, sotaque europeu): ${text}`;
    
    const parts: any[] = [];
    
    if (voiceProfile.previewAudio) {
      const [meta, base64Data] = voiceProfile.previewAudio.split(',');
      const mimeType = meta.split(':')[1].split(';')[0];
      
      prompt = `Ouve o áudio fornecido. Lê estritamente em Português de Portugal (PT-PT, sotaque europeu). O teu objetivo é replicar a mesma entoação, emoção, ritmo, pausas e estilo do áudio original, mas usando a tua própria voz. O texto a ler é: "${text}"`;
      if (voiceProfile.customPrompt) {
        prompt += ` Considera também esta direção: ${voiceProfile.customPrompt}.`;
      }
      
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType || 'audio/wav'
        }
      });
    }
    
    parts.push({ text: prompt });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return createWavDataUri(base64Audio);
    } else {
      throw new Error("Nenhum áudio retornado pela API.");
    }
  } catch (error: any) {
    throw new Error(`Erro ao gerar áudio: ${error.message}`);
  }
}

export async function cloneVoiceFromAudio(
  voiceProfile: VoiceProfile,
  segment: ExtractionSegment,
  audioBlob: Blob
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });
  const voiceName = getGeminiVoiceName(voiceProfile);

  try {
    const base64Audio = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    let prompt = `Ouve o áudio fornecido. Lê estritamente em Português de Portugal (PT-PT, sotaque europeu). O teu objetivo é replicar EXATAMENTE a mesma entoação, emoção, ritmo, pausas e estilo do áudio original, mas usando a tua própria voz. Não cries uma nova entoação, mantém o estilo original da voz importada.`;
    
    if (voiceProfile.customPrompt) {
      prompt += ` Considera também esta direção de voz: ${voiceProfile.customPrompt}.`;
    }
    
    prompt += ` O texto a ler é: "${segment.text}"`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{
        parts: [
          {
            inlineData: {
              data: base64Audio,
              mimeType: audioBlob.type || 'audio/wav'
            }
          },
          { text: prompt }
        ]
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const generatedBase64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (generatedBase64Audio) {
      return createWavDataUri(generatedBase64Audio);
    } else {
      throw new Error("Nenhum áudio retornado pela API.");
    }
  } catch (error: any) {
    console.error("Erro ao clonar voz com áudio de referência, a usar fallback:", error);
    // Fallback to simple generateSpeech if multimodal fails or is not supported
    return generateSpeech(voiceProfile, segment.text);
  }
}
