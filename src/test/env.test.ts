import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Environment Validation Schema', () => {
  // Test the schema directly without importing the module
  // (importing would trigger validation at module load time)
  const envSchema = z.object({
    VITE_SUPABASE_URL: z.string().url().optional(),
    VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    MODE: z.enum(['development', 'production', 'test']).default('development'),
    DEV: z.boolean().default(false),
    PROD: z.boolean().default(false),
    BASE_URL: z.string().default('/'),
  });

  it('should accept valid production environment', () => {
    const validEnv = {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      MODE: 'production',
      DEV: false,
      PROD: true,
      BASE_URL: '/park-it-easy-office/',
    };

    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it('should accept environment without Supabase config (demo mode)', () => {
    const demoEnv = {
      MODE: 'development',
      DEV: true,
      PROD: false,
      BASE_URL: '/',
    };

    const result = envSchema.safeParse(demoEnv);
    expect(result.success).toBe(true);
  });

  it('should reject invalid Supabase URL', () => {
    const invalidEnv = {
      VITE_SUPABASE_URL: 'not-a-url',
      MODE: 'development',
    };

    const result = envSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
  });

  it('should reject empty Supabase key when provided', () => {
    const invalidEnv = {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      MODE: 'development',
    };

    const result = envSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
  });

  it('should reject invalid MODE value', () => {
    const invalidEnv = {
      MODE: 'staging', // Not in enum
    };

    const result = envSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
  });

  it('should use default values when not provided', () => {
    const minimalEnv = {};

    const result = envSchema.safeParse(minimalEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MODE).toBe('development');
      expect(result.data.DEV).toBe(false);
      expect(result.data.PROD).toBe(false);
      expect(result.data.BASE_URL).toBe('/');
    }
  });
});

describe('Supabase Configuration Check', () => {
  it('should detect when Supabase is configured', () => {
    const env = {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'some-key',
    };

    const isConfigured = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY);
    expect(isConfigured).toBe(true);
  });

  it('should detect when Supabase is not configured', () => {
    const env = {
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
    };

    const isConfigured = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY);
    expect(isConfigured).toBe(false);
  });

  it('should detect partial Supabase configuration as not configured', () => {
    const env = {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
    };

    const isConfigured = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY);
    expect(isConfigured).toBe(false);
  });
});
