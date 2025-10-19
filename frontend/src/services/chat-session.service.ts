import { Message } from '../types/chat';

interface ChatSession {
  sessionId: string;
  messages: Message[];
  lastActivity: Date;
  messageCache: Map<string, Message[]>; // question -> [user_message, agent_response]
}

class ChatSessionService {
  private sessions = new Map<string, ChatSession>();
  private currentSessionId: string | null = null;
  private readonly STORAGE_KEY = 'ml-e-chat-sessions';
  private readonly MAX_SESSIONS = 10;
  private readonly SESSION_EXPIRY_HOURS = 24;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Get or create a chat session
   */
  getSession(sessionId?: string): ChatSession {
    // If no sessionId provided, use current session or create a new one
    let id = sessionId;
    
    if (!id) {
      // Check if we have a current session
      if (this.currentSessionId && this.sessions.has(this.currentSessionId)) {
        id = this.currentSessionId;
      } else {
        // Create a new session only if we don't have any existing sessions
        const existingSessions = this.getAllSessions();
        if (existingSessions.length > 0) {
          // Use the most recent session
          id = existingSessions[0].sessionId;
        } else {
          // Create a brand new session
          id = this.generateSessionId();
        }
      }
    }
    
    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        sessionId: id,
        messages: [],
        lastActivity: new Date(),
        messageCache: new Map()
      });
    }

    const session = this.sessions.get(id)!;
    session.lastActivity = new Date();
    this.currentSessionId = id;
    this.saveToStorage();
    
    return session;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Add message to current session
   */
  addMessage(message: Message): void {
    if (!this.currentSessionId) {
      this.getSession(); // Create new session if none exists
    }

    const session = this.sessions.get(this.currentSessionId!)!;
    session.messages.push(message);
    session.lastActivity = new Date();
    
    this.saveToStorage();
  }

  /**
   * Get messages for current session
   */
  getMessages(): Message[] {
    if (!this.currentSessionId) {
      return [];
    }

    const session = this.sessions.get(this.currentSessionId);
    return session ? session.messages : [];
  }

  /**
   * Check if a question has been asked before and return cached response
   */
  getCachedResponse(question: string): Message[] | null {
    if (!this.currentSessionId) {
      return null;
    }

    const session = this.sessions.get(this.currentSessionId);
    if (!session) {
      return null;
    }

    // Normalize question for comparison
    const normalizedQuestion = this.normalizeQuestion(question);
    
    // Check cache for similar questions
    for (const [cachedQuestion, messages] of session.messageCache) {
      if (this.isSimilarQuestion(normalizedQuestion, cachedQuestion)) {
        console.log('Found cached response for similar question:', question);
        return messages;
      }
    }

    return null;
  }

  /**
   * Cache a question-response pair
   */
  cacheResponse(question: string, userMessage: Message, agentResponse: Message): void {
    if (!this.currentSessionId) {
      return;
    }

    const session = this.sessions.get(this.currentSessionId);
    if (!session) {
      return;
    }

    const normalizedQuestion = this.normalizeQuestion(question);
    session.messageCache.set(normalizedQuestion, [userMessage, agentResponse]);
    
    this.saveToStorage();
  }

  /**
   * Clear current session messages
   */
  clearCurrentSession(): void {
    if (!this.currentSessionId) {
      return;
    }

    const session = this.sessions.get(this.currentSessionId);
    if (session) {
      session.messages = [];
      session.messageCache.clear();
      session.lastActivity = new Date();
    }

    this.saveToStorage();
  }

  /**
   * Get all sessions for user
   */
  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  /**
   * Delete old sessions to maintain storage limits
   */
  private cleanupOldSessions(): void {
    const sessions = this.getAllSessions();
    const now = new Date();
    
    // Remove expired sessions
    sessions.forEach(session => {
      const hoursSinceActivity = (now.getTime() - session.lastActivity.getTime()) / (1000 * 60 * 60);
      if (hoursSinceActivity > this.SESSION_EXPIRY_HOURS) {
        this.sessions.delete(session.sessionId);
      }
    });

    // Keep only the most recent sessions
    const activeSessions = this.getAllSessions();
    if (activeSessions.length > this.MAX_SESSIONS) {
      const sessionsToDelete = activeSessions.slice(this.MAX_SESSIONS);
      sessionsToDelete.forEach(session => {
        this.sessions.delete(session.sessionId);
      });
    }
  }

  /**
   * Save sessions to localStorage
   */
  private saveToStorage(): void {
    try {
      this.cleanupOldSessions();
      
      const sessionsData = Array.from(this.sessions.entries()).map(([id, session]) => ({
        sessionId: id,
        messages: session.messages,
        lastActivity: session.lastActivity.toISOString(),
        messageCache: Array.from(session.messageCache.entries())
      }));

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        sessions: sessionsData,
        currentSessionId: this.currentSessionId
      }));
    } catch (error) {
      console.warn('Failed to save chat sessions to storage:', error);
    }
  }

  /**
   * Load sessions from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return;
      }

      const data = JSON.parse(stored);
      this.currentSessionId = data.currentSessionId;

      data.sessions.forEach((sessionData: any) => {
        const session: ChatSession = {
          sessionId: sessionData.sessionId,
          messages: sessionData.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })),
          lastActivity: new Date(sessionData.lastActivity),
          messageCache: new Map(sessionData.messageCache || [])
        };

        this.sessions.set(sessionData.sessionId, session);
      });

      this.cleanupOldSessions();
    } catch (error) {
      console.warn('Failed to load chat sessions from storage:', error);
      // Reset storage if corrupted
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Normalize question for comparison
   */
  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Check if two questions are similar enough to use cached response
   */
  private isSimilarQuestion(question1: string, question2: string): boolean {
    // Exact match
    if (question1 === question2) {
      return true;
    }

    // Check if one question contains the other (for variations)
    if (question1.includes(question2) || question2.includes(question1)) {
      return true;
    }

    // Check for similar key terms (simple approach)
    const words1 = question1.split(' ').filter(word => word.length > 3);
    const words2 = question2.split(' ').filter(word => word.length > 3);
    
    if (words1.length === 0 || words2.length === 0) {
      return false;
    }

    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    // Consider similar if 70% of words match
    return similarity >= 0.7;
  }

  /**
   * Start a new session
   */
  startNewSession(): string {
    const sessionId = this.generateSessionId();
    this.getSession(sessionId);
    return sessionId;
  }

  /**
   * Switch to an existing session
   */
  switchToSession(sessionId: string): ChatSession | null {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      const session = this.sessions.get(sessionId)!;
      session.lastActivity = new Date();
      this.saveToStorage();
      return session;
    }
    return null;
  }

  /**
   * Get the current active session or create one if none exists
   */
  getCurrentSession(): ChatSession {
    if (this.currentSessionId && this.sessions.has(this.currentSessionId)) {
      return this.sessions.get(this.currentSessionId)!;
    }
    
    // No current session, get or create one
    return this.getSession();
  }

  /**
   * Ensure session continuity - maintains the same session across navigation
   */
  ensureSessionContinuity(): ChatSession {
    // Always return the current session or the most recent one
    const existingSessions = this.getAllSessions();
    
    if (existingSessions.length > 0) {
      const mostRecentSession = existingSessions[0];
      this.currentSessionId = mostRecentSession.sessionId;
      mostRecentSession.lastActivity = new Date();
      this.saveToStorage();
      return mostRecentSession;
    }
    
    // No existing sessions, create a new one
    return this.getSession();
  }
}

export const chatSessionService = new ChatSessionService();