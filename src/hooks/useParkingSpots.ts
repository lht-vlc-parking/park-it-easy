import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type ParkingSpot = Tables<'parking_spots'>;
type ActiveParkingSpot = Tables<'active_parking_spots'>;

const FALLBACK_SPOTS: ParkingSpot[] = [
  {
    id: 1,
    spot_number: 84,
    spot_type: 'standard',
    floor: 'B1',
    section: 'A',
    max_motorcycles: 4,
    is_active: true,
    notes: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    spot_number: 85,
    spot_type: 'standard',
    floor: 'B1',
    section: 'A',
    max_motorcycles: 4,
    is_active: true,
    notes: null,
    created_at: '',
    updated_at: '',
  },
];

export const useParkingSpots = () => {
  const spotsQuery = useQuery<ParkingSpot[]>({
    queryKey: ['parkingSpots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parking_spots')
        .select('*')
        .eq('is_active', true)
        .order('spot_number');

      if (error) {
        console.warn('Error fetching parking spots:', error);
        return FALLBACK_SPOTS;
      }

      return data || FALLBACK_SPOTS;
    },
    enabled: isSupabaseConfigured,
    placeholderData: FALLBACK_SPOTS,
  });

  const activeSpotsQuery = useQuery<ActiveParkingSpot[]>({
    queryKey: ['activeParkingSpots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('active_parking_spots')
        .select('*')
        .order('spot_number');

      if (error) {
        console.warn('Error fetching active parking spots view:', error);
        return [];
      }

      return data || [];
    },
    enabled: isSupabaseConfigured,
  });

  const spots = spotsQuery.data ?? FALLBACK_SPOTS;
  const activeSpots = activeSpotsQuery.data ?? [];
  const loading = spotsQuery.isLoading || activeSpotsQuery.isLoading;

  const spotNumbers = useMemo(() => spots.map(s => s.spot_number), [spots]);

  const getSpotAvailability = (spotNumber: number) => {
    const activeSpot = activeSpots.find(s => s.spot_number === spotNumber);
    return activeSpot?.availability_status || 'available';
  };

  return {
    spots,
    activeSpots,
    spotNumbers,
    loading,
    refetch: () => {
      spotsQuery.refetch();
      activeSpotsQuery.refetch();
    },
    getSpotAvailability,
  };
};
