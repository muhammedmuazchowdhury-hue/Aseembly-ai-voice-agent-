export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface LlmProvider {
  name: string;
  streamResponse(
    messages: ConversationMessage[],
    systemPrompt: string,
    signal: AbortSignal
  ): AsyncIterable<string>;
}

export interface TurnMetrics {
  transcriptionMs: number;
  llmFirstTokenMs: number;
  ttsFirstAudioMs: number;
  totalMs: number;
}

export type ServerToClientEvent =
  | { type: 'session.started'; sessionId: string }
  | { type: 'transcript.partial'; text: string }
  | { type: 'transcript.final'; text: string }
  | { type: 'assistant.text.delta'; text: string }
  | { type: 'assistant.audio.chunk'; audio: string; mimeType: string }
  | { type: 'turn.interrupted'; sessionId: string }
  | { type: 'turn.completed'; metrics: TurnMetrics }
  | { type: 'turn.failed'; stage: string; code: string; message: string };

export type ClientToServerEvent =
  | { type: 'audio.chunk'; payload: string }
  | { type: 'action.interrupt' }
  | { type: 'session.end' };

export interface VoiceSession {
  id: string;
  messages: ConversationMessage[];
  createdAt: number;
  lastActivityAt: number;
  activeAbortController?: AbortController;
}