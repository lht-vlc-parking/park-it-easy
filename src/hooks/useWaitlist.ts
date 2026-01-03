import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { Tables, Enums } from '@/integrations/supabase/types';

type BookingWaitlist = Tables<'booking_waitlist'>;

interface JoinWaitlistParams {
  spot_number: number;
  date: string;
  duration: Enums<'booking_duration'>;
  vehicle_type: Enums<'vehicle_type'>;
}

export const useWaitlist = () => {
  const { user } = useAuth();
  const [myWaitlistEntries, setMyWaitlistEntries] = useState<BookingWaitlist[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyWaitlist = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('booking_waitlist')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['waiting', 'notified'])
        .order('date', { ascending: true });

      if (error) {
        console.warn('Error fetching waitlist:', error);
      } else {
        setMyWaitlistEntries(data || []);
      }
    } catch (err) {
      console.error('Error fetching waitlist:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMyWaitlist();
  }, [fetchMyWaitlist]);

  const joinWaitlist = async (params: JoinWaitlistParams) => {
    if (!user) {
      toast.error('You must be logged in to join the waitlist');
      return false;
    }

    try {
      const { error } = await supabase.from('booking_waitlist').insert({
        user_id: user.id,
        spot_number: params.spot_number,
        date: params.date,
        duration: params.duration,
        vehicle_type: params.vehicle_type,
      });

      if (error) {
        if (error.code === '23505') {
          toast.error("You're already on the waitlist for this spot and time");
        } else {
          throw error;
        }
        return false;
      }

      toast.success("Added to waitlist! You'll be notified if a spot opens up.");
      await fetchMyWaitlist();
      return true;
    } catch (err) {
      console.error('Error joining waitlist:', err);
      toast.error('Failed to join waitlist');
      return false;
    }
  };

  const leaveWaitlist = async (id: string) => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('booking_waitlist')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Removed from waitlist');
      await fetchMyWaitlist();
      return true;
    } catch (err) {
      console.error('Error leaving waitlist:', err);
      toast.error('Failed to leave waitlist');
      return false;
    }
  };

  // Check if user is on waitlist for a specific spot/date/duration
  const isOnWaitlist = (spotNumber: number, date: string, duration: string) => {
    return myWaitlistEntries.some(
      entry =>
        entry.spot_number === spotNumber &&
        entry.date === date &&
        entry.duration === duration &&
        (entry.status === 'waiting' || entry.status === 'notified')
    );
  };

  // Get notified entries (spot became available)
  const notifiedEntries = myWaitlistEntries.filter(e => e.status === 'notified');

  return {
    myWaitlistEntries,
    notifiedEntries,
    loading,
    refetch: fetchMyWaitlist,
    joinWaitlist,
    leaveWaitlist,
    isOnWaitlist,
    hasNotifications: notifiedEntries.length > 0,
  };
};
