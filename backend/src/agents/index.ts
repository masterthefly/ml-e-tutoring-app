// Agent system exports
export { BaseAgent } from './base.agent.js';
export type { AgentMessage, AgentCapability, AgentConfig } from './base.agent.js';
export { MessageBus } from './message-bus.js';
export type { MessageRoute, MessageBusConfig } from './message-bus.js';
export { AgentRegistry } from './agent-registry.js';
export type { AgentRegistration, AgentDiscoveryQuery } from './agent-registry.js';
export { HealthMonitor } from './health-monitor.js';
export type { HealthMetrics, HealthMonitorConfig } from './health-monitor.js';
export { CoordinatorAgent } from './coordinator.agent.js';
export type { CoordinatorConfig, CoordinationRequest, CoordinationResponse } from './coordinator.agent.js';
export { SharedContextManager } from './shared-context.js';
export type { SharedContextData, ContextUpdate, ContextQuery } from './shared-context.js';
export { StateSynchronizer } from './state-sync.js';
export type { StateSyncConfig, StateConflict, SyncOperation } from './state-sync.js';
export { AgentSystem } from './agent-system.js';
export type { AgentSystemConfig } from './agent-system.js';

// Specialized AI Agents
export { TutorAgent, createTutorConfig } from './tutor.agent.js';
export type { TutorConfig, TutorRequest, TutorResponse, TutorContext } from './tutor.agent.js';
export { AssessmentAgent, createAssessmentConfig } from './assessment.agent.js';
export type { AssessmentConfig, AssessmentRequest, AssessmentResponse, Assessment, Question, EvaluationResult } from './assessment.agent.js';
export { ContentAgent, createContentConfig } from './content.agent.js';
export type { ContentConfig, ContentRequest, ContentResponse, GeneratedContent, Exercise, Example } from './content.agent.js';