import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

// Types
export const durationSchema = z.enum(['morning', 'afternoon', 'full']);
export const vehicleTypeSchema = z.enum(['car', 'motorcycle']);

export type Duration = z.infer<typeof durationSchema>;
export type VehicleType = z.infer<typeof vehicleTypeSchema>;

export interface Booking {
  id: string;
  date: string;
  duration: Duration;
  vehicleType: VehicleType;
  userName: string;
  spotNumber: number;
}

export interface CreateBookingData {
  date: string;
  duration: Duration;
  vehicleType: VehicleType;
  spotNumber: number;
}

export interface BookingResult {
  success: boolean;
  error?: string;
  data?: Booking;
}

// Validation Schema for database response
const dbBookingSchema = z.object({
  id: z.string(),
  date: z.string(),
  duration: durationSchema,
  vehicle_type: vehicleTypeSchema,
  user_name: z.string(),
  spot_number: z.number(),
  user_id: z.string(),
  created_at: z.string().optional(),
});

/**
 * Booking Service
 * Handles all booking-related operations with proper validation
 */
export class BookingService {
  private static readonly MAX_MOTORCYCLES = 4;
  private static readonly VALID_SPOTS = [84, 85];

  /**
   * Check if two time durations overlap
   */
  private static overlaps(a: Duration, b: Duration): boolean {
    if (a === 'full' || b === 'full') return true;
    return a === b;
  }

  /**
   * Validate booking data before creation
   */
  private static async validateBooking(
    spotNumber: number,
    date: string,
    duration: Duration,
    vehicleType: VehicleType
  ): Promise<{ valid: boolean; error?: string }> {
    // Validate spot number
    if (!this.VALID_SPOTS.includes(spotNumber)) {
      return {
        valid: false,
        error: `Invalid spot number. Valid spots are: ${this.VALID_SPOTS.join(', ')}`,
      };
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return {
        valid: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
      };
    }

    // Check if date is in the past
    const bookingDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (bookingDate < today) {
      return {
        valid: false,
        error: 'Cannot book parking for past dates',
      };
    }

    // Fetch existing bookings for validation
    const { data: existingBookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('spot_number', spotNumber)
      .eq('date', date);

    if (error) {
      console.error('Error fetching bookings:', error);
      return {
        valid: false,
        error: 'Failed to validate booking. Please try again.',
      };
    }

    // Validate each booking from database
    const validatedBookings = existingBookings?.map(b => {
      try {
        return dbBookingSchema.parse(b);
      } catch (e) {
        console.error('Invalid booking data from database:', e);
        return null;
      }
    }).filter(Boolean) || [];

    // Check for car conflicts
    if (vehicleType === 'car') {
      const hasConflict = validatedBookings.some(b => 
        this.overlaps(duration, b.duration)
      );

      if (hasConflict) {
        return {
          valid: false,
          error: 'This spot already has a booking at that time',
        };
      }
    }

    // Check for motorcycle conflicts
    if (vehicleType === 'motorcycle') {
      const carConflict = validatedBookings.some(
        b => b.vehicle_type === 'car' && this.overlaps(duration, b.duration)
      );

      if (carConflict) {
        return {
          valid: false,
          error: 'A car is booked for that time on this spot',
        };
      }

      const motorcycleCount = validatedBookings.filter(
        b => b.vehicle_type === 'motorcycle' && this.overlaps(duration, b.duration)
      ).length;

      if (motorcycleCount >= this.MAX_MOTORCYCLES) {
        return {
          valid: false,
          error: `Maximum ${this.MAX_MOTORCYCLES} motorcycles allowed at the same time`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Create a new booking
   */
  static async createBooking(
    data: CreateBookingData,
    userId: string,
    userName: string
  ): Promise<BookingResult> {
    try {
      // Validate booking
      const validation = await this.validateBooking(
        data.spotNumber,
        data.date,
        data.duration,
        data.vehicleType
      );

      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Create booking
      const { data: newBooking, error } = await supabase
        .from('bookings')
        .insert({
          user_id: userId,
          user_name: userName,
          date: data.date,
          duration: data.duration,
          vehicle_type: data.vehicleType,
          spot_number: data.spotNumber,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating booking:', error);
        
        // Check for unique constraint violation
        if (error.code === '23505') {
          return {
            success: false,
            error: 'This booking already exists or conflicts with another booking',
          };
        }

        return {
          success: false,
          error: 'Failed to create booking. Please try again.',
        };
      }

      // Transform to our type
      const booking: Booking = {
        id: newBooking.id,
        date: newBooking.date,
        duration: newBooking.duration as Duration,
        vehicleType: newBooking.vehicle_type as VehicleType,
        userName: newBooking.user_name,
        spotNumber: newBooking.spot_number,
      };

      return {
        success: true,
        data: booking,
      };
    } catch (error) {
      console.error('Unexpected error creating booking:', error);
      return {
        success: false,
        error: 'An unexpected error occurred.',
      };
    }
  }

  /**
   * Get all bookings for a user
   */
  static async getUserBookings(userId: string): Promise<Booking[]> {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (error) {
        console.error('Error fetching bookings:', error);
        return [];
      }

      // Transform and validate
      return (data || [])
        .map(booking => {
          try {
            const validated = dbBookingSchema.parse(booking);
            return {
              id: validated.id,
              date: validated.date,
              duration: validated.duration,
              vehicleType: validated.vehicle_type,
              userName: validated.user_name,
              spotNumber: validated.spot_number,
            };
          } catch (e) {
            console.error('Invalid booking data:', e);
            return null;
          }
        })
        .filter((b): b is Booking => b !== null);
    } catch (error) {
      console.error('Unexpected error fetching bookings:', error);
      return [];
    }
  }

  /**
   * Cancel a booking
   */
  static async cancelBooking(bookingId: string): Promise<BookingResult> {
    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', bookingId);

      if (error) {
        console.error('Error cancelling booking:', error);
        return {
          success: false,
          error: 'Failed to cancel booking. Please try again.',
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Unexpected error cancelling booking:', error);
      return {
        success: false,
        error: 'An unexpected error occurred.',
      };
    }
  }

  /**
   * Get bookings for a specific spot and date range
   */
  static async getSpotBookings(
    spotNumber: number,
    startDate?: string,
    endDate?: string
  ): Promise<Booking[]> {
    try {
      let query = supabase
        .from('bookings')
        .select('*')
        .eq('spot_number', spotNumber);

      if (startDate) {
        query = query.gte('date', startDate);
      }

      if (endDate) {
        query = query.lte('date', endDate);
      }

      const { data, error } = await query.order('date', { ascending: true });

      if (error) {
        console.error('Error fetching spot bookings:', error);
        return [];
      }

      return (data || [])
        .map(booking => {
          try {
            const validated = dbBookingSchema.parse(booking);
            return {
              id: validated.id,
              date: validated.date,
              duration: validated.duration,
              vehicleType: validated.vehicle_type,
              userName: validated.user_name,
              spotNumber: validated.spot_number,
            };
          } catch (e) {
            console.error('Invalid booking data:', e);
            return null;
          }
        })
        .filter((b): b is Booking => b !== null);
    } catch (error) {
      console.error('Unexpected error fetching spot bookings:', error);
      return [];
    }
  }
}
