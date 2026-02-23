/**
 * Maps Supabase/PostgreSQL error codes and messages to user-friendly messages.
 * Raw error details are never shown to users -- they are logged internally only.
 */

const SUPABASE_ERROR_MAP: Record<string, string> = {
  // Auth errors
  invalid_credentials: 'Invalid email or password.',
  email_not_confirmed: 'Please confirm your email address before signing in.',
  user_already_exists: 'An account with this email already exists.',
  weak_password: 'Password does not meet the minimum requirements.',
  over_request_limit: 'Too many attempts. Please try again later.',
  user_not_found: 'Invalid email or password.',
  email_address_invalid: 'Please enter a valid email address.',
  // Database/RLS errors
  '23505': 'This booking conflicts with an existing one.', // unique_violation
  '23514': 'The booking data is invalid.', // check_violation
  '42501': 'You do not have permission to perform this action.', // insufficient_privilege
  PGRST301: 'You do not have permission to perform this action.',
};

const GENERIC_MESSAGES: Record<string, string> = {
  auth: 'Authentication failed. Please try again.',
  booking_create: 'Failed to create booking. Please try again.',
  booking_cancel: 'Failed to cancel booking. Please try again.',
  booking_fetch: 'Failed to load bookings. Please try again.',
  password_reset: 'Failed to process password reset. Please try again.',
  default: 'Something went wrong. Please try again.',
};

interface SupabaseError {
  message?: string;
  code?: string;
  status?: number;
}

/**
 * Returns a user-safe error message. Logs the raw error internally.
 * @param error - The raw error from Supabase
 * @param context - The operation context for fallback message
 */
export function getUserErrorMessage(
  error: SupabaseError | Error | unknown,
  context: keyof typeof GENERIC_MESSAGES = 'default'
): string {
  if (!error) return GENERIC_MESSAGES[context];

  const supaError = error as SupabaseError;

  // Try to match by error code first
  if (supaError.code && SUPABASE_ERROR_MAP[supaError.code]) {
    return SUPABASE_ERROR_MAP[supaError.code];
  }

  // Try to match by known message patterns
  if (supaError.message) {
    if (supaError.message.includes('already has a booking')) {
      return 'You already have a booking for this date.';
    }
    if (supaError.message.includes('car booking at that time')) {
      return 'This spot already has a car booked for that time slot.';
    }
    if (supaError.message.includes('Maximum 4 motorcycles')) {
      return 'This spot has reached the maximum number of motorcycles for that time slot.';
    }
    if (supaError.message.includes('restricted to @lht.dlh.de')) {
      return 'Registration is restricted to company email addresses.';
    }
  }

  // Fall back to context-specific generic message
  return GENERIC_MESSAGES[context] || GENERIC_MESSAGES.default;
}
