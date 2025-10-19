import React from 'react';
import { TopicProgress as TopicProgressData } from '../../types';
import { ProgressBar } from './ProgressBar.tsx';
import './TopicProgress.css';

interface TopicProgressProps {
  topics: TopicProgressData[];
}

const topicDisplayNames: Record<string, string> = {
  'supervised-learning': 'Supervised Learning',
  'unsupervised-learning': 'Unsupervised Learning',
  'decision-trees': 'Decision Trees',
  'linear-regression': 'Linear Regression',
  'neural-networks': 'Neural Networks',
  'clustering': 'Clustering',
  'data-preprocessing': 'Data Preprocessing',
  'model-evaluation': 'Model Evaluation',
};

const getMasteryColor = (level: string): string => {
  switch (level) {
    case 'advanced': return 'var(--success-color)';
    case 'intermediate': return 'var(--warning-color)';
    case 'beginner': return 'var(--secondary-color)';
    default: return 'var(--text-muted)';
  }
};

const getMasteryIcon = (level: string): string => {
  switch (level) {
    case 'advanced': return '🏆';
    case 'intermediate': return '⭐';
    case 'beginner': return '📚';
    default: return '⏳';
  }
};

export const TopicProgress: React.FC<TopicProgressProps> = ({ topics }) => {
  const sortedTopics = [...topics].sort((a, b) => 
    b.progress - a.progress
  );

  return (
    <div className="topic-progress" role="region" aria-label="Topic progress breakdown">
      <h3 className="topic-progress__title">Topic Breakdown</h3>
      
      <div className="topic-progress__list">
        {sortedTopics.map((topic) => (
          <div 
            key={topic.topicId}
            className="topic-progress__item"
            role="article"
            aria-label={`${topicDisplayNames[topic.topicId] || topic.topicId}: ${topic.progress}% complete`}
          >
            <div className="topic-progress__header">
              <div className="topic-progress__info">
                <span 
                  className="topic-progress__mastery-icon"
                  aria-label={`Difficulty level: ${topic.difficulty}`}
                >
                  {getMasteryIcon(topic.difficulty)}
                </span>
                <h4 className="topic-progress__name">
                  {topicDisplayNames[topic.topicId] || topic.topicId}
                </h4>
              </div>
              
              <div className="topic-progress__stats">
                <span 
                  className="topic-progress__percentage"
                  aria-label={`${topic.progress}% complete`}
                >
                  {topic.progress}%
                </span>
                <span 
                  className="topic-progress__mastery"
                  style={{ color: getMasteryColor(topic.difficulty) }}
                  aria-label={`Difficulty: ${topic.difficulty}`}
                >
                  {topic.difficulty}
                </span>
              </div>
            </div>
            
            <ProgressBar 
              percentage={topic.progress}
              height={8}
              className="topic-progress__bar"
              aria-label={`Progress bar for ${topicDisplayNames[topic.topicId] || topic.topicId}`}
            />
            
            <div className="topic-progress__meta">
              <span className="topic-progress__time">
                Time spent: {Math.round(topic.timeSpent || 0)}m
              </span>
              <span className="topic-progress__last-accessed">
                Last accessed: {new Date(topic.lastAccessed).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
        
        {topics.length === 0 && (
          <div className="topic-progress__empty" role="status">
            <p>No topics started yet. Begin your ML journey by starting a chat!</p>
          </div>
        )}
      </div>
    </div>
  );
};