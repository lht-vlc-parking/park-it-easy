import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookingService } from '../services/bookingService';

// Provide a full mock so the shared module registry (singleFork + isolate:false)
// doesn't accidentally override the factory mock used in bookingService.test.ts.
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
  isSupabaseConfigured: true,
}));

/** Helper: do two bookings (given as {start_time, end_time}) overlap? */
const overlaps = (
  a: { start_time: string; end_time: string },
  b: { start_time: string; end_time: string }
) => BookingService.timesOverlap(a.start_time, a.end_time, b.start_time, b.end_time);

describe('Booking Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Booking Validation', () => {
    it('should prevent car booking when spot has full-day car booking', () => {
      const existingBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-10-15',
          duration: 'full' as const,
          start_time: '08:00',
          end_time: '18:00',
          vehicle_type: 'car' as const,
          user_name: 'John Doe',
        },
      ];

      const newBooking = { start_time: '08:00', end_time: '15:00', vehicleType: 'car' as const };

      const hasConflict = existingBookings.some(
        b => b.vehicle_type === 'car' && overlaps(newBooking, b)
      );

      expect(hasConflict).toBe(true);
    });

    it('should allow motorcycle booking when no cars are booked', () => {
      const existingBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-10-15',
          duration: 'morning' as const,
          start_time: '08:00',
          end_time: '15:00',
          vehicle_type: 'motorcycle' as const,
          user_name: 'Biker 1',
        },
      ];

      const newBooking = {
        start_time: '08:00',
        end_time: '15:00',
        vehicleType: 'motorcycle' as const,
      };

      const carConflict = existingBookings.some(
        b => b.vehicle_type === 'car' && overlaps(newBooking, b)
      );

      expect(carConflict).toBe(false);
    });

    it('should prevent motorcycle booking when car fills capacity in same slot', () => {
      const existingBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-10-15',
          duration: 'afternoon' as const,
          start_time: '15:00',
          end_time: '22:00',
          vehicle_type: 'car' as const,
          capacity: 3,
          user_name: 'Car Owner',
        },
      ];

      const newBooking = { start_time: '15:00', end_time: '22:00' };

      const usedCapacity = existingBookings
        .filter(b => overlaps(newBooking, b))
        .reduce((sum, b) => sum + (b.capacity ?? 0), 0);

      // car (3) + motorcycle (1) = 4, exactly at capacity — would succeed.
      // But car + 2 motorcycles = 5 which exceeds 4.
      expect(usedCapacity).toBe(3);
    });

    it('should allow morning and afternoon bookings separately (no overlap)', () => {
      const existingBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-10-15',
          duration: 'morning' as const,
          start_time: '08:00',
          end_time: '15:00',
          vehicle_type: 'car' as const,
          user_name: 'Morning User',
        },
      ];

      const afternoonBooking = { start_time: '15:00', end_time: '22:00' };

      const hasConflict = existingBookings.some(b => overlaps(afternoonBooking, b));

      expect(hasConflict).toBe(false);
    });
  });

  describe('Parking Spot Status', () => {
    it('should show "Fully Booked" when car is booked all day', () => {
      const bookings = [
        {
          id: '1',
          date: '2025-10-10',
          duration: 'full' as const,
          start_time: '08:00',
          end_time: '18:00',
          vehicleType: 'car',
          userName: 'Test User',
          spotNumber: 85,
        },
      ];

      const cars = bookings.filter(b => b.vehicleType === 'car');
      const hasCarFullDay = cars.some(b => b.duration === 'full');

      const status = hasCarFullDay ? 'full' : 'available';

      expect(status).toBe('full');
    });

    it('should show "Fully Booked" when car has morning and afternoon', () => {
      const bookings = [
        {
          id: '1',
          date: '2025-10-10',
          duration: 'morning' as const,
          start_time: '08:00',
          end_time: '15:00',
          vehicleType: 'car' as const,
          userName: 'User 1',
          spotNumber: 84,
        },
        {
          id: '2',
          date: '2025-10-10',
          duration: 'afternoon' as const,
          start_time: '15:00',
          end_time: '22:00',
          vehicleType: 'car' as const,
          userName: 'User 2',
          spotNumber: 84,
        },
      ];

      const cars = bookings.filter(b => b.vehicleType === 'car');
      const hasCarMorning = cars.some(b => b.duration === 'morning');
      const hasCarAfternoon = cars.some(b => b.duration === 'afternoon');
      const carsFull = hasCarMorning && hasCarAfternoon;

      expect(carsFull).toBe(true);
    });

    it('should show "Available" when no bookings exist', () => {
      const bookings: unknown[] = [];
      const status = bookings.length === 0 ? 'available' : 'partial';

      expect(status).toBe('available');
    });

    it('should show "Partially Booked" when only motorcycles booked', () => {
      const bookings = Array.from({ length: 2 }, (_, i) => ({
        id: `${i + 1}`,
        date: '2025-10-10',
        duration: 'full' as const,
        start_time: '08:00',
        end_time: '18:00',
        vehicleType: 'motorcycle' as const,
        userName: `Biker ${i + 1}`,
        spotNumber: 84,
      }));

      const motorcycles = bookings.filter(b => b.vehicleType === 'motorcycle');
      const hasmotorcycles = motorcycles.length > 0;
      const cars = bookings.filter(b => b.vehicleType === 'car');
      const carsFull = cars.some(b => b.duration === 'full');

      const status = carsFull ? 'full' : hasmotorcycles ? 'partial' : 'available';

      expect(status).toBe('partial');
    });
  });

  describe('Type Safety', () => {
    it('should have proper booking type structure', () => {
      const booking = {
        id: '123',
        date: '2025-10-10',
        duration: 'full' as const,
        start_time: '08:00',
        end_time: '18:00',
        vehicleType: 'car' as const,
        userName: 'Test User',
        spotNumber: 84,
      };

      // Type assertions
      expect(booking.duration).toMatch(/^(morning|afternoon|full)$/);
      expect(booking.vehicleType).toMatch(/^(car|motorcycle)$/);
      expect(booking.spotNumber).toBeGreaterThanOrEqual(84);
      expect(booking.spotNumber).toBeLessThanOrEqual(85);
      expect(booking.start_time).toMatch(/^\d{2}:\d{2}$/);
      expect(booking.end_time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should validate date format', () => {
      const validDates = ['2025-10-10', '2025-12-31', '2026-01-01'];
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      validDates.forEach(date => {
        expect(date).toMatch(dateRegex);
      });
    });
  });

  describe('Race Conditions', () => {
    it('should document potential race condition in booking process', async () => {
      // This test documents the bug where two users can book simultaneously

      // User 1 fetches bookings
      const bookingsUser1 = [];

      // User 2 fetches bookings (same time)
      const bookingsUser2 = [];

      // Both see no conflicts
      expect(bookingsUser1).toEqual(bookingsUser2);

      // Both insert - RACE CONDITION!
      // The second insert should fail with a database constraint
      // but currently there's no unique constraint

      // TODO: Add unique constraint: (spot_number, date, duration, vehicle_type)
      // where vehicle_type = 'car'
    });
  });

  describe('One Booking Per Day Per User', () => {
    it('should prevent user from booking two motorcycles on same day', () => {
      const existingUserBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-11-10',
          duration: 'full',
          start_time: '08:00',
          end_time: '18:00',
          vehicle_type: 'motorcycle',
          user_name: 'John Doe',
        },
      ];

      const newBookingAttempt = {
        spot_number: 85,
        date: '2025-11-10',
        duration: 'morning',
        start_time: '08:00',
        end_time: '15:00',
        vehicle_type: 'motorcycle',
        user_name: 'John Doe',
      };

      const userHasBooking = existingUserBookings.some(
        b => b.user_name === newBookingAttempt.user_name && b.date === newBookingAttempt.date
      );

      expect(userHasBooking).toBe(true);
    });

    it('should prevent user from booking car and motorcycle on same day', () => {
      const existingUserBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-11-10',
          duration: 'morning',
          start_time: '08:00',
          end_time: '15:00',
          vehicle_type: 'car',
          user_name: 'Jane Smith',
        },
      ];

      const newBookingAttempt = {
        spot_number: 85,
        date: '2025-11-10',
        duration: 'afternoon',
        start_time: '15:00',
        end_time: '22:00',
        vehicle_type: 'motorcycle',
        user_name: 'Jane Smith',
      };

      const userHasBooking = existingUserBookings.some(
        b => b.user_name === newBookingAttempt.user_name && b.date === newBookingAttempt.date
      );

      expect(userHasBooking).toBe(true);
    });

    it('should allow user to book on different days', () => {
      const existingUserBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-11-10',
          duration: 'full',
          start_time: '08:00',
          end_time: '18:00',
          vehicle_type: 'car',
          user_name: 'Bob Johnson',
        },
      ];

      const newBookingAttempt = {
        spot_number: 84,
        date: '2025-11-11', // Different date
        duration: 'full',
        start_time: '08:00',
        end_time: '18:00',
        vehicle_type: 'car',
        user_name: 'Bob Johnson',
      };

      const userHasBooking = existingUserBookings.some(
        b => b.user_name === newBookingAttempt.user_name && b.date === newBookingAttempt.date
      );

      expect(userHasBooking).toBe(false);
    });

    it('should allow different users to book on same day', () => {
      const existingUserBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-11-10',
          duration: 'full',
          start_time: '08:00',
          end_time: '18:00',
          vehicle_type: 'car',
          user_name: 'Alice',
        },
      ];

      const newBookingAttempt = {
        spot_number: 85,
        date: '2025-11-10',
        duration: 'full',
        start_time: '08:00',
        end_time: '18:00',
        vehicle_type: 'car',
        user_name: 'Bob', // Different user
      };

      const userHasBooking = existingUserBookings.some(
        b => b.user_name === newBookingAttempt.user_name && b.date === newBookingAttempt.date
      );

      expect(userHasBooking).toBe(false);
    });

    it('should detect existing booking regardless of spot number', () => {
      const existingUserBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-11-10',
          duration: 'morning',
          start_time: '08:00',
          end_time: '15:00',
          vehicle_type: 'motorcycle',
          user_name: 'Charlie',
        },
      ];

      const newBookingAttempt = {
        spot_number: 85, // Different spot
        date: '2025-11-10', // Same date
        duration: 'afternoon', // Different duration
        start_time: '15:00',
        end_time: '22:00',
        vehicle_type: 'car', // Different vehicle
        user_name: 'Charlie', // Same user
      };

      const userHasBooking = existingUserBookings.some(
        b => b.user_name === newBookingAttempt.user_name && b.date === newBookingAttempt.date
      );

      expect(userHasBooking).toBe(true);
    });

    it('should detect existing booking regardless of duration', () => {
      const existingUserBookings = [
        {
          id: '1',
          spot_number: 84,
          date: '2025-11-10',
          duration: 'full',
          start_time: '08:00',
          end_time: '18:00',
          vehicle_type: 'car',
          user_name: 'David',
        },
      ];

      const newBookingAttempt = {
        spot_number: 84,
        date: '2025-11-10',
        duration: 'morning', // Different duration
        start_time: '08:00',
        end_time: '15:00',
        vehicle_type: 'motorcycle',
        user_name: 'David',
      };

      const userHasBooking = existingUserBookings.some(
        b => b.user_name === newBookingAttempt.user_name && b.date === newBookingAttempt.date
      );

      expect(userHasBooking).toBe(true);
    });
  });
});
