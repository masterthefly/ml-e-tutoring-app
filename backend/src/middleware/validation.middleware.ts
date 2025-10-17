import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger.js';

/**
 * Middleware to validate request body against a Joi schema
 */
export function validateRequest(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Request validation failed:', { 
        path: req.path,
        errors: errorDetails 
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errorDetails
      });
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
}

/**
 * Middleware to validate query parameters against a Joi schema
 */
export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Query validation failed:', { 
        path: req.path,
        errors: errorDetails 
      });

      return res.status(400).json({
        error: 'Query validation failed',
        details: errorDetails
      });
    }

    // Replace req.query with validated and sanitized data
    req.query = value;
    next();
  };
}