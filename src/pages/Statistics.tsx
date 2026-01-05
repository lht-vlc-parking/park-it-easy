import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  TrendingUp,
  Calendar,
  Car,
  Bike,
  Percent,
  Clock,
  BarChart3,
  Users,
  Activity,
  Scale,
  Target,
  Flame,
  Lightbulb,
  MapPin,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useStatistics, useMyStats } from '@/hooks/useStatistics';
import { ThemeToggle } from '@/components/v2/ThemeToggle';

interface Booking {
  id: string;
  date: string;
  duration: 'morning' | 'afternoon' | 'full';
  vehicle_type: 'car' | 'motorcycle';
  user_name: string;
  spot_number: number;
  created_at?: string;
}

const Statistics = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // V2: Use new statistics hooks for database views
  const {
    userStats,
    dailyOccupancy: _dailyOccupancy,
    fairness,
    weeklyTrends: _weeklyTrends,
    loading: _statsLoading,
  } = useStatistics();
  const { stats: myDbStats } = useMyStats(user?.id);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      // Fetch ALL bookings from all users for statistics
      // No user check needed - statistics should always load
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('date', { ascending: true });

      if (error) {
        console.error('Error fetching bookings:', error);
        toast.error('Failed to load statistics');
      } else {
        setBookings(data || []);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const today = new Date();
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay());
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // Previous week and month for comparison
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekEnd);
  lastWeekEnd.setDate(thisWeekEnd.getDate() - 7);

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const filterByDateRange = (start: Date, end: Date) => {
    return bookings.filter(b => {
      const bookingDate = new Date(b.date);
      return bookingDate >= start && bookingDate <= end;
    });
  };

  const thisWeekBookings = filterByDateRange(thisWeekStart, thisWeekEnd);
  const thisMonthBookings = filterByDateRange(thisMonthStart, thisMonthEnd);
  const lastWeekBookings = filterByDateRange(lastWeekStart, lastWeekEnd);
  const lastMonthBookings = filterByDateRange(lastMonthStart, lastMonthEnd);
  const _activeBookings = bookings.filter(
    b => new Date(b.date) >= new Date(new Date().setHours(0, 0, 0, 0))
  );

  // Get unique users
  const uniqueUsers = [...new Set(bookings.map(b => b.user_name))];

  // User booking counts
  const userBookingCounts = uniqueUsers
    .map(userName => ({
      name: userName,
      count: bookings.filter(b => b.user_name === userName).length,
      thisWeek: thisWeekBookings.filter(b => b.user_name === userName).length,
      thisMonth: thisMonthBookings.filter(b => b.user_name === userName).length,
    }))
    .sort((a, b) => b.count - a.count);

  const carBookings = bookings.filter(b => b.vehicle_type === 'car').length;
  const motorcycleBookings = bookings.filter(b => b.vehicle_type === 'motorcycle').length;
  const totalBookings = bookings.length;

  // Calculate weekly and monthly trends
  const weeklyGrowth =
    lastWeekBookings.length > 0
      ? ((thisWeekBookings.length - lastWeekBookings.length) / lastWeekBookings.length) * 100
      : 0;
  const monthlyGrowth =
    lastMonthBookings.length > 0
      ? ((thisMonthBookings.length - lastMonthBookings.length) / lastMonthBookings.length) * 100
      : 0;

  // Active users who booked this month
  const activeUsersThisMonth = [...new Set(thisMonthBookings.map(b => b.user_name))];

  // Average bookings per active user
  const avgBookingsPerUser =
    activeUsersThisMonth.length > 0
      ? (thisMonthBookings.length / activeUsersThisMonth.length).toFixed(1)
      : '0';

  // Peak booking day of the week (weekdays only)
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun to Sat
  bookings.forEach(b => {
    const date = new Date(b.date);
    const dayOfWeek = date.getDay();
    // Only count weekdays (Mon-Fri)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      dayOfWeekCounts[dayOfWeek]++;
    }
  });
  // Only consider weekdays for peak day (indices 1-5)
  const weekdayCounts = dayOfWeekCounts.slice(1, 6);
  const peakDayIndex = weekdayCounts.indexOf(Math.max(...weekdayCounts)) + 1;
  const peakDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    peakDayIndex
  ];

  // Average booking lead time (days in advance)
  const bookingsWithCreatedAt = bookings.filter(b => b.created_at);
  const avgLeadTime =
    bookingsWithCreatedAt.length > 0
      ? bookingsWithCreatedAt.reduce((sum, b) => {
          const bookingDate = new Date(b.date);
          const createdDate = new Date(b.created_at!);
          const diffDays = Math.floor(
            (bookingDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return sum + Math.max(0, diffDays);
        }, 0) / bookingsWithCreatedAt.length
      : 0;

  // Calculate occupation percentage
  // Each spot can have one booking per day (car or motorcycle)
  // Max capacity: 2 bookings per day (2 spots)
  const calculateOccupation = (bookingsInRange: Booking[]) => {
    if (bookingsInRange.length === 0) return 0;

    // Group by date
    const dateGroups: { [key: string]: Booking[] } = {};
    bookingsInRange.forEach(b => {
      if (!dateGroups[b.date]) dateGroups[b.date] = [];
      dateGroups[b.date].push(b);
    });

    const occupations = Object.values(dateGroups).map(dayBookings => {
      // Count unique spots per day (max 2: spot 84 and spot 85)
      const uniqueSpots = new Set(dayBookings.map(b => b.spot_number));
      const maxSpots = 2;
      const usedSpots = uniqueSpots.size;
      return (usedSpots / maxSpots) * 100;
    });

    return occupations.reduce((a, b) => a + b, 0) / occupations.length;
  };

  // Calculate daily occupancy for the week
  const getDailyOccupancy = (startDate: Date, days: number) => {
    const dailyData = [];
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const dayBookings = bookings.filter(b => b.date === dateStr);
      // Count unique spots (max 2 per day)
      const uniqueSpots = new Set(dayBookings.map(b => b.spot_number));
      const maxSpots = 2;
      const occupancy = (uniqueSpots.size / maxSpots) * 100;

      dailyData.push({
        date: currentDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
        dayOfMonth: currentDate.getDate(),
        dayOfWeek: currentDate.getDay(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        bookings: uniqueSpots.size,
        occupancy: Math.min(occupancy, 100),
        maxSlots: maxSpots,
      });
    }
    return dailyData;
  };

  const weeklyOccupancy = getDailyOccupancy(thisWeekStart, 7).filter(
    day => day.dayOfWeek >= 1 && day.dayOfWeek <= 5
  ); // Only weekdays (Mon-Fri)
  // Get monthly occupancy only for weekdays (Monday-Friday)
  const allMonthlyDays = getDailyOccupancy(
    thisMonthStart,
    new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  );
  const monthlyOccupancy = allMonthlyDays.filter(day => day.dayOfWeek >= 1 && day.dayOfWeek <= 5); // Monday=1, Friday=5

  const weekOccupation = calculateOccupation(thisWeekBookings);
  const monthOccupation = calculateOccupation(thisMonthBookings);

  // Most popular spot
  const spot84Count = bookings.filter(b => b.spot_number === 84).length;
  const spot85Count = bookings.filter(b => b.spot_number === 85).length;
  const _mostPopularSpot = spot84Count >= spot85Count ? 84 : 85;

  // Most popular time
  const morningCount = bookings.filter(
    b => b.duration === 'morning' || b.duration === 'full'
  ).length;
  const afternoonCount = bookings.filter(
    b => b.duration === 'afternoon' || b.duration === 'full'
  ).length;
  const _mostPopularTime = morningCount >= afternoonCount ? 'Morning' : 'Afternoon';

  // ============ NEW V2 STATISTICS ============

  // Get current user's bookings
  const currentUserName = user?.user_metadata?.user_name || user?.email;
  const myBookings = bookings.filter(b => b.user_name === currentUserName);
  const myBookingsSorted = [...myBookings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // --- Personal Parking Profile ---
  const myPrimaryVehicle =
    myBookings.length > 0
      ? myBookings.filter(b => b.vehicle_type === 'car').length >=
        myBookings.filter(b => b.vehicle_type === 'motorcycle').length
        ? 'Car'
        : 'Motorcycle'
      : 'N/A';

  const myFavoriteSpot =
    myBookings.length > 0
      ? myBookings.filter(b => b.spot_number === 84).length >=
        myBookings.filter(b => b.spot_number === 85).length
        ? 84
        : 85
      : null;

  const myFavoriteSpotPercent =
    myBookings.length > 0 && myFavoriteSpot
      ? (
          (myBookings.filter(b => b.spot_number === myFavoriteSpot).length / myBookings.length) *
          100
        ).toFixed(0)
      : '0';

  const myPreferredDuration = (() => {
    if (myBookings.length === 0) return 'N/A';
    const fullCount = myBookings.filter(b => b.duration === 'full').length;
    const morningCount = myBookings.filter(b => b.duration === 'morning').length;
    const afternoonCount = myBookings.filter(b => b.duration === 'afternoon').length;
    if (fullCount >= morningCount && fullCount >= afternoonCount) return 'Full Day';
    if (morningCount >= afternoonCount) return 'Morning';
    return 'Afternoon';
  })();

  const myPreferredDurationPercent = (() => {
    if (myBookings.length === 0) return '0';
    const duration =
      myPreferredDuration === 'Full Day'
        ? 'full'
        : myPreferredDuration === 'Morning'
          ? 'morning'
          : 'afternoon';
    return (
      (myBookings.filter(b => b.duration === duration).length / myBookings.length) *
      100
    ).toFixed(0);
  })();

  // Booking pattern (most common days)
  const myDayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  myBookings.forEach(b => {
    const dayOfWeek = new Date(b.date).getDay();
    myDayCounts[dayOfWeek]++;
  });
  const myTopDays = myDayCounts
    .map((count, idx) => ({ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx], count }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  // --- Booking Streak ---
  const calculateStreak = () => {
    if (myBookingsSorted.length === 0)
      return { current: 0, longest: 0, daysSinceLast: null as number | null };

    const lastBookingDate = myBookingsSorted[myBookingsSorted.length - 1]?.date;
    const daysSinceLast = lastBookingDate
      ? Math.floor((today.getTime() - new Date(lastBookingDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Calculate weekly streaks (consecutive weeks with at least one booking)
    const weeklyBookings = new Set<string>();
    myBookingsSorted.forEach(b => {
      const d = new Date(b.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      weeklyBookings.add(weekStart.toISOString().split('T')[0]);
    });

    const weeks = Array.from(weeklyBookings).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;

    for (let i = 1; i < weeks.length; i++) {
      const prev = new Date(weeks[i - 1]);
      const curr = new Date(weeks[i]);
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 7) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Check if current week has a booking
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());
    const hasCurrentWeekBooking = weeklyBookings.has(currentWeekStart.toISOString().split('T')[0]);

    if (hasCurrentWeekBooking && weeks.length > 0) {
      currentStreak = 1;
      for (let i = weeks.length - 2; i >= 0; i--) {
        const curr = new Date(weeks[i + 1]);
        const prev = new Date(weeks[i]);
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays === 7) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    return { current: currentStreak, longest: longestStreak, daysSinceLast };
  };

  const streakData = calculateStreak();

  // --- Environmental Impact (kept for potential future use) ---
  const _sharedTrips = Math.max(0, totalBookings - uniqueUsers.length * 10);
  const _co2Saved = (_sharedTrips * 2.3).toFixed(1);
  const _treesEquivalent = (parseFloat(_co2Saved) / 21).toFixed(1);

  // --- Monthly Capacity Report ---
  // Calculate workdays in current month (Mon-Fri)
  const getWorkdaysInMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let workdays = 0;
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) workdays++;
    }
    return workdays;
  };

  const workdaysThisMonth = getWorkdaysInMonth(today.getFullYear(), today.getMonth());
  const totalCapacityThisMonth = workdaysThisMonth * 2; // 2 spots per workday
  const usedCapacityThisMonth = thisMonthBookings.length;
  const _availableCapacityThisMonth = totalCapacityThisMonth - usedCapacityThisMonth;
  const _capacityUsedPercent = ((usedCapacityThisMonth / totalCapacityThisMonth) * 100).toFixed(0);

  // Demand vs Supply ratio (estimate demand as users who wanted to book)
  const _demandRatio =
    activeUsersThisMonth.length > 0
      ? (activeUsersThisMonth.length / (totalCapacityThisMonth / workdaysThisMonth)).toFixed(1)
      : '0';

  // --- Unmet Demand (days when both spots were full) ---
  const fullDays = monthlyOccupancy.filter(day => day.bookings >= 2).length;
  const fullDaysPercent =
    monthlyOccupancy.length > 0 ? ((fullDays / monthlyOccupancy.length) * 100).toFixed(0) : '0';

  // Find which days are most commonly full
  const fullDaysByWeekday = [0, 0, 0, 0, 0, 0, 0];
  monthlyOccupancy.forEach(day => {
    if (day.bookings >= 2) {
      fullDaysByWeekday[day.dayOfWeek]++;
    }
  });
  const mostFullDay = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][fullDaysByWeekday.indexOf(Math.max(...fullDaysByWeekday))];

  // --- 3-Month Trends ---
  const getMonthData = (monthsAgo: number) => {
    const targetDate = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
    const monthBookings = filterByDateRange(monthStart, monthEnd);
    const workdays = getWorkdaysInMonth(targetDate.getFullYear(), targetDate.getMonth());
    const capacity = workdays * 2;
    const utilization = capacity > 0 ? (monthBookings.length / capacity) * 100 : 0;
    return {
      name: targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      bookings: monthBookings.length,
      utilization: utilization.toFixed(0),
      capacity,
    };
  };

  const threeMonthTrend = [getMonthData(2), getMonthData(1), getMonthData(0)];

  // Predict next month (simple linear projection)
  const utilizationTrend = threeMonthTrend.map(m => parseFloat(m.utilization));
  const avgGrowth =
    utilizationTrend.length >= 2
      ? (utilizationTrend[utilizationTrend.length - 1] - utilizationTrend[0]) /
        (utilizationTrend.length - 1)
      : 0;
  const predictedUtilization = Math.min(
    100,
    Math.max(0, parseFloat(threeMonthTrend[2].utilization) + avgGrowth)
  ).toFixed(0);

  // --- Best Time to Book (Success Rate by Day/Time) ---
  // Analyze which days/times have more availability
  const daySuccessRates = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    .map((dayName, idx) => {
      const dayIndex = idx + 1; // Mon=1, Tue=2, etc.
      const daysInRange = monthlyOccupancy.filter(d => d.dayOfWeek === dayIndex);
      const totalSpots = daysInRange.length * 2; // 2 spots per day
      const bookedSpots = daysInRange.reduce((sum, d) => sum + d.bookings, 0);
      const freeSpots = totalSpots - bookedSpots;
      const occupancyRate = totalSpots > 0 ? (bookedSpots / totalSpots) * 100 : 0;
      return {
        day: dayName,
        occupancyRate: occupancyRate.toFixed(0),
        freeSpots,
        bookedSpots,
        totalSpots,
        total: daysInRange.length,
      };
    })
    .sort((a, b) => parseFloat(a.occupancyRate) - parseFloat(b.occupancyRate)); // Lowest occupancy = best day

  const bestDayToBook = daySuccessRates[0]; // Lowest occupancy
  const worstDayToBook = daySuccessRates[daySuccessRates.length - 1]; // Highest occupancy

  const stats = [
    {
      title: "This Week's Bookings",
      value: thisWeekBookings.length,
      icon: TrendingUp,
      gradient: 'bg-gradient-accent',
      description:
        weeklyGrowth > 0
          ? `↑ ${weeklyGrowth.toFixed(0)}% vs last week`
          : weeklyGrowth < 0
            ? `↓ ${Math.abs(weeklyGrowth).toFixed(0)}% vs last week`
            : 'No change from last week',
    },
    {
      title: "This Month's Bookings",
      value: thisMonthBookings.length,
      icon: BarChart3,
      gradient: 'bg-gradient-primary',
      description:
        monthlyGrowth > 0
          ? `↑ ${monthlyGrowth.toFixed(0)}% vs last month`
          : monthlyGrowth < 0
            ? `↓ ${Math.abs(monthlyGrowth).toFixed(0)}% vs last month`
            : 'No change from last month',
    },
    {
      title: 'Active Users',
      value: activeUsersThisMonth.length,
      icon: Users,
      gradient: 'bg-gradient-success',
      description: `${avgBookingsPerUser} avg bookings per user`,
    },
    {
      title: 'Week Utilization',
      value: `${weekOccupation.toFixed(0)}%`,
      icon: Percent,
      gradient: 'bg-gradient-primary',
      description:
        thisWeekBookings.length > 0
          ? `${thisWeekBookings.length} bookings this week`
          : 'No bookings this week',
    },
    {
      title: 'Month Utilization',
      value: `${monthOccupation.toFixed(0)}%`,
      icon: Activity,
      gradient: 'bg-gradient-success',
      description:
        thisMonthBookings.length > 0
          ? `${thisMonthBookings.length} bookings this month`
          : 'No bookings this month',
    },
    {
      title: 'Peak Day',
      value: peakDay,
      icon: Calendar,
      gradient: 'bg-gradient-accent',
      description: `Most popular booking day`,
    },
    {
      title: 'Booking Lead Time',
      value: `${avgLeadTime.toFixed(1)} days`,
      icon: Clock,
      gradient: 'bg-gradient-primary',
      description: 'Avg advance booking time',
    },
    {
      title: 'Vehicle Mix',
      value: `${((carBookings / totalBookings) * 100 || 0).toFixed(0)}% Cars`,
      icon: Car,
      gradient: 'bg-gradient-success',
      description: `${((motorcycleBookings / totalBookings) * 100 || 0).toFixed(0)}% motorcycles`,
    },
  ];

  // Calculate fairness score (lower variance = more fair)
  // V2: Use database view if available, fallback to client calculation
  const calculateFairnessScore = () => {
    // Use database fairness score if available
    if (fairness?.fairness_score !== null && fairness?.fairness_score !== undefined) {
      return fairness.fairness_score;
    }

    // Fallback to client-side calculation
    if (userBookingCounts.length === 0) return 100;
    const counts = userBookingCounts.map(u => u.thisMonth);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg === 0) return 100;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / avg) * 100; // Coefficient of variation
    return Math.max(0, Math.min(100, 100 - cv));
  };

  const fairnessScore = calculateFairnessScore();

  // Get current user's stats - use database stats if available (currentUserName defined above)
  const myStats = userBookingCounts.find(u => u.name === currentUserName);
  const myMonthBookings = myDbStats?.this_month ?? myStats?.thisMonth ?? 0;
  const avgMonthBookings =
    activeUsersThisMonth.length > 0 ? thisMonthBookings.length / activeUsersThisMonth.length : 0;
  const mySharePercent =
    thisMonthBookings.length > 0
      ? ((myMonthBookings / thisMonthBookings.length) * 100).toFixed(1)
      : '0';

  // V2: Merge database user stats with client-calculated stats
  const enhancedUserBookingCounts =
    userStats.length > 0
      ? userStats.map(dbStat => ({
          name: dbStat.display_name || 'Unknown',
          count: dbStat.total_bookings || 0,
          thisWeek: dbStat.this_week || 0,
          thisMonth: dbStat.this_month || 0,
          department: dbStat.department,
        }))
      : userBookingCounts;

  return (
    <div className="mesh-gradient min-h-screen bg-background">
      {/* Hero Section */}
      <div className="gradient-hero relative overflow-hidden px-4 py-8 text-white shadow-lg md:py-12">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
        <div className="container relative z-10 mx-auto max-w-6xl">
          <div className="mb-4 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="animate-fade-in text-white hover:bg-white/10"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Bookings
            </Button>
            <ThemeToggle variant="minimal" className="text-white hover:bg-white/20" />
          </div>
          <div className="animate-fade-in-up">
            <h1 className="mb-2 text-3xl font-bold md:mb-4 md:text-5xl">Statistics</h1>
            <p className="text-base opacity-90 md:text-xl">Detailed insights and usage metrics</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
        {loading ? (
          <div className="animate-fade-in py-12 text-center">
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading statistics...</p>
          </div>
        ) : (
          <div className="space-y-6 md:space-y-8">
            {/* Fairness & Your Stats Section - NEW */}
            <section className="animate-fade-in-up">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-primary h-1 w-8 rounded-full"></div>
                Fairness & Your Share
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                {/* Fairness Score */}
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Scale className="h-5 w-5 text-primary" />
                      Booking Equity Score
                    </CardTitle>
                    <CardDescription>
                      How fairly parking is distributed among all {uniqueUsers.length} team members
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex items-center gap-4">
                      <div className="relative h-24 w-24">
                        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            className="text-muted/30"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeDasharray={`${fairnessScore}, 100`}
                            className={
                              fairnessScore >= 70
                                ? 'text-success'
                                : fairnessScore >= 40
                                  ? 'text-warning'
                                  : 'text-destructive'
                            }
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-bold">{fairnessScore.toFixed(0)}</span>
                        </div>
                      </div>
                      <div>
                        <p
                          className={`text-lg font-semibold ${fairnessScore >= 70 ? 'text-success' : fairnessScore >= 40 ? 'text-warning' : 'text-destructive'}`}
                        >
                          {fairnessScore >= 70
                            ? 'Good'
                            : fairnessScore >= 40
                              ? 'Fair'
                              : 'Needs Improvement'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {fairnessScore >= 70
                            ? 'Parking is well distributed among team members'
                            : 'Some users may be booking more than their fair share'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Your Share */}
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Users className="h-5 w-5 text-primary" />
                      Your Monthly Share
                    </CardTitle>
                    <CardDescription>Your parking usage compared to team average</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-2 flex justify-between">
                          <span className="text-sm font-medium">
                            You: {myMonthBookings} bookings ({mySharePercent}%)
                          </span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-muted">
                          <div
                            className="gradient-primary h-3 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(parseFloat(mySharePercent) * 2, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">
                            Team Average: {avgMonthBookings.toFixed(1)} bookings
                          </span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-muted">
                          <div
                            className="h-3 rounded-full bg-muted-foreground/50 transition-all duration-500"
                            style={{
                              width: `${Math.min((avgMonthBookings / thisMonthBookings.length) * 100 * 2, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <p
                        className={`text-sm font-medium ${myMonthBookings > avgMonthBookings * 1.5 ? 'text-warning' : myMonthBookings < avgMonthBookings * 0.5 ? 'text-info' : 'text-success'}`}
                      >
                        {myMonthBookings > avgMonthBookings * 1.5
                          ? "⚠️ You're booking more than average. Consider sharing!"
                          : myMonthBookings < avgMonthBookings * 0.5 && myMonthBookings > 0
                            ? "📉 You're booking less than average"
                            : myMonthBookings === 0
                              ? "📭 You haven't booked this month"
                              : '✅ Your usage is balanced with the team'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Main Stats Grid */}
            <section className="animate-fade-in-up stagger-1">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-primary h-1 w-8 rounded-full"></div>
                Overview
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
                {stats.map((stat, index) => (
                  <Card
                    key={stat.title}
                    className="glass-card hover-lift animate-scale-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
                        {stat.title}
                      </CardTitle>
                      <CardDescription className="text-[10px] sm:text-xs">
                        {stat.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="truncate text-2xl font-bold sm:text-3xl">{stat.value}</div>
                        <div className={`rounded-lg p-2 sm:p-3 ${stat.gradient} shadow-md`}>
                          <stat.icon className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Detailed Breakdown */}
            <section className="animate-fade-in-up stagger-2">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-success h-1 w-8 rounded-full"></div>
                Breakdown
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg">
                      Vehicle Type Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="mb-2 flex justify-between">
                        <span className="flex items-center gap-2 text-xs font-medium sm:text-sm">
                          <Car className="h-3 w-3 sm:h-4 sm:w-4" />
                          Cars
                        </span>
                        <span className="text-xs font-bold sm:text-sm">{carBookings}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-info transition-all duration-500"
                          style={{ width: `${(carBookings / totalBookings) * 100 || 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex justify-between">
                        <span className="flex items-center gap-2 text-xs font-medium sm:text-sm">
                          <Bike className="h-3 w-3 sm:h-4 sm:w-4" />
                          Motorcycles
                        </span>
                        <span className="text-xs font-bold sm:text-sm">{motorcycleBookings}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-warning transition-all duration-500"
                          style={{ width: `${(motorcycleBookings / totalBookings) * 100 || 0}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg">Spot Usage</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="mb-2 flex justify-between">
                        <span className="text-xs font-medium sm:text-sm">Spot 84</span>
                        <span className="text-xs font-bold sm:text-sm">{spot84Count}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-success transition-all duration-500"
                          style={{ width: `${(spot84Count / totalBookings) * 100 || 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex justify-between">
                        <span className="text-xs font-medium sm:text-sm">Spot 85</span>
                        <span className="text-xs font-bold sm:text-sm">{spot85Count}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${(spot85Count / totalBookings) * 100 || 0}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Weekly Occupancy Details */}
            <section className="animate-fade-in-up stagger-3">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-accent h-1 w-8 rounded-full"></div>
                Weekly Occupancy
              </h2>
              <Card className="glass-card hover-lift">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">
                    This Week (
                    {thisWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                    - {thisWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                  </CardTitle>
                  <CardDescription>
                    Weekday capacity usage • Max: 2 spots/day (Spot 84 & Spot 85)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {weeklyOccupancy.map((day, index) => (
                      <div key={index}>
                        <div className="mb-1 flex justify-between">
                          <span className="text-xs font-medium sm:text-sm">{day.date}</span>
                          <span className="text-xs font-bold sm:text-sm">
                            {day.bookings}/{day.maxSlots} spots ({day.occupancy.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-muted">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-500 ${
                              day.occupancy >= 100
                                ? 'bg-destructive'
                                : day.occupancy >= 50
                                  ? 'bg-warning'
                                  : day.occupancy > 0
                                    ? 'bg-success'
                                    : 'bg-muted-foreground/30'
                            }`}
                            style={{ width: `${day.occupancy}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Monthly Occupancy Overview */}
            <section className="animate-fade-in-up stagger-4">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-primary h-1 w-8 rounded-full"></div>
                Monthly Occupancy
              </h2>
              <Card className="glass-card hover-lift">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">
                    {thisMonthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-4">
                    <span>{thisMonthBookings.length} bookings</span>
                    <span>•</span>
                    <span>Avg {monthOccupation.toFixed(0)}% occupancy</span>
                    <span>•</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)] ring-1 ring-success/50"></span>{' '}
                        Available
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-warning shadow-[0_0_6px_rgba(245,158,11,0.6)]"></span>{' '}
                        Half
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.6)]"></span>{' '}
                        Full
                      </span>
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Calendar Header - Day Names */}
                  <div className="mb-2 grid grid-cols-5 gap-1 sm:gap-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(dayName => (
                      <div
                        key={dayName}
                        className="rounded-md bg-muted/50 py-1.5 text-center text-xs font-medium text-muted-foreground"
                      >
                        {dayName}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid - Group by weeks */}
                  <div className="space-y-1 sm:space-y-2">
                    {(() => {
                      // Group days by weeks (Monday-Friday)
                      const weeks: (typeof monthlyOccupancy)[] = [];
                      let currentWeek: typeof monthlyOccupancy = [];

                      monthlyOccupancy.forEach(day => {
                        currentWeek.push(day);
                        // Friday is day 5
                        if (day.dayOfWeek === 5) {
                          weeks.push([...currentWeek]);
                          currentWeek = [];
                        }
                      });

                      // Add incomplete week if exists
                      if (currentWeek.length > 0) {
                        weeks.push(currentWeek);
                      }

                      return weeks.map((week, weekIndex) => (
                        <div key={weekIndex} className="grid grid-cols-5 gap-1 sm:gap-2">
                          {/* Fill empty cells at the start of the week if needed */}
                          {week[0] &&
                            Array.from({ length: week[0].dayOfWeek - 1 }).map((_, emptyIndex) => (
                              <div
                                key={`empty-${emptyIndex}`}
                                className="aspect-[4/3] sm:aspect-square"
                              />
                            ))}

                          {/* Render actual days */}
                          {week.map((day, dayIndex) => {
                            const isToday =
                              new Date().toDateString() ===
                              new Date(
                                thisMonthStart.getFullYear(),
                                thisMonthStart.getMonth(),
                                day.dayOfMonth
                              ).toDateString();
                            const occupancyClass =
                              day.occupancy >= 100
                                ? 'bg-destructive/15 border-destructive/40 dark:bg-destructive/20'
                                : day.occupancy >= 50
                                  ? 'bg-warning/15 border-warning/40 dark:bg-warning/20'
                                  : day.occupancy > 0
                                    ? 'bg-success/15 border-success/40 dark:bg-success/20'
                                    : 'bg-muted/30 border-border/50';

                            return (
                              <div
                                key={dayIndex}
                                className={`flex aspect-[4/3] cursor-default flex-col items-center justify-center rounded-lg border-2 p-1 transition-all duration-200 hover:scale-[1.02] sm:aspect-square sm:p-2 ${occupancyClass} ${isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                              >
                                <div
                                  className={`text-base font-bold sm:text-xl ${isToday ? 'text-primary' : ''}`}
                                >
                                  {day.dayOfMonth}
                                </div>
                                <div className="mt-1 flex items-center gap-1 sm:mt-1.5 sm:gap-1.5">
                                  {[0, 1].map(spotIndex => (
                                    <div
                                      key={spotIndex}
                                      className={`h-3 w-3 rounded-full transition-all sm:h-4 sm:w-4 ${
                                        spotIndex < day.bookings
                                          ? day.bookings >= 2
                                            ? 'bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.6)]'
                                            : 'bg-warning shadow-[0_0_6px_rgba(245,158,11,0.6)]'
                                          : 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)] ring-1 ring-success/50'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}

                          {/* Fill empty cells at the end of the week if needed */}
                          {week.length > 0 &&
                            week[week.length - 1] &&
                            Array.from({ length: 5 - week[week.length - 1].dayOfWeek }).map(
                              (_, emptyIndex) => (
                                <div
                                  key={`empty-end-${emptyIndex}`}
                                  className="aspect-[4/3] sm:aspect-square"
                                />
                              )
                            )}
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* User Booking Statistics */}
            <section className="animate-fade-in-up stagger-5">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-success h-1 w-8 rounded-full"></div>
                Booking Leaders
              </h2>
              <Card className="glass-card hover-lift">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">Who Books the Most</CardTitle>
                  <CardDescription>User ranking by total bookings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(enhancedUserBookingCounts.length > 0
                      ? enhancedUserBookingCounts
                      : userBookingCounts
                    ).map((user, index) => (
                      <div
                        key={user.name}
                        className={
                          currentUserName && user.name === currentUserName
                            ? 'rounded-lg border border-primary/20 bg-primary/10 p-2'
                            : ''
                        }
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                                index === 0
                                  ? 'bg-yellow-500'
                                  : index === 1
                                    ? 'bg-gray-400'
                                    : index === 2
                                      ? 'bg-orange-600'
                                      : 'bg-primary'
                              }`}
                            >
                              {index + 1}
                            </div>
                            <span className="text-sm font-medium">
                              {user.name}
                              {currentUserName && user.name === currentUserName && (
                                <span className="ml-1 text-xs text-primary">(You)</span>
                              )}
                            </span>
                            {'department' in user && user.department && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                {user.department}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold">{user.count} total</div>
                            <div className="text-xs text-muted-foreground">
                              {user.thisWeek} this week • {user.thisMonth} this month
                            </div>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${
                              index === 0
                                ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                                : index === 1
                                  ? 'bg-gradient-to-r from-gray-400 to-gray-500'
                                  : index === 2
                                    ? 'bg-gradient-to-r from-orange-600 to-orange-700'
                                    : 'gradient-primary'
                            }`}
                            style={{
                              width: `${(user.count / (enhancedUserBookingCounts[0]?.count || userBookingCounts[0]?.count || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Personal Parking Profile - NEW */}
            <section className="animate-fade-in-up stagger-6">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-accent h-1 w-8 rounded-full"></div>
                Your Parking Profile
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                {/* Profile Overview */}
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Target className="h-5 w-5 text-primary" />
                      Your Preferences
                    </CardTitle>
                    <CardDescription>Based on your booking history</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {myPrimaryVehicle === 'Car' ? (
                            <Car className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Bike className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm">Primary Vehicle</span>
                        </div>
                        <span className="font-semibold">{myPrimaryVehicle}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Favorite Spot</span>
                        </div>
                        <span className="font-semibold">
                          {myFavoriteSpot ? `Spot ${myFavoriteSpot}` : 'N/A'}
                          {myFavoriteSpot && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({myFavoriteSpotPercent}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Preferred Time</span>
                        </div>
                        <span className="font-semibold">
                          {myPreferredDuration}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({myPreferredDurationPercent}%)
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Booking Pattern</span>
                        </div>
                        <span className="font-semibold">
                          {myTopDays.length > 0
                            ? myTopDays.map(d => d.day).join(' & ')
                            : 'No pattern'}
                        </span>
                      </div>
                      <div className="mt-4 rounded-lg border border-border/50 bg-muted/30 p-3">
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold">{myBookings.length}</div>
                            <div className="text-xs text-muted-foreground">All Time</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold">{myMonthBookings}</div>
                            <div className="text-xs text-muted-foreground">This Month</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Booking Streak */}
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Flame className="h-5 w-5 text-orange-500" />
                      Booking Streak
                    </CardTitle>
                    <CardDescription>Your weekly booking consistency</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="flex items-center justify-around">
                        <div className="text-center">
                          <div className="mb-1 text-4xl font-bold text-orange-500">
                            {streakData.current}
                          </div>
                          <div className="text-sm text-muted-foreground">Current Streak</div>
                          <div className="text-xs text-muted-foreground">(weeks)</div>
                        </div>
                        <div className="h-16 w-px bg-border"></div>
                        <div className="text-center">
                          <div className="mb-1 text-4xl font-bold text-primary">
                            {streakData.longest}
                          </div>
                          <div className="text-sm text-muted-foreground">Longest Streak</div>
                          <div className="text-xs text-muted-foreground">(weeks)</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
                        {streakData.daysSinceLast !== null ? (
                          streakData.daysSinceLast === 0 ? (
                            <p className="text-success">🎉 You have a booking today!</p>
                          ) : streakData.daysSinceLast <= 7 ? (
                            <p className="text-sm">
                              Last booking:{' '}
                              <span className="font-semibold">
                                {streakData.daysSinceLast} days ago
                              </span>
                            </p>
                          ) : (
                            <p className="text-sm text-warning">
                              ⚠️ It's been {streakData.daysSinceLast} days since your last booking
                            </p>
                          )
                        ) : (
                          <p className="text-sm text-muted-foreground">No bookings yet</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Trends & Predictions - NEW */}
            <section className="animate-fade-in-up stagger-8">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-success h-1 w-8 rounded-full"></div>
                Trends & Predictions
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                {/* 3-Month Trend */}
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      3-Month Trend
                    </CardTitle>
                    <CardDescription>Historical utilization comparison</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {threeMonthTrend.map((month, index) => (
                        <div key={month.name}>
                          <div className="mb-1 flex justify-between">
                            <span className="text-sm font-medium">{month.name}</span>
                            <span className="text-sm">
                              {month.utilization}% ({month.bookings}/{month.capacity})
                            </span>
                          </div>
                          <div className="h-3 w-full rounded-full bg-muted">
                            <div
                              className={`h-3 rounded-full transition-all duration-500 ${
                                index === 2 ? 'gradient-primary' : 'bg-muted-foreground/50'
                              }`}
                              style={{ width: `${month.utilization}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="mt-4 rounded-lg border border-info/30 bg-info/10 p-3">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-info" />
                          <span className="font-semibold text-info">Prediction</span>
                        </div>
                        <p className="mt-1 text-sm">
                          Next month estimated at{' '}
                          <span className="font-bold">{predictedUtilization}%</span> utilization
                          {parseFloat(predictedUtilization) >= 90 && (
                            <span className="text-warning"> (High demand expected!)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Best Time to Book */}
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Lightbulb className="h-5 w-5 text-yellow-500" />
                      Best Time to Book
                    </CardTitle>
                    <CardDescription>Based on historical occupancy this month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">✅ Best Day</span>
                          <span className="font-bold text-success">{bestDayToBook?.day}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {bestDayToBook?.freeSpots} free spots out of {bestDayToBook?.totalSpots} (
                          {100 - parseInt(bestDayToBook?.occupancyRate || '0')}% free)
                        </p>
                      </div>
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">⚠️ Busiest Day</span>
                          <span className="font-bold text-destructive">{worstDayToBook?.day}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {worstDayToBook?.bookedSpots} of {worstDayToBook?.totalSpots} spots booked
                          ({worstDayToBook?.occupancyRate}% occupied)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Occupancy by Day:</p>
                        {daySuccessRates.map((day, idx) => (
                          <div key={day.day} className="flex items-center justify-between text-sm">
                            <span>{day.day}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 rounded-full bg-muted">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    idx === 0
                                      ? 'bg-success'
                                      : idx === daySuccessRates.length - 1
                                        ? 'bg-destructive'
                                        : 'bg-info'
                                  }`}
                                  style={{ width: `${day.occupancyRate}%` }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs">{day.occupancyRate}%</span>
                            </div>
                          </div>
                        ))}
                        <p className="mt-2 text-center text-xs text-muted-foreground">
                          Lower % = more spots available
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Unmet Demand - NEW */}
            <section className="animate-fade-in-up stagger-9">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold md:text-2xl">
                <div className="gradient-accent h-1 w-8 rounded-full"></div>
                Unmet Demand
              </h2>
              <Card className="glass-card hover-lift">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Activity className="h-5 w-5 text-warning" />
                    Days When Both Spots Were Full
                  </CardTitle>
                  <CardDescription>Times when demand exceeded available parking</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                    <div className="text-center">
                      <div className="mb-1 text-4xl font-bold text-warning">{fullDays}</div>
                      <div className="text-sm text-muted-foreground">Full Days</div>
                      <div className="text-xs text-muted-foreground">This Month</div>
                    </div>
                    <div className="text-center">
                      <div className="mb-1 text-4xl font-bold">{fullDaysPercent}%</div>
                      <div className="text-sm text-muted-foreground">Of Workdays</div>
                      <div className="text-xs text-muted-foreground">Were Full</div>
                    </div>
                    <div className="text-center">
                      <div className="mb-1 text-4xl font-bold text-destructive">{mostFullDay}</div>
                      <div className="text-sm text-muted-foreground">Most Common</div>
                      <div className="text-xs text-muted-foreground">Full Day</div>
                    </div>
                  </div>
                  {fullDays > 0 && (
                    <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-center">
                      <p className="text-sm">
                        💡 Tip: Try booking on{' '}
                        <span className="font-semibold">{bestDayToBook?.day}</span> for better
                        availability
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default Statistics;
