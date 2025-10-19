import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { Message, ChatAgent, TypingStatus } from '../types/chat';
import { chatSessionService } from '../services/chat-session.service';

interface UseChatReturn {
  messages: Message[];
  isTyping: boolean;
  typingAgent?: ChatAgent;
  isConnected: boolean;
  isLoading: boolean;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
  refreshMessages: () => void;
  sessionId: string | null;
}

export const useChat = (providedSessionId?: string): UseChatReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingStatus, setTypingStatus] = useState<TypingStatus>({
    isTyping: false,
    timestamp: new Date(),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const { isConnected, connect, emit, on, off } = useWebSocket();

  // Initialize session and load messages
  useEffect(() => {
    // Use session continuity to maintain the same session across navigation
    const session = providedSessionId 
      ? chatSessionService.getSession(providedSessionId)
      : chatSessionService.ensureSessionContinuity();
      
    setCurrentSessionId(session.sessionId);
    
    // Load existing messages from the session
    const existingMessages = session.messages || [];
    setMessages(existingMessages);
    
    console.log(`Loaded ${existingMessages.length} messages from session ${session.sessionId}`);
  }, [providedSessionId]);

  // Connect to WebSocket when component mounts
  useEffect(() => {
    if (!isConnected) {
      connect().catch(console.error);
    }
  }, [isConnected, connect]);

  // Join chat session when connected
  useEffect(() => {
    if (isConnected && currentSessionId) {
      emit('session:join', currentSessionId);
    }
  }, [isConnected, currentSessionId, emit]);

  // Set up message listeners
  useEffect(() => {
    const handleChatMessage = (data: any) => {
      const message: Message = {
        id: data.id || Date.now().toString(),
        sender: data.agentResponse ? (data.username || 'tutor') : 'student',
        content: data.message,
        timestamp: new Date(data.timestamp),
        metadata: {
          agentResponse: data.agentResponse,
          userId: data.userId,
          username: data.username,
        },
      };
      
      // Add to session service for persistence
      chatSessionService.addMessage(message);
      
      // Update local state
      setMessages(prev => {
        const newMessages = [...prev, message];
        return newMessages;
      });
      setIsLoading(false);
    };

    const handleTyping = (data: { userId: string; username: string; isTyping: boolean }) => {
      // Only show typing for agents/system users
      if (data.userId === 'system' || data.username.includes('Assistant')) {
        setTypingStatus({
          isTyping: data.isTyping,
          agent: 'tutor' as ChatAgent,
          timestamp: new Date(),
        });
      }
    };

    if (isConnected) {
      on('chat:message' as keyof CustomWebSocketEvents, handleChatMessage as any);
      on('chat:typing' as keyof CustomWebSocketEvents, handleTyping as any);
    }

    return () => {
      if (isConnected) {
        off('chat:message' as keyof CustomWebSocketEvents, handleChatMessage as any);
        off('chat:typing' as keyof CustomWebSocketEvents, handleTyping as any);
      }
    };
  }, [isConnected, on, off]);

  const sendMessage = useCallback((content: string) => {
    if (!isConnected) {
      console.warn('Cannot send message: not connected to WebSocket');
      return;
    }

    // Check for cached response first
    const cachedResponse = chatSessionService.getCachedResponse(content);
    if (cachedResponse) {
      console.log('Using cached response for question:', content);
      
      // Add cached messages to current session with new timestamps
      const [userMsg, agentMsg] = cachedResponse;
      const newUserMsg = {
        ...userMsg,
        id: Date.now().toString(),
        timestamp: new Date()
      };
      const newAgentMsg = {
        ...agentMsg,
        id: (Date.now() + 1).toString(),
        timestamp: new Date()
      };

      // Add to session and update UI
      chatSessionService.addMessage(newUserMsg);
      chatSessionService.addMessage(newAgentMsg);
      setMessages(prev => [...prev, newUserMsg, newAgentMsg]);
      
      return;
    }

    setIsLoading(true);

    // Send message via WebSocket - backend will echo it back
    emit('chat:message', {
      message: content,
      sessionId: currentSessionId || `session_${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
  }, [isConnected, currentSessionId, emit]);

  const clearMessages = useCallback(() => {
    chatSessionService.clearCurrentSession();
    setMessages([]);
    setTypingStatus({ isTyping: false, timestamp: new Date() });
    setIsLoading(false);
  }, []);

  const refreshMessages = useCallback(() => {
    // Always get the current session to ensure continuity
    const session = chatSessionService.getCurrentSession();
    setCurrentSessionId(session.sessionId);
    setMessages(session.messages || []);
    console.log(`Refreshed ${session.messages.length} messages from session ${session.sessionId}`);
  }, []);

  // Cache question-response pairs for future use
  useEffect(() => {
    if (messages.length >= 2) {
      const lastTwo = messages.slice(-2);
      const [userMsg, agentMsg] = lastTwo;
      
      // Check if we have a user question followed by an agent response
      if (userMsg.sender === 'student' && agentMsg.sender === 'tutor' && 
          userMsg.content && agentMsg.content) {
        chatSessionService.cacheResponse(userMsg.content, userMsg, agentMsg);
      }
    }
  }, [messages]);

  // Refresh messages when window gains focus (user returns to tab/page)
  useEffect(() => {
    const handleFocus = () => {
      refreshMessages();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshMessages]);

  return {
    messages,
    isTyping: typingStatus.isTyping,
    typingAgent: typingStatus.agent,
    isConnected,
    isLoading,
    sendMessage,
    clearMessages,
    refreshMessages,
    sessionId: currentSessionId,
  };
};