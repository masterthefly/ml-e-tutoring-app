import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
  const { user, login, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');

  // Redirect if already authenticated
  if (user) {
    return <Navigate to="/chat" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      await login(formData.username, formData.password);
    } catch (err) {
      setError('Invalid username or password');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="login-page" role="main" aria-label="Login to ML-E">
      <div className="login-page__container">
        <div className="login-page__header">
          <h1 className="login-page__title">
            <span className="login-page__logo" aria-hidden="true">🤖</span>
            Welcome to ML-E
          </h1>
          <p className="login-page__subtitle">
            Your AI-powered Machine Learning tutor
          </p>
        </div>

        <form 
          className="login-form" 
          onSubmit={handleSubmit}
          aria-label="Login form"
        >
          <div className="form-group">
            <label htmlFor="username" className="form-label">
              Username
            </label>
            <input
              type="text"
              id="username"
              name="username"
              className="form-input"
              value={formData.username}
              onChange={handleChange}
              required
              aria-describedby={error ? 'login-error' : undefined}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              className="form-input"
              value={formData.password}
              onChange={handleChange}
              required
              aria-describedby={error ? 'login-error' : undefined}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div 
              id="login-error" 
              className="error-message" 
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn--primary login-form__submit"
            disabled={isLoading}
            aria-describedby={isLoading ? 'login-loading' : undefined}
          >
            {isLoading ? (
              <>
                <span className="loading" aria-hidden="true"></span>
                <span id="login-loading" className="sr-only">Signing in...</span>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};