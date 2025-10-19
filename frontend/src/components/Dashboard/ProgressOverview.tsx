import React from 'react';
import { UserProgress } from '../../types';
import { CircularProgress } from './CircularProgress.tsx';
import './ProgressOverview.css';

interface ProgressOverviewProps {
  progress: UserProgress;
}

export const ProgressOverview: React.FC<ProgressOverviewProps> = ({ progress }) => {
  const totalTopics = progress.topics.length;
  const completedTopics = progress.topics.filter(
    (topic: any) => topic.progress >= 100
  ).length;
  const overallProgress = progress.overallProgress;

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div className="progress-overview" role="region" aria-label="Progress overview">
      <h2 className="progress-overview__title">Your Learning Progress</h2>
      
      <div className="progress-overview__main">
        <div className="progress-overview__circle">
          <CircularProgress 
            percentage={overallProgress}
            size={120}
            strokeWidth={8}
            aria-label={`Overall progress: ${Math.round(overallProgress)}% complete`}
          />
          <div className="progress-overview__percentage">
            {Math.round(overallProgress)}%
          </div>
        </div>
        
        <div className="progress-overview__stats">
          <div className="progress-overview__stat">
            <span className="progress-overview__stat-value" aria-label={`${completedTopics} topics completed`}>
              {completedTopics}
            </span>
            <span className="progress-overview__stat-label">Topics Completed</span>
          </div>
          
          <div className="progress-overview__stat">
            <span className="progress-overview__stat-value" aria-label={`Level ${progress.currentLevel}`}>
              {progress.currentLevel}
            </span>
            <span className="progress-overview__stat-label">Current Level</span>
          </div>
          
          <div className="progress-overview__stat">
            <span className="progress-overview__stat-value" aria-label={`${formatTime(progress.performance.totalTimeSpent)} total time spent`}>
              {formatTime(progress.performance.totalTimeSpent)}
            </span>
            <span className="progress-overview__stat-label">Time Spent</span>
          </div>
        </div>
      </div>
      
      <div className="progress-overview__summary">
        <p>
          You've completed <strong>{completedTopics} out of {totalTopics}</strong> topics 
          in your Machine Learning journey. Keep up the great work!
        </p>
      </div>
    </div>
  );
};