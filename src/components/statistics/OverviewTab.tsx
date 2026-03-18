import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BarChart3, Activity, Users, Clock, Trophy, Calendar, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

import type { Booking } from '@/types/booking';

interface OverviewTabProps {
  bookings: Booking[];
  uniqueUsers: string[];
  fairnessScore: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a key like "2026-01" from a date string. */
function toMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Pretty month label: "Jan '26" */
function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[Number(m) - 1]} '${y.slice(2)}`;
}

/** Count workdays (Mon-Fri) between two dates inclusive. */
function countWorkdays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Count workdays in a specific month. */
function workdaysInMonth(year: number, month: number): number {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0); // last day
  return countWorkdays(start, end);
}

/** Generate all month keys between two month keys inclusive. */
function monthRange(first: string, last: string): string[] {
  const keys: string[] = [];
  const [fy, fm] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  let y = fy;
  let m = fm;
  while (y < ly || (y === ly && m <= lm)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return keys;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const SPOTS = 2; // number of parking spots

// ---------------------------------------------------------------------------
// Chart config
// ---------------------------------------------------------------------------

const chartConfig: ChartConfig = {
  bookings: {
    label: 'Bookings',
    color: 'hsl(var(--primary))',
  },
  utilization: {
    label: 'Utilization %',
    color: 'hsl(var(--success))',
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const width = 64;
  const height = 24;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="mt-1 opacity-60">
      <polyline
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  );
}

function FairnessGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 40;
  const stroke = 8;
  // Semi-circle: 180 degrees
  const circumference = Math.PI * radius;
  const progress = (clamped / 100) * circumference;

  let color: string;
  if (clamped >= 70) color = 'hsl(var(--success))';
  else if (clamped >= 40) color = 'hsl(var(--warning))';
  else color = 'hsl(var(--destructive, 0 84% 60%))';

  return (
    <div className="flex flex-col items-center">
      <svg
        width={radius * 2 + stroke}
        height={radius + stroke + 8}
        viewBox={`0 0 ${radius * 2 + stroke} ${radius + stroke + 8}`}
      >
        {/* Background arc */}
        <path
          d={`M ${stroke / 2} ${radius + stroke / 2} A ${radius} ${radius} 0 0 1 ${radius * 2 + stroke / 2} ${radius + stroke / 2}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M ${stroke / 2} ${radius + stroke / 2} A ${radius} ${radius} 0 0 1 ${radius * 2 + stroke / 2} ${radius + stroke / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className="transition-all duration-700 ease-out"
        />
        {/* Score text */}
        <text
          x={radius + stroke / 2}
          y={radius}
          textAnchor="middle"
          className="fill-foreground text-lg font-bold"
          fontSize="18"
          fontWeight="700"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OverviewTab({ bookings, uniqueUsers, fairnessScore }: OverviewTabProps) {
  // ---- Computed stats ----
  const stats = useMemo(() => {
    if (bookings.length === 0) {
      return {
        totalBookings: 0,
        utilization: 0,
        teamMembers: uniqueUsers.length,
        avgLeadTime: 0,
        monthlyData: [] as {
          month: string;
          label: string;
          bookings: number;
          utilization: number;
        }[],
        sparklineData: [] as number[],
        peakMonth: 'N/A',
        peakMonthCount: 0,
        busiestDay: 'N/A',
      };
    }

    // Sort bookings by date
    const sorted = [...bookings].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // --- Total bookings ---
    const totalBookings = bookings.length;

    // --- All-time utilization ---
    const firstDate = new Date(sorted[0].date);
    const today = new Date();
    const totalWorkdays = countWorkdays(firstDate, today);
    // Each booking occupies a "slot day". Full = 1 day, morning/afternoon = 0.5 day
    const totalSlotDays = bookings.reduce((sum, b) => {
      return sum + (b.duration === 'full' ? 1 : 0.5);
    }, 0);
    const utilization =
      totalWorkdays > 0 ? Math.min((totalSlotDays / (totalWorkdays * SPOTS)) * 100, 100) : 0;

    // --- Average lead time ---
    const leadTimes: number[] = [];
    for (const b of bookings) {
      if (b.created_at) {
        const created = new Date(b.created_at);
        const booked = new Date(b.date);
        const diffMs = booked.getTime() - created.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays >= 0) leadTimes.push(diffDays);
      }
    }
    const avgLeadTime =
      leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

    // --- Monthly data ---
    const firstMonth = toMonthKey(sorted[0].date);
    const nowMonth = toMonthKey(today.toISOString());
    const allMonths = monthRange(firstMonth, nowMonth);

    // Count bookings per month
    const monthCounts: Record<string, number> = {};
    const monthSlotDays: Record<string, number> = {};
    for (const m of allMonths) {
      monthCounts[m] = 0;
      monthSlotDays[m] = 0;
    }
    for (const b of bookings) {
      const mk = toMonthKey(b.date);
      if (mk in monthCounts) {
        monthCounts[mk]++;
        monthSlotDays[mk] += b.duration === 'full' ? 1 : 0.5;
      }
    }

    const monthlyData = allMonths.map(m => {
      const [y, mo] = m.split('-').map(Number);
      const wd = workdaysInMonth(y, mo - 1);
      const util = wd > 0 ? Math.min((monthSlotDays[m] / (wd * SPOTS)) * 100, 100) : 0;
      return {
        month: m,
        label: formatMonthLabel(m),
        bookings: monthCounts[m],
        utilization: Math.round(util),
      };
    });

    // --- Sparkline: last 6 months ---
    const last6 = monthlyData.slice(-6);
    const sparklineData = last6.map(d => d.bookings);

    // --- Peak month ---
    let peakMonth = allMonths[0];
    let peakMonthCount = 0;
    for (const m of allMonths) {
      if (monthCounts[m] > peakMonthCount) {
        peakMonthCount = monthCounts[m];
        peakMonth = m;
      }
    }

    // --- Busiest weekday ---
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    for (const b of bookings) {
      const day = new Date(b.date).getDay();
      weekdayCounts[day]++;
    }
    // Only consider Mon-Fri
    let busiestDayIdx = 1;
    for (let i = 1; i <= 5; i++) {
      if (weekdayCounts[i] > weekdayCounts[busiestDayIdx]) {
        busiestDayIdx = i;
      }
    }
    const busiestDay = WEEKDAY_NAMES[busiestDayIdx];

    return {
      totalBookings,
      utilization,
      teamMembers: uniqueUsers.length,
      avgLeadTime,
      monthlyData,
      sparklineData,
      peakMonth: formatMonthLabel(peakMonth),
      peakMonthCount,
      busiestDay,
    };
  }, [bookings, uniqueUsers]);

  return (
    <div className="space-y-6">
      {/* ================================================================
          HERO METRICS ROW
          ================================================================ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {/* Total Bookings */}
        <Card className="glass-card hover-lift animate-fade-in-up stagger-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-3xl font-bold">{stats.totalBookings}</div>
            <CardDescription>all-time reservations</CardDescription>
            <MiniSparkline data={stats.sparklineData} />
          </CardContent>
        </Card>

        {/* All-Time Utilization */}
        <Card className="glass-card hover-lift animate-fade-in-up stagger-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Utilization</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-3xl font-bold">{stats.utilization.toFixed(1)}%</div>
            <CardDescription>of available spot-days used</CardDescription>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card className="glass-card hover-lift animate-fade-in-up stagger-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-3xl font-bold">{stats.teamMembers}</div>
            <CardDescription>have used parking</CardDescription>
          </CardContent>
        </Card>

        {/* Avg Lead Time */}
        <Card className="glass-card hover-lift animate-fade-in-up stagger-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-3xl font-bold">{stats.avgLeadTime.toFixed(1)}</div>
            <CardDescription>days booked in advance</CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================
          MONTHLY BOOKINGS TREND
          ================================================================ */}
      <Card className="glass-card animate-fade-in-up stagger-5">
        <CardHeader>
          <CardTitle>Booking Activity Over Time</CardTitle>
          <CardDescription>
            Monthly bookings and utilization since the first reservation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full md:h-[350px]">
            <AreaChart data={stats.monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillBookings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fillUtilization" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
              />
              <YAxis
                yAxisId="left"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={label => String(label)}
                    formatter={(value, name) => {
                      if (name === 'utilization') {
                        return (
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: 'hsl(var(--success))' }}
                            />
                            <span className="flex flex-1 justify-between gap-4">
                              <span className="text-muted-foreground">Utilization</span>
                              <span className="font-mono font-medium tabular-nums text-foreground">
                                {value}%
                              </span>
                            </span>
                          </span>
                        );
                      }
                      return (
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: 'hsl(var(--primary))' }}
                          />
                          <span className="flex flex-1 justify-between gap-4">
                            <span className="text-muted-foreground">Bookings</span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {value}
                            </span>
                          </span>
                        </span>
                      );
                    }}
                  />
                }
              />
              <Area
                yAxisId="left"
                dataKey="bookings"
                type="monotone"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#fillBookings)"
              />
              <Area
                yAxisId="right"
                dataKey="utilization"
                type="monotone"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                strokeDasharray="4 4"
                fill="url(#fillUtilization)"
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ================================================================
          QUICK INSIGHTS ROW
          ================================================================ */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {/* Peak Month */}
        <Card className="glass-card hover-lift animate-fade-in-up stagger-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Peak Month</CardTitle>
            <Trophy className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.peakMonth}</div>
            <CardDescription>
              {stats.peakMonthCount} bookings — the busiest month yet
            </CardDescription>
          </CardContent>
        </Card>

        {/* Busiest Day */}
        <Card className="glass-card hover-lift animate-fade-in-up stagger-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Busiest Day</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.busiestDay}</div>
            <CardDescription>most popular weekday for parking</CardDescription>
          </CardContent>
        </Card>

        {/* Fairness Score */}
        <Card className="glass-card hover-lift animate-fade-in-up stagger-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fairness Score</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-2">
            <FairnessGauge score={fairnessScore} />
            <CardDescription className="mt-2 text-center">
              {fairnessScore >= 70
                ? 'nicely balanced across the team'
                : fairnessScore >= 40
                  ? 'some members book more than others'
                  : 'a few people dominate the spots'}
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
