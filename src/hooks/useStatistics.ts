import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type UserBookingStats = Tables<'user_booking_stats'>;
type DailyOccupancyStats = Tables<'daily_occupancy_stats'>;
type BookingFairness = Tables<'booking_fairness'>;
type SpotPopularity = Tables<'spot_popularity'>;
type WeeklyBookingTrends = Tables<'weekly_booking_trends'>;

export const useStatistics = () => {
  const userStatsQuery = useQuery<UserBookingStats[]>({
    queryKey: ['statistics', 'userStats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_booking_stats')
        .select('*')
        .order('total_bookings', { ascending: false });
      if (error) {
        console.warn('Error fetching user stats:', error);
        return [];
      }
      return data || [];
    },
    enabled: isSupabaseConfigured,
  });

  const dailyOccupancyQuery = useQuery<DailyOccupancyStats[]>({
    queryKey: ['statistics', 'dailyOccupancy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_occupancy_stats')
        .select('*')
        .order('date', { ascending: true });
      if (error) {
        console.warn('Error fetching daily occupancy:', error);
        return [];
      }
      return data || [];
    },
    enabled: isSupabaseConfigured,
  });

  const fairnessQuery = useQuery<BookingFairness | null>({
    queryKey: ['statistics', 'fairness'],
    queryFn: async () => {
      const { data, error } = await supabase.from('booking_fairness').select('*').single();
      if (error && error.code !== 'PGRST116') {
        console.warn('Error fetching fairness:', error);
      }
      return data || null;
    },
    enabled: isSupabaseConfigured,
  });

  const spotPopularityQuery = useQuery<SpotPopularity[]>({
    queryKey: ['statistics', 'spotPopularity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spot_popularity')
        .select('*')
        .order('spot_number')
        .order('day_of_week');
      if (error) {
        console.warn('Error fetching spot popularity:', error);
        return [];
      }
      return data || [];
    },
    enabled: isSupabaseConfigured,
  });

  const weeklyTrendsQuery = useQuery<WeeklyBookingTrends[]>({
    queryKey: ['statistics', 'weeklyTrends'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_booking_trends')
        .select('*')
        .order('week_start', { ascending: false })
        .limit(12);
      if (error) {
        console.warn('Error fetching weekly trends:', error);
        return [];
      }
      return data || [];
    },
    enabled: isSupabaseConfigured,
  });

  const loading =
    userStatsQuery.isLoading ||
    dailyOccupancyQuery.isLoading ||
    fairnessQuery.isLoading ||
    spotPopularityQuery.isLoading ||
    weeklyTrendsQuery.isLoading;

  const error =
    userStatsQuery.error ||
    dailyOccupancyQuery.error ||
    fairnessQuery.error ||
    spotPopularityQuery.error ||
    weeklyTrendsQuery.error;

  return {
    userStats: userStatsQuery.data ?? [],
    dailyOccupancy: dailyOccupancyQuery.data ?? [],
    fairness: fairnessQuery.data ?? null,
    spotPopularity: spotPopularityQuery.data ?? [],
    weeklyTrends: weeklyTrendsQuery.data ?? [],
    loading,
    error: error ? String(error) : null,
    refetch: () => {
      userStatsQuery.refetch();
      dailyOccupancyQuery.refetch();
      fairnessQuery.refetch();
      spotPopularityQuery.refetch();
      weeklyTrendsQuery.refetch();
    },
  };
};

export const useFairnessScore = () => {
  const { data: fairnessScore, isLoading: loading } = useQuery<number>({
    queryKey: ['statistics', 'fairnessScore'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_fairness')
        .select('fairness_score')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn('Error fetching fairness score:', error);
      }

      return data?.fairness_score ?? 100;
    },
    enabled: isSupabaseConfigured,
  });

  return { fairnessScore: fairnessScore ?? null, loading };
};

export const useMyStats = (userId: string | undefined) => {
  const { data: stats, isLoading: loading } = useQuery<UserBookingStats | null>({
    queryKey: ['statistics', 'myStats', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_booking_stats')
        .select('*')
        .eq('user_id', userId!)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn('Error fetching user stats:', error);
      }

      return data || null;
    },
    enabled: isSupabaseConfigured && !!userId,
  });

  return { stats: stats ?? null, loading };
};
