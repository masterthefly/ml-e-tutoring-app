import React from 'react';
import { ProgressDashboard } from '../components/Dashboard/ProgressDashboard';
import { useProgress } from '../hooks/useProgress';
import './DashboardPage.css';

export const DashboardPage: React.FC = () => {
  const { progress, isLoading, error, refreshProgress } = useProgress();

  return (
    <div className="dashboard-page" role="main" aria-label="Learning progress dashboard">
      <div className="dashboard-page__header">
        <h1 className="dashboard-page__title">Learning Progress</h1>
        <p className="dashboard-page__description">
          Track your Machine Learning learning journey and achievements
        </p>
        
        {error && (
          <div className="dashboard-page__error" role="alert">
            <p>Error loading progress: {error}</p>
            <button 
              onClick={refreshProgress}
              className="btn btn--secondary"
              aria-label="Retry loading progress data"
            >
              Retry
            </button>
          </div>
        )}
      </div>
      
      <div className="dashboard-page__content">
        {progress ? (
          <ProgressDashboard progress={progress} isLoading={isLoading} />
        ) : !error ? (
          <div className="dashboard-placeholder" role="region" aria-label="Loading progress data">
            <div className="loading" aria-hidden="true"></div>
            <span className="sr-only">Loading your progress...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};