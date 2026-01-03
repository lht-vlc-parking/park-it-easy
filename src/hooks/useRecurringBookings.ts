import { useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type RecurringBooking = Tables<"recurring_bookings">;
type RecurringBookingInsert = TablesInsert<"recurring_bookings">;

export const useRecurringBookings = () => {
  const { user } = useAuth();
  const [recurringBookings, setRecurringBookings] = useState<RecurringBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecurringBookings = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("recurring_bookings")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Error fetching recurring bookings:", error);
      } else {
        setRecurringBookings(data || []);
      }
    } catch (err) {
      console.error("Error fetching recurring bookings:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRecurringBookings();
  }, [fetchRecurringBookings]);

  const createRecurringBooking = async (booking: Omit<RecurringBookingInsert, "user_id">) => {
    if (!user) {
      toast.error("You must be logged in to create a recurring booking");
      return false;
    }

    try {
      const { error } = await supabase.from("recurring_bookings").insert({
        ...booking,
        user_id: user.id,
      });

      if (error) throw error;

      toast.success("Recurring booking created!");
      await fetchRecurringBookings();
      return true;
    } catch (err) {
      console.error("Error creating recurring booking:", err);
      toast.error("Failed to create recurring booking");
      return false;
    }
  };

  const updateRecurringBooking = async (id: string, updates: Partial<RecurringBooking>) => {
    if (!user) {
      toast.error("You must be logged in");
      return false;
    }

    try {
      const { error } = await supabase
        .from("recurring_bookings")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success("Recurring booking updated!");
      await fetchRecurringBookings();
      return true;
    } catch (err) {
      console.error("Error updating recurring booking:", err);
      toast.error("Failed to update recurring booking");
      return false;
    }
  };

  const deleteRecurringBooking = async (id: string) => {
    if (!user) {
      toast.error("You must be logged in");
      return false;
    }

    try {
      const { error } = await supabase
        .from("recurring_bookings")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success("Recurring booking deleted!");
      await fetchRecurringBookings();
      return true;
    } catch (err) {
      console.error("Error deleting recurring booking:", err);
      toast.error("Failed to delete recurring booking");
      return false;
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    return updateRecurringBooking(id, { is_active: isActive });
  };

  // Helper to format days of week
  const formatDaysOfWeek = (days: number[]) => {
    const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map(d => dayNames[d]).filter(Boolean).join(", ");
  };

  return {
    recurringBookings,
    activeRecurringBookings: recurringBookings.filter(b => b.is_active),
    loading,
    refetch: fetchRecurringBookings,
    createRecurringBooking,
    updateRecurringBooking,
    deleteRecurringBooking,
    toggleActive,
    formatDaysOfWeek,
  };
};
