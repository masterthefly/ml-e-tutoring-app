import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api.client';
import './DashboardPage.css';

interface LearningAnalytics {
  overallProgress: number;
  topicsCompleted: number;
  totalTimeSpent: number;
  averageSessionDuration: number;
  learningVelocity: number;
  engagementScore: number;
  streakDays: number;
  recentTopics: string[];
  strugglingConcepts: string[];
  masteredConcepts: string[];
  achievements: Array<{
    name: string;
    type: string;
    description: string;
    points: number;
    earnedAt: string;
  }>;
  weeklyProgress: Array<{
    date: string;
    timeSpent: number;
    topicsCompleted: number;
  }>;
}

export const DashboardPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<LearningAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.get('/analytics/dashboard?days=30');
      setAnalytics(response.data.data);
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      setError(err.response?.data?.message || 'Failed to load progress data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="dashboard-page" role="main" aria-label="Learning progress dashboard">
        <div className="dashboard-page__header">
          <h1 className="dashboard-page__title">Learning Progress</h1>
          <p className="dashboard-page__description">
            Track your Machine Learning learning journey and achievements
          </p>
        </div>
        <div className="dashboard-page__content">
          <div className="dashboard-placeholder" role="region" aria-label="Loading progress data">
            <div className="loading" aria-hidden="true"></div>
            <p>Loading your progress...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page" role="main" aria-label="Learning progress dashboard">
        <div className="dashboard-page__header">
          <h1 className="dashboard-page__title">Learning Progress</h1>
          <p className="dashboard-page__description">
            Track your Machine Learning learning journey and achievements
          </p>
        </div>
        <div className="dashboard-page__content">
          <div className="dashboard-page__error" role="alert">
            <p>Error loading progress: {error}</p>
            <button 
              onClick={loadAnalytics}
              className="btn btn--secondary"
              aria-label="Retry loading progress data"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="dashboard-page" role="main" aria-label="Learning progress dashboard">
        <div className="dashboard-page__header">
          <h1 className="dashboard-page__title">Learning Progress</h1>
          <p className="dashboard-page__description">
            Track your Machine Learning learning journey and achievements
          </p>
        </div>
        <div className="dashboard-page__content">
          <div className="no-data">
            <p>No progress data available yet. Start chatting to begin tracking your learning!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page" role="main" aria-label="Learning progress dashboard">
      <div className="dashboard-page__header">
        <h1 className="dashboard-page__title">Learning Progress</h1>
        <p className="dashboard-page__description">
          Track your Machine Learning learning journey and achievements
        </p>
      </div>
      
      <div className="dashboard-page__content">
        {/* Overview Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{analytics.overallProgress}%</div>
            <div className="stat-label">Overall Progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{analytics.topicsCompleted}</div>
            <div className="stat-label">Topics Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatTime(analytics.totalTimeSpent)}</div>
            <div className="stat-label">Total Time Spent</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{analytics.engagementScore}</div>
            <div className="stat-label">Engagement Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{analytics.streakDays}</div>
            <div className="stat-label">Learning Streak</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{analytics.learningVelocity}</div>
            <div className="stat-label">Learning Velocity</div>
          </div>
        </div>

        {/* Recent Topics */}
        {analytics.recentTopics.length > 0 && (
          <div className="dashboard-section">
            <h2 className="section-title">Recent Topics</h2>
            <div className="topic-list">
              {analytics.recentTopics.map((topic, index) => (
                <div key={index} className="topic-item">
                  {topic}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mastered Concepts */}
        {analytics.masteredConcepts.length > 0 && (
          <div className="dashboard-section">
            <h2 className="section-title">Mastered Concepts</h2>
            <div className="concept-list">
              {analytics.masteredConcepts.map((concept, index) => (
                <div key={index} className="concept-item concept-item--mastered">
                  ✅ {concept}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Struggling Concepts */}
        {analytics.strugglingConcepts.length > 0 && (
          <div className="dashboard-section">
            <h2 className="section-title">Areas for Improvement</h2>
            <div className="concept-list">
              {analytics.strugglingConcepts.map((concept, index) => (
                <div key={index} className="concept-item concept-item--struggling">
                  📚 {concept}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        {analytics.achievements.length > 0 && (
          <div className="dashboard-section">
            <h2 className="section-title">Recent Achievements</h2>
            <div className="achievements-list">
              {analytics.achievements.slice(0, 5).map((achievement, index) => (
                <div key={index} className="achievement-item">
                  <div className="achievement-icon">🏆</div>
                  <div className="achievement-details">
                    <div className="achievement-name">{achievement.name}</div>
                    <div className="achievement-description">{achievement.description}</div>
                    <div className="achievement-points">{achievement.points} points</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Progress */}
        {analytics.weeklyProgress.length > 0 && (
          <div className="dashboard-section">
            <h2 className="section-title">Weekly Progress</h2>
            <div className="weekly-progress">
              {analytics.weeklyProgress.map((day, index) => (
                <div key={index} className="progress-day">
                  <div className="day-date">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="day-stats">
                    <div className="day-time">{formatTime(day.timeSpent)}</div>
                    <div className="day-topics">{day.topicsCompleted} topics</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <div className="dashboard-actions">
          <button 
            onClick={loadAnalytics}
            className="btn btn--primary"
            aria-label="Refresh progress data"
          >
            Refresh Progress
          </button>
        </div>
      </div>
    </div>
  );
};