import { useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type UserBookingStats = Tables<"user_booking_stats">;
type DailyOccupancyStats = Tables<"daily_occupancy_stats">;
type BookingFairness = Tables<"booking_fairness">;
type SpotPopularity = Tables<"spot_popularity">;
type WeeklyBookingTrends = Tables<"weekly_booking_trends">;

interface StatisticsData {
  userStats: UserBookingStats[];
  dailyOccupancy: DailyOccupancyStats[];
  fairness: BookingFairness | null;
  spotPopularity: SpotPopularity[];
  weeklyTrends: WeeklyBookingTrends[];
}

export const useStatistics = () => {
  const [data, setData] = useState<StatisticsData>({
    userStats: [],
    dailyOccupancy: [],
    fairness: null,
    spotPopularity: [],
    weeklyTrends: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllStats = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all statistics in parallel
      const [
        userStatsResult,
        dailyOccupancyResult,
        fairnessResult,
        spotPopularityResult,
        weeklyTrendsResult,
      ] = await Promise.all([
        supabase.from("user_booking_stats").select("*").order("total_bookings", { ascending: false }),
        supabase.from("daily_occupancy_stats").select("*").order("date", { ascending: true }),
        supabase.from("booking_fairness").select("*").single(),
        supabase.from("spot_popularity").select("*").order("spot_number").order("day_of_week"),
        supabase.from("weekly_booking_trends").select("*").order("week_start", { ascending: false }).limit(12),
      ]);

      // Check for errors
      if (userStatsResult.error) console.warn("Error fetching user stats:", userStatsResult.error);
      if (dailyOccupancyResult.error) console.warn("Error fetching daily occupancy:", dailyOccupancyResult.error);
      if (fairnessResult.error && fairnessResult.error.code !== 'PGRST116') {
        console.warn("Error fetching fairness:", fairnessResult.error);
      }
      if (spotPopularityResult.error) console.warn("Error fetching spot popularity:", spotPopularityResult.error);
      if (weeklyTrendsResult.error) console.warn("Error fetching weekly trends:", weeklyTrendsResult.error);

      setData({
        userStats: userStatsResult.data || [],
        dailyOccupancy: dailyOccupancyResult.data || [],
        fairness: fairnessResult.data || null,
        spotPopularity: spotPopularityResult.data || [],
        weeklyTrends: weeklyTrendsResult.data || [],
      });
    } catch (err) {
      console.error("Error fetching statistics:", err);
      setError("Failed to load statistics");
      toast.error("Failed to load statistics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllStats();
  }, [fetchAllStats]);

  return {
    ...data,
    loading,
    error,
    refetch: fetchAllStats,
  };
};

// Hook for just the fairness score (lighter weight)
export const useFairnessScore = () => {
  const [fairnessScore, setFairnessScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const fetchFairness = async () => {
      try {
        const { data, error } = await supabase
          .from("booking_fairness")
          .select("fairness_score")
          .single();

        if (error && error.code !== 'PGRST116') {
          console.warn("Error fetching fairness score:", error);
        }

        setFairnessScore(data?.fairness_score ?? 100);
      } catch (err) {
        console.error("Error fetching fairness score:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFairness();
  }, []);

  return { fairnessScore, loading };
};

// Hook for current user's stats
export const useMyStats = (userId: string | undefined) => {
  const [stats, setStats] = useState<UserBookingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setLoading(false);
      return;
    }

    const fetchMyStats = async () => {
      try {
        const { data, error } = await supabase
          .from("user_booking_stats")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.warn("Error fetching user stats:", error);
        }

        setStats(data || null);
      } catch (err) {
        console.error("Error fetching user stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMyStats();
  }, [userId]);

  return { stats, loading };
};
