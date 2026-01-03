import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type UserProfile = Tables<"user_profiles">;
type UserProfileUpdate = TablesUpdate<"user_profiles">;

export const useUserProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }

    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        // Profile might not exist yet (trigger should create it)
        console.warn("Profile not found, may be created on next auth event");
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: UserProfileUpdate) => {
    if (!user) {
      toast.error("You must be logged in to update your profile");
      return false;
    }

    try {
      const { error } = await supabase
        .from("user_profiles")
        .update(updates)
        .eq("id", user.id);

      if (error) throw error;

      // Refresh profile
      await fetchProfile();
      toast.success("Profile updated successfully");
      return true;
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
      return false;
    }
  };

  return {
    profile,
    loading,
    updateProfile,
    refetch: fetchProfile,
  };
};
