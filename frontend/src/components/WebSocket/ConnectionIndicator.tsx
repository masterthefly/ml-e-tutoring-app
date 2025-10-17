import React from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import './ConnectionIndicator.css';

export const ConnectionIndicator: React.FC = () => {
  const { isConnected, isConnecting, error } = useWebSocket();

  if (isConnected) {
    return null; // Don't show anything when connected
  }

  return (
    <div 
      className={`connection-indicator ${
        error ? 'connection-indicator--error' : 'connection-indicator--connecting'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="connection-indicator__content">
        {isConnecting ? (
          <>
            <div className="connection-indicator__spinner" aria-hidden="true"></div>
            <span>Connecting to ML-E...</span>
          </>
        ) : error ? (
          <>
            <span className="connection-indicator__icon" aria-hidden="true">⚠️</span>
            <span>Connection failed: {error}</span>
          </>
        ) : (
          <>
            <span className="connection-indicator__icon" aria-hidden="true">🔌</span>
            <span>Disconnected from ML-E</span>
          </>
        )}
      </div>
    </div>
  );
};