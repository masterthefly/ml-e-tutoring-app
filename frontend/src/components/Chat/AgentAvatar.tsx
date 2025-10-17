import React from 'react';
import { ChatAgent } from '../../types/chat';
import './AgentAvatar.css';

interface AgentAvatarProps {
  agent: ChatAgent;
  className?: string;
}

const agentConfig = {
  tutor: {
    emoji: '👨‍🏫',
    color: '#2563eb',
    name: 'Tutor',
    description: 'Main teaching agent'
  },
  assessment: {
    emoji: '📊',
    color: '#059669',
    name: 'Assessment',
    description: 'Evaluation and testing agent'
  },
  content: {
    emoji: '📚',
    color: '#d97706',
    name: 'Content',
    description: 'Content generation agent'
  },
  coordinator: {
    emoji: '🎯',
    color: '#dc2626',
    name: 'Coordinator',
    description: 'Agent coordination system'
  }
};

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ agent, className = '' }) => {
  const config = agentConfig[agent] || agentConfig.tutor;
  
  return (
    <div 
      className={`agent-avatar ${className}`}
      style={{ '--agent-color': config.color } as React.CSSProperties}
      role="img"
      aria-label={`${config.name} agent avatar`}
      title={`${config.name} - ${config.description}`}
    >
      <span className="agent-avatar__emoji" aria-hidden="true">
        {config.emoji}
      </span>
    </div>
  );
};