import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParkingSpotCard } from '../components/ParkingSpotCard';

describe('ParkingSpotCard', () => {
  describe('Book button behavior', () => {
    it('should always enable "Book This Spot" button when no bookings exist', () => {
      const onBook = vi.fn();
      
      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={[]}
          onBook={onBook}
        />
      );

      const button = screen.getByRole('button', { name: /book this spot/i });
      expect(button).toBeEnabled();
    });

    it('should enable "Book This Spot" button even when spot has today bookings', () => {
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

      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      const button = screen.getByRole('button', { name: /book this spot/i });
      expect(button).toBeEnabled();
    });

    it('should enable "Book This Spot" button when spot is fully booked for today', () => {
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

      render(
        <ParkingSpotCard
          spotNumber={85}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Button should be enabled because users can book for other days
      expect(button).toBeEnabled();
    });

    it('should enable "Book This Spot" button when motorcycles are at capacity', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];
      
      // 4 motorcycles (at capacity)
      const currentBookings = Array.from({ length: 4 }, (_, i) => ({
        id: `${i + 1}`,
        date: today,
        duration: 'full' as const,
        vehicleType: 'motorcycle' as const,
        userName: `Biker ${i + 1}`,
      }));

      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Button should be enabled because users can book for other days
      expect(button).toBeEnabled();
    });

    it('should enable "Book This Spot" button when both car and motorcycles are booked', () => {
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

      render(
        <ParkingSpotCard
          spotNumber={85}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Button should be enabled because users can book for other days
      expect(button).toBeEnabled();
    });

    it('should always show "Book This Spot" text regardless of today status', () => {
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

      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      // Button should always say "Book This Spot" not "Fully Booked"
      expect(screen.getByRole('button', { name: /book this spot/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /fully booked/i })).not.toBeInTheDocument();
    });
  });

  describe('Display status badges', () => {
    it('should show "Available" badge when no bookings exist', () => {
      const onBook = vi.fn();
      
      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={[]}
          onBook={onBook}
        />
      );

      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    it('should show "Fully Booked" badge when spot is fully booked for today', () => {
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

      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      // Badge should show status, but button should be enabled
      expect(screen.getByText('Fully Booked')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /book this spot/i })).toBeEnabled();
    });

    it('should show "Partially Booked" badge when some slots are taken', () => {
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

      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      expect(screen.getByText('Partially Booked')).toBeInTheDocument();
    });
  });

  describe('Button color based on status', () => {
    it('should show orange button when spot is fully booked', () => {
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

      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Check that button has orange gradient classes for fully booked spots
      expect(button.className).toContain('from-orange-500');
      expect(button.className).toContain('to-orange-600');
    });

    it('should show blue button when spot is available', () => {
      const onBook = vi.fn();
      
      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={[]}
          onBook={onBook}
        />
      );

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Check that button has blue gradient classes for available spots
      expect(button.className).toContain('from-blue-500');
      expect(button.className).toContain('to-blue-600');
    });

    it('should show blue button when spot is partially booked', () => {
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

      render(
        <ParkingSpotCard
          spotNumber={84}
          currentBookings={currentBookings}
          onBook={onBook}
        />
      );

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Check that button has blue gradient classes for partially booked spots
      expect(button.className).toContain('from-blue-500');
      expect(button.className).toContain('to-blue-600');
    });
  });
});
