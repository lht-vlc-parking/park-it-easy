import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Car, Bike, Calendar, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Booking } from '@/types/booking';

interface ParkingSpotCardProps {
  spotNumber: number;
  currentBookings: Booking[];
  onBook: () => void;
}

export const ParkingSpotCard = ({ spotNumber, currentBookings, onBook }: ParkingSpotCardProps) => {
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = currentBookings.filter(b => b.date === today);

  const getAvailabilityStatus = () => {
    if (todayBookings.length === 0) return 'available';

    const motorcycles = todayBookings.filter(b => b.vehicle_type === 'motorcycle');
    const cars = todayBookings.filter(b => b.vehicle_type === 'car');

    // Check if motorcycle limit reached
    const motorcyclesFull = motorcycles.length >= 4;

    // Check if car slots are full
    const hasCarFullDay = cars.some(b => b.duration === 'full');
    const hasCarMorning = cars.some(b => b.duration === 'morning');
    const hasCarAfternoon = cars.some(b => b.duration === 'afternoon');
    const carsFull = hasCarFullDay || (hasCarMorning && hasCarAfternoon);

    // If both car and motorcycle spots are full, it's completely full
    if (motorcyclesFull && carsFull) return 'full';

    // If car is booked for full day or both time slots, consider it fully booked
    // (even if motorcycles can still park)
    if (carsFull) return 'full';

    // If motorcycles are at capacity but cars can still park
    if (motorcyclesFull) return 'partial';

    // If there are some bookings but space available
    return 'partial';
  };

  const status = getAvailabilityStatus();

  return (
    <Card
      className={cn(
        'glass-card hover-lift animate-fade-in-up relative overflow-hidden border-2',
        status === 'available' && 'border-success/30 hover:border-success/50',
        status === 'partial' && 'border-info/30 hover:border-info/50',
        status === 'full' && 'border-warning/30 bg-warning/5 hover:border-warning/50'
      )}
    >
      {/* Decorative corner gradient */}
      <div
        className={cn(
          'absolute right-0 top-0 h-24 w-24 opacity-20 blur-2xl',
          status === 'available' && 'bg-success',
          status === 'partial' && 'bg-info',
          status === 'full' && 'bg-warning'
        )}
      />

      <CardHeader className="relative pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <div
              className={cn(
                'flex gap-1 rounded-lg p-1.5',
                status === 'available' && 'bg-success/10',
                status === 'partial' && 'bg-info/10',
                status === 'full' && 'bg-warning/10'
              )}
            >
              <Car
                className={cn(
                  'h-4 w-4 sm:h-5 sm:w-5',
                  status === 'available' && 'text-success',
                  status === 'partial' && 'text-info',
                  status === 'full' && 'text-warning'
                )}
              />
              <Bike
                className={cn(
                  'h-4 w-4 sm:h-5 sm:w-5',
                  status === 'available' && 'text-success',
                  status === 'partial' && 'text-info',
                  status === 'full' && 'text-warning'
                )}
              />
            </div>
            <span className="truncate">Spot {spotNumber}</span>
          </CardTitle>
          <Badge
            className={cn(
              'whitespace-nowrap text-xs font-semibold shadow-lg',
              status === 'available' && 'bg-success text-white shadow-success/30',
              status === 'partial' && 'bg-info text-white shadow-info/30',
              status === 'full' && 'bg-warning text-white shadow-warning/30'
            )}
          >
            {status === 'available' && '✓ Available'}
            {status === 'partial' && '◐ Partial'}
            {status === 'full' && '✕ Full'}
          </Badge>
        </div>
        <CardDescription className="text-xs font-medium text-muted-foreground sm:text-sm">
          Cars & Motorcycles (Max 4 motorcycles)
        </CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-3 sm:space-y-4">
        {todayBookings.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
              Today's Bookings ({todayBookings.length})
            </div>
            <div className="max-h-32 space-y-1.5 overflow-y-auto">
              {todayBookings.map((booking, index) => (
                <div
                  key={booking.id}
                  className="relative animate-fade-in rounded-lg border border-border/50 bg-muted/50 p-2"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      'absolute right-1 top-1 whitespace-nowrap text-[10px] font-medium sm:text-xs',
                      booking.duration === 'full' && 'border-primary/50 bg-primary/10 text-primary',
                      booking.duration === 'morning' && 'border-info/50 bg-info/10 text-info',
                      booking.duration === 'afternoon' &&
                        'border-warning/50 bg-warning/10 text-warning'
                    )}
                  >
                    {booking.duration === 'full'
                      ? 'All Day'
                      : booking.duration === 'morning'
                        ? 'AM'
                        : 'PM'}
                  </Badge>
                  <div className="flex min-w-0 items-center gap-2 pr-12">
                    {booking.vehicle_type === 'car' ? (
                      <Car className="h-3 w-3 flex-shrink-0 text-primary sm:h-4 sm:w-4" />
                    ) : (
                      <Bike className="h-3 w-3 flex-shrink-0 text-accent sm:h-4 sm:w-4" />
                    )}
                    <span className="truncate text-xs font-medium sm:text-sm">
                      {booking.user_name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-6 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-success/50" />
            <p className="text-sm font-medium text-muted-foreground">Available all day!</p>
          </div>
        )}
        <Button
          onClick={onBook}
          className={cn(
            'w-full text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] sm:text-base',
            status === 'full'
              ? 'gradient-warning shadow-warning/30 hover:shadow-warning/50'
              : 'gradient-primary shadow-primary/30 hover:shadow-primary/50'
          )}
        >
          {status === 'full' ? 'View Options' : 'Book This Spot'}
        </Button>
      </CardContent>
    </Card>
  );
};
