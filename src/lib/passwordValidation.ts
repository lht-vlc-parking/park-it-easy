import { z } from 'zod';

/**
 * Password validation schemas — single source of truth for the entire app.
 *
 * signupPasswordSchema: Used for signup and password-change flows.
 * Enforces 12+ chars with uppercase, lowercase, and digit.
 *
 * loginPasswordSchema: Used for login flows only.
 * Only requires non-empty — existing users may have weaker legacy passwords.
 */

export const signupPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(72, 'Password must be less than 72 characters')
  .refine(pw => /[A-Z]/.test(pw), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine(pw => /[a-z]/.test(pw), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine(pw => /\d/.test(pw), {
    message: 'Password must contain at least one digit',
  });

export const loginPasswordSchema = z.string().min(1, 'Password is required');

/**
 * Returns an array of human-readable error messages for a password
 * against the signup schema. Useful for inline form validation.
 */
export function getPasswordErrors(password: string): string[] {
  const result = signupPasswordSchema.safeParse(password);
  if (result.success) return [];
  return result.error.issues.map(issue => issue.message);
}
