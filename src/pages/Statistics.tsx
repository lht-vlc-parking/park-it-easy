import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, BarChart3, User, Users, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useStatistics } from '@/hooks/useStatistics';
import { ThemeToggle } from '@/components/v2/ThemeToggle';
import OverviewTab from '@/components/statistics/OverviewTab';
import MyProfileTab from '@/components/statistics/MyProfileTab';
import TeamTab from '@/components/statistics/TeamTab';
import { TrendsTab } from '@/components/statistics/TrendsTab';

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

  const { fairness } = useStatistics();

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
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

  // Shared computed values
  const uniqueUsers = useMemo(() => [...new Set(bookings.map(b => b.user_name))], [bookings]);

  const currentUserName = user?.user_metadata?.user_name || user?.email;

  // Fairness score calculation
  const fairnessScore = useMemo(() => {
    if (fairness?.fairness_score !== null && fairness?.fairness_score !== undefined) {
      return fairness.fairness_score;
    }
    if (uniqueUsers.length === 0) return 100;
    const counts = uniqueUsers.map(name => bookings.filter(b => b.user_name === name).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg === 0) return 100;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / avg) * 100;
    return Math.max(0, Math.min(100, 100 - cv));
  }, [bookings, uniqueUsers, fairness]);

  return (
    <div className="mesh-gradient min-h-screen bg-background">
      {/* Hero Section */}
      <div className="gradient-hero relative overflow-hidden px-4 py-6 text-white shadow-lg sm:py-8 md:py-10">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        <div className="container relative z-10 mx-auto max-w-6xl">
          <div className="mb-3 flex items-center justify-between sm:mb-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="animate-fade-in text-white hover:bg-white/10"
              size="sm"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Back to Bookings</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <ThemeToggle variant="minimal" className="text-white hover:bg-white/20" />
          </div>
          <div className="animate-fade-in-up">
            <h1 className="mb-1 text-2xl font-bold sm:text-3xl md:mb-2 md:text-5xl">Statistics</h1>
            <p className="text-sm opacity-90 sm:text-base md:text-xl">
              All-time insights and usage metrics
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto max-w-6xl px-4 py-4 sm:py-6 md:py-8">
        {loading ? (
          <div className="animate-fade-in py-12 text-center">
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
            <p className="text-muted-foreground">Loading statistics...</p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="animate-fade-in-up">
            {/* Tab Navigation - scrollable on mobile */}
            <TabsList className="mb-6 grid h-auto w-full grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1 backdrop-blur-sm sm:gap-2 sm:p-1.5">
              <TabsTrigger
                value="overview"
                className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Overview</span>
              </TabsTrigger>
              <TabsTrigger
                value="profile"
                className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">My Profile</span>
                <span className="sm:hidden">Profile</span>
              </TabsTrigger>
              <TabsTrigger
                value="team"
                className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Team</span>
              </TabsTrigger>
              <TabsTrigger
                value="trends"
                className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Trends</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab Content */}
            <TabsContent value="overview">
              <OverviewTab
                bookings={bookings}
                uniqueUsers={uniqueUsers}
                fairnessScore={fairnessScore}
              />
            </TabsContent>

            <TabsContent value="profile">
              <MyProfileTab
                bookings={bookings}
                currentUserName={currentUserName}
                allBookings={bookings}
              />
            </TabsContent>

            <TabsContent value="team">
              <TeamTab
                bookings={bookings}
                currentUserName={currentUserName}
                fairnessScore={fairnessScore}
              />
            </TabsContent>

            <TabsContent value="trends">
              <TrendsTab bookings={bookings} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Statistics;
