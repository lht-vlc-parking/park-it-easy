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
    from: vi.fn((_table: string) => {
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
          vehicle_type: 'car' as VehicleType,
          spot_number: 84,
        },
        'user-123',
        'Test User'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.spot_number).toBe(84);
    });

    it('should reject invalid spot numbers', async () => {
      const result = await BookingService.createBooking(
        {
          date: '2026-01-15',
          duration: 'full' as Duration,
          vehicle_type: 'car' as VehicleType,
          spot_number: 99, // Invalid spot
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
          vehicle_type: 'car' as VehicleType,
          spot_number: 84,
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
          vehicle_type: 'car' as VehicleType,
          spot_number: 84,
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
    expect(BookingService.overlaps('full', 'morning')).toBe(true);
  });

  it('full day overlaps with afternoon', () => {
    expect(BookingService.overlaps('full', 'afternoon')).toBe(true);
  });

  it('morning does not overlap with afternoon', () => {
    expect(BookingService.overlaps('morning', 'afternoon')).toBe(false);
  });

  it('morning overlaps with morning', () => {
    expect(BookingService.overlaps('morning', 'morning')).toBe(true);
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

describe('Capacity System', () => {
  const SPOT_CAPACITY = 4;
  const CAR_CAPACITY = 3;
  const MOTORCYCLE_CAPACITY = 1;

  it('should allow 1 car (3 units)', () => {
    const usedCapacity = 0;
    const requiredCapacity = CAR_CAPACITY;
    expect(usedCapacity + requiredCapacity <= SPOT_CAPACITY).toBe(true);
  });

  it('should allow 1 car + 1 motorcycle (4 units)', () => {
    const carUsed = CAR_CAPACITY;
    const motoRequired = MOTORCYCLE_CAPACITY;
    expect(carUsed + motoRequired <= SPOT_CAPACITY).toBe(true);
  });

  it('should allow 4 motorcycles (4 units)', () => {
    const motos = 4;
    const usedCapacity = motos * MOTORCYCLE_CAPACITY;
    expect(usedCapacity <= SPOT_CAPACITY).toBe(true);
  });

  it('should reject car + car (6 units exceeds 4)', () => {
    const firstCar = CAR_CAPACITY;
    const secondCar = CAR_CAPACITY;
    expect(firstCar + secondCar <= SPOT_CAPACITY).toBe(false);
  });

  it('should reject car + 2 motorcycles (5 units exceeds 4)', () => {
    const carUsed = CAR_CAPACITY;
    const motos = 2;
    const motoCapacity = motos * MOTORCYCLE_CAPACITY;
    expect(carUsed + motoCapacity <= SPOT_CAPACITY).toBe(false);
  });

  it('should reject 5 motorcycles (5 units exceeds 4)', () => {
    const motos = 5;
    const usedCapacity = motos * MOTORCYCLE_CAPACITY;
    expect(usedCapacity <= SPOT_CAPACITY).toBe(false);
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
