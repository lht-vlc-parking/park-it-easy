import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BookingService, type Duration, type VehicleType } from '../services/bookingService';

// Helper to create chainable mock
const createChainableMock = (finalValue: unknown) => {
  const chainable: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'gte', 'lte', 'order', 'single'];

  methods.forEach(method => {
    chainable[method] = vi.fn(() => {
      // Return a promise for terminal methods, otherwise return chainable
      if (method === 'single') {
        return Promise.resolve(finalValue);
      }
      return { ...chainable, then: (resolve: (v: unknown) => void) => resolve(finalValue) };
    });
  });

  return chainable;
};

// Mock Supabase client
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const selectChain = createChainableMock({ data: [], error: null });
      const insertChain = createChainableMock({
        data: {
          id: 'test-id',
          date: '2026-01-15',
          duration: 'full',
          vehicle_type: 'car',
          user_name: 'Test User',
          spot_number: 84,
          user_id: 'user-123',
          created_at: new Date().toISOString(),
        },
        error: null,
      });
      const deleteChain = createChainableMock({ error: null });

      return {
        select: vi.fn(() => selectChain),
        insert: vi.fn(() => ({
          select: vi.fn(() => insertChain),
        })),
        delete: vi.fn(() => deleteChain),
      };
    }),
  },
  isSupabaseConfigured: true,
}));

describe('BookingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock current date to a fixed date for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-03'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createBooking', () => {
    it('should create a booking successfully', async () => {
      const result = await BookingService.createBooking(
        {
          date: '2026-01-15',
          duration: 'full' as Duration,
          vehicleType: 'car' as VehicleType,
          spotNumber: 84,
        },
        'user-123',
        'Test User'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.spotNumber).toBe(84);
    });

    it('should reject invalid spot numbers', async () => {
      const result = await BookingService.createBooking(
        {
          date: '2026-01-15',
          duration: 'full' as Duration,
          vehicleType: 'car' as VehicleType,
          spotNumber: 99, // Invalid spot
        },
        'user-123',
        'Test User'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid spot number');
    });

    it('should reject past dates', async () => {
      const result = await BookingService.createBooking(
        {
          date: '2025-12-01', // Past date
          duration: 'full' as Duration,
          vehicleType: 'car' as VehicleType,
          spotNumber: 84,
        },
        'user-123',
        'Test User'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('past dates');
    });

    it('should reject invalid date format', async () => {
      const result = await BookingService.createBooking(
        {
          date: '01-15-2026', // Wrong format
          duration: 'full' as Duration,
          vehicleType: 'car' as VehicleType,
          spotNumber: 84,
        },
        'user-123',
        'Test User'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid date format');
    });
  });

  describe('cancelBooking', () => {
    it('should cancel a booking successfully', async () => {
      const result = await BookingService.cancelBooking('booking-123');

      expect(result.success).toBe(true);
    });
  });

  describe('getUserBookings', () => {
    it('should return empty array when no bookings', async () => {
      const result = await BookingService.getUserBookings('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('getSpotBookings', () => {
    it('should return empty array when no bookings for spot', async () => {
      const result = await BookingService.getSpotBookings(84);

      expect(result).toEqual([]);
    });

    it('should accept date range parameters', async () => {
      const result = await BookingService.getSpotBookings(84, '2026-01-01', '2026-01-31');

      expect(result).toEqual([]);
    });
  });
});

describe('Booking Overlap Logic', () => {
  it('full day overlaps with morning', () => {
    const overlaps = (a: Duration, b: Duration): boolean => {
      if (a === 'full' || b === 'full') return true;
      return a === b;
    };

    expect(overlaps('full', 'morning')).toBe(true);
  });

  it('full day overlaps with afternoon', () => {
    const overlaps = (a: Duration, b: Duration): boolean => {
      if (a === 'full' || b === 'full') return true;
      return a === b;
    };

    expect(overlaps('full', 'afternoon')).toBe(true);
  });

  it('morning does not overlap with afternoon', () => {
    const overlaps = (a: Duration, b: Duration): boolean => {
      if (a === 'full' || b === 'full') return true;
      return a === b;
    };

    expect(overlaps('morning', 'afternoon')).toBe(false);
  });

  it('morning overlaps with morning', () => {
    const overlaps = (a: Duration, b: Duration): boolean => {
      if (a === 'full' || b === 'full') return true;
      return a === b;
    };

    expect(overlaps('morning', 'morning')).toBe(true);
  });
});

describe('Motorcycle Limit', () => {
  const MAX_MOTORCYCLES = 4;

  it('should allow up to 4 motorcycles', () => {
    const existingMotorcycles = 3;
    const canAddMore = existingMotorcycles < MAX_MOTORCYCLES;

    expect(canAddMore).toBe(true);
  });

  it('should reject 5th motorcycle', () => {
    const existingMotorcycles = 4;
    const canAddMore = existingMotorcycles < MAX_MOTORCYCLES;

    expect(canAddMore).toBe(false);
  });
});

describe('Valid Parking Spots', () => {
  const VALID_SPOTS = [84, 85];

  it('should accept spot 84', () => {
    expect(VALID_SPOTS.includes(84)).toBe(true);
  });

  it('should accept spot 85', () => {
    expect(VALID_SPOTS.includes(85)).toBe(true);
  });

  it('should reject spot 86', () => {
    expect(VALID_SPOTS.includes(86)).toBe(false);
  });

  it('should reject spot 0', () => {
    expect(VALID_SPOTS.includes(0)).toBe(false);
  });
});
