import { useState, useEffect } from 'react';
import { ParkingSpotCard } from '@/components/ParkingSpotCard';
import { BookingDialogWithValidation } from '@/components/BookingDialogWithValidation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, LogOut, User, Clock, Activity } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/v2/ThemeToggle';

interface Booking {
  id: string;
  date: string;
  duration: 'morning' | 'afternoon' | 'full';
  vehicleType: 'car' | 'motorcycle';
  userName: string;
  spotNumber: number;
  createdAt?: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch bookings from database
  useEffect(() => {
    if (user) {
      fetchBookings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchBookings = async () => {
    try {
      if (!user) return;

      // Fetch ALL bookings to show correct parking spot availability
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;

      // Transform database data to match our interface
      const transformedBookings: Booking[] = (data || []).map(booking => ({
        id: booking.id,
        date: booking.date,
        duration: booking.duration as 'morning' | 'afternoon' | 'full',
        vehicleType: booking.vehicle_type as 'car' | 'motorcycle',
        userName: booking.user_name,
        spotNumber: booking.spot_number,
        createdAt: booking.created_at,
      }));

      setBookings(transformedBookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const handleBookSpot = (spotNumber: number) => {
    setSelectedSpot(spotNumber);
    setDialogOpen(true);
  };

  const handleConfirmBooking = async (booking: Omit<Booking, 'id'>) => {
    try {
      if (!user) {
        toast.error('You must be logged in to book a spot');
        return;
      }

      const { error } = await supabase.from('bookings').insert({
        user_id: user.id,
        user_name: user.user_metadata?.user_name || user.email || 'Unknown',
        date: booking.date,
        duration: booking.duration,
        vehicle_type: booking.vehicleType,
        spot_number: booking.spotNumber,
      });

      if (error) {
        console.error('Error creating booking:', error);
        // Show the actual error message from the database
        const errorMessage = error.message || 'Failed to create booking';
        toast.error(errorMessage);
        return;
      }

      toast.success('Parking spot booked successfully!');
      fetchBookings(); // Refresh the list
    } catch (error: unknown) {
      console.error('Error creating booking:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create booking';
      toast.error(errorMessage);
    }
  };

  const handleUnbook = async (bookingId: string) => {
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', bookingId);

      if (error) {
        console.error('Error cancelling booking:', error);
        const errorMessage = error.message || 'Failed to cancel booking';
        toast.error(errorMessage);
        return;
      }

      toast.success('Booking cancelled successfully!');
      fetchBookings(); // Refresh the list
    } catch (error: unknown) {
      console.error('Error cancelling booking:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel booking';
      toast.error(errorMessage);
    }
  };

  // Filter out expired bookings (past dates)
  const today = new Date().toISOString().split('T')[0];
  const activeBookings = bookings.filter(b => b.date >= today);

  // Show ALL upcoming bookings (not just current user's)
  const allUpcomingBookings = activeBookings;

  const spot84Bookings = activeBookings.filter(b => b.spotNumber === 84);
  const spot85Bookings = activeBookings.filter(b => b.spotNumber === 85);

  // Personal statistics
  const userName = user?.user_metadata?.user_name || user?.email;
  const myBookings = bookings.filter(b => b.userName === userName);
  const _myActiveBookings = activeBookings.filter(b => b.userName === userName);
  const _myCarBookings = myBookings.filter(b => b.vehicleType === 'car').length;
  const _myMotorcycleBookings = myBookings.filter(b => b.vehicleType === 'motorcycle').length;
  const mySpot84Count = myBookings.filter(b => b.spotNumber === 84).length;
  const mySpot85Count = myBookings.filter(b => b.spotNumber === 85).length;
  const myMostUsedSpot = mySpot84Count >= mySpot85Count ? 84 : 85;

  // More meaningful personal stats
  const thisWeekStart = new Date(today);
  const weekday = thisWeekStart.getDay();
  thisWeekStart.setDate(thisWeekStart.getDate() - weekday);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

  const myWeekBookings = myBookings.filter(b => {
    const bookingDate = new Date(b.date);
    return bookingDate >= thisWeekStart && bookingDate <= thisWeekEnd;
  });

  // Calculate preferred time slot
  const myMorningCount = myBookings.filter(
    b => b.duration === 'morning' || b.duration === 'full'
  ).length;
  const myAfternoonCount = myBookings.filter(
    b => b.duration === 'afternoon' || b.duration === 'full'
  ).length;
  const myFullDayCount = myBookings.filter(b => b.duration === 'full').length;

  let myPreferredTime = 'Not set';
  if (myFullDayCount > myMorningCount * 0.5 && myFullDayCount > myAfternoonCount * 0.5) {
    myPreferredTime = 'Full Day';
  } else if (myMorningCount > myAfternoonCount) {
    myPreferredTime = 'Morning';
  } else if (myAfternoonCount > myMorningCount) {
    myPreferredTime = 'Afternoon';
  }

  // Average bookings per week for user
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
  const avgBookingsPerWeek = weeksActive > 0 ? (myBookings.length / weeksActive).toFixed(1) : '0';

  return (
    <div className="mesh-gradient min-h-screen bg-background">
      {/* Hero Section with liquid glass effect */}
      <div className="liquid-gradient relative overflow-hidden px-4 py-8 text-white shadow-xl md:py-12">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
        <div className="container relative z-10 mx-auto max-w-6xl">
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
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
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
                <p className="ml-10 text-sm text-muted-foreground">
                  View all team members' parking reservations. Your bookings are marked with a "You"
                  badge.
                </p>
              </div>
              {allUpcomingBookings.length > 0 ? (
                <div className="space-y-3">
                  {allUpcomingBookings
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((booking, index) => {
                      // Check if booking is today
                      const isToday = booking.date === today;

                      const isMyBooking =
                        booking.userName === (user?.user_metadata?.user_name || user?.email);

                      return (
                        <div
                          key={booking.id}
                          className={`glass-card animate-fade-in-up relative flex flex-col justify-between rounded-xl border-2 p-4 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg sm:flex-row sm:items-center ${
                            isToday
                              ? 'border-warning/50 bg-warning/5'
                              : isMyBooking
                                ? 'border-primary/50 bg-primary/5'
                                : 'border-border/50'
                          } ${isToday ? 'ring-2 ring-warning/30 ring-offset-2 ring-offset-background' : ''}`}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <div className="absolute right-3 top-3 flex items-center gap-2">
                            <Badge
                              className={`px-3 py-1.5 text-xs font-medium shadow-sm sm:text-sm ${
                                booking.duration === 'full'
                                  ? 'gradient-primary text-white'
                                  : booking.duration === 'morning'
                                    ? 'bg-info text-white'
                                    : 'bg-warning text-white'
                              }`}
                            >
                              {booking.duration === 'full'
                                ? 'All Day'
                                : booking.duration === 'morning'
                                  ? 'AM'
                                  : 'PM'}
                            </Badge>
                            {isMyBooking && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUnbook(booking.id)}
                                className="border-destructive/30 text-destructive transition-all hover:border-destructive hover:bg-destructive hover:text-white"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                          <div className="mb-3 flex items-center gap-3 sm:mb-0 sm:gap-4">
                            <div
                              className={`min-w-[50px] rounded-xl p-2 text-center sm:min-w-[60px] ${
                                isToday
                                  ? 'bg-warning/20 ring-2 ring-warning'
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
                                {new Date(booking.date).getDate()}
                              </div>
                              <div className="text-xs uppercase text-muted-foreground">
                                {new Date(booking.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                })}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 truncate font-semibold">
                                {booking.userName}
                                {isToday && (
                                  <span className="rounded-full bg-warning px-2 py-0.5 text-xs text-white shadow-sm">
                                    Today
                                  </span>
                                )}
                                {isMyBooking && (
                                  <span className="rounded-full bg-success px-2 py-0.5 text-xs text-white shadow-sm">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                                <span className="font-medium">Spot {booking.spotNumber}</span>
                                <span className="text-muted-foreground/50">•</span>
                                <span
                                  className={`font-medium ${booking.vehicleType === 'car' ? 'text-info' : 'text-accent'}`}
                                >
                                  {booking.vehicleType === 'car' ? '🚗 Car' : '🏍️ Moto'}
                                </span>
                              </div>
                              {booking.createdAt && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground/75">
                                  <Clock className="h-3 w-3" />
                                  <span>
                                    Created{' '}
                                    {new Date(booking.createdAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })}{' '}
                                    at{' '}
                                    {new Date(booking.createdAt).toLocaleTimeString('en-US', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="glass-card rounded-xl border-2 border-dashed border-muted-foreground/20 py-12 text-center">
                  <Calendar className="mx-auto mb-3 h-12 w-12 text-muted-foreground opacity-50" />
                  <p className="font-medium text-muted-foreground">No upcoming bookings</p>
                  <p className="mt-1 text-sm text-muted-foreground">Book a spot to get started!</p>
                </div>
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
                  <Card className="glass-card hover-lift border-2 border-info/20">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Booking Frequency
                          </p>
                          <p className="text-3xl font-bold text-info">{avgBookingsPerWeek}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            bookings/week average
                          </p>
                        </div>
                        <div className="rounded-xl bg-info/10 p-3">
                          <Calendar className="h-8 w-8 text-info" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card hover-lift border-2 border-success/20">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">This Week</p>
                          <p className="text-3xl font-bold text-success">{myWeekBookings.length}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {myBookings.length} all-time total
                          </p>
                        </div>
                        <div className="rounded-xl bg-success/10 p-3">
                          <BarChart3 className="h-8 w-8 text-success" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card hover-lift border-2 border-warning/20">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Preferred Time
                          </p>
                          <p className="text-3xl font-bold text-warning">{myPreferredTime}</p>
                          <p className="mt-1 text-xs text-muted-foreground">most common choice</p>
                        </div>
                        <div className="rounded-xl bg-warning/10 p-3">
                          <Clock className="h-8 w-8 text-warning" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card hover-lift border-2 border-accent/20">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Favorite Spot</p>
                          <p className="text-3xl font-bold text-accent">Spot {myMostUsedSpot}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {Math.max(mySpot84Count, mySpot85Count)} times booked
                          </p>
                        </div>
                        <div className="rounded-xl bg-accent/10 p-3">
                          <Activity className="h-8 w-8 text-accent" />
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
