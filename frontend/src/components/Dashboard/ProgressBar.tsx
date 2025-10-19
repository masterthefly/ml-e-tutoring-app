import React from 'react';

interface ProgressBarProps {
  percentage: number;
  height?: number;
  className?: string;
  'aria-label'?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percentage,
  height = 6,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const clampedPercentage = Math.max(0, Math.min(100, percentage));
  
  return (
    <div 
      className={`progress-bar ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(clampedPercentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel || `Progress: ${Math.round(clampedPercentage)}%`}
      style={{ height: `${height}px` }}
    >
      <div 
        className="progress-bar__fill"
        style={{ 
          width: `${clampedPercentage}%`,
          backgroundColor: clampedPercentage === 100 ? 'var(--success-color)' : 'var(--primary-color)',
          transition: 'width 0.3s ease-in-out',
        }}
      />
    </div>
  );
};