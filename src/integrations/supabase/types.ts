export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          created_at: string
          date: string
          duration: Database["public"]["Enums"]["booking_duration"]
          id: string
          spot_number: number
          user_id: string | null
          user_name: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          created_at?: string
          date: string
          duration: Database["public"]["Enums"]["booking_duration"]
          id?: string
          spot_number: number
          user_id?: string | null
          user_name: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          created_at?: string
          date?: string
          duration?: Database["public"]["Enums"]["booking_duration"]
          id?: string
          spot_number?: number
          user_id?: string | null
          user_name?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          display_name: string
          email: string | null
          avatar_url: string | null
          department: string | null
          default_vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
          default_spot_preference: number | null
          notification_preferences: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name: string
          email?: string | null
          avatar_url?: string | null
          department?: string | null
          default_vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
          default_spot_preference?: number | null
          notification_preferences?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          email?: string | null
          avatar_url?: string | null
          department?: string | null
          default_vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
          default_spot_preference?: number | null
          notification_preferences?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      parking_spots: {
        Row: {
          id: number
          spot_number: number
          spot_type: Database["public"]["Enums"]["spot_type"]
          floor: string | null
          section: string | null
          max_motorcycles: number
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          spot_number: number
          spot_type?: Database["public"]["Enums"]["spot_type"]
          floor?: string | null
          section?: string | null
          max_motorcycles?: number
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          spot_number?: number
          spot_type?: Database["public"]["Enums"]["spot_type"]
          floor?: string | null
          section?: string | null
          max_motorcycles?: number
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_audit: {
        Row: {
          id: string
          booking_id: string | null
          user_id: string | null
          action: Database["public"]["Enums"]["audit_action"]
          old_data: Json | null
          new_data: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id?: string | null
          user_id?: string | null
          action: Database["public"]["Enums"]["audit_action"]
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string | null
          user_id?: string | null
          action?: Database["public"]["Enums"]["audit_action"]
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      recurring_bookings: {
        Row: {
          id: string
          user_id: string
          spot_number: number
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          duration: Database["public"]["Enums"]["booking_duration"]
          pattern: Database["public"]["Enums"]["recurrence_pattern"]
          days_of_week: number[]
          start_date: string
          end_date: string | null
          is_active: boolean
          last_generated_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          spot_number: number
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          duration: Database["public"]["Enums"]["booking_duration"]
          pattern?: Database["public"]["Enums"]["recurrence_pattern"]
          days_of_week?: number[]
          start_date: string
          end_date?: string | null
          is_active?: boolean
          last_generated_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          spot_number?: number
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          duration?: Database["public"]["Enums"]["booking_duration"]
          pattern?: Database["public"]["Enums"]["recurrence_pattern"]
          days_of_week?: number[]
          start_date?: string
          end_date?: string | null
          is_active?: boolean
          last_generated_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_waitlist: {
        Row: {
          id: string
          user_id: string
          spot_number: number
          date: string
          duration: Database["public"]["Enums"]["booking_duration"]
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          position: number | null
          status: Database["public"]["Enums"]["waitlist_status"]
          notified_at: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          spot_number: number
          date: string
          duration: Database["public"]["Enums"]["booking_duration"]
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          position?: number | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          notified_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          spot_number?: number
          date?: string
          duration?: Database["public"]["Enums"]["booking_duration"]
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          position?: number | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          notified_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      booking_availability: {
        Row: {
          booking_count: number | null
          date: string | null
          duration: Database["public"]["Enums"]["booking_duration"] | null
          spot_number: number | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
        }
        Relationships: []
      }
      active_parking_spots: {
        Row: {
          id: number | null
          spot_number: number | null
          spot_type: Database["public"]["Enums"]["spot_type"] | null
          floor: string | null
          section: string | null
          max_motorcycles: number | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          today_booking_count: number | null
          availability_status: string | null
        }
        Relationships: []
      }
      user_booking_stats: {
        Row: {
          user_id: string | null
          display_name: string | null
          department: string | null
          total_bookings: number | null
          this_week: number | null
          this_month: number | null
          car_bookings: number | null
          motorcycle_bookings: number | null
          spot_84_count: number | null
          spot_85_count: number | null
          full_day_count: number | null
          morning_count: number | null
          afternoon_count: number | null
          first_booking_date: string | null
          last_booking_date: string | null
        }
        Relationships: []
      }
      daily_occupancy_stats: {
        Row: {
          date: string | null
          day_of_week: number | null
          day_of_month: number | null
          booking_count: number | null
          car_count: number | null
          moto_count: number | null
          max_spots: number | null
          occupancy_percent: number | null
        }
        Relationships: []
      }
      booking_fairness: {
        Row: {
          avg_bookings: number | null
          std_dev: number | null
          user_count: number | null
          fairness_score: number | null
        }
        Relationships: []
      }
      spot_popularity: {
        Row: {
          spot_number: number | null
          day_of_week: number | null
          booking_count: number | null
          percentage: number | null
        }
        Relationships: []
      }
      weekly_booking_trends: {
        Row: {
          week_start: string | null
          total_bookings: number | null
          unique_users: number | null
          car_bookings: number | null
          moto_bookings: number | null
          avg_spot_preference: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_recurring_bookings: {
        Args: { days_ahead?: number }
        Returns: number
      }
      expire_waitlist_notifications: {
        Args: Record<string, never>
        Returns: number
      }
      refresh_booking_summary: {
        Args: Record<string, never>
        Returns: void
      }
    }
    Enums: {
      booking_duration: "morning" | "afternoon" | "full"
      vehicle_type: "car" | "motorcycle"
      spot_type: "standard" | "handicap" | "ev" | "motorcycle_only"
      audit_action: "created" | "cancelled" | "modified"
      recurrence_pattern: "daily" | "weekly" | "biweekly" | "monthly"
      waitlist_status: "waiting" | "notified" | "expired" | "fulfilled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      booking_duration: ["morning", "afternoon", "full"],
      vehicle_type: ["car", "motorcycle"],
      spot_type: ["standard", "handicap", "ev", "motorcycle_only"],
      audit_action: ["created", "cancelled", "modified"],
      recurrence_pattern: ["daily", "weekly", "biweekly", "monthly"],
      waitlist_status: ["waiting", "notified", "expired", "fulfilled"],
    },
  },
} as const
