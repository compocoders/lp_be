import { ApiError } from '../utils/ApiError.js';

export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      next(new ApiError(400, error.errors?.[0]?.message || 'Validation Error'));
    }
  };
};
