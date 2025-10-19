import { useState, useEffect, useCallback, useRef } from 'react';
import { websocketService, CustomWebSocketEvents } from '../services/websocket.service';

interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  emit: (event: string, data?: any) => void;
  on: <K extends keyof CustomWebSocketEvents>(event: K, callback: CustomWebSocketEvents[K]) => void;
  off: <K extends keyof CustomWebSocketEvents>(event: K, callback?: CustomWebSocketEvents[K]) => void;
}

export const useWebSocket = (): UseWebSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenersRef = useRef<Map<string, Function>>(new Map());

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setError(null);

    try {
      await websocketService.connect();
      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected]);

  const disconnect = useCallback(() => {
    websocketService.disconnect();
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    websocketService.emit(event, data);
  }, []);

  const on = useCallback(<K extends keyof CustomWebSocketEvents>(
    event: K,
    callback: CustomWebSocketEvents[K]
  ) => {
    websocketService.on(event, callback);
    listenersRef.current.set(event as string, callback);
  }, []);

  const off = useCallback(<K extends keyof CustomWebSocketEvents>(
    event: K,
    callback?: CustomWebSocketEvents[K]
  ) => {
    websocketService.off(event, callback);
    if (!callback) {
      listenersRef.current.delete(event as string);
    }
  }, []);

  // Set up connection status listeners
  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setIsConnecting(false);
    };

    const handleConnectError = (err: Error) => {
      setError(err.message);
      setIsConnecting(false);
      setIsConnected(false);
    };

    const handleReconnect = () => {
      setIsConnected(true);
      setError(null);
    };

    websocketService.onConnect(handleConnect);
    websocketService.onDisconnect(handleDisconnect);
    websocketService.onConnectError(handleConnectError);
    websocketService.onReconnect(handleReconnect);

    return () => {
      websocketService.offConnect(handleConnect);
      websocketService.offDisconnect(handleDisconnect);
      websocketService.offConnectError(handleConnectError);
      websocketService.offReconnect(handleReconnect);
    };
  }, []);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      listenersRef.current.forEach((callback, event) => {
        websocketService.off(event as keyof CustomWebSocketEvents, callback as any);
      });
      listenersRef.current.clear();
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    emit,
    on,
    off,
  };
};