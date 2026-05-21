import { useMemo, useState } from 'react';
import { ParkingSpotCard } from '@/components/ParkingSpotCard';
import { BookingDialogWithValidation } from '@/components/BookingDialogWithValidation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, LogOut, User, Clock, Activity, Car, Bike } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/v2/ThemeToggle';
import { getUserErrorMessage } from '@/lib/errorMessages';
import { useBookings } from '@/hooks/useBookings';
import { useCreateBooking } from '@/hooks/useCreateBooking';
import { useDeleteBooking } from '@/hooks/useDeleteBooking';

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const { data: bookings = [], isLoading: loading } = useBookings({ dateFrom: today });
  const createBooking = useCreateBooking();
  const deleteBooking = useDeleteBooking();

  const handleBookSpot = (spotNumber: number) => {
    setSelectedSpot(spotNumber);
    setDialogOpen(true);
  };

  const handleConfirmBooking = (booking: {
    date: string;
    duration: 'morning' | 'afternoon' | 'full';
    vehicle_type: 'car' | 'motorcycle';
    spot_number: number;
  }) => {
    if (!user) {
      toast.error('You must be logged in to book a spot');
      return;
    }

    createBooking.mutate(
      {
        date: booking.date,
        duration: booking.duration,
        vehicle_type: booking.vehicle_type,
        spot_number: booking.spot_number,
        userId: user.id,
        userName: user.user_metadata?.user_name || user.email || 'Unknown',
      },
      {
        onSuccess: () => toast.success('Parking spot booked successfully!'),
        onError: error => {
          console.error('Error creating booking:', error);
          toast.error(getUserErrorMessage(error, 'booking_create'));
        },
      }
    );
  };

  const handleUnbook = (bookingId: string) => {
    deleteBooking.mutate(bookingId, {
      onSuccess: () => toast.success('Booking cancelled successfully!'),
      onError: error => {
        console.error('Error cancelling booking:', error);
        toast.error(getUserErrorMessage(error, 'booking_cancel'));
      },
    });
  };

  // Group bookings by date + spot to show one card per spot/day
  const groupedUpcomingBookings = useMemo(() => {
    const map = new Map<string, { date: string; spot_number: number; bookings: typeof bookings }>();
    bookings.forEach(b => {
      const key = `${b.date}::${b.spot_number}`;
      if (!map.has(key)) {
        map.set(key, { date: b.date, spot_number: b.spot_number, bookings: [b] });
      } else {
        map.get(key)!.bookings.push(b);
      }
    });

    return Array.from(map.values()).map(group => {
      // Prefer a car booking as representative when present, otherwise first booking
      const representative =
        group.bookings.find(x => x.vehicle_type === 'car') || group.bookings[0];
      return {
        id: group.bookings.map(x => x.id).join(','),
        date: group.date,
        spot_number: group.spot_number,
        vehicle_type: representative.vehicle_type,
        duration: representative.duration,
        user_name: representative.user_name,
        user_id: representative.user_id,
        created_at: representative.created_at,
        bookings: group.bookings,
      };
    });
  }, [bookings]);

  const spot84Bookings = useMemo(() => bookings.filter(b => b.spot_number === 84), [bookings]);
  const spot85Bookings = useMemo(() => bookings.filter(b => b.spot_number === 85), [bookings]);

  // Personal statistics
  const userName = user?.user_metadata?.user_name || user?.email;
  const myBookings = useMemo(
    () => bookings.filter(b => b.user_name === userName),
    [bookings, userName]
  );

  // Personal computed stats
  const myStats = useMemo(() => {
    const spot84Count = myBookings.filter(b => b.spot_number === 84).length;
    const spot85Count = myBookings.filter(b => b.spot_number === 85).length;

    // Week bookings
    const weekStart = new Date(today);
    const wd = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - wd);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekBookings = myBookings.filter(b => {
      const bookingDate = new Date(b.date);
      return bookingDate >= weekStart && bookingDate <= weekEnd;
    });

    // Preferred time
    const morningCount = myBookings.filter(
      b => b.duration === 'morning' || b.duration === 'full'
    ).length;
    const afternoonCount = myBookings.filter(
      b => b.duration === 'afternoon' || b.duration === 'full'
    ).length;
    const fullDayCount = myBookings.filter(b => b.duration === 'full').length;

    let preferredTime = 'Not set';
    if (fullDayCount > morningCount * 0.5 && fullDayCount > afternoonCount * 0.5) {
      preferredTime = 'Full Day';
    } else if (morningCount > afternoonCount) {
      preferredTime = 'Morning';
    } else if (afternoonCount > morningCount) {
      preferredTime = 'Afternoon';
    }

    // Average bookings per week
    const weeksActive =
      myBookings.length > 0
        ? Math.max(
            1,
            Math.ceil(
              (new Date().getTime() - new Date(myBookings[0].date).getTime()) /
                (7 * 24 * 60 * 60 * 1000)
            )
          )
        : 0;
    const avgPerWeek = weeksActive > 0 ? (myBookings.length / weeksActive).toFixed(1) : '0';

    return {
      spot84Count,
      spot85Count,
      mostUsedSpot: spot84Count >= spot85Count ? 84 : 85,
      weekBookings,
      preferredTime,
      avgPerWeek,
    };
  }, [myBookings, today]);

  return (
    <div className="mesh-gradient bg-background min-h-screen">
      {/* Hero Section with liquid glass effect */}
      <div className="liquid-gradient relative overflow-hidden px-4 py-8 text-white shadow-xl md:py-12">
        <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent"></div>
        <div className="relative z-10 container mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="animate-fade-in-up flex-1">
              <h1 className="mb-2 text-3xl font-bold tracking-tight md:mb-4 md:text-5xl">
                Park it easy office
              </h1>
              <p className="text-base font-light opacity-90 md:text-xl">
                Easy parking spot management for our team
              </p>
              {user && (
                <div className="mt-3 flex items-center gap-2 text-sm opacity-80">
                  <User className="h-4 w-4" />
                  <span>{user.user_metadata?.user_name || user.email}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              <ThemeToggle variant="minimal" className="text-white hover:bg-white/20" />
              <Button
                onClick={() => navigate('/statistics')}
                className="glass-button border-white/30 text-white shadow-lg transition-all hover:scale-105"
                size="lg"
              >
                <BarChart3 className="mr-2 h-5 w-5" />
                <span className="hidden sm:inline">View</span> Statistics
              </Button>
              <Button
                onClick={signOut}
                variant="outline"
                className="glass-button border-white/30 text-white shadow-lg transition-all hover:scale-105"
                size="lg"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 md:space-y-8 md:py-8">
        {loading ? (
          <div className="animate-fade-in py-12 text-center">
            <div className="border-primary mb-4 inline-block h-12 w-12 animate-spin rounded-full border-b-2"></div>
            <p className="text-muted-foreground">Loading bookings...</p>
          </div>
        ) : (
          <>
            {/* Parking Spots Section with glass cards */}
            <section className="animate-fade-in-up">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-primary h-1 w-8 rounded-full"></div>
                Available Parking Spots
              </h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <ParkingSpotCard
                  spotNumber={84}
                  currentBookings={spot84Bookings}
                  onBook={() => handleBookSpot(84)}
                />
                <ParkingSpotCard
                  spotNumber={85}
                  currentBookings={spot85Bookings}
                  onBook={() => handleBookSpot(85)}
                />
              </div>
            </section>

            {/* All Users' Bookings Section */}
            <section className="animate-fade-in-up stagger-1">
              <div className="mb-4">
                <h2 className="mb-2 flex flex-wrap items-center gap-2 text-xl font-bold md:text-2xl">
                  <div className="gradient-success h-1 w-8 rounded-full"></div>
                  All Upcoming Bookings
                  <Badge
                    variant="outline"
                    className="border-success/30 bg-success/10 text-xs font-normal"
                  >
                    Team-wide visibility
                  </Badge>
                </h2>
                <p className="text-muted-foreground ml-10 text-sm">
                  View all team members' parking reservations. Your bookings are marked with a "You"
                  badge.
                </p>
              </div>
              {groupedUpcomingBookings.length > 0 ? (
                <div className="space-y-3">
                  {groupedUpcomingBookings
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((group, index) => {
                      // Check if booking is today
                      const isToday = group.date === today;

                      // If the current user has a booking in this group
                      const isMyBooking = group.bookings.some(b => b.user_id === user?.id);

                      return (
                        <div
                          key={`${group.date}-${group.spot_number}`}
                          className={`glass-card animate-fade-in-up relative flex flex-col justify-between rounded-xl border-2 p-4 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg sm:flex-row sm:items-center ${
                            isToday
                              ? 'border-warning/50 bg-warning/5'
                              : isMyBooking
                                ? 'border-primary/50 bg-primary/5'
                                : 'border-border/50'
                          } ${isToday ? 'ring-warning/30 ring-offset-background ring-2 ring-offset-2' : ''}`}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <div className="mb-3 flex w-full items-start gap-3 sm:mb-0 sm:gap-4">
                            <div
                              className={`min-w-12.5 rounded-xl p-2 text-center sm:min-w-15 ${
                                isToday
                                  ? 'bg-warning/20 ring-warning ring-2'
                                  : isMyBooking
                                    ? 'bg-primary/20'
                                    : 'bg-muted/50'
                              }`}
                            >
                              <div
                                className={`text-xl font-bold sm:text-2xl ${
                                  isToday
                                    ? 'text-warning'
                                    : isMyBooking
                                      ? 'text-primary'
                                      : 'text-foreground'
                                }`}
                              >
                                {new Date(group.date).getDate()}
                              </div>
                              <div className="text-muted-foreground text-xs uppercase">
                                {new Date(group.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                })}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 truncate font-semibold">
                                Spot {group.spot_number}
                                <span className="text-muted-foreground text-xs font-normal">
                                  · {group.bookings?.length}{' '}
                                  {group.bookings?.length === 1 ? 'booking' : 'bookings'}
                                </span>
                                {isToday && (
                                  <span className="bg-warning rounded-full px-2 py-0.5 text-xs text-white shadow-sm">
                                    Today
                                  </span>
                                )}
                              </div>
                              {group.bookings.map((booking, i) => (
                                <div
                                  key={booking.id}
                                  className="animate-fade-in border-border/50 bg-muted/50 mt-1.5 rounded-lg border p-2"
                                  style={{ animationDelay: `${i * 50}ms` }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      {booking.vehicle_type === 'car' ? (
                                        <Car className="text-primary h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" />
                                      ) : (
                                        <Bike className="text-accent h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" />
                                      )}
                                      <span className="text-xs font-medium break-words sm:text-sm">
                                        {booking.user_name}
                                      </span>
                                    </div>
                                    <div className="flex flex-shrink-0 items-center gap-1.5">
                                      {booking.user_id === user?.id && (
                                        <span className="bg-success rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
                                          You
                                        </span>
                                      )}
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'text-[10px] font-medium whitespace-nowrap sm:text-xs',
                                          booking.duration === 'full' &&
                                            'border-primary/50 bg-primary/10 text-primary',
                                          booking.duration === 'morning' &&
                                            'border-info/50 bg-info/10 text-info',
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
                                      {booking.user_id === user?.id && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleUnbook(booking.id)}
                                          className="border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive h-6 px-1.5 text-[10px] transition-all hover:text-white sm:text-xs"
                                        >
                                          Cancel
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center">
                  No upcoming bookings yet. Be the first to book a spot!
                </p>
              )}
            </section>

            {/* Personal Statistics Section */}
            {myBookings.length > 0 && (
              <section className="animate-fade-in-up stagger-2">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                  <div className="gradient-accent h-1 w-8 rounded-full"></div>
                  My Parking Stats
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="glass-card hover-lift border-info/20 border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground text-sm font-medium">
                            Booking Frequency
                          </p>
                          <p className="text-info text-3xl font-bold">{myStats.avgPerWeek}</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            bookings/week average
                          </p>
                        </div>
                        <div className="bg-info/10 rounded-xl p-3">
                          <Calendar className="text-info h-8 w-8" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card hover-lift border-success/20 border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground text-sm font-medium">This Week</p>
                          <p className="text-success text-3xl font-bold">
                            {myStats.weekBookings.length}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {myBookings.length} all-time total
                          </p>
                        </div>
                        <div className="bg-success/10 rounded-xl p-3">
                          <BarChart3 className="text-success h-8 w-8" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card hover-lift border-warning/20 border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground text-sm font-medium">
                            Preferred Time
                          </p>
                          <p className="text-warning text-3xl font-bold">{myStats.preferredTime}</p>
                          <p className="text-muted-foreground mt-1 text-xs">most common choice</p>
                        </div>
                        <div className="bg-warning/10 rounded-xl p-3">
                          <Clock className="text-warning h-8 w-8" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card hover-lift border-accent/20 border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground text-sm font-medium">Favorite Spot</p>
                          <p className="text-accent text-3xl font-bold">
                            Spot {myStats.mostUsedSpot}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {Math.max(myStats.spot84Count, myStats.spot85Count)} times booked
                          </p>
                        </div>
                        <div className="bg-accent/10 rounded-xl p-3">
                          <Activity className="text-accent h-8 w-8" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Booking Dialog */}
      {selectedSpot && (
        <BookingDialogWithValidation
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          spotNumber={selectedSpot}
          onConfirm={handleConfirmBooking}
        />
      )}
    </div>
  );
};

export default Index;
