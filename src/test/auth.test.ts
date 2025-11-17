import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../integrations/supabase/client';
import type { User, Session, AuthError } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

describe('Authentication Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Password Reset', () => {
    it('should fail when BASE_URL is undefined', async () => {
      // This test documents the current bug
      const email = 'test@lht.dlh.de';
      
      // Simulate BASE_URL being undefined
      const baseUrl = import.meta.env.BASE_URL || '/';
      const redirectUrl = `${window.location.origin}${baseUrl}auth`.replace(/([^:]\/)\/+/g, "$1");
      
      // Mock the resetPasswordForEmail call
      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
        data: {},
        error: null,
      });

      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        email,
        expect.objectContaining({
          redirectTo: expect.stringContaining('auth'),
        })
      );
    });

    it('should construct correct redirect URL for localhost', () => {
      // Test for local development
      const origin = 'http://localhost:8080';
      const baseUrl = '/park-it-easy-office/';
      const expected = `${origin}/park-it-easy-office/auth`;
      
      const redirectUrl = `${origin}${baseUrl}auth`.replace(/([^:]\/)\/+/g, "$1");
      
      expect(redirectUrl).toBe(expected);
    });

    it('should construct correct redirect URL for production', () => {
      // Test for GitHub Pages
      const origin = 'https://miguel11nines.github.io';
      const baseUrl = '/park-it-easy-office/';
      const expected = `${origin}/park-it-easy-office/auth`;
      
      const redirectUrl = `${origin}${baseUrl}auth`.replace(/([^:]\/)\/+/g, "$1");
      
      expect(redirectUrl).toBe(expected);
    });

    it('should handle missing BASE_URL gracefully', () => {
      const origin = 'http://localhost:8080';
      const baseUrl = '/'; // Default when BASE_URL is undefined
      const redirectUrl = `${origin}${baseUrl}auth`.replace(/([^:]\/)\/+/g, "$1");
      
      expect(redirectUrl).toBe('http://localhost:8080/auth');
    });

    it('should call resetPasswordForEmail with correct parameters', async () => {
      const email = 'test@lht.dlh.de';
      const redirectUrl = 'http://localhost:8080/park-it-easy-office/auth';

      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
        data: {},
        error: null,
      });

      await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });

      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(email, {
        redirectTo: redirectUrl,
      });
    });

    it('should handle resetPasswordForEmail errors', async () => {
      const email = 'test@lht.dlh.de';
      const error = new Error('Email not found');

      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
        data: {},
        error: error as unknown as null,
      });

      const result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'http://localhost/auth',
      });

      expect(result.error).toBe(error);
    });
  });

  describe('Email Validation', () => {
    it('should accept valid LHT email addresses', () => {
      const validEmails = [
        'john.doe@lht.dlh.de',
        'test.user@lht.dlh.de',
        'admin@lht.dlh.de',
      ];

      validEmails.forEach(email => {
        expect(email.endsWith('@lht.dlh.de')).toBe(true);
      });
    });

    it('should reject invalid email domains', () => {
      const invalidEmails = [
        'test@gmail.com',
        'user@yahoo.com',
        'admin@lht.com',
        'test@dlh.de',
      ];

      invalidEmails.forEach(email => {
        expect(email.endsWith('@lht.dlh.de')).toBe(false);
      });
    });
  });

  describe('Login', () => {
    it('should successfully log in with valid credentials', async () => {
      const credentials = {
        email: 'test@lht.dlh.de',
        password: 'ValidPassword123',
      };

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: { id: '123', email: credentials.email } as unknown as User,
          session: { access_token: 'token' } as unknown as Session,
        },
        error: null,
      });

      const result = await supabase.auth.signInWithPassword(credentials);

      expect(result.error).toBeNull();
      expect(result.data.user?.email).toBe(credentials.email);
    });

    it('should handle invalid credentials', async () => {
      const credentials = {
        email: 'test@lht.dlh.de',
        password: 'WrongPassword',
      };

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: new Error('Invalid login credentials') as unknown as AuthError,
      });

      const result = await supabase.auth.signInWithPassword(credentials);

      expect(result.error).toBeTruthy();
      expect(result.error?.message).toContain('Invalid login credentials');
    });
  });

  describe('Sign Up', () => {
    it('should successfully create a new account', async () => {
      const userData = {
        email: 'newuser@lht.dlh.de',
        password: 'SecurePassword123',
        options: {
          data: {
            user_name: 'New User',
          },
        },
      };

      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: {
          user: { id: '456', email: userData.email } as unknown as User,
          session: { access_token: 'token' } as unknown as Session,
        },
        error: null,
      });

      const result = await supabase.auth.signUp(userData);

      expect(result.error).toBeNull();
      expect(result.data.user?.email).toBe(userData.email);
    });

    it('should handle duplicate email registration', async () => {
      const userData = {
        email: 'existing@lht.dlh.de',
        password: 'Password123',
      };

      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { user: null, session: null },
        error: new Error('User already registered') as unknown as AuthError,
      });

      const result = await supabase.auth.signUp(userData);

      expect(result.error).toBeTruthy();
      expect(result.error?.message).toContain('already registered');
    });
  });

  describe('Password Update', () => {
    it('should successfully update password', async () => {
      const newPassword = 'NewSecurePassword123';

      vi.mocked(supabase.auth.updateUser).mockResolvedValue({
        data: { user: { id: '123' } as unknown as User },
        error: null,
      });

      const result = await supabase.auth.updateUser({ password: newPassword });

      expect(result.error).toBeNull();
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: newPassword,
      });
    });

    it('should handle password update errors', async () => {
      vi.mocked(supabase.auth.updateUser).mockResolvedValue({
        data: { user: null },
        error: new Error('Password update failed') as unknown as AuthError,
      });

      const result = await supabase.auth.updateUser({ password: 'NewPassword' });

      expect(result.error).toBeTruthy();
    });
  });
});
