export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      approvals: {
        Row: {
          acted_at: string
          action: Database["public"]["Enums"]["approval_action"]
          approver_id: string
          comment: string | null
          created_at: string
          id: string
          request_id: string
        }
        Insert: {
          acted_at?: string
          action: Database["public"]["Enums"]["approval_action"]
          approver_id: string
          comment?: string | null
          created_at?: string
          id?: string
          request_id: string
        }
        Update: {
          acted_at?: string
          action?: Database["public"]["Enums"]["approval_action"]
          approver_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_type: Database["public"]["Enums"]["attendance_type"]
          created_at: string
          employee_id: string
          id: string
          latitude: number | null
          longitude: number | null
          note: string | null
          recorded_at: string
        }
        Insert: {
          attendance_type: Database["public"]["Enums"]["attendance_type"]
          created_at?: string
          employee_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          recorded_at?: string
        }
        Update: {
          attendance_type?: Database["public"]["Enums"]["attendance_type"]
          created_at?: string
          employee_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      daily_attendances: {
        Row: {
          actual_work_minutes: number
          break_minutes: number
          clock_in: string | null
          clock_out: string | null
          created_at: string
          employee_id: string
          id: string
          late_night_minutes: number
          overtime_minutes: number
          status: Database["public"]["Enums"]["daily_status"]
          updated_at: string
          work_date: string
        }
        Insert: {
          actual_work_minutes?: number
          break_minutes?: number
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          late_night_minutes?: number
          overtime_minutes?: number
          status?: Database["public"]["Enums"]["daily_status"]
          updated_at?: string
          work_date: string
        }
        Update: {
          actual_work_minutes?: number
          break_minutes?: number
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          late_night_minutes?: number
          overtime_minutes?: number
          status?: Database["public"]["Enums"]["daily_status"]
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department_id: string | null
          email: string
          employee_number: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          hire_date: string
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email: string
          employee_number: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hire_date: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string
          employee_number?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hire_date?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          created_at: string
          employee_id: string
          fiscal_year: number
          granted_days: number
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          remaining_days: number
          updated_at: string
          used_days: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          fiscal_year: number
          granted_days?: number
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          remaining_days?: number
          updated_at?: string
          used_days?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          fiscal_year?: number
          granted_days?: number
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          remaining_days?: number
          updated_at?: string
          used_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          correction_data: Json | null
          created_at: string
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"] | null
          reason: string
          request_date: string
          request_type: Database["public"]["Enums"]["request_type"]
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          target_attendance_id: string | null
          updated_at: string
        }
        Insert: {
          correction_data?: Json | null
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"] | null
          reason: string
          request_date?: string
          request_type: Database["public"]["Enums"]["request_type"]
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          target_attendance_id?: string | null
          updated_at?: string
        }
        Update: {
          correction_data?: Json | null
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"] | null
          reason?: string
          request_date?: string
          request_type?: Database["public"]["Enums"]["request_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          target_attendance_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_target_attendance_id_fkey"
            columns: ["target_attendance_id"]
            isOneToOne: false
            referencedRelation: "daily_attendances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      department_monthly_summary: {
        Row: {
          avg_overtime_minutes: number | null
          avg_work_minutes: number | null
          department_id: string | null
          department_name: string | null
          employee_count: number | null
          month: string | null
          total_overtime_minutes: number | null
          total_work_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_attendance_summary: {
        Row: {
          absent_days: number | null
          employee_id: string | null
          leave_days: number | null
          month: string | null
          total_break_minutes: number | null
          total_late_night_minutes: number | null
          total_overtime_minutes: number | null
          total_work_minutes: number | null
          work_days: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_daily_attendance: {
        Args: { p_employee_id: string; p_work_date: string }
        Returns: undefined
      }
      current_department_id: { Args: never; Returns: string }
      current_employee_id: { Args: never; Returns: string }
      decide_request: {
        Args: {
          p_action: Database["public"]["Enums"]["approval_action"]
          p_comment?: string
          p_request_id: string
        }
        Returns: Database["public"]["Enums"]["request_status"]
      }
      get_current_employee: {
        Args: never
        Returns: {
          created_at: string
          department_id: string | null
          email: string
          employee_number: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          hire_date: string
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_leave_alert_employees: {
        Args: { p_fiscal_year: number; p_min_usage_days?: number }
        Returns: {
          department_name: string
          employee_id: string
          employee_name: string
          granted_days: number
          remaining_days: number
          used_days: number
        }[]
      }
      get_overtime_alert_employees: {
        Args: { p_month: string; p_threshold_minutes?: number }
        Returns: {
          department_name: string
          employee_id: string
          employee_name: string
          total_overtime_minutes: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_manager_of: { Args: { target_employee_id: string }; Returns: boolean }
      is_manager_or_above: { Args: never; Returns: boolean }
    }
    Enums: {
      approval_action: "approved" | "rejected" | "returned"
      attendance_type: "clock_in" | "clock_out" | "break_start" | "break_end"
      daily_status: "present" | "absent" | "holiday" | "leave"
      employment_type: "full_time" | "part_time" | "contract"
      leave_type: "paid" | "substitute" | "sick" | "special"
      request_status: "pending" | "approved" | "rejected" | "withdrawn"
      request_type:
        | "overtime"
        | "holiday_work"
        | "leave"
        | "attendance_correction"
      user_role: "admin" | "manager" | "employee"
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
      approval_action: ["approved", "rejected", "returned"],
      attendance_type: ["clock_in", "clock_out", "break_start", "break_end"],
      daily_status: ["present", "absent", "holiday", "leave"],
      employment_type: ["full_time", "part_time", "contract"],
      leave_type: ["paid", "substitute", "sick", "special"],
      request_status: ["pending", "approved", "rejected", "withdrawn"],
      request_type: [
        "overtime",
        "holiday_work",
        "leave",
        "attendance_correction",
      ],
      user_role: ["admin", "manager", "employee"],
    },
  },
} as const

