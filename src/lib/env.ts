import { z } from 'zod';

/**
 * Environment variable validation schema
 * Validates all required and optional environment variables at runtime
 */
const envSchema = z.object({
  // Supabase configuration (optional - app can run in demo mode without it)
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a valid URL').optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'VITE_SUPABASE_PUBLISHABLE_KEY cannot be empty')
    .optional(),

  // App configuration
  MODE: z.enum(['development', 'production', 'test']).default('development'),
  DEV: z.boolean().default(false),
  PROD: z.boolean().default(false),
  BASE_URL: z.string().default('/'),
});

/**
 * Parsed and validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables and return typed result
 */
function validateEnv(): Env {
  const rawEnv = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    MODE: import.meta.env.MODE,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
    BASE_URL: import.meta.env.BASE_URL,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errors = result.error.errors
      .map(err => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');

    console.error('❌ Environment validation failed:\n' + errors);

    // In development, show detailed errors
    if (import.meta.env.DEV) {
      throw new Error(`Environment validation failed:\n${errors}`);
    }

    // In production, use defaults where possible
    return envSchema.parse({
      MODE: 'production',
      DEV: false,
      PROD: true,
      BASE_URL: '/',
    });
  }

  return result.data;
}

/**
 * Validated environment variables
 * Use this throughout the application instead of import.meta.env directly
 */
export const env = validateEnv();

/**
 * Check if Supabase is properly configured
 */
export const isSupabaseConfigured = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY);

/**
 * Log environment status in development
 */
if (env.DEV) {
  console.log('🔧 Environment:', {
    mode: env.MODE,
    supabaseConfigured: isSupabaseConfigured,
    baseUrl: env.BASE_URL,
  });
}
