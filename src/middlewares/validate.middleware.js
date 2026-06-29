/**
 * ─── Request Validation Middleware ───────────────────────────────────────────────────────────────────
 *
 * The `validate` factory creates an Express middleware that validates a request's
 * body, query string, and URL parameters against a Zod schema.
 *
 * Benefits:
 *  - Rejects malformed requests early (before they reach the controller)
 *  - Replaces raw req.body/query/params with the validated + transformed values
 *    (e.g., default values are applied, types are coerced)
 *  - Provides descriptive error messages to the client on validation failure
 *
 * Usage:
 *  @example
 *  import { z } from 'zod';
 *  const schema = z.object({ body: z.object({ name: z.string().min(1) }) });
 *  router.post('/example', validate(schema), controller.handle);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ApiError } from '../utils/ApiError.js';

/**
 * Creates a request validation middleware from a Zod schema.
 *
 * The schema should have `body`, `query`, and/or `params` as top-level keys.
 * Any key that exists in the validated result will REPLACE the corresponding
 * value on the request object, ensuring controllers always receive clean data.
 *
 * @param {import('zod').ZodSchema} schema — Zod schema to validate against
 * @returns {import('express').RequestHandler} Express middleware function
 */
export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      // Parse and validate all three parts of the request in one call
      const validatedData = await schema.parseAsync({
        body:   req.body,
        query:  req.query,
        params: req.params,
      });

      // Replace req fields with validated + transformed values (e.g., defaults applied)
      if (validatedData.body)   req.body   = validatedData.body;
      if (validatedData.query)  req.query  = validatedData.query;
      if (validatedData.params) req.params = validatedData.params;

      next();
    } catch (error) {
      // Log the raw Zod error for server-side debugging
      console.error('Validation Error Details:', error);
      if (error.errors) {
        console.error('Zod Issues:', JSON.stringify(error.errors, null, 2));
      }
      // Forward the first validation error message to the client as a 400
      next(new ApiError(400, error.errors?.[0]?.message || error.message || 'Validation Error'));
    }
  };
};
