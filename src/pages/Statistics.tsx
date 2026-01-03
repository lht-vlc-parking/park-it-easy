import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Calendar, Car, Bike, Percent, Clock, BarChart3, Users, Activity, Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/v2/ThemeToggle";

interface Booking {
  id: string;
  date: string;
  duration: "morning" | "afternoon" | "full";
  vehicle_type: "car" | "motorcycle";
  user_name: string;
  spot_number: number;
  created_at?: string;
}

const Statistics = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

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
  const activeBookings = bookings.filter(b => new Date(b.date) >= new Date(new Date().setHours(0, 0, 0, 0)));

  // Get unique users
  const uniqueUsers = [...new Set(bookings.map(b => b.user_name))];
  
  // User booking counts
  const userBookingCounts = uniqueUsers.map(userName => ({
    name: userName,
    count: bookings.filter(b => b.user_name === userName).length,
    thisWeek: thisWeekBookings.filter(b => b.user_name === userName).length,
    thisMonth: thisMonthBookings.filter(b => b.user_name === userName).length,
  })).sort((a, b) => b.count - a.count);

  const carBookings = bookings.filter(b => b.vehicle_type === "car").length;
  const motorcycleBookings = bookings.filter(b => b.vehicle_type === "motorcycle").length;
  const totalBookings = bookings.length;

  // Calculate weekly and monthly trends
  const weeklyGrowth = lastWeekBookings.length > 0 
    ? ((thisWeekBookings.length - lastWeekBookings.length) / lastWeekBookings.length) * 100 
    : 0;
  const monthlyGrowth = lastMonthBookings.length > 0 
    ? ((thisMonthBookings.length - lastMonthBookings.length) / lastMonthBookings.length) * 100 
    : 0;

  // Active users who booked this month
  const activeUsersThisMonth = [...new Set(thisMonthBookings.map(b => b.user_name))];
  
  // Average bookings per active user
  const avgBookingsPerUser = activeUsersThisMonth.length > 0 
    ? (thisMonthBookings.length / activeUsersThisMonth.length).toFixed(1) 
    : '0';

  // Peak booking day of the week
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun to Sat
  bookings.forEach(b => {
    const date = new Date(b.date);
    dayOfWeekCounts[date.getDay()]++;
  });
  const peakDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))
  ];

  // Average booking lead time (days in advance)
  const bookingsWithCreatedAt = bookings.filter(b => b.created_at);
  const avgLeadTime = bookingsWithCreatedAt.length > 0
    ? bookingsWithCreatedAt.reduce((sum, b) => {
        const bookingDate = new Date(b.date);
        const createdDate = new Date(b.created_at!);
        const diffDays = Math.floor((bookingDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
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
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayBookings = bookings.filter(b => b.date === dateStr);
      // Count unique spots (max 2 per day)
      const uniqueSpots = new Set(dayBookings.map(b => b.spot_number));
      const maxSpots = 2;
      const occupancy = (uniqueSpots.size / maxSpots) * 100;
      
      dailyData.push({
        date: currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        dayOfMonth: currentDate.getDate(),
        dayOfWeek: currentDate.getDay(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        bookings: uniqueSpots.size,
        occupancy: Math.min(occupancy, 100),
        maxSlots: maxSpots,
      });
    }
    return dailyData;
  };

  const weeklyOccupancy = getDailyOccupancy(thisWeekStart, 7);
  // Get monthly occupancy only for weekdays (Monday-Friday)
  const allMonthlyDays = getDailyOccupancy(thisMonthStart, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate());
  const monthlyOccupancy = allMonthlyDays.filter(day => day.dayOfWeek >= 1 && day.dayOfWeek <= 5); // Monday=1, Friday=5

  const weekOccupation = calculateOccupation(thisWeekBookings);
  const monthOccupation = calculateOccupation(thisMonthBookings);

  // Most popular spot
  const spot84Count = bookings.filter(b => b.spot_number === 84).length;
  const spot85Count = bookings.filter(b => b.spot_number === 85).length;
  const mostPopularSpot = spot84Count >= spot85Count ? 84 : 85;

  // Most popular time
  const morningCount = bookings.filter(b => b.duration === "morning" || b.duration === "full").length;
  const afternoonCount = bookings.filter(b => b.duration === "afternoon" || b.duration === "full").length;
  const mostPopularTime = morningCount >= afternoonCount ? "Morning" : "Afternoon";

  const stats = [
    {
      title: "This Week's Bookings",
      value: thisWeekBookings.length,
      icon: TrendingUp,
      gradient: "bg-gradient-accent",
      description: weeklyGrowth > 0 
        ? `↑ ${weeklyGrowth.toFixed(0)}% vs last week` 
        : weeklyGrowth < 0 
        ? `↓ ${Math.abs(weeklyGrowth).toFixed(0)}% vs last week` 
        : "No change from last week"
    },
    {
      title: "This Month's Bookings",
      value: thisMonthBookings.length,
      icon: BarChart3,
      gradient: "bg-gradient-primary",
      description: monthlyGrowth > 0 
        ? `↑ ${monthlyGrowth.toFixed(0)}% vs last month` 
        : monthlyGrowth < 0 
        ? `↓ ${Math.abs(monthlyGrowth).toFixed(0)}% vs last month` 
        : "No change from last month"
    },
    {
      title: "Active Users",
      value: activeUsersThisMonth.length,
      icon: Users,
      gradient: "bg-gradient-success",
      description: `${avgBookingsPerUser} avg bookings per user`
    },
    {
      title: "Week Utilization",
      value: `${weekOccupation.toFixed(0)}%`,
      icon: Percent,
      gradient: "bg-gradient-primary",
      description: thisWeekBookings.length > 0 ? `${thisWeekBookings.length} bookings this week` : "No bookings this week"
    },
    {
      title: "Month Utilization",
      value: `${monthOccupation.toFixed(0)}%`,
      icon: Activity,
      gradient: "bg-gradient-success",
      description: thisMonthBookings.length > 0 ? `${thisMonthBookings.length} bookings this month` : "No bookings this month"
    },
    {
      title: "Peak Day",
      value: peakDay,
      icon: Calendar,
      gradient: "bg-gradient-accent",
      description: `Most popular booking day`
    },
    {
      title: "Booking Lead Time",
      value: `${avgLeadTime.toFixed(1)} days`,
      icon: Clock,
      gradient: "bg-gradient-primary",
      description: "Avg advance booking time"
    },
    {
      title: "Vehicle Mix",
      value: `${((carBookings / totalBookings) * 100 || 0).toFixed(0)}% Cars`,
      icon: Car,
      gradient: "bg-gradient-success",
      description: `${((motorcycleBookings / totalBookings) * 100 || 0).toFixed(0)}% motorcycles`
    },
  ];

  // Calculate fairness score (lower variance = more fair)
  const calculateFairnessScore = () => {
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

  // Get current user's stats
  const currentUserName = user?.user_metadata?.user_name || user?.email;
  const myStats = userBookingCounts.find(u => u.name === currentUserName);
  const myMonthBookings = myStats?.thisMonth || 0;
  const avgMonthBookings = activeUsersThisMonth.length > 0 
    ? thisMonthBookings.length / activeUsersThisMonth.length 
    : 0;
  const mySharePercent = thisMonthBookings.length > 0 
    ? (myMonthBookings / thisMonthBookings.length * 100).toFixed(1) 
    : '0';

  return (
    <div className="min-h-screen bg-background mesh-gradient">
      {/* Hero Section */}
      <div className="gradient-hero text-white py-8 md:py-12 px-4 shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="text-white hover:bg-white/10 animate-fade-in"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Bookings
          </Button>
            <ThemeToggle variant="minimal" className="text-white hover:bg-white/20" />
          </div>
          <div className="animate-fade-in-up">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 md:mb-4">Statistics</h1>
            <p className="text-base md:text-xl opacity-90">
              Detailed insights and usage metrics
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
        {loading ? (
          <div className="text-center py-12 animate-fade-in">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Loading statistics...</p>
          </div>
        ) : (
          <div className="space-y-6 md:space-y-8">
            {/* Fairness & Your Stats Section - NEW */}
            <section className="animate-fade-in-up">
              <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="h-1 w-8 gradient-primary rounded-full"></div>
                Fairness & Your Share
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* Fairness Score */}
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Scale className="h-5 w-5 text-primary" />
                      Booking Equity Score
                    </CardTitle>
                    <CardDescription>
                      How fairly parking is distributed among all {uniqueUsers.length} team members
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative w-24 h-24">
                        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
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
                            className={fairnessScore >= 70 ? "text-success" : fairnessScore >= 40 ? "text-warning" : "text-destructive"}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-bold">{fairnessScore.toFixed(0)}</span>
                        </div>
                      </div>
                      <div>
                        <p className={`text-lg font-semibold ${fairnessScore >= 70 ? "text-success" : fairnessScore >= 40 ? "text-warning" : "text-destructive"}`}>
                          {fairnessScore >= 70 ? "Good" : fairnessScore >= 40 ? "Fair" : "Needs Improvement"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {fairnessScore >= 70 
                            ? "Parking is well distributed among team members" 
                            : "Some users may be booking more than their fair share"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Your Share */}
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Your Monthly Share
                    </CardTitle>
                    <CardDescription>
                      Your parking usage compared to team average
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm font-medium">You: {myMonthBookings} bookings ({mySharePercent}%)</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3">
                          <div
                            className="gradient-primary h-3 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(parseFloat(mySharePercent) * 2, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm font-medium text-muted-foreground">
                            Team Average: {avgMonthBookings.toFixed(1)} bookings
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3">
                          <div
                            className="bg-muted-foreground/50 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((avgMonthBookings / thisMonthBookings.length) * 100 * 2, 100)}%` }}
                          />
                        </div>
                      </div>
                      <p className={`text-sm font-medium ${myMonthBookings > avgMonthBookings * 1.5 ? "text-warning" : myMonthBookings < avgMonthBookings * 0.5 ? "text-info" : "text-success"}`}>
                        {myMonthBookings > avgMonthBookings * 1.5 
                          ? "⚠️ You're booking more than average. Consider sharing!" 
                          : myMonthBookings < avgMonthBookings * 0.5 && myMonthBookings > 0
                          ? "📉 You're booking less than average"
                          : myMonthBookings === 0
                          ? "📭 You haven't booked this month"
                          : "✅ Your usage is balanced with the team"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Main Stats Grid */}
            <section className="animate-fade-in-up stagger-1">
              <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="h-1 w-8 gradient-primary rounded-full"></div>
                Overview
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {stats.map((stat, index) => (
                  <Card 
                    key={stat.title} 
                    className="glass-card hover-lift animate-scale-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                        {stat.title}
                      </CardTitle>
                      <CardDescription className="text-[10px] sm:text-xs">
                        {stat.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-2xl sm:text-3xl font-bold truncate">{stat.value}</div>
                        <div className={`p-2 sm:p-3 rounded-lg ${stat.gradient} shadow-md`}>
                          <stat.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Detailed Breakdown */}
            <section className="animate-fade-in-up stagger-2">
              <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="h-1 w-8 gradient-success rounded-full"></div>
                Breakdown
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <Card className="glass-card hover-lift">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg">Vehicle Type Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs sm:text-sm font-medium flex items-center gap-2">
                          <Car className="h-3 w-3 sm:h-4 sm:w-4" />
                          Cars
                        </span>
                        <span className="text-xs sm:text-sm font-bold">{carBookings}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="gradient-primary h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(carBookings / totalBookings) * 100 || 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs sm:text-sm font-medium flex items-center gap-2">
                          <Bike className="h-3 w-3 sm:h-4 sm:w-4" />
                          Motorcycles
                        </span>
                        <span className="text-xs sm:text-sm font-bold">{motorcycleBookings}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="gradient-accent h-2 rounded-full transition-all duration-500"
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
                      <div className="flex justify-between mb-2">
                        <span className="text-xs sm:text-sm font-medium">Spot 84</span>
                        <span className="text-xs sm:text-sm font-bold">{spot84Count}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="gradient-success h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(spot84Count / totalBookings) * 100 || 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs sm:text-sm font-medium">Spot 85</span>
                        <span className="text-xs sm:text-sm font-bold">{spot85Count}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="gradient-accent h-2 rounded-full transition-all duration-500"
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
              <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="h-1 w-8 gradient-accent rounded-full"></div>
                Weekly Occupancy
              </h2>
              <Card className="glass-card hover-lift">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">This Week ({thisWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {thisWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</CardTitle>
                  <CardDescription>Daily capacity usage • Max: 2 spots/day (Spot 84 & Spot 85)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {weeklyOccupancy.map((day, index) => (
                      <div key={index}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs sm:text-sm font-medium">{day.date}</span>
                          <span className="text-xs sm:text-sm font-bold">{day.bookings}/{day.maxSlots} spots ({day.occupancy.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-500 ${
                              day.occupancy >= 100 ? 'bg-destructive' : 
                              day.occupancy >= 50 ? 'bg-warning' : 
                              day.occupancy > 0 ? 'bg-success' :
                              'bg-muted-foreground/30'
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
              <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="h-1 w-8 gradient-primary rounded-full"></div>
                Monthly Occupancy
              </h2>
              <Card className="glass-card hover-lift">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">
                    {thisMonthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-4 flex-wrap">
                    <span>{thisMonthBookings.length} bookings</span>
                    <span>•</span>
                    <span>Avg {monthOccupation.toFixed(0)}% occupancy</span>
                    <span>•</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success"></span> Available</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning"></span> Half</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive"></span> Full</span>
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Calendar Header - Day Names */}
                  <div className="grid grid-cols-5 gap-1 sm:gap-2 mb-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((dayName) => (
                      <div key={dayName} className="text-center font-medium text-xs text-muted-foreground py-1.5 bg-muted/50 rounded-md">
                        {dayName}
                      </div>
                    ))}
                  </div>
                  
                  {/* Calendar Grid - Group by weeks */}
                  <div className="space-y-1 sm:space-y-2">
                    {(() => {
                      // Group days by weeks (Monday-Friday)
                      const weeks: typeof monthlyOccupancy[] = [];
                      let currentWeek: typeof monthlyOccupancy = [];
                      
                      monthlyOccupancy.forEach((day) => {
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
                          {week[0] && Array.from({ length: week[0].dayOfWeek - 1 }).map((_, emptyIndex) => (
                            <div key={`empty-${emptyIndex}`} className="aspect-[4/3] sm:aspect-square" />
                          ))}
                          
                          {/* Render actual days */}
                          {week.map((day, dayIndex) => {
                            const isToday = new Date().toDateString() === new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth(), day.dayOfMonth).toDateString();
                            const occupancyClass = day.occupancy >= 100 
                              ? 'bg-destructive/15 border-destructive/40 dark:bg-destructive/20' 
                              : day.occupancy >= 50 
                              ? 'bg-warning/15 border-warning/40 dark:bg-warning/20' 
                              : day.occupancy > 0 
                              ? 'bg-success/15 border-success/40 dark:bg-success/20' 
                              : 'bg-muted/30 border-border/50';
                            
                            return (
                              <div 
                                key={dayIndex}
                                className={`aspect-[4/3] sm:aspect-square flex flex-col items-center justify-center p-1 sm:p-2 rounded-lg border-2 transition-all duration-200 hover:scale-[1.02] cursor-default ${occupancyClass} ${isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                              >
                                <div className={`text-base sm:text-xl font-bold ${isToday ? 'text-primary' : ''}`}>
                                  {day.dayOfMonth}
                                </div>
                                <div className="flex items-center gap-0.5 mt-0.5 sm:mt-1">
                                  {[0, 1].map((spotIndex) => (
                                    <div 
                                      key={spotIndex}
                                      className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-colors ${
                                        spotIndex < day.bookings 
                                          ? day.bookings >= 2 ? 'bg-destructive' : 'bg-warning' 
                                          : 'bg-muted-foreground/20'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          
                          {/* Fill empty cells at the end of the week if needed */}
                          {week.length > 0 && week[week.length - 1] && 
                            Array.from({ length: 5 - week[week.length - 1].dayOfWeek }).map((_, emptyIndex) => (
                              <div key={`empty-end-${emptyIndex}`} className="aspect-[4/3] sm:aspect-square" />
                            ))
                          }
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* User Booking Statistics */}
            <section className="animate-fade-in-up stagger-5">
              <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="h-1 w-8 gradient-success rounded-full"></div>
                Booking Leaders
              </h2>
              <Card className="glass-card hover-lift">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">Who Books the Most</CardTitle>
                  <CardDescription>User ranking by total bookings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {userBookingCounts.map((user, index) => (
                      <div key={user.name} className={currentUserName && user.name === currentUserName ? "p-2 rounded-lg bg-primary/10 border border-primary/20" : ""}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                              index === 0 ? 'bg-yellow-500' :
                              index === 1 ? 'bg-gray-400' :
                              index === 2 ? 'bg-orange-600' :
                              'bg-primary'
                            }`}>
                              {index + 1}
                            </div>
                            <span className="text-sm font-medium">
                              {user.name}
                              {currentUserName && user.name === currentUserName && <span className="text-xs text-primary ml-1">(You)</span>}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold">{user.count} total</div>
                            <div className="text-xs text-muted-foreground">
                              {user.thisWeek} this week • {user.thisMonth} this month
                            </div>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${
                              index === 0 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                              index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                              index === 2 ? 'bg-gradient-to-r from-orange-600 to-orange-700' :
                              'gradient-primary'
                            }`}
                            style={{ width: `${(user.count / userBookingCounts[0].count) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
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
