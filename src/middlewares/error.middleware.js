import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;
  
  if (!(err instanceof ApiError)) {
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
