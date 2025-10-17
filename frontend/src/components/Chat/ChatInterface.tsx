import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage.tsx';
import { ChatInput } from './ChatInput.tsx';
import { TypingIndicator } from './TypingIndicator.tsx';
import { ConnectionStatus } from './ConnectionStatus.tsx';
import { Message, ChatAgent } from '../../types';
import './ChatInterface.css';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isTyping: boolean;
  typingAgent?: ChatAgent;
  isConnected: boolean;
  isLoading?: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isTyping,
  typingAgent,
  isConnected,
  isLoading = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!isUserScrolling) {
      scrollToBottom();
    }
  }, [messages, isTyping, isUserScrolling]);

  // Handle scroll detection
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      setIsUserScrolling(!isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (content: string) => {
    setIsUserScrolling(false); // Reset scroll state when sending
    onSendMessage(content);
  };

  return (
    <div className="chat-interface" role="region" aria-label="Chat conversation">
      <ConnectionStatus isConnected={isConnected} />
      
      <div 
        className="chat-interface__messages"
        ref={messagesContainerRef}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="chat-interface__welcome" role="region" aria-label="Welcome message">
            <div className="chat-interface__welcome-content">
              <h2>Welcome to ML-E! 🤖</h2>
              <p>
                I'm your AI tutor for Machine Learning concepts. Ask me anything about:
              </p>
              <ul>
                <li>Supervised and Unsupervised Learning</li>
                <li>Machine Learning Algorithms</li>
                <li>Data Processing and Analysis</li>
                <li>Real-world ML Applications</li>
              </ul>
              <p>
                <strong>Try asking:</strong> "What is supervised learning?" or "How does a decision tree work?"
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
              />
            ))}
            
            {isTyping && typingAgent && (
              <TypingIndicator agent={typingAgent} />
            )}
          </>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {!isUserScrolling && messages.length > 0 && (
        <button
          className="chat-interface__scroll-button"
          onClick={scrollToBottom}
          aria-label="Scroll to latest message"
        >
          ↓ New messages
        </button>
      )}

      <ChatInput
        onSendMessage={handleSendMessage}
        disabled={!isConnected || isLoading}
        placeholder={
          !isConnected 
            ? "Connecting..." 
            : isLoading 
            ? "Processing..." 
            : "Ask me about Machine Learning..."
        }
      />
    </div>
  );
};