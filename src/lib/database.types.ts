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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      events: {
        Row: {
          all_day: boolean
          cancelled: boolean
          color: string | null
          created_at: string
          ends_at: string
          id: string
          notes: string | null
          original_start: string | null
          recurrence: Json | null
          recurrence_ends_at: string | null
          series_id: string | null
          starts_at: string
          title: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          cancelled?: boolean
          color?: string | null
          created_at?: string
          ends_at: string
          id?: string
          notes?: string | null
          original_start?: string | null
          recurrence?: Json | null
          recurrence_ends_at?: string | null
          series_id?: string | null
          starts_at: string
          title: string
          user_id?: string
        }
        Update: {
          all_day?: boolean
          cancelled?: boolean
          color?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          notes?: string | null
          original_start?: string | null
          recurrence?: Json | null
          recurrence_ends_at?: string | null
          series_id?: string | null
          starts_at?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_series_fk"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          holiday_country: string | null
          id: string
          time_format: string
          timezone: string
          updated_at: string
          week_start_on: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          holiday_country?: string | null
          id: string
          time_format?: string
          timezone?: string
          updated_at?: string
          week_start_on?: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          holiday_country?: string | null
          id?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          week_start_on?: number
        }
        Relationships: []
      }
      task_lists: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          cancelled: boolean
          completed_at: string | null
          created_at: string
          due_date: string | null
          due_time: string | null
          id: string
          list_id: string | null
          notes: string | null
          original_date: string | null
          parent_id: string | null
          recurrence: Json | null
          recurrence_ends_on: string | null
          series_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          cancelled?: boolean
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          due_time?: string | null
          id?: string
          list_id?: string | null
          notes?: string | null
          original_date?: string | null
          parent_id?: string | null
          recurrence?: Json | null
          recurrence_ends_on?: string | null
          series_id?: string | null
          title: string
          user_id?: string
        }
        Update: {
          cancelled?: boolean
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          due_time?: string | null
          id?: string
          list_id?: string | null
          notes?: string | null
          original_date?: string | null
          parent_id?: string | null
          recurrence?: Json | null
          recurrence_ends_on?: string | null
          series_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_own_account: { Args: never; Returns: undefined }
      tasks_in_range: {
        Args: { range_start: string; range_end: string }
        Returns: Database['public']['Tables']['tasks']['Row'][]
      }
      update_task_series: {
        Args: { p_series: string; p_fields: Json }
        Returns: undefined
      }
      split_task_series: {
        Args: {
          p_series: string
          p_split_on: string
          p_old_rule: Json | null
          p_old_ends_on: string | null
          p_new: Json | null
        }
        Returns: string
      }
      events_in_range: {
        Args: { range_start: string; range_end: string }
        Returns: Database['public']['Tables']['events']['Row'][]
      }
      split_series: {
        Args: {
          p_series: string
          p_split_at: string
          p_old_rule: Json | null
          p_old_ends_at: string | null
          p_new: Json | null
          p_drop_exceptions: boolean
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
