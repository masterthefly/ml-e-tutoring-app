import React from 'react';
import { TopicProgress } from '../../types';
import './LearningPath.css';

interface LearningPathProps {
  currentPath: string[];
  completedTopics: TopicProgress[];
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

export const LearningPath: React.FC<LearningPathProps> = ({
  currentPath,
  completedTopics,
}) => {
  const getTopicStatus = (topicId: string, index: number) => {
    const topicProgress = completedTopics.find(t => t.topicId === topicId);
    
    if (topicProgress && topicProgress.progress >= 100) {
      return 'completed';
    }
    
    if (topicProgress && topicProgress.progress > 0) {
      return 'in-progress';
    }
    
    // Check if this is the next available topic
    const previousTopicsCompleted = currentPath
      .slice(0, index)
      .every(prevTopicId => {
        const prevProgress = completedTopics.find(t => t.topicId === prevTopicId);
        return prevProgress ? prevProgress.progress >= 100 : false;
      });
    
    if (previousTopicsCompleted) {
      return 'available';
    }
    
    return 'locked';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in-progress': return '🔄';
      case 'available': return '🎯';
      case 'locked': return '🔒';
      default: return '⏳';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'in-progress': return 'In Progress';
      case 'available': return 'Available';
      case 'locked': return 'Locked';
      default: return 'Unknown';
    }
  };

  return (
    <div className="learning-path" role="region" aria-label="Learning path visualization">
      <h3 className="learning-path__title">Your Learning Journey</h3>
      
      <div className="learning-path__container">
        <div className="learning-path__track" role="list" aria-label="Learning path steps">
          {currentPath.map((topicId, index) => {
            const status = getTopicStatus(topicId, index);
            const topicProgress = completedTopics.find(t => t.topicId === topicId);
            
            return (
              <div
                key={topicId}
                className={`learning-path__step learning-path__step--${status}`}
                role="listitem"
                aria-label={`${topicDisplayNames[topicId] || topicId}: ${getStatusLabel(status)}`}
              >
                <div className="learning-path__step-connector" aria-hidden="true" />
                
                <div className="learning-path__step-content">
                  <div className="learning-path__step-icon" aria-hidden="true">
                    {getStatusIcon(status)}
                  </div>
                  
                  <div className="learning-path__step-info">
                    <h4 className="learning-path__step-title">
                      {topicDisplayNames[topicId] || topicId}
                    </h4>
                    
                    <span className="learning-path__step-status">
                      {getStatusLabel(status)}
                      {topicProgress && topicProgress.progress > 0 && (
                        <span className="learning-path__step-percentage">
                          {' '}({topicProgress.progress}%)
                        </span>
                      )}
                    </span>
                    
                    {status === 'available' && (
                      <button 
                        className="learning-path__step-action"
                        aria-label={`Start learning ${topicDisplayNames[topicId] || topicId}`}
                      >
                        Start Topic
                      </button>
                    )}
                    
                    {status === 'in-progress' && (
                      <button 
                        className="learning-path__step-action learning-path__step-action--continue"
                        aria-label={`Continue learning ${topicDisplayNames[topicId] || topicId}`}
                      >
                        Continue
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {currentPath.length === 0 && (
          <div className="learning-path__empty" role="status">
            <p>Your personalized learning path will appear here once you start chatting with ML-E!</p>
          </div>
        )}
      </div>
    </div>
  );
};