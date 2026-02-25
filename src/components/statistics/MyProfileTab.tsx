import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Line } from 'recharts';
import { Flame, Car, Bike, MapPin, Clock, Calendar, Award, Zap } from 'lucide-react';

interface Booking {
  id: string;
  date: string;
  duration: 'morning' | 'afternoon' | 'full';
  vehicle_type: 'car' | 'motorcycle';
  user_name: string;
  spot_number: number;
  created_at?: string;
}

interface MyProfileTabProps {
  bookings: Booking[];
  currentUserName: string | undefined;
  allBookings: Booking[];
}

// --- Utility helpers ---

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffWeeks(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

// --- Score gauge SVG component ---

function ScoreGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = 70;
  const strokeWidth = 12;
  const center = 85;
  const circumference = 2 * Math.PI * radius;
  // Arc from -225deg to +45deg (270deg sweep)
  const arcLength = (270 / 360) * circumference;
  const filledLength = (clampedScore / 100) * arcLength;

  const getColor = (s: number) => {
    if (s >= 70) return '#22c55e'; // green
    if (s >= 40) return '#eab308'; // yellow
    return '#ef4444'; // red
  };

  const getGradientId = 'scoreGradient';

  return (
    <div className="relative mx-auto h-[180px] w-[180px] sm:h-[200px] sm:w-[200px]">
      <svg
        viewBox="0 0 170 170"
        className="h-full w-full"
        style={{ filter: `drop-shadow(0 0 12px ${getColor(clampedScore)}40)` }}
      >
        <defs>
          <linearGradient id={getGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="40%" stopColor="#eab308" />
            <stop offset="70%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
        {/* Background arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(135 ${center} ${center})`}
        />
        {/* Filled arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${getGradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={`${filledLength} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(135 ${center} ${center})`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold sm:text-5xl" style={{ color: getColor(clampedScore) }}>
          {Math.round(clampedScore)}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function SubScoreBar({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-semibold">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

// --- Main Component ---

export default function MyProfileTab({
  bookings,
  currentUserName,
  allBookings,
}: MyProfileTabProps) {
  const myBookings = useMemo(
    () => bookings.filter(b => b.user_name === currentUserName),
    [bookings, currentUserName]
  );

  const myBookingsSorted = useMemo(
    () => [...myBookings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [myBookings]
  );

  const today = useMemo(() => new Date(), []);

  // ============================
  // 1. Parking Score Calculation
  // ============================

  const parkingScore = useMemo(() => {
    if (myBookingsSorted.length === 0) {
      return { total: 0, consistency: 0, fairness: 0, activity: 0 };
    }

    const firstBookingDate = new Date(myBookingsSorted[0].date);

    // --- Consistency (40%): weeks booked / total weeks since first booking ---
    const weeksWithBooking = new Set<string>();
    myBookingsSorted.forEach(b => {
      weeksWithBooking.add(getISOWeekKey(new Date(b.date)));
    });
    const totalWeeksSinceFirst = Math.max(
      1,
      diffWeeks(today, getWeekStartDate(firstBookingDate)) + 1
    );
    const consistency = Math.min(100, (weeksWithBooking.size / totalWeeksSinceFirst) * 100);

    // --- Fairness (30%): how close to the average booking count ---
    const uniqueUsers = [...new Set(allBookings.map(b => b.user_name))];
    const avgBookings = allBookings.length / Math.max(1, uniqueUsers.length);
    const deviation = Math.abs(myBookings.length - avgBookings);
    const fairness = Math.max(0, 100 - (deviation / Math.max(1, avgBookings)) * 100);

    // --- Activity (30%): months active / total months since first booking ---
    const monthsActive = new Set<string>();
    myBookingsSorted.forEach(b => {
      monthsActive.add(getMonthKey(new Date(b.date)));
    });
    const firstMonth = firstBookingDate.getFullYear() * 12 + firstBookingDate.getMonth();
    const currentMonth = today.getFullYear() * 12 + today.getMonth();
    const totalMonths = Math.max(1, currentMonth - firstMonth + 1);
    const activity = Math.min(100, (monthsActive.size / totalMonths) * 100);

    const total = consistency * 0.4 + fairness * 0.3 + activity * 0.3;

    return { total, consistency, fairness, activity };
  }, [myBookingsSorted, myBookings.length, allBookings, today]);

  // ============================
  // 2. Streak Calculation
  // ============================

  const streakData = useMemo(() => {
    if (myBookingsSorted.length === 0) {
      return { current: 0, longest: 0 };
    }

    const weeklyBookings = new Set<string>();
    myBookingsSorted.forEach(b => {
      weeklyBookings.add(getISOWeekKey(new Date(b.date)));
    });

    const weeks = Array.from(weeklyBookings).sort();
    let longestStreak = 1;
    let tempStreak = 1;

    for (let i = 1; i < weeks.length; i++) {
      // Parse week keys and check consecutive
      const [prevYear, prevWeek] = weeks[i - 1].split('-W').map(Number);
      const [currYear, currWeek] = weeks[i].split('-W').map(Number);
      const isConsecutive =
        (currYear === prevYear && currWeek === prevWeek + 1) ||
        (currYear === prevYear + 1 && prevWeek >= 52 && currWeek === 1);

      if (isConsecutive) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Current streak: count backwards from current week
    const currentWeekKey = getISOWeekKey(today);
    const lastWeekDate = new Date(today);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeekKey = getISOWeekKey(lastWeekDate);

    let currentStreak = 0;
    if (weeklyBookings.has(currentWeekKey) || weeklyBookings.has(lastWeekKey)) {
      // Start from the most recent week that has a booking
      const startKey = weeklyBookings.has(currentWeekKey) ? currentWeekKey : lastWeekKey;
      const startIdx = weeks.indexOf(startKey);
      if (startIdx >= 0) {
        currentStreak = 1;
        for (let i = startIdx - 1; i >= 0; i--) {
          const [prevYear, prevWeek] = weeks[i].split('-W').map(Number);
          const [currYear, currWeek] = weeks[i + 1].split('-W').map(Number);
          const isConsecutive =
            (currYear === prevYear && currWeek === prevWeek + 1) ||
            (currYear === prevYear + 1 && prevWeek >= 52 && currWeek === 1);
          if (isConsecutive) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
    }

    return { current: currentStreak, longest: longestStreak };
  }, [myBookingsSorted, today]);

  // ============================
  // 2b. Booking Heatmap
  // ============================

  const heatmapData = useMemo(() => {
    // Last 12 weeks, 5 columns (Mon-Fri)
    const weeks: { weekLabel: string; days: number[] }[] = [];
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 12 * 7);
    // Align to Monday
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));

    // Count bookings by date
    const bookingsByDate = new Map<string, number>();
    myBookings.forEach(b => {
      bookingsByDate.set(b.date, (bookingsByDate.get(b.date) || 0) + 1);
    });

    let totalInPeriod = 0;

    for (let w = 0; w < 12; w++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + w * 7);
      const days: number[] = [];
      for (let d = 0; d < 5; d++) {
        const cellDate = new Date(weekStart);
        cellDate.setDate(weekStart.getDate() + d);
        const key = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
        const count = bookingsByDate.get(key) || 0;
        days.push(count);
        totalInPeriod += count;
      }
      const weekLabel = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      weeks.push({ weekLabel, days });
    }

    return { weeks, totalInPeriod };
  }, [myBookings, today]);

  // ============================
  // 3. Preferences
  // ============================

  const preferences = useMemo(() => {
    if (myBookings.length === 0) {
      return {
        vehicle: { value: 'N/A', pct: 0 },
        spot: { value: 'N/A', pct: 0 },
        time: { value: 'N/A', pct: 0 },
        day: { value: 'N/A', pct: 0 },
      };
    }

    // Primary Vehicle
    const carCount = myBookings.filter(b => b.vehicle_type === 'car').length;
    const motoCount = myBookings.length - carCount;
    const vehicleIsCar = carCount >= motoCount;
    const vehiclePct = Math.round(
      ((vehicleIsCar ? carCount : motoCount) / myBookings.length) * 100
    );

    // Favorite Spot
    const spotCounts = new Map<number, number>();
    myBookings.forEach(b => {
      spotCounts.set(b.spot_number, (spotCounts.get(b.spot_number) || 0) + 1);
    });
    let favSpot = myBookings[0].spot_number;
    let favSpotCount = 0;
    spotCounts.forEach((count, spot) => {
      if (count > favSpotCount) {
        favSpot = spot;
        favSpotCount = count;
      }
    });
    const spotPct = Math.round((favSpotCount / myBookings.length) * 100);

    // Preferred Time
    const durationCounts = { morning: 0, afternoon: 0, full: 0 };
    myBookings.forEach(b => {
      durationCounts[b.duration]++;
    });
    const topDuration = (
      Object.entries(durationCounts) as [keyof typeof durationCounts, number][]
    ).sort((a, b) => b[1] - a[1])[0];
    const durationLabel =
      topDuration[0] === 'full'
        ? 'Full Day'
        : topDuration[0] === 'morning'
          ? 'Morning'
          : 'Afternoon';
    const timePct = Math.round((topDuration[1] / myBookings.length) * 100);

    // Best Day
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    myBookings.forEach(b => {
      dayCounts[new Date(b.date).getDay()]++;
    });
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let bestDayIdx = 1;
    let bestDayCount = 0;
    dayCounts.forEach((count, idx) => {
      if (count > bestDayCount) {
        bestDayIdx = idx;
        bestDayCount = count;
      }
    });
    const dayPct = Math.round((bestDayCount / myBookings.length) * 100);

    return {
      vehicle: { value: vehicleIsCar ? 'Car' : 'Motorcycle', pct: vehiclePct },
      spot: { value: `Spot ${favSpot}`, pct: spotPct },
      time: { value: durationLabel, pct: timePct },
      day: { value: dayNames[bestDayIdx], pct: dayPct },
    };
  }, [myBookings]);

  // ============================
  // 4. Monthly Activity Chart
  // ============================

  const monthlyActivityData = useMemo(() => {
    if (myBookingsSorted.length === 0) return [];

    const firstDate = new Date(myBookingsSorted[0].date);
    const firstMonth = firstDate.getFullYear() * 12 + firstDate.getMonth();
    const currentMonth = today.getFullYear() * 12 + today.getMonth();

    // My bookings by month
    const myMonthCounts = new Map<string, number>();
    myBookingsSorted.forEach(b => {
      const key = getMonthKey(new Date(b.date));
      myMonthCounts.set(key, (myMonthCounts.get(key) || 0) + 1);
    });

    // All bookings by month for team average
    const allMonthCounts = new Map<string, number>();
    const allMonthUsers = new Map<string, Set<string>>();
    allBookings.forEach(b => {
      const key = getMonthKey(new Date(b.date));
      allMonthCounts.set(key, (allMonthCounts.get(key) || 0) + 1);
      if (!allMonthUsers.has(key)) allMonthUsers.set(key, new Set());
      allMonthUsers.get(key)!.add(b.user_name);
    });

    const data: { month: string; you: number; teamAvg: number }[] = [];

    for (let m = firstMonth; m <= currentMonth; m++) {
      const year = Math.floor(m / 12);
      const month = m % 12;
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = new Date(year, month).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      const myCount = myMonthCounts.get(key) || 0;
      const allCount = allMonthCounts.get(key) || 0;
      const userCount = allMonthUsers.get(key)?.size || 1;
      const teamAvg = Math.round((allCount / userCount) * 10) / 10;

      data.push({ month: label, you: myCount, teamAvg });
    }

    return data;
  }, [myBookingsSorted, allBookings, today]);

  const chartConfig = {
    you: {
      label: 'Your Bookings',
      color: 'hsl(217, 91%, 60%)',
    },
    teamAvg: {
      label: 'Team Average',
      color: 'hsl(0, 0%, 60%)',
    },
  };

  // ============================
  // Render
  // ============================

  if (!currentUserName) {
    return (
      <Card className="glass-card animate-fade-in-up">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Award className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-semibold">Sign in to see your profile</p>
          <p className="text-sm text-muted-foreground">
            Your personal parking stats will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (myBookings.length === 0) {
    return (
      <Card className="glass-card animate-fade-in-up">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-semibold">No bookings yet</p>
          <p className="text-sm text-muted-foreground">
            Start booking parking spots to build your profile!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* === 1. Parking Score Hero Card === */}
      <Card className="glass-card animate-fade-in-up overflow-hidden shadow-glow">
        <CardHeader className="pb-2 text-center">
          <div className="mx-auto mb-1 flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg sm:text-xl">Your Parking Score</CardTitle>
          </div>
          <CardDescription>A snapshot of your parking habits</CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <ScoreGauge score={parkingScore.total} />
          <div className="mx-auto mt-4 max-w-xs space-y-2.5">
            <SubScoreBar
              label="Consistency"
              value={parkingScore.consistency}
              icon={<Flame className="h-3 w-3" />}
            />
            <SubScoreBar
              label="Fairness"
              value={parkingScore.fairness}
              icon={<Award className="h-3 w-3" />}
            />
            <SubScoreBar
              label="Activity"
              value={parkingScore.activity}
              icon={<Zap className="h-3 w-3" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* === 2. Streak & Heatmap Row === */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        {/* Current Streak Card */}
        <Card className="glass-card hover-lift animate-fade-in-up">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Flame className="h-5 w-5 text-orange-500" />
              Booking Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-8">
              {/* Current streak */}
              <div className="text-center">
                <div className="mb-1 text-5xl font-bold text-orange-500">{streakData.current}</div>
                <div className="text-sm text-muted-foreground">weeks</div>
                {streakData.current > 0 && (
                  <p className="mt-2 text-xs font-medium text-orange-500">Keep it going!</p>
                )}
              </div>
              <div className="h-16 w-px bg-border" />
              {/* Longest streak */}
              <div className="text-center">
                <div className="mb-1 text-3xl font-bold text-muted-foreground">
                  {streakData.longest}
                </div>
                <div className="text-xs text-muted-foreground">longest</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Booking Heatmap Card */}
        <Card className="glass-card hover-lift animate-fade-in-up">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              Your Booking Pattern
            </CardTitle>
            <CardDescription className="text-xs">
              {heatmapData.totalInPeriod} bookings in the last 12 weeks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Column labels */}
            <div className="mb-1 grid grid-cols-[auto_repeat(5,1fr)] gap-1">
              <div className="w-8" />
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => (
                <div key={d} className="text-center text-[10px] text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            {/* Grid rows */}
            <div className="space-y-0.5">
              {heatmapData.weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-[auto_repeat(5,1fr)] gap-1">
                  <div className="flex w-8 items-center justify-end pr-1 text-[9px] text-muted-foreground">
                    {wi % 3 === 0 ? week.weekLabel : ''}
                  </div>
                  {week.days.map((count, di) => (
                    <div
                      key={di}
                      className="aspect-square rounded-sm transition-colors"
                      style={{
                        backgroundColor:
                          count === 0
                            ? 'hsl(var(--muted) / 0.3)'
                            : count === 1
                              ? 'hsl(217 91% 60% / 0.5)'
                              : 'hsl(217 91% 60% / 0.9)',
                      }}
                      title={`${count} booking${count !== 1 ? 's' : ''}`}
                    />
                  ))}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              <span>Less</span>
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: 'hsl(var(--muted) / 0.3)' }}
              />
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: 'hsl(217 91% 60% / 0.5)' }}
              />
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: 'hsl(217 91% 60% / 0.9)' }}
              />
              <span>More</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === 3. Your Preferences === */}
      <Card className="glass-card hover-lift animate-fade-in-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Your Preferences
          </CardTitle>
          <CardDescription>What defines your parking style</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {/* Primary Vehicle */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 transition-colors hover:bg-muted/40">
              <div className="mb-2 flex items-center gap-1.5">
                {preferences.vehicle.value === 'Car' ? (
                  <Car className="h-4 w-4 text-blue-500" />
                ) : (
                  <Bike className="h-4 w-4 text-orange-500" />
                )}
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Vehicle
                </span>
              </div>
              <p className="text-sm font-bold">{preferences.vehicle.value}</p>
              <div className="mt-1.5 h-1 w-full rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${preferences.vehicle.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{preferences.vehicle.pct}%</p>
            </div>

            {/* Favorite Spot */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 transition-colors hover:bg-muted/40">
              <div className="mb-2 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-green-500" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Spot
                </span>
              </div>
              <p className="text-sm font-bold">{preferences.spot.value}</p>
              <div className="mt-1.5 h-1 w-full rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${preferences.spot.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{preferences.spot.pct}%</p>
            </div>

            {/* Preferred Time */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 transition-colors hover:bg-muted/40">
              <div className="mb-2 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-purple-500" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Time
                </span>
              </div>
              <p className="text-sm font-bold">{preferences.time.value}</p>
              <div className="mt-1.5 h-1 w-full rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${preferences.time.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{preferences.time.pct}%</p>
            </div>

            {/* Best Day */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 transition-colors hover:bg-muted/40">
              <div className="mb-2 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-amber-500" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Day
                </span>
              </div>
              <p className="text-sm font-bold">{preferences.day.value}</p>
              <div className="mt-1.5 h-1 w-full rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${preferences.day.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{preferences.day.pct}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === 4. Monthly Activity Chart === */}
      <Card className="glass-card hover-lift animate-fade-in-up">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Award className="h-5 w-5 text-primary" />
            Your Monthly Activity
          </CardTitle>
          <CardDescription>Your bookings vs team average over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[200px] w-full sm:h-[300px]">
            <ComposedChart
              data={monthlyActivityData}
              margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="you" fill="url(#barGradient)" radius={[4, 4, 0, 0]} name="you" />
              <Line
                dataKey="teamAvg"
                type="monotone"
                stroke="hsl(0, 0%, 60%)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="teamAvg"
              />
            </ComposedChart>
          </ChartContainer>
          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[hsl(217,91%,60%)]" />
              Your Bookings
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[hsl(0,0%,60%)]" />
              Team Average
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
