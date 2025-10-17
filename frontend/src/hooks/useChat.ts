import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { Message, ChatAgent, TypingStatus } from '../types/chat';

interface UseChatReturn {
  messages: Message[];
  isTyping: boolean;
  typingAgent?: ChatAgent;
  isConnected: boolean;
  isLoading: boolean;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

export const useChat = (sessionId?: string): UseChatReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingStatus, setTypingStatus] = useState<TypingStatus>({
    isTyping: false,
    timestamp: new Date(),
  });
  const [isLoading, setIsLoading] = useState(false);

  const { isConnected, connect, emit, on, off } = useWebSocket();

  // Connect to WebSocket when component mounts
  useEffect(() => {
    if (!isConnected) {
      connect().catch(console.error);
    }
  }, [isConnected, connect]);

  // Join chat session when connected
  useEffect(() => {
    if (isConnected && sessionId) {
      emit('join-session', { sessionId });
    }
  }, [isConnected, sessionId, emit]);

  // Set up message listeners
  useEffect(() => {
    const handleMessage = (data: any) => {
      const message: Message = {
        id: data.id || Date.now().toString(),
        sender: data.sender,
        content: data.content,
        timestamp: new Date(data.timestamp),
        metadata: data.metadata,
      };
      
      setMessages(prev => [...prev, message]);
      setIsLoading(false);
    };

    const handleAgentResponse = (data: any) => {
      const message: Message = {
        id: data.id || Date.now().toString(),
        sender: data.agent || 'tutor',
        content: data.content,
        timestamp: new Date(data.timestamp || Date.now()),
        metadata: {
          confidence: data.confidence,
          agentId: data.agentId,
          ...data.metadata,
        },
      };
      
      setMessages(prev => [...prev, message]);
      setTypingStatus({ isTyping: false, timestamp: new Date() });
      setIsLoading(false);
    };

    const handleTyping = (data: { agent: string; isTyping: boolean }) => {
      setTypingStatus({
        isTyping: data.isTyping,
        agent: data.agent as ChatAgent,
        timestamp: new Date(),
      });
    };

    if (isConnected) {
      on('message', handleMessage);
      on('agent-response', handleAgentResponse);
      on('typing', handleTyping);
    }

    return () => {
      if (isConnected) {
        off('message', handleMessage);
        off('agent-response', handleAgentResponse);
        off('typing', handleTyping);
      }
    };
  }, [isConnected, on, off]);

  const sendMessage = useCallback((content: string) => {
    if (!isConnected) {
      console.warn('Cannot send message: not connected to WebSocket');
      return;
    }

    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'student',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Send message via WebSocket
    emit('send-message', {
      content,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }, [isConnected, sessionId, emit]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setTypingStatus({ isTyping: false, timestamp: new Date() });
    setIsLoading(false);
  }, []);

  return {
    messages,
    isTyping: typingStatus.isTyping,
    typingAgent: typingStatus.agent,
    isConnected,
    isLoading,
    sendMessage,
    clearMessages,
  };
};