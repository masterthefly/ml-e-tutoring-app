import React from 'react';
import { ChatAgent } from '../../types';
import { AgentAvatar } from './AgentAvatar.tsx';
import './TypingIndicator.css';

interface TypingIndicatorProps {
  agent: ChatAgent;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ agent }) => {
  return (
    <div 
      className="typing-indicator"
      role="status"
      aria-label={`${agent} agent is typing`}
      aria-live="polite"
    >
      <AgentAvatar 
        agent={agent} 
        className="typing-indicator__avatar"
      />
      
      <div className="typing-indicator__content">
        <div className="typing-indicator__header">
          <span className="typing-indicator__agent">
            {agent.name}
          </span>
        </div>
        
        <div className="typing-indicator__animation">
          <span className="typing-indicator__dot" aria-hidden="true"></span>
          <span className="typing-indicator__dot" aria-hidden="true"></span>
          <span className="typing-indicator__dot" aria-hidden="true"></span>
          <span className="sr-only">is typing</span>
        </div>
      </div>
    </div>
  );
};