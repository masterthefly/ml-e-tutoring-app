import React, { useEffect, useRef } from 'react';
import { Message } from '../../types';
import { MathRenderer } from './MathRenderer.tsx';
import { AgentAvatar } from './AgentAvatar.tsx';
import './ChatMessage.css';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const messageRef = useRef<HTMLDivElement>(null);

  // Announce new messages to screen readers
  useEffect(() => {
    if (message.sender !== 'student' && messageRef.current) {
      const announcement = `New message from ${message.sender}: ${message.content}`;
      const ariaLive = messageRef.current.getAttribute('aria-live');
      if (ariaLive === 'polite') {
        messageRef.current.setAttribute('aria-label', announcement);
      }
    }
  }, [message]);

  const isStudent = message.sender === 'student';
  const messageClass = `chat-message ${isStudent ? 'chat-message--student' : 'chat-message--agent'}`;

  return (
    <div 
      ref={messageRef}
      className={messageClass}
      role="article"
      aria-label={`Message from ${message.sender} at ${message.timestamp.toLocaleTimeString()}`}
    >
      {!isStudent && (
        <AgentAvatar 
          agent={message.sender} 
          className="chat-message__avatar"
        />
      )}
      
      <div className="chat-message__content">
        {!isStudent && (
          <div className="chat-message__header">
            <span className="chat-message__sender" aria-label={`Agent: ${message.sender}`}>
              {message.sender.charAt(0).toUpperCase() + message.sender.slice(1)} Agent
            </span>
            <span className="chat-message__timestamp" aria-label={`Sent at ${message.timestamp.toLocaleTimeString()}`}>
              {message.timestamp.toLocaleTimeString()}
            </span>
          </div>
        )}
        
        <div className="chat-message__text">
          <MathRenderer content={message.content} />
        </div>
        
        {message.metadata?.confidence && (
          <div className="chat-message__metadata" aria-label={`Confidence: ${message.metadata.confidence}%`}>
            <span className="chat-message__confidence">
              Confidence: {message.metadata.confidence}%
            </span>
          </div>
        )}
        
        {isStudent && (
          <div className="chat-message__timestamp chat-message__timestamp--student">
            {message.timestamp.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};