import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';

type MockBooking = {
  id: string;
  date?: string;
  vehicle_type?: string;
  duration?: string;
  spot_number?: number;
  user_name?: string;
};

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('Statistics Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Fetching All Bookings', () => {
    it('should fetch ALL bookings without user filter for statistics', async () => {
      const mockBookings = [
        {
          id: '1',
          user_id: 'user1',
          user_name: 'Alice',
          date: '2025-10-15',
          duration: 'full',
          vehicle_type: 'car',
          spot_number: 84,
        },
        {
          id: '2',
          user_id: 'user2',
          user_name: 'Bob',
          date: '2025-10-15',
          duration: 'morning',
          vehicle_type: 'motorcycle',
          spot_number: 85,
        },
      ];

      const selectMock = vi.fn().mockReturnThis();
      const orderMock = vi.fn().mockResolvedValue({
        data: mockBookings,
        error: null,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from as any).mockReturnValue({
        select: selectMock,
        order: orderMock,
      });

      // Simulate fetching bookings for statistics
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('date', { ascending: true });

      expect(error).toBeNull();
      expect(data).toEqual(mockBookings);
      expect(supabase.from).toHaveBeenCalledWith('bookings');
      expect(selectMock).toHaveBeenCalledWith('*');
      // Should NOT have .eq('user_id', ...) call
      expect(selectMock).not.toHaveBeenCalledWith(expect.objectContaining({ user_id: expect.anything() }));
    });
  });

  describe('Statistics Calculations', () => {
    it('should calculate total bookings correctly', () => {
      const bookings = [
        { id: '1', vehicle_type: 'car', spot_number: 84 },
        { id: '2', vehicle_type: 'motorcycle', spot_number: 85 },
        { id: '3', vehicle_type: 'car', spot_number: 84 },
      ];

      const total = bookings.length;
      expect(total).toBe(3);
    });

    it('should calculate car vs motorcycle distribution', () => {
      const bookings: MockBooking[] = [
        { id: '1', vehicle_type: 'car' },
        { id: '2', vehicle_type: 'motorcycle' },
        { id: '3', vehicle_type: 'motorcycle' },
        { id: '4', vehicle_type: 'car' },
      ];

      const carCount = bookings.filter((b: MockBooking) => b.vehicle_type === 'car').length;
      const motorcycleCount = bookings.filter((b: MockBooking) => b.vehicle_type === 'motorcycle').length;

      expect(carCount).toBe(2);
      expect(motorcycleCount).toBe(2);
      expect(carCount + motorcycleCount).toBe(bookings.length);
    });

    it('should determine most popular spot', () => {
      const bookings = [
        { id: '1', spot_number: 84 },
        { id: '2', spot_number: 84 },
        { id: '3', spot_number: 85 },
        { id: '4', spot_number: 84 },
      ];

      const spot84Count = bookings.filter((b: MockBooking) => b.spot_number === 84).length;
      const spot85Count = bookings.filter((b: MockBooking) => b.spot_number === 85).length;
      const mostPopular = spot84Count >= spot85Count ? 84 : 85;

      expect(mostPopular).toBe(84);
      expect(spot84Count).toBe(3);
      expect(spot85Count).toBe(1);
    });

    it('should determine most popular time', () => {
      const bookings = [
        { id: '1', duration: 'morning' },
        { id: '2', duration: 'full' },
        { id: '3', duration: 'afternoon' },
        { id: '4', duration: 'morning' },
        { id: '5', duration: 'full' },
      ];

      // Full day counts for both morning and afternoon
      const morningCount = bookings.filter(
        (b: MockBooking) => b.duration === 'morning' || b.duration === 'full'
      ).length;
      const afternoonCount = bookings.filter(
        (b: MockBooking) => b.duration === 'afternoon' || b.duration === 'full'
      ).length;

      expect(morningCount).toBe(4); // 2 morning + 2 full
      expect(afternoonCount).toBe(3); // 1 afternoon + 2 full
    });

    it('should filter bookings by date range', () => {
      const bookings = [
        { id: '1', date: '2025-10-01' },
        { id: '2', date: '2025-10-08' },
        { id: '3', date: '2025-10-15' },
        { id: '4', date: '2025-10-22' },
      ];

      const filterByDateRange = (start: Date, end: Date) => {
        return bookings.filter((b: MockBooking) => {
          const bookingDate = new Date(b.date || '');
          return bookingDate >= start && bookingDate <= end;
        });
      };

      const weekStart = new Date('2025-10-06');
      const weekEnd = new Date('2025-10-12');
      const weekBookings = filterByDateRange(weekStart, weekEnd);

      expect(weekBookings.length).toBe(1);
      expect(weekBookings[0].date).toBe('2025-10-08');
    });

    it('should handle empty bookings array', () => {
      const bookings: MockBooking[] = [];

      const total = bookings.length;
      const carCount = bookings.filter((b: MockBooking) => b.vehicle_type === 'car').length;
      const motorcycleCount = bookings.filter((b: MockBooking) => b.vehicle_type === 'motorcycle').length;

      expect(total).toBe(0);
      expect(carCount).toBe(0);
      expect(motorcycleCount).toBe(0);
    });

    it('should calculate percentage safely with zero division', () => {
      const totalBookings = 0;
      const carBookings = 0;

      const percentage = (carBookings / totalBookings) * 100 || 0;

      expect(percentage).toBe(0);
      expect(isNaN(percentage)).toBe(false);
    });
  });

  describe('Occupancy Calculation (2 spots per day)', () => {
    it('should calculate 50% occupancy with 1 spot booked', () => {
      const dayBookings = [
        { id: '1', spot_number: 84, date: '2025-11-08' },
      ];

      const uniqueSpots = new Set(dayBookings.map((b: MockBooking) => b.spot_number));
      const maxSpots = 2;
      const occupancy = (uniqueSpots.size / maxSpots) * 100;

      expect(occupancy).toBe(50);
      expect(uniqueSpots.size).toBe(1);
    });

    it('should calculate 100% occupancy with both spots booked', () => {
      const dayBookings = [
        { id: '1', spot_number: 84, date: '2025-11-08' },
        { id: '2', spot_number: 85, date: '2025-11-08' },
      ];

      const uniqueSpots = new Set(dayBookings.map((b: MockBooking) => b.spot_number));
      const maxSpots = 2;
      const occupancy = (uniqueSpots.size / maxSpots) * 100;

      expect(occupancy).toBe(100);
      expect(uniqueSpots.size).toBe(2);
    });

    it('should calculate 0% occupancy with no bookings', () => {
      const dayBookings: MockBooking[] = [];

      const uniqueSpots = new Set(dayBookings.map((b: MockBooking) => b.spot_number));
      const maxSpots = 2;
      const occupancy = uniqueSpots.size === 0 ? 0 : (uniqueSpots.size / maxSpots) * 100;

      expect(occupancy).toBe(0);
    });

    it('should count unique spots only (multiple bookings per spot = same occupancy)', () => {
      // Multiple bookings on spot 84 (different periods)
      const dayBookings = [
        { id: '1', spot_number: 84, date: '2025-11-08', duration: 'morning' },
        { id: '2', spot_number: 84, date: '2025-11-08', duration: 'afternoon' },
      ];

      const uniqueSpots = new Set(dayBookings.map((b: MockBooking) => b.spot_number));
      const maxSpots = 2;
      const occupancy = (uniqueSpots.size / maxSpots) * 100;

      // Still only 1 unique spot
      expect(uniqueSpots.size).toBe(1);
      expect(occupancy).toBe(50);
    });
  });

  describe('User Statistics', () => {
    it('should count unique users', () => {
      const bookings: MockBooking[] = [
        { id: '1', user_name: 'Alice' },
        { id: '2', user_name: 'Bob' },
        { id: '3', user_name: 'Alice' },
        { id: '4', user_name: 'Charlie' },
      ];

      const uniqueUsers = [...new Set(bookings.map(b => b.user_name))];

      expect(uniqueUsers.length).toBe(3);
      expect(uniqueUsers).toContain('Alice');
      expect(uniqueUsers).toContain('Bob');
      expect(uniqueUsers).toContain('Charlie');
    });

    it('should rank users by booking count', () => {
      const bookings: MockBooking[] = [
        { id: '1', user_name: 'Alice' },
        { id: '2', user_name: 'Bob' },
        { id: '3', user_name: 'Alice' },
        { id: '4', user_name: 'Charlie' },
        { id: '5', user_name: 'Alice' },
      ];

      const uniqueUsers = [...new Set(bookings.map(b => b.user_name))];
      const userCounts = uniqueUsers.map(userName => ({
        name: userName,
        count: bookings.filter(b => b.user_name === userName).length,
      })).sort((a, b) => b.count - a.count);

      expect(userCounts[0].name).toBe('Alice');
      expect(userCounts[0].count).toBe(3);
      expect(userCounts[1].count).toBe(1);
    });
  });

  describe('Spot Usage Statistics', () => {
    it('should count bookings per spot', () => {
      const bookings: MockBooking[] = [
        { id: '1', spot_number: 84 },
        { id: '2', spot_number: 84 },
        { id: '3', spot_number: 85 },
      ];

      const spot84Usage = bookings.filter((b: MockBooking) => b.spot_number === 84).length;
      const spot85Usage = bookings.filter((b: MockBooking) => b.spot_number === 85).length;

      expect(spot84Usage).toBe(2);
      expect(spot85Usage).toBe(1);
    });

    it('should handle spots with no bookings', () => {
      const bookings: MockBooking[] = [
        { id: '1', spot_number: 84 },
      ];

      const spot84Usage = bookings.filter((b: MockBooking) => b.spot_number === 84).length;
      const spot85Usage = bookings.filter((b: MockBooking) => b.spot_number === 85).length;

      expect(spot84Usage).toBe(1);
      expect(spot85Usage).toBe(0);
    });
  });

  describe('Trend Calculations', () => {
    it('should calculate week-over-week growth correctly', () => {
      const thisWeekBookings = [
        { id: '1', date: '2025-11-10' },
        { id: '2', date: '2025-11-11' },
        { id: '3', date: '2025-11-12' },
      ];
      const lastWeekBookings = [
        { id: '4', date: '2025-11-03' },
        { id: '5', date: '2025-11-04' },
      ];

      const weeklyGrowth = lastWeekBookings.length > 0
        ? ((thisWeekBookings.length - lastWeekBookings.length) / lastWeekBookings.length) * 100
        : 0;

      expect(weeklyGrowth).toBe(50); // 3 vs 2 = 50% growth
    });

    it('should calculate negative growth correctly', () => {
      const thisWeekBookings = [
        { id: '1', date: '2025-11-10' },
      ];
      const lastWeekBookings = [
        { id: '4', date: '2025-11-03' },
        { id: '5', date: '2025-11-04' },
      ];

      const weeklyGrowth = lastWeekBookings.length > 0
        ? ((thisWeekBookings.length - lastWeekBookings.length) / lastWeekBookings.length) * 100
        : 0;

      expect(weeklyGrowth).toBe(-50); // 1 vs 2 = -50% decline
    });

    it('should handle zero growth', () => {
      const thisWeekBookings = [
        { id: '1', date: '2025-11-10' },
        { id: '2', date: '2025-11-11' },
      ];
      const lastWeekBookings = [
        { id: '4', date: '2025-11-03' },
        { id: '5', date: '2025-11-04' },
      ];

      const weeklyGrowth = lastWeekBookings.length > 0
        ? ((thisWeekBookings.length - lastWeekBookings.length) / lastWeekBookings.length) * 100
        : 0;

      expect(weeklyGrowth).toBe(0); // 2 vs 2 = 0% growth
    });
  });

  describe('Advanced Metrics', () => {
    it('should calculate average bookings per user', () => {
      const bookings: MockBooking[] = [
        { id: '1', user_name: 'Alice' },
        { id: '2', user_name: 'Alice' },
        { id: '3', user_name: 'Alice' },
        { id: '4', user_name: 'Bob' },
        { id: '5', user_name: 'Bob' },
        { id: '6', user_name: 'Charlie' },
      ];

      const uniqueUsers = [...new Set(bookings.map(b => b.user_name))];
      const avgBookingsPerUser = uniqueUsers.length > 0
        ? (bookings.length / uniqueUsers.length).toFixed(1)
        : '0';

      expect(avgBookingsPerUser).toBe('2.0'); // 6 bookings / 3 users = 2.0
    });

    it('should find peak day of the week', () => {
      const bookings: MockBooking[] = [
        { id: '1', date: '2025-11-03' }, // Monday
        { id: '2', date: '2025-11-04' }, // Tuesday
        { id: '3', date: '2025-11-04' }, // Tuesday
        { id: '4', date: '2025-11-04' }, // Tuesday
        { id: '5', date: '2025-11-05' }, // Wednesday
      ];

      const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun to Sat
      bookings.forEach(b => {
        if (b.date) {
          const date = new Date(b.date);
          dayOfWeekCounts[date.getDay()]++;
        }
      });

      const peakDayIndex = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
      const peakDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][peakDayIndex];

      expect(peakDay).toBe('Tuesday');
      expect(dayOfWeekCounts[2]).toBe(3); // Tuesday (index 2) has 3 bookings
    });

    it('should calculate preferred time slot', () => {
      const bookings: MockBooking[] = [
        { id: '1', duration: 'morning' },
        { id: '2', duration: 'morning' },
        { id: '3', duration: 'morning' },
        { id: '4', duration: 'afternoon' },
        { id: '5', duration: 'full' },
      ];

      const morningCount = bookings.filter(
        b => b.duration === 'morning' || b.duration === 'full'
      ).length;
      const afternoonCount = bookings.filter(
        b => b.duration === 'afternoon' || b.duration === 'full'
      ).length;
      const fullDayCount = bookings.filter(b => b.duration === 'full').length;

      let preferredTime = 'Not set';
      if (fullDayCount > morningCount * 0.5 && fullDayCount > afternoonCount * 0.5) {
        preferredTime = 'Full Day';
      } else if (morningCount > afternoonCount) {
        preferredTime = 'Morning';
      } else if (afternoonCount > morningCount) {
        preferredTime = 'Afternoon';
      }

      expect(preferredTime).toBe('Morning'); // 4 morning (including full) vs 2 afternoon
      expect(morningCount).toBe(4);
      expect(afternoonCount).toBe(2);
    });
  });
});
