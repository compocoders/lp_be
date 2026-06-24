import { ApiError } from '../utils/ApiError.js';

export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      const validatedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (validatedData.body) req.body = validatedData.body;
      if (validatedData.query) req.query = validatedData.query;
      if (validatedData.params) req.params = validatedData.params;
      next();
    } catch (error) {
      console.error('Validation Error Details:', error);
      if (error.errors) {
        console.error('Zod Issues:', JSON.stringify(error.errors, null, 2));
      }
      next(new ApiError(400, error.errors?.[0]?.message || error.message || 'Validation Error'));
    }
  };
};
