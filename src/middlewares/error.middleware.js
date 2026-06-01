import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import multer from 'multer';

export const errorHandler = (err, req, res, next) => {
  console.error('[Global Error Handler]:', err);
  let { statusCode, message } = err;
  
  if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = `Upload Error: ${err.message}`;
  } else if (!(err instanceof ApiError)) {
    statusCode = statusCode || 500;
    message = message || 'Internal Server Error';
  }

  res.locals.errorMessage = err.message;

  const response = {
    code: statusCode,
    message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  res.status(statusCode).send(response);
};
