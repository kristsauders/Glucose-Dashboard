import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', error);

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    error: error.message,
    ...(env.NODE_ENV === 'development' && { stack: error.stack }),
  });
}
