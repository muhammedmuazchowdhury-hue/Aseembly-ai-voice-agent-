import { randomUUID } from 'crypto';
import { ConversationMessage, VoiceSession } from './llm/types';

export class SessionManager {
  private sessions: Map<string, VoiceSession> = new Map();

  // Create a new session
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

  // Retrieve an existing session
  getSession(id: string): VoiceSession | undefined {
    return this.sessions.get(id);
  }

  // Add a new message to a session's history
  addMessage(id: string, message: ConversationMessage) {
    const session = this.sessions.get(id);
    if (session) {
      session.messages.push(message);
      session.lastActivityAt = Date.now();
    }
  }

  // Handle barge-in: Abort current AI response if user interrupts
  interruptSession(id: string) {
    const session = this.sessions.get(id);
    if (session && session.activeAbortController) {
      session.activeAbortController.abort();
      session.activeAbortController = undefined; // Reset after aborting
    }
  }

  // Prevent memory leaks by removing inactive sessions
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