import React from 'react';
import { AssessmentResult } from '../../types';
import { LineChart } from './LineChart.tsx';
import './PerformanceAnalytics.css';

interface PerformanceAnalyticsProps {
  assessmentScores: AssessmentResult[];
  totalTimeSpent: number;
  currentLevel: string;
}

export const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({
  assessmentScores,
  totalTimeSpent,
  currentLevel,
}) => {
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getAverageScore = (): number => {
    if (assessmentScores.length === 0) return 0;
    const sum = assessmentScores.reduce((acc, score) => acc + score.score, 0);
    return Math.round(sum / assessmentScores.length);
  };

  const getScoreTrend = (): 'improving' | 'declining' | 'stable' => {
    if (assessmentScores.length < 2) return 'stable';
    
    const recent = assessmentScores.slice(-3);
    const older = assessmentScores.slice(-6, -3);
    
    if (recent.length === 0 || older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((acc, s) => acc + s.score, 0) / recent.length;
    const olderAvg = older.reduce((acc, s) => acc + s.score, 0) / older.length;
    
    const difference = recentAvg - olderAvg;
    
    if (difference > 5) return 'improving';
    if (difference < -5) return 'declining';
    return 'stable';
  };

  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      case 'stable': return '➡️';
      default: return '📊';
    }
  };

  const getTrendColor = (trend: string): string => {
    switch (trend) {
      case 'improving': return 'var(--success-color)';
      case 'declining': return 'var(--error-color)';
      case 'stable': return 'var(--secondary-color)';
      default: return 'var(--text-secondary)';
    }
  };

  const averageScore = getAverageScore();
  const scoreTrend = getScoreTrend();

  return (
    <div className="performance-analytics" role="region" aria-label="Performance analytics">
      <h3 className="performance-analytics__title">Performance Analytics</h3>
      
      <div className="performance-analytics__grid">
        <div className="performance-analytics__metric">
          <div className="performance-analytics__metric-value" aria-label={`Average score: ${averageScore}%`}>
            {averageScore}%
          </div>
          <div className="performance-analytics__metric-label">Average Score</div>
        </div>
        
        <div className="performance-analytics__metric">
          <div className="performance-analytics__metric-value" aria-label={`Total study time: ${formatTime(totalTimeSpent)}`}>
            {formatTime(totalTimeSpent)}
          </div>
          <div className="performance-analytics__metric-label">Study Time</div>
        </div>
        
        <div className="performance-analytics__metric">
          <div className="performance-analytics__metric-value" aria-label={`Current level: ${currentLevel}`}>
            {currentLevel}
          </div>
          <div className="performance-analytics__metric-label">Current Level</div>
        </div>
        
        <div className="performance-analytics__metric">
          <div 
            className="performance-analytics__metric-value performance-analytics__trend"
            style={{ color: getTrendColor(scoreTrend) }}
            aria-label={`Performance trend: ${scoreTrend}`}
          >
            <span className="performance-analytics__trend-icon" aria-hidden="true">
              {getTrendIcon(scoreTrend)}
            </span>
            {scoreTrend}
          </div>
          <div className="performance-analytics__metric-label">Trend</div>
        </div>
      </div>
      
      {assessmentScores.length > 0 && (
        <div className="performance-analytics__chart">
          <h4 className="performance-analytics__chart-title">Score History</h4>
          <LineChart 
            data={assessmentScores.map(score => ({
              x: new Date(score.completedAt).toLocaleDateString(),
              y: score.score,
            }))}
            height={200}
            aria-label="Assessment scores over time"
          />
        </div>
      )}
      
      {assessmentScores.length === 0 && (
        <div className="performance-analytics__empty" role="status">
          <p>Complete some assessments to see your performance analytics!</p>
        </div>
      )}
    </div>
  );
};