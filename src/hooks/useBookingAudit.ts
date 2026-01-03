import { useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";

type BookingAudit = Tables<"booking_audit">;

export const useBookingAudit = (limit: number = 50) => {
  const { user } = useAuth();
  const [auditHistory, setAuditHistory] = useState<BookingAudit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuditHistory = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("booking_audit")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.warn("Error fetching audit history:", error);
      } else {
        setAuditHistory(data || []);
      }
    } catch (err) {
      console.error("Error fetching audit history:", err);
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  useEffect(() => {
    fetchAuditHistory();
  }, [fetchAuditHistory]);

  // Helper to format audit entries for display
  const formatAuditEntry = (entry: BookingAudit) => {
    const actionLabels = {
      created: "Created booking",
      cancelled: "Cancelled booking",
      modified: "Modified booking",
    };

    return {
      ...entry,
      actionLabel: actionLabels[entry.action],
      date: entry.new_data?.date || entry.old_data?.date || "Unknown",
      spotNumber: entry.new_data?.spot_number || entry.old_data?.spot_number || "Unknown",
    };
  };

  return {
    auditHistory,
    loading,
    refetch: fetchAuditHistory,
    formatAuditEntry,
  };
};
