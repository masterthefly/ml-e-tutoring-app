import React from 'react';
import { User } from '../../types/auth';
import './Header.css';

interface HeaderProps {
  user: User | null;
}

export const Header: React.FC<HeaderProps> = ({ user }) => {
  return (
    <header className="header" role="banner">
      <div className="header__container">
        <div className="header__brand">
          <h1 className="header__title">
            <span className="header__logo" aria-hidden="true">🤖</span>
            ML-E
          </h1>
          <span className="header__subtitle">AI Machine Learning Tutor</span>
        </div>
        
        {user && (
          <div className="header__user" role="region" aria-label="User information">
            <span className="header__welcome" aria-label={`Welcome, ${user.username}`}>
              Welcome, {user.username}
            </span>
            <span className="header__grade" aria-label={`Grade ${user.grade}`}>
              Grade {user.grade}
            </span>
          </div>
        )}
      </div>
    </header>
  );
};