import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Navigation } from './Navigation';
import { useAuth } from '../../hooks/useAuth';
import './Layout.css';

export const Layout: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="layout" role="main">
      <Header user={user} />
      <div className="layout__content">
        <Navigation />
        <main 
          className="layout__main" 
          role="main" 
          aria-label="Main content area"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};