import React from 'react';
import { ChatInterface } from '../components/Chat/ChatInterface';
import { useChat } from '../hooks/useChat';
import './ChatPage.css';

export const ChatPage: React.FC = () => {
  const {
    messages,
    isTyping,
    typingAgent,
    isConnected,
    isLoading,
    sendMessage,
    refreshMessages,
    sessionId,
  } = useChat();

  // Refresh messages when component mounts (user navigates to chat page)
  React.useEffect(() => {
    refreshMessages();
  }, [refreshMessages]);

  return (
    <div className="chat-page" role="main" aria-label="Chat with AI tutor">
      <div className="chat-page__header">
        <h1 className="chat-page__title">Chat with ML-E</h1>
        <p className="chat-page__description">
          Ask questions about Machine Learning concepts and get personalized explanations
        </p>
      </div>
      
      <div className="chat-page__content">
        <ChatInterface
          messages={messages}
          onSendMessage={sendMessage}
          isTyping={isTyping}
          typingAgent={typingAgent}
          isConnected={isConnected}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};