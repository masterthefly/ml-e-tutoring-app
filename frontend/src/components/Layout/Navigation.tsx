import React from 'react';
import { NavLink } from 'react-router-dom';
import './Navigation.css';

export const Navigation: React.FC = () => {
  return (
    <nav className="navigation" role="navigation" aria-label="Main navigation">
      <ul className="navigation__list" role="menubar">
        <li className="navigation__item" role="none">
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              `navigation__link ${isActive ? 'navigation__link--active' : ''}`
            }
            role="menuitem"
            aria-label="Chat with AI tutor"
          >
            <span className="navigation__icon" aria-hidden="true">💬</span>
            <span className="navigation__text">Chat</span>
          </NavLink>
        </li>
        <li className="navigation__item" role="none">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `navigation__link ${isActive ? 'navigation__link--active' : ''}`
            }
            role="menuitem"
            aria-label="View learning progress dashboard"
          >
            <span className="navigation__icon" aria-hidden="true">📊</span>
            <span className="navigation__text">Progress</span>
          </NavLink>
        </li>
        <li className="navigation__item" role="none">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `navigation__link ${isActive ? 'navigation__link--active' : ''}`
            }
            role="menuitem"
            aria-label="Manage your profile"
          >
            <span className="navigation__icon" aria-hidden="true">👤</span>
            <span className="navigation__text">Profile</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  );
};