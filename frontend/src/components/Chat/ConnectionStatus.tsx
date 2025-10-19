import React from 'react';
import './ConnectionStatus.css';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ isConnected }) => {
  if (isConnected) {
    return null; // Don't show anything when connected
  }

  return (
    <div 
      className="connection-status connection-status--disconnected"
      role="alert"
      aria-live="assertive"
    >
      <div className="connection-status__content">
        <span className="connection-status__icon" aria-hidden="true">⚠️</span>
        <span className="connection-status__text">
          Connection lost. Attempting to reconnect...
        </span>
        <div className="connection-status__spinner" aria-hidden="true"></div>
      </div>
    </div>
  );
};