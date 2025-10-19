import { useState, useEffect, useCallback } from 'react';
import { User } from '../types/auth';
import { authService } from '../services/auth.service';

interface UseAuthReturn {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First check localStorage for stored user data
        const storedUser = authService.getStoredUser();
        if (storedUser) {
          setUser(storedUser);
        }

        // Then verify with server if we have a token
        const token = authService.getToken();
        if (token) {
          try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
          } catch (error) {
            // Token might be expired, but keep stored user for now
            console.warn('Failed to verify token with server:', error);
            if (!storedUser) {
              setUser(null);
            }
          }
        } else if (!storedUser) {
          setUser(null);
        }
      } catch (error) {
        // User not authenticated or token expired
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const userData = await authService.login(username, password);
      setUser(userData);
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  return {
    user,
    isLoading,
    login,
    logout,
  };
};