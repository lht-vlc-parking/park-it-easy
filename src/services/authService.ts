import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

// Validation Schemas
export const emailSchema = z.string()
  .email("Please enter a valid email address")
  .max(255)
  .refine((email) => email.endsWith('@lht.dlh.de'), {
    message: 'Only @lht.dlh.de email addresses are allowed',
  });

export const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(72, "Password must be less than 72 characters");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be less than 100 characters");

// Types
export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignUpData extends AuthCredentials {
  name: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

// Helper function to construct redirect URL
export function getAuthRedirectUrl(path: string = 'auth'): string {
  const origin = window.location.origin;
  const baseUrl = import.meta.env.BASE_URL || '/';
  
  // Ensure base URL starts and ends correctly
  const normalizedBase = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  const pathWithSlash = path.startsWith('/') ? path : `/${path}`;
  
  // Construct URL and remove double slashes (except after protocol)
  const url = `${origin}${normalizedBase}${pathWithSlash}`;
  return url.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * Authentication Service
 * Handles all authentication-related operations with proper error handling
 */
export class AuthService {
  /**
   * Sign in with email and password
   */
  static async signIn(credentials: AuthCredentials): Promise<AuthResult> {
    try {
      // Validate inputs
      emailSchema.parse(credentials.email);
      passwordSchema.parse(credentials.password);

      const { error } = await supabase.auth.signInWithPassword(credentials);

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          return {
            success: false,
            error: "Invalid email or password. Please try again.",
          };
        }
        return {
          success: false,
          error: "An error occurred. Please try again later.",
        };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors[0].message,
        };
      }
      return {
        success: false,
        error: "An unexpected error occurred.",
      };
    }
  }

  /**
   * Sign up with email, password, and name
   */
  static async signUp(data: SignUpData): Promise<AuthResult> {
    try {
      // Validate inputs
      emailSchema.parse(data.email);
      passwordSchema.parse(data.password);
      nameSchema.parse(data.name);

      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            user_name: data.name,
          },
          emailRedirectTo: getAuthRedirectUrl(''),
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          return {
            success: false,
            error: "This email is already registered. Please log in instead.",
          };
        }
        return {
          success: false,
          error: "An error occurred. Please try again later.",
        };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors[0].message,
        };
      }
      return {
        success: false,
        error: "An unexpected error occurred.",
      };
    }
  }

  /**
   * Request password reset email
   */
  static async requestPasswordReset(email: string): Promise<AuthResult> {
    try {
      // Validate email
      emailSchema.parse(email);

      const redirectUrl = getAuthRedirectUrl('auth');

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.error('Password reset error:', error);
        return {
          success: false,
          error: "An error occurred. Please try again later.",
        };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors[0].message,
        };
      }
      console.error('Password reset unexpected error:', error);
      return {
        success: false,
        error: "An unexpected error occurred.",
      };
    }
  }

  /**
   * Update user password
   */
  static async updatePassword(newPassword: string): Promise<AuthResult> {
    try {
      // Validate password
      passwordSchema.parse(newPassword);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return {
          success: false,
          error: "An error occurred. Please try again.",
        };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors[0].message,
        };
      }
      return {
        success: false,
        error: "An unexpected error occurred.",
      };
    }
  }

  /**
   * Sign out the current user
   */
  static async signOut(): Promise<AuthResult> {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        return {
          success: false,
          error: "Failed to sign out.",
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: "An unexpected error occurred.",
      };
    }
  }
}
