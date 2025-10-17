import React from 'react';
import { ProgressOverview } from './ProgressOverview.tsx';
import { TopicProgress } from './TopicProgress.tsx';
import { LearningPath } from './LearningPath.tsx';
import { PerformanceAnalytics } from './PerformanceAnalytics.tsx';
import { UserProgress } from '../../types';
import './ProgressDashboard.css';

interface ProgressDashboardProps {
  progress: UserProgress;
  isLoading?: boolean;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  progress,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="progress-dashboard progress-dashboard--loading" role="status" aria-label="Loading progress data">
        <div className="progress-dashboard__loading">
          <div className="loading" aria-hidden="true"></div>
          <span className="sr-only">Loading your progress...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="progress-dashboard" role="region" aria-label="Learning progress dashboard">
      <div className="progress-dashboard__grid">
        <div className="progress-dashboard__overview">
          <ProgressOverview progress={progress} />
        </div>
        
        <div className="progress-dashboard__topics">
          <TopicProgress topics={progress.topics} />
        </div>
        
        <div className="progress-dashboard__path">
          <LearningPath 
            currentPath={progress.learningPaths.length > 0 ? progress.learningPaths[0].topics.map(t => t.topicId) : []}
            completedTopics={progress.topics}
          />
        </div>
        
        <div className="progress-dashboard__analytics">
          <PerformanceAnalytics 
            assessmentScores={[]}
            totalTimeSpent={progress.performance.totalTimeSpent}
            currentLevel={progress.currentLevel}
          />
        </div>
      </div>
    </div>
  );
};