import { 
  User, 
  UserPreferences, 
  CreateUserRequest, 
  LoginRequest
} from '../types/user.js';
import {
  LearningSession,
  Message,
  MessageMetadata
} from '../types/session.js';
import {
  StudentProgress,
  TopicProgress,
  AssessmentResult
} from '../types/progress.js';
import {
  AgentState,
  AgentMessage,
  CoordinationRequest
} from '../types/agent.js';

// Validation result type
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Input sanitization
export const sanitizeString = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['"]/g, '') // Remove quotes to prevent injection
    .substring(0, 1000); // Limit length
};

export const sanitizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};

// User validation functions
export const validateUser = (user: Partial<User>): ValidationResult => {
  const errors: string[] = [];

  if (!user.id || typeof user.id !== 'string' || user.id.length === 0) {
    errors.push('User ID is required and must be a non-empty string');
  }

  if (!user.username || typeof user.username !== 'string' || user.username.length < 3) {
    errors.push('Username is required and must be at least 3 characters');
  }

  if (!user.email || typeof user.email !== 'string' || !EMAIL_REGEX.test(user.email)) {
    errors.push('Valid email address is required');
  }

  if (!user.grade || (user.grade !== 9 && user.grade !== 10)) {
    errors.push('Grade must be 9 or 10');
  }

  if (user.preferences && !validateUserPreferences(user.preferences).isValid) {
    errors.push('Invalid user preferences');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateUserPreferences = (preferences: Partial<UserPreferences>): ValidationResult => {
  const errors: string[] = [];

  if (preferences.learningPace && !['slow', 'medium', 'fast'].includes(preferences.learningPace)) {
    errors.push('Learning pace must be slow, medium, or fast');
  }

  if (preferences.preferredExamples && !Array.isArray(preferences.preferredExamples)) {
    errors.push('Preferred examples must be an array');
  }

  if (preferences.difficultyLevel !== undefined && 
      (typeof preferences.difficultyLevel !== 'number' || 
       preferences.difficultyLevel < 1 || 
       preferences.difficultyLevel > 10)) {
    errors.push('Difficulty level must be a number between 1 and 10');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateCreateUserRequest = (request: Partial<CreateUserRequest>): ValidationResult => {
  const errors: string[] = [];

  if (!request.username || typeof request.username !== 'string' || request.username.length < 3) {
    errors.push('Username is required and must be at least 3 characters');
  }

  if (!request.email || typeof request.email !== 'string' || !EMAIL_REGEX.test(request.email)) {
    errors.push('Valid email address is required');
  }

  if (!request.password || typeof request.password !== 'string' || request.password.length < 8) {
    errors.push('Password is required and must be at least 8 characters');
  }

  if (!request.grade || (request.grade !== 9 && request.grade !== 10)) {
    errors.push('Grade must be 9 or 10');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateLoginRequest = (request: Partial<LoginRequest>): ValidationResult => {
  const errors: string[] = [];

  if (!request.email || typeof request.email !== 'string' || !EMAIL_REGEX.test(request.email)) {
    errors.push('Valid email address is required');
  }

  if (!request.password || typeof request.password !== 'string' || request.password.length === 0) {
    errors.push('Password is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Session validation functions
export const validateLearningSession = (session: Partial<LearningSession>): ValidationResult => {
  const errors: string[] = [];

  if (!session.id || typeof session.id !== 'string') {
    errors.push('Session ID is required');
  }

  if (!session.userId || typeof session.userId !== 'string') {
    errors.push('User ID is required');
  }

  if (!session.startTime || !(session.startTime instanceof Date)) {
    errors.push('Start time is required and must be a valid Date');
  }

  if (session.endTime && !(session.endTime instanceof Date)) {
    errors.push('End time must be a valid Date if provided');
  }

  if (!session.currentTopic || typeof session.currentTopic !== 'string') {
    errors.push('Current topic is required');
  }

  if (!session.conversationHistory || !Array.isArray(session.conversationHistory)) {
    errors.push('Conversation history must be an array');
  }

  if (!session.agentStates || !Array.isArray(session.agentStates)) {
    errors.push('Agent states must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateMessage = (message: Partial<Message>): ValidationResult => {
  const errors: string[] = [];

  if (!message.id || typeof message.id !== 'string') {
    errors.push('Message ID is required');
  }

  if (!message.sender || !['student', 'tutor', 'assessment', 'content', 'coordinator'].includes(message.sender)) {
    errors.push('Valid sender is required');
  }

  if (!message.content || typeof message.content !== 'string' || message.content.trim().length === 0) {
    errors.push('Message content is required and cannot be empty');
  }

  if (!message.timestamp || !(message.timestamp instanceof Date)) {
    errors.push('Timestamp is required and must be a valid Date');
  }

  if (message.metadata && !validateMessageMetadata(message.metadata).isValid) {
    errors.push('Invalid message metadata');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateMessageMetadata = (metadata: Partial<MessageMetadata>): ValidationResult => {
  const errors: string[] = [];

  if (!metadata.messageType || !['explanation', 'question', 'assessment', 'feedback', 'system'].includes(metadata.messageType)) {
    errors.push('Valid message type is required');
  }

  if (metadata.difficulty !== undefined && 
      (typeof metadata.difficulty !== 'number' || 
       metadata.difficulty < 1 || 
       metadata.difficulty > 10)) {
    errors.push('Difficulty must be a number between 1 and 10');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Progress validation functions
export const validateStudentProgress = (progress: Partial<StudentProgress>): ValidationResult => {
  const errors: string[] = [];

  if (!progress.userId || typeof progress.userId !== 'string') {
    errors.push('User ID is required');
  }

  if (!progress.topicsCompleted || !Array.isArray(progress.topicsCompleted)) {
    errors.push('Topics completed must be an array');
  }

  if (typeof progress.currentLevel !== 'number' || progress.currentLevel < 1) {
    errors.push('Current level must be a positive number');
  }

  if (typeof progress.totalTimeSpent !== 'number' || progress.totalTimeSpent < 0) {
    errors.push('Total time spent must be a non-negative number');
  }

  if (!progress.assessmentScores || !Array.isArray(progress.assessmentScores)) {
    errors.push('Assessment scores must be an array');
  }

  if (!progress.learningPath || !Array.isArray(progress.learningPath)) {
    errors.push('Learning path must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateTopicProgress = (topicProgress: Partial<TopicProgress>): ValidationResult => {
  const errors: string[] = [];

  if (!topicProgress.topicId || typeof topicProgress.topicId !== 'string') {
    errors.push('Topic ID is required');
  }

  if (!topicProgress.topicName || typeof topicProgress.topicName !== 'string') {
    errors.push('Topic name is required');
  }

  if (typeof topicProgress.completionPercentage !== 'number' || 
      topicProgress.completionPercentage < 0 || 
      topicProgress.completionPercentage > 100) {
    errors.push('Completion percentage must be between 0 and 100');
  }

  if (!topicProgress.masteryLevel || 
      !['beginner', 'intermediate', 'advanced'].includes(topicProgress.masteryLevel)) {
    errors.push('Valid mastery level is required');
  }

  if (typeof topicProgress.timeSpent !== 'number' || topicProgress.timeSpent < 0) {
    errors.push('Time spent must be a non-negative number');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Agent validation functions
export const validateAgentState = (agentState: Partial<AgentState>): ValidationResult => {
  const errors: string[] = [];

  if (!agentState.agentId || typeof agentState.agentId !== 'string') {
    errors.push('Agent ID is required');
  }

  if (!agentState.agentType || 
      !['coordinator', 'tutor', 'assessment', 'content'].includes(agentState.agentType)) {
    errors.push('Valid agent type is required');
  }

  if (!agentState.sessionId || typeof agentState.sessionId !== 'string') {
    errors.push('Session ID is required');
  }

  if (!agentState.status || 
      !['active', 'idle', 'error', 'busy'].includes(agentState.status)) {
    errors.push('Valid status is required');
  }

  if (!agentState.capabilities || !Array.isArray(agentState.capabilities)) {
    errors.push('Capabilities must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateCoordinationRequest = (request: Partial<CoordinationRequest>): ValidationResult => {
  const errors: string[] = [];

  if (!request.sessionId || typeof request.sessionId !== 'string') {
    errors.push('Session ID is required');
  }

  if (!request.studentMessage || typeof request.studentMessage !== 'string' || request.studentMessage.trim().length === 0) {
    errors.push('Student message is required and cannot be empty');
  }

  if (!request.currentContext || typeof request.currentContext !== 'object') {
    errors.push('Current context is required and must be an object');
  }

  if (!request.priority || !['low', 'medium', 'high'].includes(request.priority)) {
    errors.push('Valid priority is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};