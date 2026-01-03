import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParkingSpotCard } from '../components/ParkingSpotCard';

describe('ParkingSpotCard', () => {
  describe('Book button behavior', () => {
    it('should always enable "Book This Spot" button when no bookings exist', () => {
      const onBook = vi.fn();

      render(<ParkingSpotCard spotNumber={84} currentBookings={[]} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /book this spot/i });
      expect(button).toBeEnabled();
    });

    it('should enable button even when spot has today bookings (shows "View Options")', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        {
          id: '1',
          date: today,
          duration: 'full' as const,
          vehicleType: 'car' as const,
          userName: 'John Doe',
        },
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      // When fully booked, button shows "View Options"
      const button = screen.getByRole('button', { name: /view options/i });
      expect(button).toBeEnabled();
    });

    it('should show "View Options" button when spot is fully booked for today', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      // Fully booked with car for full day
      const currentBookings = [
        {
          id: '1',
          date: today,
          duration: 'full' as const,
          vehicleType: 'car' as const,
          userName: 'John Doe',
        },
      ];

      render(<ParkingSpotCard spotNumber={85} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /view options/i });
      // Button should be enabled because users can book for other days
      expect(button).toBeEnabled();
    });

    it('should enable "Book This Spot" button when motorcycles are at capacity but no car', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      // 4 motorcycles (at capacity) - this is "partial" status
      const currentBookings = Array.from({ length: 4 }, (_, i) => ({
        id: `${i + 1}`,
        date: today,
        duration: 'full' as const,
        vehicleType: 'motorcycle' as const,
        userName: `Biker ${i + 1}`,
      }));

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Button should be enabled because users can book for other days
      expect(button).toBeEnabled();
    });

    it('should show "View Options" when both car and motorcycles are fully booked', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        {
          id: '1',
          date: today,
          duration: 'morning' as const,
          vehicleType: 'car' as const,
          userName: 'Morning Car',
        },
        {
          id: '2',
          date: today,
          duration: 'afternoon' as const,
          vehicleType: 'car' as const,
          userName: 'Afternoon Car',
        },
        ...Array.from({ length: 4 }, (_, i) => ({
          id: `${i + 3}`,
          date: today,
          duration: 'full' as const,
          vehicleType: 'motorcycle' as const,
          userName: `Biker ${i + 1}`,
        })),
      ];

      render(<ParkingSpotCard spotNumber={85} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /view options/i });
      // Button should be enabled because users can book for other days
      expect(button).toBeEnabled();
    });

    it('should show "View Options" when car fully booked, not "Book This Spot"', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        {
          id: '1',
          date: today,
          duration: 'full' as const,
          vehicleType: 'car' as const,
          userName: 'John Doe',
        },
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      // Button should say "View Options" when fully booked
      expect(screen.getByRole('button', { name: /view options/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /book this spot/i })).not.toBeInTheDocument();
    });
  });

  describe('Display status badges', () => {
    it('should show "✓ Available" badge when no bookings exist', () => {
      const onBook = vi.fn();

      render(<ParkingSpotCard spotNumber={84} currentBookings={[]} onBook={onBook} />);

      expect(screen.getByText('✓ Available')).toBeInTheDocument();
    });

    it('should show "✕ Full" badge when spot is fully booked for today', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        {
          id: '1',
          date: today,
          duration: 'full' as const,
          vehicleType: 'car' as const,
          userName: 'John Doe',
        },
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      // Badge should show status, and button shows "View Options"
      expect(screen.getByText('✕ Full')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view options/i })).toBeEnabled();
    });

    it('should show "◐ Partial" badge when some slots are taken', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        {
          id: '1',
          date: today,
          duration: 'morning' as const,
          vehicleType: 'car' as const,
          userName: 'Morning User',
        },
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      expect(screen.getByText('◐ Partial')).toBeInTheDocument();
    });
  });

  describe('Button styling based on status', () => {
    it('should show warning gradient button when spot is fully booked', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        {
          id: '1',
          date: today,
          duration: 'full' as const,
          vehicleType: 'car' as const,
          userName: 'John Doe',
        },
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /view options/i });
      // Check that button has warning gradient class for fully booked spots
      expect(button.className).toContain('gradient-warning');
    });

    it('should show primary gradient button when spot is available', () => {
      const onBook = vi.fn();

      render(<ParkingSpotCard spotNumber={84} currentBookings={[]} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Check that button has primary gradient class for available spots
      expect(button.className).toContain('gradient-primary');
    });

    it('should show primary gradient button when spot is partially booked', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        {
          id: '1',
          date: today,
          duration: 'morning' as const,
          vehicleType: 'car' as const,
          userName: 'Morning User',
        },
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Check that button has primary gradient class for partially booked spots
      expect(button.className).toContain('gradient-primary');
    });
  });
});
