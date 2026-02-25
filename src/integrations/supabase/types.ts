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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          activity_date: string
          activity_name: string
          activity_type: string
          created_at: string
          duration_type: string | null
          end_time: string | null
          from_date: string | null
          half_day_type: string | null
          id: string
          remarks: string | null
          retailer_id: string | null
          start_time: string | null
          to_date: string | null
          total_days: number | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          activity_date?: string
          activity_name: string
          activity_type: string
          created_at?: string
          duration_type?: string | null
          end_time?: string | null
          from_date?: string | null
          half_day_type?: string | null
          id?: string
          remarks?: string | null
          retailer_id?: string | null
          start_time?: string | null
          to_date?: string | null
          total_days?: number | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          activity_date?: string
          activity_name?: string
          activity_type?: string
          created_at?: string
          duration_type?: string | null
          end_time?: string | null
          from_date?: string | null
          half_day_type?: string | null
          id?: string
          remarks?: string | null
          retailer_id?: string | null
          start_time?: string | null
          to_date?: string | null
          total_days?: number | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      additional_expenses: {
        Row: {
          amount: number
          bill_url: string | null
          category: string
          created_at: string
          custom_category: string | null
          description: string | null
          expense_date: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          bill_url?: string | null
          category: string
          created_at?: string
          custom_category?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bill_url?: string | null
          category?: string
          created_at?: string
          custom_category?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in_address: string | null
          check_in_location: Json | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_out_address: string | null
          check_out_location: Json | null
          check_out_photo_url: string | null
          check_out_time: string | null
          created_at: string
          date: string
          face_match_confidence: number | null
          face_match_confidence_out: number | null
          face_verification_status: string | null
          face_verification_status_out: string | null
          id: string
          notes: string | null
          regularized_request_id: string | null
          status: string
          total_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_address?: string | null
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_address?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          face_match_confidence?: number | null
          face_match_confidence_out?: number | null
          face_verification_status?: string | null
          face_verification_status_out?: string | null
          id?: string
          notes?: string | null
          regularized_request_id?: string | null
          status?: string
          total_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_address?: string | null
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_address?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          face_match_confidence?: number | null
          face_match_confidence_out?: number | null
          face_verification_status?: string | null
          face_verification_status_out?: string | null
          id?: string
          notes?: string | null
          regularized_request_id?: string | null
          status?: string
          total_hours?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance_policy: {
        Row: {
          created_at: string
          id: string
          policy_key: string
          policy_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          policy_key: string
          policy_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          policy_key?: string
          policy_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      beat_allowances: {
        Row: {
          beat_id: string
          beat_name: string
          created_at: string
          da_amount: number | null
          id: string
          ta_amount: number | null
          updated_at: string
        }
        Insert: {
          beat_id: string
          beat_name: string
          created_at?: string
          da_amount?: number | null
          id?: string
          ta_amount?: number | null
          updated_at?: string
        }
        Update: {
          beat_id?: string
          beat_name?: string
          created_at?: string
          da_amount?: number | null
          id?: string
          ta_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      beat_plans: {
        Row: {
          beat_data: Json | null
          beat_id: string | null
          beat_name: string | null
          created_at: string
          id: string
          plan_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          beat_data?: Json | null
          beat_id?: string | null
          beat_name?: string | null
          created_at?: string
          id?: string
          plan_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          beat_data?: Json | null
          beat_id?: string | null
          beat_name?: string | null
          created_at?: string
          id?: string
          plan_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_ifsc: string | null
          bank_name: string | null
          company_name: string
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          logo_url: string | null
          pan_number: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          pan_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          pan_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          content_type: string | null
          created_at: string
          doc_type: Database["public"]["Enums"]["employee_doc_type"]
          file_name: string
          file_path: string
          id: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["employee_doc_type"]
          file_name: string
          file_path: string
          id?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["employee_doc_type"]
          file_name?: string
          file_path?: string
          id?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          address: string | null
          alternate_email: string | null
          band: string | null
          created_at: string
          daily_da_allowance: number | null
          date_of_exit: string | null
          date_of_joining: string | null
          education: string | null
          emergency_contact_number: string | null
          hq: string | null
          id: string
          manager_id: string | null
          monthly_salary: number | null
          photo_url: string | null
          secondary_manager_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          alternate_email?: string | null
          band?: string | null
          created_at?: string
          daily_da_allowance?: number | null
          date_of_exit?: string | null
          date_of_joining?: string | null
          education?: string | null
          emergency_contact_number?: string | null
          hq?: string | null
          id?: string
          manager_id?: string | null
          monthly_salary?: number | null
          photo_url?: string | null
          secondary_manager_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          alternate_email?: string | null
          band?: string | null
          created_at?: string
          daily_da_allowance?: number | null
          date_of_exit?: string | null
          date_of_joining?: string | null
          education?: string | null
          emergency_contact_number?: string | null
          hq?: string | null
          id?: string
          manager_id?: string | null
          monthly_salary?: number | null
          photo_url?: string | null
          secondary_manager_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_master_config: {
        Row: {
          created_at: string
          da_type: string
          fixed_da_amount: number | null
          fixed_ta_amount: number | null
          id: string
          ta_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          da_type?: string
          fixed_da_amount?: number | null
          fixed_ta_amount?: number | null
          id?: string
          ta_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          da_type?: string
          fixed_da_amount?: number | null
          fixed_ta_amount?: number | null
          id?: string
          ta_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      gps_tracking: {
        Row: {
          accuracy: number | null
          date: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
          timestamp: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          date?: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
          timestamp?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          date?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      gps_tracking_stops: {
        Row: {
          duration_minutes: number | null
          id: string
          latitude: number
          longitude: number
          reason: string | null
          timestamp: string
          user_id: string
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          latitude: number
          longitude: number
          reason?: string | null
          timestamp?: string
          user_id: string
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          latitude?: number
          longitude?: number
          reason?: string | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          holiday_name: string
          id: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          holiday_name: string
          id?: string
          year?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          holiday_name?: string
          id?: string
          year?: number
        }
        Relationships: []
      }
      leave_applications: {
        Row: {
          applied_date: string | null
          approved_at: string | null
          approved_by: string | null
          approved_date: string | null
          created_at: string
          from_date: string
          half_day_period: string | null
          id: string
          is_half_day: boolean | null
          leave_type_id: string
          reason: string | null
          status: string
          to_date: string
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_date?: string | null
          created_at?: string
          from_date: string
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean | null
          leave_type_id: string
          reason?: string | null
          status?: string
          to_date: string
          total_days: number
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_date?: string | null
          created_at?: string
          from_date?: string
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean | null
          leave_type_id?: string
          reason?: string | null
          status?: string
          to_date?: string
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_applications_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balance: {
        Row: {
          created_at: string
          id: string
          leave_type_id: string
          opening_balance: number
          remaining_balance: number | null
          updated_at: string
          used_balance: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          leave_type_id: string
          opening_balance?: number
          remaining_balance?: number | null
          updated_at?: string
          used_balance?: number
          user_id: string
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          leave_type_id?: string
          opening_balance?: number
          remaining_balance?: number | null
          updated_at?: string
          used_balance?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balance_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policy: {
        Row: {
          accrual_type: string
          carry_forward_allowed: boolean
          created_at: string
          id: string
          is_active: boolean
          leave_type_id: string
          max_carry_forward: number
          monthly_accrual: number | null
          updated_at: string
          yearly_entitlement: number
        }
        Insert: {
          accrual_type?: string
          carry_forward_allowed?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          leave_type_id: string
          max_carry_forward?: number
          monthly_accrual?: number | null
          updated_at?: string
          yearly_entitlement?: number
        }
        Update: {
          accrual_type?: string
          carry_forward_allowed?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          leave_type_id?: string
          max_carry_forward?: number
          monthly_accrual?: number | null
          updated_at?: string
          yearly_entitlement?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_policy_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: true
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          accrual_type: string
          annual_quota: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_days: number
          name: string
        }
        Insert: {
          accrual_type?: string
          annual_quota?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_days?: number
          name: string
        }
        Update: {
          accrual_type?: string
          annual_quota?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_days?: number
          name?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          rate: number
          total: number
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          rate?: number
          total?: number
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          rate?: number
          total?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          discount_amount: number | null
          id: string
          retailer_name: string | null
          status: string
          subtotal: number | null
          total_amount: number | null
          updated_at: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          discount_amount?: number | null
          id?: string
          retailer_name?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          discount_amount?: number | null
          id?: string
          retailer_name?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_modify_all: boolean
          can_read: boolean
          can_view_all: boolean
          id: string
          object_name: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          id?: string
          object_name: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          id?: string
          object_name?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_schemes: {
        Row: {
          condition_quantity: number | null
          created_at: string
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          end_date: string | null
          free_quantity: number | null
          id: string
          is_active: boolean
          name: string
          product_id: string
          scheme_type: string
          start_date: string | null
        }
        Insert: {
          condition_quantity?: number | null
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          end_date?: string | null
          free_quantity?: number | null
          id?: string
          is_active?: boolean
          name: string
          product_id: string
          scheme_type?: string
          start_date?: string | null
        }
        Update: {
          condition_quantity?: number | null
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          end_date?: string | null
          free_quantity?: number | null
          id?: string
          is_active?: boolean
          name?: string
          product_id?: string
          scheme_type?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_schemes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          closing_stock: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          product_number: string | null
          rate: number
          sku: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          closing_stock?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          product_number?: string | null
          rate?: number
          sku?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          closing_stock?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          product_number?: string | null
          rate?: number
          sku?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_object_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_modify_all: boolean
          can_read: boolean
          can_view_all: boolean
          id: string
          object_name: string
          profile_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          id?: string
          object_name: string
          profile_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          id?: string
          object_name?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_object_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "security_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          hint_answer: string | null
          hint_question: string | null
          id: string
          phone_number: string | null
          profile_picture_url: string | null
          recovery_email: string | null
          updated_at: string
          user_status: string
          username: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          hint_answer?: string | null
          hint_question?: string | null
          id: string
          phone_number?: string | null
          profile_picture_url?: string | null
          recovery_email?: string | null
          updated_at?: string
          user_status?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          hint_answer?: string | null
          hint_question?: string | null
          id?: string
          phone_number?: string | null
          profile_picture_url?: string | null
          recovery_email?: string | null
          updated_at?: string
          user_status?: string
          username?: string | null
        }
        Relationships: []
      }
      regularization_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendance_date: string | null
          created_at: string
          current_check_in_time: string | null
          current_check_out_time: string | null
          date: string
          id: string
          reason: string | null
          rejection_reason: string | null
          request_type: string
          requested_check_in_time: string | null
          requested_check_out_time: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date?: string | null
          created_at?: string
          current_check_in_time?: string | null
          current_check_out_time?: string | null
          date: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          request_type: string
          requested_check_in_time?: string | null
          requested_check_out_time?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date?: string | null
          created_at?: string
          current_check_in_time?: string | null
          current_check_out_time?: string | null
          date?: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          request_type?: string
          requested_check_in_time?: string | null
          requested_check_out_time?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      retailers: {
        Row: {
          address: string | null
          beat_id: string | null
          category: string | null
          created_at: string
          id: string
          last_visit_date: string | null
          latitude: number | null
          location_tag: string | null
          longitude: number | null
          name: string
          notes: string | null
          order_value: number | null
          phone: string | null
          potential: string | null
          priority: string | null
          retail_type: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          beat_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          last_visit_date?: string | null
          latitude?: number | null
          location_tag?: string | null
          longitude?: number | null
          name: string
          notes?: string | null
          order_value?: number | null
          phone?: string | null
          potential?: string | null
          priority?: string | null
          retail_type?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          beat_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          last_visit_date?: string | null
          latitude?: number | null
          location_tag?: string | null
          longitude?: number | null
          name?: string
          notes?: string | null
          order_value?: number | null
          phone?: string | null
          potential?: string | null
          priority?: string | null
          retail_type?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_profiles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_security_profiles: {
        Row: {
          created_at: string
          id: string
          profile_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_security_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "security_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          reporting_manager_id: string | null
          role_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          reporting_manager_id?: string | null
          role_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          reporting_manager_id?: string | null
          role_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          check_in_location: Json | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_out_location: Json | null
          check_out_photo_url: string | null
          check_out_time: string | null
          created_at: string
          id: string
          location_match_in: boolean | null
          location_match_out: boolean | null
          planned_date: string | null
          retailer_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          location_match_in?: boolean | null
          location_match_out?: boolean | null
          planned_date?: string | null
          retailer_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          location_match_in?: boolean | null
          location_match_out?: boolean | null
          planned_date?: string | null
          retailer_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      week_off_config: {
        Row: {
          alternate_pattern: string | null
          created_at: string
          day_of_week: number
          id: string
          is_off: boolean
          updated_at: string
        }
        Insert: {
          alternate_pattern?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_off?: boolean
          updated_at?: string
        }
        Update: {
          alternate_pattern?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_off?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      working_days_config: {
        Row: {
          created_at: string
          holidays: number
          id: string
          month: number
          total_days: number
          updated_at: string
          week_offs: number
          working_days: number
          year: number
        }
        Insert: {
          created_at?: string
          holidays?: number
          id?: string
          month: number
          total_days?: number
          updated_at?: string
          week_offs?: number
          working_days?: number
          year: number
        }
        Update: {
          created_at?: string
          holidays?: number
          id?: string
          month?: number
          total_days?: number
          updated_at?: string
          week_offs?: number
          working_days?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_object: {
        Args: { _object_name: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      ensure_current_user: {
        Args: { _email: string; _full_name?: string; _username?: string }
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          username: string
        }[]
      }
      get_subordinate_users: {
        Args: { _manager_id: string }
        Returns: {
          level: number
          user_id: string
        }[]
      }
      get_user_hierarchy: {
        Args: { _manager_id: string }
        Returns: {
          level: number
          user_id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "data_viewer" | "sales_manager"
      employee_doc_type: "address_proof" | "id_proof" | "other"
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
      app_role: ["admin", "user", "data_viewer", "sales_manager"],
      employee_doc_type: ["address_proof", "id_proof", "other"],
    },
  },
} as const
