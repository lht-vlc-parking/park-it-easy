import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
  Minus,
  Zap,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Booking {
  id: string;
  date: string;
  duration: 'morning' | 'afternoon' | 'full';
  vehicle_type: 'car' | 'motorcycle';
  user_name: string;
  spot_number: number;
  created_at?: string;
}

interface TrendsTabProps {
  bookings: Booking[];
}

type TimeRange = '3m' | '6m' | 'all';

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '3m': 'Last 3 Months',
  '6m': 'Last 6 Months',
  all: 'All Time',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTimeRangeCutoff(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  const months = range === '3m' ? 3 : 6;
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
}

const occupancyChartConfig = {
  occupancy: {
    label: 'Occupancy',
    color: 'hsl(var(--primary))',
  },
} as const;

const dayOfWeekChartConfig = {
  bookings: {
    label: 'Bookings',
    color: 'hsl(var(--primary))',
  },
} as const;

export function TrendsTab({ bookings }: TrendsTabProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('3m');

  // Filter bookings by time range
  const filteredBookings = useMemo(() => {
    const cutoff = getTimeRangeCutoff(timeRange);
    if (!cutoff) return bookings;
    return bookings.filter(b => parseDate(b.date) >= cutoff);
  }, [bookings, timeRange]);

  // ─── Daily Occupancy Data (weekdays only) ──────────────────────────
  const dailyOccupancyData = useMemo(() => {
    const dayMap = new Map<string, Set<number>>();

    for (const b of filteredBookings) {
      const date = parseDate(b.date);
      if (!isWeekday(date)) continue;
      if (!dayMap.has(b.date)) dayMap.set(b.date, new Set());
      dayMap.get(b.date)!.add(b.spot_number);
    }

    const entries = Array.from(dayMap.entries())
      .map(([dateStr, spots]) => ({
        date: dateStr,
        spotsUsed: spots.size,
        occupancy: Math.round((spots.size / 2) * 100),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return entries;
  }, [filteredBookings]);

  // ─── Insights: Busiest / Quietest Month ────────────────────────────
  const { busiestMonth, quietestMonth } = useMemo(() => {
    const monthMap = new Map<string, { totalOccupancy: number; days: number }>();

    for (const d of dailyOccupancyData) {
      const date = parseDate(d.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) monthMap.set(key, { totalOccupancy: 0, days: 0 });
      const entry = monthMap.get(key)!;
      entry.totalOccupancy += d.occupancy;
      entry.days += 1;
    }

    let busiest = { key: '', avg: 0 };
    let quietest = { key: '', avg: Infinity };

    for (const [key, val] of monthMap) {
      const avg = val.days > 0 ? val.totalOccupancy / val.days : 0;
      if (avg > busiest.avg) busiest = { key, avg };
      if (avg < quietest.avg) quietest = { key, avg };
    }

    const formatKey = (key: string) => {
      if (!key) return 'N/A';
      const [y, m] = key.split('-').map(Number);
      return `${MONTH_NAMES[m - 1]} ${y}`;
    };

    return {
      busiestMonth: { name: formatKey(busiest.key), occupancy: Math.round(busiest.avg) },
      quietestMonth: {
        name: formatKey(quietest.key),
        occupancy: quietest.avg === Infinity ? 0 : Math.round(quietest.avg),
      },
    };
  }, [dailyOccupancyData]);

  // ─── Insights: Unmet Demand ────────────────────────────────────────
  const demandInsights = useMemo(() => {
    const totalWorkdays = dailyOccupancyData.length;
    const fullDays = dailyOccupancyData.filter(d => d.occupancy >= 100);
    const fullDayCount = fullDays.length;
    const percentage = totalWorkdays > 0 ? Math.round((fullDayCount / totalWorkdays) * 100) : 0;

    // Most common full day (weekday)
    const dayCount: Record<number, number> = {};
    for (const d of fullDays) {
      const date = parseDate(d.date);
      const dow = date.getDay(); // 1=Mon ... 5=Fri
      dayCount[dow] = (dayCount[dow] || 0) + 1;
    }

    let mostCommonDay = '';
    let maxCount = 0;
    for (const [dow, count] of Object.entries(dayCount)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonDay = DAY_NAMES[Number(dow) - 1] || '';
      }
    }

    return { fullDayCount, totalWorkdays, percentage, mostCommonDay };
  }, [dailyOccupancyData]);

  // ─── Insights: Prediction (linear regression) ─────────────────────
  const prediction = useMemo(() => {
    // Aggregate monthly average occupancy
    const monthMap = new Map<string, { total: number; days: number }>();
    for (const d of dailyOccupancyData) {
      const date = parseDate(d.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) monthMap.set(key, { total: 0, days: 0 });
      const entry = monthMap.get(key)!;
      entry.total += d.occupancy;
      entry.days += 1;
    }

    const monthlyData = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val], i) => ({ x: i, y: val.days > 0 ? val.total / val.days : 0 }));

    if (monthlyData.length < 2) {
      return { predicted: null, trend: 'stable' as const };
    }

    // Simple linear regression: y = mx + b
    const n = monthlyData.length;
    const sumX = monthlyData.reduce((s, d) => s + d.x, 0);
    const sumY = monthlyData.reduce((s, d) => s + d.y, 0);
    const sumXY = monthlyData.reduce((s, d) => s + d.x * d.y, 0);
    const sumX2 = monthlyData.reduce((s, d) => s + d.x * d.x, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return { predicted: Math.round(sumY / n), trend: 'stable' as const };
    }

    const m = (n * sumXY - sumX * sumY) / denominator;
    const b = (sumY - m * sumX) / n;
    const nextX = n; // predict next month
    const predicted = Math.max(0, Math.min(100, Math.round(m * nextX + b)));

    const trend: 'up' | 'down' | 'stable' = m > 2 ? 'up' : m < -2 ? 'down' : 'stable';

    return { predicted, trend };
  }, [dailyOccupancyData]);

  // ─── Day of Week Analysis ─────────────────────────────────────────
  const dayOfWeekData = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const b of filteredBookings) {
      const date = parseDate(b.date);
      const dow = date.getDay();
      if (dow >= 1 && dow <= 5) {
        counts[dow] += 1;
      }
    }

    const data = DAY_NAMES.map((name, i) => ({
      day: name,
      bookings: counts[i + 1],
    }));

    const maxBookings = Math.max(...data.map(d => d.bookings));

    return { data, maxBookings };
  }, [filteredBookings]);

  // ─── Monthly Heatmap Calendar (current month) ─────────────────────
  const calendarData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weekdays: Array<{
      dayOfMonth: number;
      dayOfWeek: number;
      bookings: number;
      dateStr: string;
    }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dow = date.getDay();
      if (dow >= 1 && dow <= 5) {
        const dateStr = formatDateStr(date);
        const dayBookings = new Set(
          bookings.filter(b => b.date === dateStr).map(b => b.spot_number)
        ).size;

        weekdays.push({
          dayOfMonth: d,
          dayOfWeek: dow,
          bookings: dayBookings,
          dateStr,
        });
      }
    }

    return { weekdays, year, month };
  }, [bookings]);

  const nextMonthName = MONTH_NAMES[new Date().getMonth() === 11 ? 0 : new Date().getMonth() + 1];

  return (
    <div className="space-y-6">
      {/* ─── Time Range Selector ──────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(TIME_RANGE_LABELS) as [TimeRange, string][]).map(([key, label]) => (
            <Button
              key={key}
              variant={timeRange === key ? 'default' : 'secondary'}
              size="sm"
              className="rounded-full text-xs"
              onClick={() => setTimeRange(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* ─── Occupancy Trend (AreaChart) ──────────────────────────── */}
      <section className="animate-fade-in-up">
        <Card className="glass-card hover-lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Activity className="h-5 w-5 text-primary" />
              Daily Occupancy Rate
            </CardTitle>
            <CardDescription>Weekday parking utilization over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={occupancyChartConfig} className="h-[250px] w-full md:h-[350px]">
              <AreaChart
                data={dailyOccupancyData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(142 76% 36%)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val: string) => {
                    const d = parseDate(val);
                    return d.toLocaleDateString('en-US', { month: 'short' });
                  }}
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(val: number) => `${val}%`}
                  tick={{ fontSize: 11 }}
                  width={40}
                />
                <ReferenceLine
                  y={100}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Full Capacity',
                    position: 'insideTopRight',
                    fontSize: 10,
                    fill: 'hsl(var(--destructive))',
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        if (!payload?.[0]?.payload) return '';
                        const p = payload[0].payload as {
                          date: string;
                          spotsUsed: number;
                          occupancy: number;
                        };
                        const d = parseDate(p.date);
                        return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — ${p.spotsUsed}/2 spots (${p.occupancy}%)`;
                      }}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="occupancy"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#occupancyGradient)"
                  name="Occupancy %"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      {/* ─── Insights Row ─────────────────────────────────────────── */}
      <section className="animate-fade-in-up stagger-1">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Busiest Period */}
          <Card className="glass-card hover-lift">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Flame className="h-4 w-4 text-warning" />
                Busiest Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-warning">
                    Hottest month
                  </p>
                  <p className="text-lg font-bold">{busiestMonth.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {busiestMonth.occupancy}% avg occupancy
                  </p>
                </div>
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">
                    Quietest: {quietestMonth.name} ({quietestMonth.occupancy}%)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Demand Patterns */}
          <Card className="glass-card hover-lift">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Zap className="h-4 w-4 text-destructive" />
                Unmet Demand
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-2xl font-bold">
                  {demandInsights.fullDayCount}
                  <span className="text-sm font-normal text-muted-foreground">
                    {' '}
                    / {demandInsights.totalWorkdays} days
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  at full capacity ({demandInsights.percentage}%)
                </p>
                {demandInsights.mostCommonDay && (
                  <p className="text-xs text-muted-foreground">
                    Most common full day:{' '}
                    <span className="font-semibold text-foreground">
                      {demandInsights.mostCommonDay}
                    </span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Prediction */}
          <Card className="glass-card hover-lift">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Calendar className="h-4 w-4 text-info" />
                Next Month Forecast
              </CardTitle>
              <CardDescription className="text-xs">{nextMonthName} prediction</CardDescription>
            </CardHeader>
            <CardContent>
              {prediction.predicted !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold">{prediction.predicted}%</span>
                    {prediction.trend === 'up' && <TrendingUp className="h-5 w-5 text-warning" />}
                    {prediction.trend === 'down' && (
                      <TrendingDown className="h-5 w-5 text-success" />
                    )}
                    {prediction.trend === 'stable' && (
                      <Minus className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <p
                    className={`text-sm font-medium ${
                      prediction.predicted > 90
                        ? 'text-warning'
                        : prediction.predicted < 50
                          ? 'text-success'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {prediction.predicted > 90 && (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        High demand expected!
                      </span>
                    )}
                    {prediction.predicted >= 50 && prediction.predicted <= 90 && 'Moderate demand'}
                    {prediction.predicted < 50 && 'Plenty of availability'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not enough data for a prediction yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── Day of Week Analysis (BarChart) ──────────────────────── */}
      <section className="animate-fade-in-up stagger-2">
        <Card className="glass-card hover-lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Bookings by Day of Week
            </CardTitle>
            <CardDescription>Total bookings per weekday in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={dayOfWeekChartConfig} className="h-[200px] w-full md:h-[280px]">
              <BarChart
                data={dayOfWeekData.data}
                margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={35} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="bookings"
                  radius={[6, 6, 0, 0]}
                  label={{ position: 'top', fontSize: 11 }}
                >
                  {dayOfWeekData.data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.bookings === dayOfWeekData.maxBookings
                          ? 'hsl(var(--warning))'
                          : 'hsl(var(--primary))'
                      }
                      opacity={entry.bookings === dayOfWeekData.maxBookings ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      {/* ─── Monthly Heatmap Calendar ─────────────────────────────── */}
      <section className="animate-fade-in-up stagger-3">
        <Card className="glass-card hover-lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              Monthly Occupancy Calendar
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-4">
              <span>
                {MONTH_NAMES[calendarData.month]} {calendarData.year}
              </span>
              <span>•</span>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)] ring-1 ring-success/50" />
                  Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-warning shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                  Half
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                  Full
                </span>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Day name headers */}
            <div className="mb-2 grid grid-cols-5 gap-1 sm:gap-2">
              {DAY_NAMES.map(name => (
                <div
                  key={name}
                  className="rounded-md bg-muted/50 py-1.5 text-center text-xs font-medium text-muted-foreground"
                >
                  {name}
                </div>
              ))}
            </div>

            {/* Calendar grid grouped by weeks */}
            <div className="space-y-1 sm:space-y-2">
              {(() => {
                const weeks: (typeof calendarData.weekdays)[] = [];
                let currentWeek: typeof calendarData.weekdays = [];

                for (const day of calendarData.weekdays) {
                  currentWeek.push(day);
                  if (day.dayOfWeek === 5) {
                    weeks.push([...currentWeek]);
                    currentWeek = [];
                  }
                }
                if (currentWeek.length > 0) {
                  weeks.push(currentWeek);
                }

                const todayStr = formatDateStr(new Date());

                return weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="grid grid-cols-5 gap-1 sm:gap-2">
                    {/* Empty leading cells */}
                    {week[0] &&
                      Array.from({ length: week[0].dayOfWeek - 1 }).map((_, i) => (
                        <div key={`empty-start-${i}`} className="aspect-[4/3] sm:aspect-square" />
                      ))}

                    {/* Day cells */}
                    {week.map(day => {
                      const isToday = day.dateStr === todayStr;
                      const occupancyClass =
                        day.bookings >= 2
                          ? 'bg-destructive/15 border-destructive/40 dark:bg-destructive/20'
                          : day.bookings === 1
                            ? 'bg-warning/15 border-warning/40 dark:bg-warning/20'
                            : 'bg-success/15 border-success/40 dark:bg-success/20';

                      return (
                        <div
                          key={day.dayOfMonth}
                          className={`flex aspect-[4/3] cursor-default flex-col items-center justify-center rounded-lg border-2 p-1 transition-all duration-200 hover:scale-[1.02] sm:aspect-square sm:p-2 ${occupancyClass} ${
                            isToday
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                              : ''
                          }`}
                        >
                          <div
                            className={`text-base font-bold sm:text-xl ${
                              isToday ? 'text-primary' : ''
                            }`}
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

                    {/* Empty trailing cells */}
                    {week.length > 0 &&
                      week[week.length - 1] &&
                      Array.from({ length: 5 - week[week.length - 1].dayOfWeek }).map((_, i) => (
                        <div key={`empty-end-${i}`} className="aspect-[4/3] sm:aspect-square" />
                      ))}
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
