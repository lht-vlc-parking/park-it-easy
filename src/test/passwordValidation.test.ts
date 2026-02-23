import { describe, it, expect } from 'vitest';
import {
  signupPasswordSchema,
  loginPasswordSchema,
  getPasswordErrors,
} from '../lib/passwordValidation';

describe('signupPasswordSchema', () => {
  it('rejects passwords shorter than 12 characters', () => {
    const result = signupPasswordSchema.safeParse('Short1Aa');
    expect(result.success).toBe(false);
  });

  it('rejects passwords without uppercase letter', () => {
    const result = signupPasswordSchema.safeParse('alllowercase1');
    expect(result.success).toBe(false);
  });

  it('rejects passwords without lowercase letter', () => {
    const result = signupPasswordSchema.safeParse('ALLUPPERCASE1');
    expect(result.success).toBe(false);
  });

  it('rejects passwords without digit', () => {
    const result = signupPasswordSchema.safeParse('NoDigitsHereAbc');
    expect(result.success).toBe(false);
  });

  it('rejects passwords longer than 72 characters', () => {
    const result = signupPasswordSchema.safeParse('Aa1' + 'x'.repeat(70));
    expect(result.success).toBe(false);
  });

  it('accepts valid complex passwords', () => {
    const result = signupPasswordSchema.safeParse('SecurePass123');
    expect(result.success).toBe(true);
  });

  it('accepts passwords with special characters', () => {
    const result = signupPasswordSchema.safeParse('MyP@ssw0rd!!xx');
    expect(result.success).toBe(true);
  });
});

describe('loginPasswordSchema', () => {
  it('rejects empty passwords', () => {
    const result = loginPasswordSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('accepts short passwords (for legacy users)', () => {
    const result = loginPasswordSchema.safeParse('abc123');
    expect(result.success).toBe(true);
  });

  it('accepts any non-empty password', () => {
    const result = loginPasswordSchema.safeParse('x');
    expect(result.success).toBe(true);
  });
});

describe('getPasswordErrors', () => {
  it('returns all applicable error messages for a weak password', () => {
    const errors = getPasswordErrors('short');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('12'))).toBe(true);
    expect(errors.some(e => e.includes('uppercase'))).toBe(true);
    expect(errors.some(e => e.includes('digit'))).toBe(true);
  });

  it('returns empty array for valid password', () => {
    const errors = getPasswordErrors('SecurePass123');
    expect(errors).toEqual([]);
  });
});
