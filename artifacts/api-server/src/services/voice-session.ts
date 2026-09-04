import { randomUUID } from 'crypto';
import { ConversationMessage, VoiceSession } from './llm/types';

export class SessionManager {
  private sessions: Map<string, VoiceSession> = new Map();

  // নতুন সেশন তৈরি
  createSession(): VoiceSession {
    const id = randomUUID();
    const session: VoiceSession = {
      id,
      messages: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.sessions.set(id, session);
    return session;
  }

  // সেশন খুঁজে বের করা
  getSession(id: string): VoiceSession | undefined {
    return this.sessions.get(id);
  }

  // সেশনে নতুন মেসেজ অ্যাড করা
  addMessage(id: string, message: ConversationMessage) {
    const session = this.sessions.get(id);
    if (session) {
      session.messages.push(message);
      session.lastActivityAt = Date.now();
    }
  }

  // ইউজার কথা বলে উঠলে AI-কে থামিয়ে দেওয়া (Barge-in/Interruption)
  interruptSession(id: string) {
    const session = this.sessions.get(id);
    if (session && session.activeAbortController) {
      session.activeAbortController.abort();
      session.activeAbortController = undefined; // Abort করার পর রিসেট
    }
  }

  // মেমোরি লিক ঠেকাতে পুরনো সেশন মুছে ফেলা
  cleanupOldSessions(maxIdleMs: number) {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt > maxIdleMs) {
        this.interruptSession(id);
        this.sessions.delete(id);
      }
    }
  }
}

export const sessionManager = new SessionManager();