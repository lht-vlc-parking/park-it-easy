import { useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ParkingSpot = Tables<"parking_spots">;
type ActiveParkingSpot = Tables<"active_parking_spots">;

export const useParkingSpots = () => {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [activeSpots, setActiveSpots] = useState<ActiveParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSpots = useCallback(async () => {
    if (!isSupabaseConfigured) {
      // Fallback to hardcoded spots if Supabase not configured
      setSpots([
        { id: 1, spot_number: 84, spot_type: 'standard', floor: 'B1', section: 'A', max_motorcycles: 4, is_active: true, notes: null, created_at: '', updated_at: '' },
        { id: 2, spot_number: 85, spot_type: 'standard', floor: 'B1', section: 'A', max_motorcycles: 4, is_active: true, notes: null, created_at: '', updated_at: '' },
      ]);
      setLoading(false);
      return;
    }

    try {
      // Fetch both regular spots and active spots view
      const [spotsResult, activeSpotsResult] = await Promise.all([
        supabase
          .from("parking_spots")
          .select("*")
          .eq("is_active", true)
          .order("spot_number"),
        supabase
          .from("active_parking_spots")
          .select("*")
          .order("spot_number"),
      ]);

      if (spotsResult.error) {
        console.warn("Error fetching parking spots:", spotsResult.error);
        // Fallback to hardcoded spots
        setSpots([
          { id: 1, spot_number: 84, spot_type: 'standard', floor: 'B1', section: 'A', max_motorcycles: 4, is_active: true, notes: null, created_at: '', updated_at: '' },
          { id: 2, spot_number: 85, spot_type: 'standard', floor: 'B1', section: 'A', max_motorcycles: 4, is_active: true, notes: null, created_at: '', updated_at: '' },
        ]);
      } else {
        setSpots(spotsResult.data || []);
      }

      if (activeSpotsResult.error) {
        console.warn("Error fetching active parking spots view:", activeSpotsResult.error);
      } else {
        setActiveSpots(activeSpotsResult.data || []);
      }
    } catch (err) {
      console.error("Error fetching parking spots:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  // Get spot numbers for use in components
  const spotNumbers = spots.map(s => s.spot_number);

  // Get availability status for a specific spot
  const getSpotAvailability = (spotNumber: number) => {
    const activeSpot = activeSpots.find(s => s.spot_number === spotNumber);
    return activeSpot?.availability_status || 'available';
  };

  return {
    spots,
    activeSpots,
    spotNumbers,
    loading,
    refetch: fetchSpots,
    getSpotAvailability,
  };
};
