import { User, LoginRequest, LoginResponse } from '../types/auth';
import { apiClient } from './api.client.ts';

class AuthService {
  private readonly TOKEN_KEY = 'ml-e-token';
  private readonly USER_KEY = 'ml-e-user';

  async login(username: string, password: string): Promise<User> {
    const loginData: LoginRequest = { username, password };

    const response = await apiClient.post<LoginResponse>('/auth/login', loginData);

    if (response.data.token && response.data.user) {
      this.setToken(response.data.token);
      this.setUser(response.data.user);
      return response.data.user;
    }

    throw new Error('Invalid login response');
  }

  async getCurrentUser(): Promise<User | null> {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    try {
      const response = await apiClient.get<User>('/auth/me');
      const user = response.data;
      this.setUser(user);
      return user;
    } catch (error) {
      // Token might be expired or invalid
      this.logout();
      return null;
    }
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  private setUser(user: User): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  getStoredUser(): User | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();