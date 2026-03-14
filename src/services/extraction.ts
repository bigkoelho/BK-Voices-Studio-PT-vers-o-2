import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionSegment, VoiceProfile } from "../types";
import { getApiKey } from "./config";

export async function extractVoicesFromMedia(base64Data: string, mimeType: string): Promise<{
  segments: ExtractionSegment[],
  speakers: Record<string, Omit<VoiceProfile, 'id' | 'name'>>
}> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        {
          text: `Analisa este ficheiro multimédia.
Transcreve o que é dito, identificando os diferentes locutores como "VOZ 1", "VOZ 2", etc.
Para cada fala, fornece o timestamp exato de início em segundos (ex: 12.5), a direção/emoção (ex: "calmo", "irritado"), e o texto.
Além disso, para cada locutor identificado, extrai o "ADN da voz" (género, idade, estilo e características únicas).
Responde ESTRITAMENTE em JSON com o formato:
{
  "segments": [
    { "startTime": 12.5, "speaker": "VOZ 1", "direction": "calmo", "text": "Olá, tudo bem?" }
  ],
  "speakers": [
    { "id": "VOZ 1", "gender": "Masculino", "age": "Adulto", "style": "Conversacional", "customPrompt": "Voz rouca e profunda" }
  ]
}`
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  startTime: { type: Type.NUMBER, description: "Tempo de início em segundos" },
                  speaker: { type: Type.STRING, description: "Identificador do locutor, ex: VOZ 1" },
                  direction: { type: Type.STRING, description: "Emoção ou direção" },
                  text: { type: Type.STRING, description: "Texto falado" }
                },
                required: ["startTime", "speaker", "direction", "text"]
              }
            },
            speakers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Identificador do locutor, ex: VOZ 1" },
                  gender: { type: Type.STRING, description: "Masculino ou Feminino" },
                  age: { type: Type.STRING, description: "Criança, Jovem, Adulto ou Idoso" },
                  style: { type: Type.STRING, description: "Narrador, Cartoon, Conversacional, Notícias, Áudio-livro ou Publicidade" },
                  customPrompt: { type: Type.STRING, description: "Características únicas da voz (sotaque, tom, textura)" }
                },
                required: ["id", "gender", "age", "style", "customPrompt"]
              }
            }
          },
          required: ["segments", "speakers"]
        }
      }
    });

    let result = JSON.parse(response.text || "{}");
    if (!result || typeof result !== 'object') result = {};
    if (!result.segments) result.segments = [];
    if (!result.speakers) result.speakers = [];
    
    const speakersRecord: Record<string, Omit<VoiceProfile, 'id' | 'name'>> = {};
    result.speakers.forEach((spk: any) => {
      if (spk.id) {
        speakersRecord[spk.id] = {
          gender: spk.gender || 'Feminino',
          age: spk.age || 'Adulto',
          style: spk.style || 'Conversacional',
          customPrompt: spk.customPrompt || ''
        };
      }
    });
    
    return {
      segments: result.segments,
      speakers: speakersRecord
    };
  } catch (error: any) {
    const errorMessage = error.message || "";
    if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Limite de utilização atingido (Quota Excedida). A API da Google limitou os pedidos temporariamente. Por favor, aguarda um minuto antes de tentar novamente.");
    }
    throw new Error("Erro ao analisar o ficheiro multimédia. Verifica se o ficheiro é válido e tenta novamente.");
  }
}

export async function mergeAudioBuffers(segments: { audioDataUri: string, startTime: number }[], totalDuration: number): Promise<string> {
  const sampleRate = 24000;
  
  // Ensure duration is at least 1 second and covers the last segment
  let maxTime = totalDuration;
  for (const seg of segments) {
    if (seg.startTime + 5 > maxTime) { // assume 5s max per segment if we don't know duration
      maxTime = seg.startTime + 5;
    }
  }
  
  const ctx = new OfflineAudioContext(1, Math.ceil(maxTime * sampleRate), sampleRate);

  for (const seg of segments) {
    try {
      if (!seg.audioDataUri) continue;
      
      const base64 = seg.audioDataUri.split(',')[1];
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(seg.startTime);
    } catch (e) {
      console.error("Failed to decode/place audio segment", e);
    }
  }

  const renderedBuffer = await ctx.startRendering();
  return audioBufferToWavDataUri(renderedBuffer);
}

function audioBufferToWavDataUri(buffer: AudioBuffer): string {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true); // write 16-bit sample
      pos += 2;
    }
    offset++; // next source sample
  }

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // Convert to base64
  let binary = '';
  const bytes = new Uint8Array(out);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
