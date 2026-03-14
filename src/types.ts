import { ScriptSegment } from './services/gemini';

export interface VoiceProfile {
  id: string;
  name: string;
  gender: string;
  age: string;
  style: string;
  customPrompt: string;
  previewAudio?: string;
}

export interface AudioGeneration {
  id: string;
  name?: string;
  voiceId: string;
  text: string;
  audioData: string; // base64
  timestamp: number;
  projectId?: string;
  source?: 'script' | 'direct' | 'extraction' | 'test';
  voiceProfile?: VoiceProfile;
}

export interface ScriptProject {
  id: string;
  name: string;
  voiceProfile: VoiceProfile;
  segments: ScriptSegment[];
  updatedAt: number;
}

export interface ScriptBlock {
  id: string;
  speaker: string;
  text: string;
  audioDataUri?: string;
  selected?: boolean;
}

export interface ExtractionSegment {
  id: string;
  startTime: number;
  speaker: string;
  direction: string;
  text: string;
  forcedVoiceId?: string;
  audioDataUri?: string;
  selected?: boolean;
}

export interface ExtractionProject {
  id: string;
  name: string;
  segments: ExtractionSegment[];
  speakers: Record<string, Omit<VoiceProfile, 'id' | 'name'>>;
  speakerMapping: Record<string, string>;
  updatedAt: number;
}

export interface CloningProject {
  id: string;
  name: string;
  segments: ExtractionSegment[];
  speakerMapping: Record<string, string>;
  updatedAt: number;
}

export interface ProjectData {
  voices: VoiceProfile[];
  generations: AudioGeneration[];
  projects?: ScriptProject[];
  extractions?: ExtractionProject[];
  clonings?: CloningProject[];
}
