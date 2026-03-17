import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Line,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';
import { Trophy, Medal, Users, Car, Bike, Crown, Star } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Booking {
  id: string;
  date: string;
  duration: 'morning' | 'afternoon' | 'full';
  vehicle_type: 'car' | 'motorcycle';
  user_name: string;
  spot_number: number;
  created_at?: string;
}

interface TeamTabProps {
  bookings: Booking[];
  currentUserName: string | undefined;
  fairnessScore: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr).getDay(); // 0=Sun … 6=Sat
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TeamTab({ bookings, currentUserName, fairnessScore }: TeamTabProps) {
  // ---- Aggregated user data --------------------------------------------------
  const userDataMap = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        cars: number;
        motorcycles: number;
        spot84: number;
        spot85: number;
        firstDate: string;
      }
    >();
    for (const b of bookings) {
      let entry = map.get(b.user_name);
      if (!entry) {
        entry = {
          name: b.user_name,
          total: 0,
          cars: 0,
          motorcycles: 0,
          spot84: 0,
          spot85: 0,
          firstDate: b.date,
        };
        map.set(b.user_name, entry);
      }
      entry.total++;
      if (b.vehicle_type === 'car') entry.cars++;
      else entry.motorcycles++;
      if (b.spot_number === 84) entry.spot84++;
      else if (b.spot_number === 85) entry.spot85++;
      if (b.date < entry.firstDate) entry.firstDate = b.date;
    }
    return map;
  }, [bookings]);

  const rankedUsers = useMemo(
    () => Array.from(userDataMap.values()).sort((a, b) => b.total - a.total),
    [userDataMap]
  );

  const topThree = rankedUsers.slice(0, 3);
  const rest = rankedUsers.slice(3);

  // ---- Vehicle mix (pie) -----------------------------------------------------
  const vehicleMixData = useMemo(() => {
    let cars = 0;
    let motorcycles = 0;
    for (const b of bookings) {
      if (b.vehicle_type === 'car') cars++;
      else motorcycles++;
    }
    return [
      { name: 'Cars', value: cars },
      { name: 'Motorcycles', value: motorcycles },
    ];
  }, [bookings]);

  const vehicleChartConfig: ChartConfig = {
    Cars: { label: 'Cars', color: 'hsl(var(--info))' },
    Motorcycles: { label: 'Motorcycles', color: 'hsl(var(--warning))' },
  };

  const VEHICLE_COLORS = ['hsl(var(--info))', 'hsl(var(--warning))'];

  // ---- Spot popularity by day (bar) ------------------------------------------
  const spotByDayData = useMemo(() => {
    const grid: Record<string, { spot84: number; spot85: number }> = {};
    for (const label of DAY_LABELS) grid[label] = { spot84: 0, spot85: 0 };

    for (const b of bookings) {
      const dow = getDayOfWeek(b.date); // 0=Sun
      if (dow >= 1 && dow <= 5) {
        const label = DAY_LABELS[dow - 1];
        if (b.spot_number === 84) grid[label].spot84++;
        else if (b.spot_number === 85) grid[label].spot85++;
      }
    }
    return DAY_LABELS.map(d => ({
      day: d,
      'Spot 84': grid[d].spot84,
      'Spot 85': grid[d].spot85,
    }));
  }, [bookings]);

  const spotChartConfig: ChartConfig = {
    'Spot 84': { label: 'Spot 84', color: 'hsl(var(--success))' },
    'Spot 85': { label: 'Spot 85', color: 'hsl(var(--primary))' },
  };

  // ---- Monthly fairness over time (line) -------------------------------------
  const fairnessOverTime = useMemo(() => {
    // Group bookings by month
    const monthMap = new Map<string, Map<string, number>>();
    for (const b of bookings) {
      const d = new Date(b.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) monthMap.set(key, new Map());
      const userMap = monthMap.get(key)!;
      userMap.set(b.user_name, (userMap.get(b.user_name) ?? 0) + 1);
    }

    const months = Array.from(monthMap.keys()).sort();
    return months.map(m => {
      const userCounts = Array.from(monthMap.get(m)!.values());
      const avg = userCounts.reduce((s, v) => s + v, 0) / userCounts.length;
      if (avg === 0) return { month: m, score: 100 };
      const variance = userCounts.reduce((s, v) => s + (v - avg) ** 2, 0) / userCounts.length;
      const cv = (Math.sqrt(variance) / avg) * 100;
      const score = Math.max(0, Math.min(100, 100 - cv));
      return {
        month: new Date(m + '-01').toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        }),
        score: Math.round(score),
      };
    });
  }, [bookings]);

  const fairnessChartConfig: ChartConfig = {
    score: { label: 'Fairness', color: 'hsl(var(--primary))' },
  };

  // ---- Max total for progress bars -------------------------------------------
  const maxTotal = rankedUsers[0]?.total ?? 1;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const medalColor = (rank: number) => {
    if (rank === 0) return 'bg-yellow-500';
    if (rank === 1) return 'bg-gray-400';
    if (rank === 2) return 'bg-orange-600';
    return 'bg-primary';
  };

  const podiumIcon = (rank: number) => {
    if (rank === 0) return <Crown className="h-5 w-5 text-yellow-400" />;
    if (rank === 1) return <Medal className="h-4 w-4 text-gray-300" />;
    if (rank === 2) return <Medal className="h-4 w-4 text-orange-400" />;
    return null;
  };

  // Podium ordering: [2nd, 1st, 3rd]
  const podiumOrder = useMemo(() => {
    if (topThree.length === 0) return [];
    if (topThree.length === 1) return [{ ...topThree[0], rank: 0 }];
    if (topThree.length === 2)
      return [
        { ...topThree[1], rank: 1 },
        { ...topThree[0], rank: 0 },
      ];
    return [
      { ...topThree[1], rank: 1 },
      { ...topThree[0], rank: 0 },
      { ...topThree[2], rank: 2 },
    ];
  }, [topThree]);

  const podiumHeight = (rank: number) => {
    if (rank === 0) return 'h-32';
    if (rank === 1) return 'h-24';
    return 'h-20';
  };

  const podiumHeightMobile = (rank: number) => {
    if (rank === 0) return 'h-24';
    if (rank === 1) return 'h-20';
    return 'h-16';
  };

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ===== 1. Podium-Style Leaderboard ===== */}
      <section className="animate-fade-in-up">
        <Card className="glass-card hover-lift overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Leaderboard
            </CardTitle>
            <CardDescription>Top parkers by total bookings</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Podium */}
            {podiumOrder.length > 0 && (
              <div className="mb-6 flex items-end justify-center gap-2 sm:gap-4">
                {podiumOrder.map(u => (
                  <div key={u.name} className="flex flex-col items-center gap-1">
                    {/* Icon */}
                    {podiumIcon(u.rank)}

                    {/* Avatar */}
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white sm:h-14 sm:w-14 sm:text-base ${medalColor(u.rank)} ${u.rank === 0 ? 'shadow-lg ring-4 ring-yellow-300/50' : ''}`}
                    >
                      {getInitials(u.name)}
                    </div>

                    {/* Name & count */}
                    <span className="max-w-[80px] truncate text-center text-xs font-semibold sm:max-w-[100px] sm:text-sm">
                      {u.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{u.total} bookings</span>

                    {/* Podium block */}
                    <div
                      className={`w-16 rounded-t-lg sm:w-24 ${medalColor(u.rank)} ${podiumHeightMobile(u.rank)} sm:${podiumHeight(u.rank)} flex items-center justify-center`}
                    >
                      <span className="text-lg font-black text-white sm:text-2xl">
                        {u.rank + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Remaining users */}
            {rest.length > 0 && (
              <div className="space-y-2">
                {rest.map((u, i) => {
                  const rank = i + 3;
                  const isMe = currentUserName === u.name;
                  return (
                    <div
                      key={u.name}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${isMe ? 'border border-primary/30 bg-primary/5' : 'hover:bg-muted/50'}`}
                    >
                      <span className="w-6 text-center text-sm font-bold text-muted-foreground">
                        {rank + 1}
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                        {getInitials(u.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-medium">{u.name}</span>
                          {isMe && (
                            <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              You
                            </span>
                          )}
                        </div>
                        {/* Progress bar */}
                        <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary/60 transition-all duration-500"
                            style={{
                              width: `${(u.total / maxTotal) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{u.total}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {rankedUsers.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No booking data yet.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== 2. Team Distribution (2 cards) ===== */}
      <section className="animate-fade-in-up grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
        {/* Vehicle Mix Donut */}
        <Card className="glass-card hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Car className="h-4 w-4 text-info" />
              Team Vehicle Mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={vehicleChartConfig} className="mx-auto h-[200px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={vehicleMixData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  strokeWidth={2}
                  stroke="hsl(var(--background))"
                >
                  {vehicleMixData.map((_, idx) => (
                    <Cell key={idx} fill={VEHICLE_COLORS[idx]} />
                  ))}
                </Pie>
                {/* Center label */}
                <text
                  x="50%"
                  y="48%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-2xl font-bold"
                >
                  {bookings.length}
                </text>
                <text
                  x="50%"
                  y="58%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-xs"
                >
                  total
                </text>
              </PieChart>
            </ChartContainer>
            {/* Legend */}
            <div className="mt-2 flex items-center justify-center gap-6 text-xs">
              {vehicleMixData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: VEHICLE_COLORS[i] }}
                  />
                  <span className="text-muted-foreground">
                    {d.name}: {d.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Spot Popularity by Day */}
        <Card className="glass-card hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Star className="h-4 w-4 text-primary" />
              Spot Popularity by Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={spotChartConfig} className="h-[200px] w-full">
              <BarChart data={spotByDayData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="Spot 84" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Spot 85" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      {/* ===== 3. Fairness Over Time ===== */}
      <section className="animate-fade-in-up">
        <Card className="glass-card hover-lift">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Users className="h-4 w-4 text-primary" />
                  Booking Distribution Fairness
                </CardTitle>
                <CardDescription>
                  How evenly parking is shared across the team over time
                </CardDescription>
              </div>
              <div className="text-right">
                <div
                  className={`text-3xl font-black tabular-nums ${
                    fairnessScore >= 70
                      ? 'text-success'
                      : fairnessScore >= 40
                        ? 'text-warning'
                        : 'text-destructive'
                  }`}
                >
                  {Math.round(fairnessScore)}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  current
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={fairnessChartConfig} className="h-[200px] w-full md:h-[300px]">
              <ComposedChart data={fairnessOverTime}>
                <defs>
                  <linearGradient id="fairnessGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine
                  y={70}
                  stroke="hsl(var(--success))"
                  strokeDasharray="6 3"
                  label={{
                    value: 'Good',
                    position: 'right',
                    fill: 'hsl(var(--success))',
                    fontSize: 11,
                  }}
                />
                <ReferenceLine
                  y={40}
                  stroke="hsl(var(--warning))"
                  strokeDasharray="6 3"
                  label={{
                    value: 'Fair',
                    position: 'right',
                    fill: 'hsl(var(--warning))',
                    fontSize: 11,
                  }}
                />
                <Area type="monotone" dataKey="score" fill="url(#fairnessGradient)" stroke="none" />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      {/* ===== 4. Per-User Breakdown ===== */}
      <section className="animate-fade-in-up">
        <Card className="glass-card hover-lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Bike className="h-4 w-4 text-warning" />
              Team Member Details
            </CardTitle>
            <CardDescription>All-time stats for every team member</CardDescription>
          </CardHeader>
          <CardContent className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 text-right font-medium">Bookings</th>
                  <th className="pb-2 pr-4 font-medium">Car / Motorcycle</th>
                  <th className="pb-2 pr-4 font-medium">Spot Pref</th>
                  <th className="pb-2 font-medium">First Booking</th>
                </tr>
              </thead>
              <tbody>
                {rankedUsers.map((u, i) => {
                  const isMe = currentUserName === u.name;
                  const carPct = u.total > 0 ? Math.round((u.cars / u.total) * 100) : 0;
                  return (
                    <tr
                      key={u.name}
                      className={`border-b last:border-0 ${isMe ? 'border-primary/20 bg-primary/5' : ''}`}
                    >
                      {/* Rank */}
                      <td className="py-2.5 pr-2">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${medalColor(i)}`}
                        >
                          {i + 1}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="py-2.5 pr-4 font-medium">
                        <div className="flex items-center gap-1.5">
                          {u.name}
                          {isMe && (
                            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">
                        {u.total}
                      </td>

                      {/* Mini stacked bar */}
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-info"
                              style={{
                                width: `${carPct}%`,
                              }}
                            />
                          </div>
                          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                            {u.cars}C / {u.motorcycles}M
                          </span>
                        </div>
                      </td>

                      {/* Spot preference */}
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        <span className={u.spot84 >= u.spot85 ? 'font-semibold text-success' : ''}>
                          84: {u.spot84}
                        </span>
                        {' / '}
                        <span className={u.spot85 > u.spot84 ? 'font-semibold text-primary' : ''}>
                          85: {u.spot85}
                        </span>
                      </td>

                      {/* First booking */}
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {new Date(u.firstDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {rankedUsers.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No booking data yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
