import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { StudentProgress, ProgressUpdate } from '../types/progress';

interface UseProgressReturn {
  progress: StudentProgress | null;
  isLoading: boolean;
  error: string | null;
  refreshProgress: () => void;
}

export const useProgress = (): UseProgressReturn => {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, emit, on, off } = useWebSocket();

  // Set up progress listeners
  useEffect(() => {
    const handleProgressUpdate = (data: StudentProgress) => {
      setProgress(data);
      setIsLoading(false);
      setError(null);
    };

    const handleProgressError = (errorData: { message: string }) => {
      setError(errorData.message);
      setIsLoading(false);
    };

    const handleProgressIncrement = (update: ProgressUpdate) => {
      setProgress(prev => {
        if (!prev) return prev;

        const updatedTopics = prev.topicsCompleted.map(topic => {
          if (topic.topicId === update.topicId) {
            return {
              ...topic,
              completionPercentage: Math.min(100, topic.completionPercentage + update.progressDelta),
              timeSpent: topic.timeSpent + update.timeSpent,
              masteryLevel: update.masteryLevel || topic.masteryLevel,
              lastAccessed: new Date().toISOString(),
            };
          }
          return topic;
        });

        // Add new topic if it doesn't exist
        const existingTopic = prev.topicsCompleted.find(t => t.topicId === update.topicId);
        if (!existingTopic) {
          updatedTopics.push({
            topicId: update.topicId,
            completionPercentage: Math.max(0, update.progressDelta),
            timeSpent: update.timeSpent,
            masteryLevel: update.masteryLevel || 'beginner',
            lastAccessed: new Date().toISOString(),
          });
        }

        return {
          ...prev,
          topicsCompleted: updatedTopics,
          totalTimeSpent: prev.totalTimeSpent + update.timeSpent,
        };
      });
    };

    if (isConnected) {
      on('progress-update', handleProgressUpdate);
      on('progress-error', handleProgressError);
      on('progress-increment', handleProgressIncrement);
    }

    return () => {
      if (isConnected) {
        off('progress-update', handleProgressUpdate);
        off('progress-error', handleProgressError);
        off('progress-increment', handleProgressIncrement);
      }
    };
  }, [isConnected, on, off]);

  // Request initial progress data when connected
  useEffect(() => {
    if (isConnected && !progress && isLoading) {
      emit('get-progress');
    }
  }, [isConnected, progress, isLoading, emit]);

  const refreshProgress = useCallback(() => {
    if (isConnected) {
      setIsLoading(true);
      setError(null);
      emit('get-progress');
    }
  }, [isConnected, emit]);

  return {
    progress,
    isLoading,
    error,
    refreshProgress,
  };
};