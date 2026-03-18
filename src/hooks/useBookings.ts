import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Booking } from '@/types/booking';

interface UseBookingsOptions {
  dateFrom?: string;
}

export function useBookings(options: UseBookingsOptions = {}) {
  return useQuery<Booking[]>({
    queryKey: ['bookings', options.dateFrom ?? 'all'],
    queryFn: async () => {
      let query = supabase.from('bookings').select('*').order('date', { ascending: true });

      if (options.dateFrom) {
        query = query.gte('date', options.dateFrom);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}
