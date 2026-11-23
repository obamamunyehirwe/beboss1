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
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_email: string
          created_at: number
          details: string
          id: string
          target_id: string
        }
        Insert: {
          action: string
          admin_email: string
          created_at?: number
          details?: string
          id?: string
          target_id?: string
        }
        Update: {
          action?: string
          admin_email?: string
          created_at?: number
          details?: string
          id?: string
          target_id?: string
        }
        Relationships: []
      }
      admin_bootstrap_emails: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      admin_profiles: {
        Row: {
          created_at: number
          email: string
          full_name: string
          is_active: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: number
          email: string
          full_name?: string
          is_active?: boolean
          role?: string
          user_id: string
        }
        Update: {
          created_at?: number
          email?: string
          full_name?: string
          is_active?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string
          cta_label: string
          cta_url: string
          ends_at: string | null
          id: string
          is_active: boolean
          severity: string
          starts_at: string
          target_shop_key: string
          title: string
          translations: Json
          updated_at: string
        }
        Insert: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string
          cta_label?: string
          cta_url?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          severity?: string
          starts_at?: string
          target_shop_key?: string
          title: string
          translations?: Json
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string
          cta_label?: string
          cta_url?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          severity?: string
          starts_at?: string
          target_shop_key?: string
          title?: string
          translations?: Json
          updated_at?: string
        }
        Relationships: []
      }
      apk_downloads: {
        Row: {
          channel: string
          created_at: string
          id: string
          release_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          release_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          release_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apk_downloads_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "app_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          admin_whatsapp_number: string
          airtel_money_phone: string
          airtel_recipient_name: string
          apk_download_url: string
          apk_version: string
          id: string
          mtn_momo_code: string
          mtn_momo_phone: string
          mtn_recipient_name: string
          per_device_fee_rwf: number
          support_email: string
          updated_at: number
        }
        Insert: {
          admin_whatsapp_number?: string
          airtel_money_phone?: string
          airtel_recipient_name?: string
          apk_download_url?: string
          apk_version?: string
          id?: string
          mtn_momo_code?: string
          mtn_momo_phone?: string
          mtn_recipient_name?: string
          per_device_fee_rwf?: number
          support_email?: string
          updated_at?: number
        }
        Update: {
          admin_whatsapp_number?: string
          airtel_money_phone?: string
          airtel_recipient_name?: string
          apk_download_url?: string
          apk_version?: string
          id?: string
          mtn_momo_code?: string
          mtn_momo_phone?: string
          mtn_recipient_name?: string
          per_device_fee_rwf?: number
          support_email?: string
          updated_at?: number
        }
        Relationships: []
      }
      app_releases: {
        Row: {
          created_by: string
          download_count: number
          file_name: string
          file_path: string
          file_url: string
          id: string
          is_current: boolean
          min_android: string
          published_at: string
          release_notes: string
          sha256: string
          size_bytes: number
          version_code: number
          version_name: string
        }
        Insert: {
          created_by?: string
          download_count?: number
          file_name?: string
          file_path?: string
          file_url?: string
          id?: string
          is_current?: boolean
          min_android?: string
          published_at?: string
          release_notes?: string
          sha256?: string
          size_bytes?: number
          version_code?: number
          version_name: string
        }
        Update: {
          created_by?: string
          download_count?: number
          file_name?: string
          file_path?: string
          file_url?: string
          id?: string
          is_current?: boolean
          min_android?: string
          published_at?: string
          release_notes?: string
          sha256?: string
          size_bytes?: number
          version_code?: number
          version_name?: string
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          name: string
          updated_at: string
          updated_by: string
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          updated_by?: string
          value: string
        }
        Update: {
          name?: string
          updated_at?: string
          updated_by?: string
          value?: string
        }
        Relationships: []
      }
      branch_sync_snapshots: {
        Row: {
          branch_id: string
          branch_name: string
          chunk_count: number
          chunk_index: number
          device_id: string
          id: string
          owner_username: string
          payload_token: string
          records_summary: string
          shop_name: string
          shop_sync_key: string
          sync_generation: string
          updated_at: number
        }
        Insert: {
          branch_id?: string
          branch_name?: string
          chunk_count?: number
          chunk_index?: number
          device_id: string
          id: string
          owner_username?: string
          payload_token: string
          records_summary?: string
          shop_name?: string
          shop_sync_key: string
          sync_generation?: string
          updated_at?: number
        }
        Update: {
          branch_id?: string
          branch_name?: string
          chunk_count?: number
          chunk_index?: number
          device_id?: string
          id?: string
          owner_username?: string
          payload_token?: string
          records_summary?: string
          shop_name?: string
          shop_sync_key?: string
          sync_generation?: string
          updated_at?: number
        }
        Relationships: []
      }
      cloud_sync_events: {
        Row: {
          action: string
          actor: string
          created_at: string
          detail: string
          device_id: string
          entity: string
          id: number
          shop_name: string
          shop_sync_key: string
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          detail?: string
          device_id?: string
          entity: string
          id?: never
          shop_name?: string
          shop_sync_key?: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          detail?: string
          device_id?: string
          entity?: string
          id?: never
          shop_name?: string
          shop_sync_key?: string
        }
        Relationships: []
      }
      device_security_telemetry: {
        Row: {
          accuracy_meters: number
          clock_rollback_detected: boolean
          clock_skew_ms: number
          device_id: string
          device_name: string
          has_hooking: boolean
          id: string
          inspected_at: number
          is_emulator: boolean
          is_rooted: boolean
          keystore_backing: string
          latitude: number
          location_captured_at: number
          location_label: string
          longitude: number
          message_summary_json: Json
          permissions_summary: string
          posture_label: string
          risk_score: number
          shop_name: string
          shop_sync_key: string
          signals_json: string
          tamper_incident_count: number
          tamper_reason: string
          unsynced_messages_count: number
          updated_at: number
        }
        Insert: {
          accuracy_meters?: number
          clock_rollback_detected?: boolean
          clock_skew_ms?: number
          device_id: string
          device_name?: string
          has_hooking?: boolean
          id: string
          inspected_at?: number
          is_emulator?: boolean
          is_rooted?: boolean
          keystore_backing?: string
          latitude?: number
          location_captured_at?: number
          location_label?: string
          longitude?: number
          message_summary_json?: Json
          permissions_summary?: string
          posture_label?: string
          risk_score?: number
          shop_name?: string
          shop_sync_key: string
          signals_json?: string
          tamper_incident_count?: number
          tamper_reason?: string
          unsynced_messages_count?: number
          updated_at?: number
        }
        Update: {
          accuracy_meters?: number
          clock_rollback_detected?: boolean
          clock_skew_ms?: number
          device_id?: string
          device_name?: string
          has_hooking?: boolean
          id?: string
          inspected_at?: number
          is_emulator?: boolean
          is_rooted?: boolean
          keystore_backing?: string
          latitude?: number
          location_captured_at?: number
          location_label?: string
          longitude?: number
          message_summary_json?: Json
          permissions_summary?: string
          posture_label?: string
          risk_score?: number
          shop_name?: string
          shop_sync_key?: string
          signals_json?: string
          tamper_incident_count?: number
          tamper_reason?: string
          unsynced_messages_count?: number
          updated_at?: number
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          admin_reply_note: string
          created_at: string
          email: string
          full_name: string
          id: string
          message: string
          phone: string
          shop_name: string
          status: string
          topic: string
          updated_at: string
        }
        Insert: {
          admin_reply_note?: string
          created_at?: string
          email?: string
          full_name: string
          id?: string
          message: string
          phone?: string
          shop_name?: string
          status?: string
          topic?: string
          updated_at?: string
        }
        Update: {
          admin_reply_note?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string
          phone?: string
          shop_name?: string
          status?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          admin_verification_note: string
          amount_rwf: number
          approval_mode: string
          branch_count: number
          created_at: number
          device_challenge: string
          device_count: number
          duration_months: number
          fee_per_device_rwf: number
          generated_unlock_code: string
          id: string
          owner_phone: string
          owner_username: string
          payer_full_name: string
          payer_phone: string
          payment_note: string
          payment_time_ms: number
          provider: string
          rejection_reason: string
          shop_name: string
          source: string
          status: string
          updated_at: number
          ussd_code: string
          verified_by_admin: string
          worker_count: number
        }
        Insert: {
          admin_verification_note?: string
          amount_rwf?: number
          approval_mode?: string
          branch_count?: number
          created_at?: number
          device_challenge?: string
          device_count?: number
          duration_months?: number
          fee_per_device_rwf?: number
          generated_unlock_code?: string
          id: string
          owner_phone: string
          owner_username: string
          payer_full_name?: string
          payer_phone?: string
          payment_note?: string
          payment_time_ms?: number
          provider?: string
          rejection_reason?: string
          shop_name: string
          source?: string
          status?: string
          updated_at?: number
          ussd_code?: string
          verified_by_admin?: string
          worker_count?: number
        }
        Update: {
          admin_verification_note?: string
          amount_rwf?: number
          approval_mode?: string
          branch_count?: number
          created_at?: number
          device_challenge?: string
          device_count?: number
          duration_months?: number
          fee_per_device_rwf?: number
          generated_unlock_code?: string
          id?: string
          owner_phone?: string
          owner_username?: string
          payer_full_name?: string
          payer_phone?: string
          payment_note?: string
          payment_time_ms?: number
          provider?: string
          rejection_reason?: string
          shop_name?: string
          source?: string
          status?: string
          updated_at?: number
          ussd_code?: string
          verified_by_admin?: string
          worker_count?: number
        }
        Relationships: []
      }
      shop_accounts: {
        Row: {
          admin_notes: string
          admin_whatsapp: string
          auto_unlocked_at: number
          branch_count: number
          business_type: string
          created_at: number
          device_challenge: string
          device_count: number
          device_limit: number
          id: string
          min_app_version: string
          monthly_fee_rwf: number
          owner_name: string
          owner_phone: string
          owner_username: string
          remote_kill_switch: boolean
          server_failed_pin_attempts: number
          shop_name: string
          subscription_expires_at: number
          subscription_status: string
          updated_at: number
          worker_count: number
        }
        Insert: {
          admin_notes?: string
          admin_whatsapp?: string
          auto_unlocked_at?: number
          branch_count?: number
          business_type?: string
          created_at?: number
          device_challenge?: string
          device_count?: number
          device_limit?: number
          id: string
          min_app_version?: string
          monthly_fee_rwf?: number
          owner_name?: string
          owner_phone: string
          owner_username: string
          remote_kill_switch?: boolean
          server_failed_pin_attempts?: number
          shop_name: string
          subscription_expires_at?: number
          subscription_status?: string
          updated_at?: number
          worker_count?: number
        }
        Update: {
          admin_notes?: string
          admin_whatsapp?: string
          auto_unlocked_at?: number
          branch_count?: number
          created_at?: number
          device_challenge?: string
          device_count?: number
          device_limit?: number
          id?: string
          min_app_version?: string
          monthly_fee_rwf?: number
          owner_name?: string
          owner_phone?: string
          owner_username?: string
          remote_kill_switch?: boolean
          server_failed_pin_attempts?: number
          shop_name?: string
          subscription_expires_at?: number
          subscription_status?: string
          updated_at?: number
          worker_count?: number
        }
        Relationships: []
      }
      shop_branches: {
        Row: {
          address: string
          code: string
          color_hex: string
          created_at: number
          daily_sales_target_rwf: number
          email: string
          hlc_timestamp: number
          id: string
          is_active: boolean
          is_main_branch: boolean
          last_modified_device_id: string
          manager_name: string
          manager_user_id: string
          monthly_target_rwf: number
          name: string
          notes: string
          opening_cash_float: number
          operational_status: string
          phone: string
          product_count: number
          shop_name: string
          shop_sync_key: string
          stock_value_rwf: number
          sync_version: number
          updated_at: number
        }
        Insert: {
          address?: string
          code?: string
          color_hex?: string
          created_at?: number
          daily_sales_target_rwf?: number
          email?: string
          hlc_timestamp?: number
          id: string
          is_active?: boolean
          is_main_branch?: boolean
          last_modified_device_id?: string
          manager_name?: string
          manager_user_id?: string
          monthly_target_rwf?: number
          name?: string
          notes?: string
          opening_cash_float?: number
          operational_status?: string
          phone?: string
          product_count?: number
          shop_name?: string
          shop_sync_key: string
          stock_value_rwf?: number
          sync_version?: number
          updated_at?: number
        }
        Update: {
          address?: string
          code?: string
          color_hex?: string
          created_at?: number
          daily_sales_target_rwf?: number
          email?: string
          hlc_timestamp?: number
          id?: string
          is_active?: boolean
          is_main_branch?: boolean
          last_modified_device_id?: string
          manager_name?: string
          manager_user_id?: string
          monthly_target_rwf?: number
          name?: string
          notes?: string
          opening_cash_float?: number
          operational_status?: string
          phone?: string
          product_count?: number
          shop_name?: string
          shop_sync_key?: string
          stock_value_rwf?: number
          sync_version?: number
          updated_at?: number
        }
        Relationships: []
      }
      shop_devices: {
        Row: {
          assigned_user_id: string
          assigned_user_name: string
          assigned_username: string
          branch_id: string
          branch_name: string
          created_at: number
          device_id: string
          device_name: string
          id: string
          is_active: boolean
          is_owner_primary: boolean
          join_code: string
          last_synced_at: number
          monthly_fee_addon_rwf: number
          role: string
          shop_name: string
          shop_sync_key: string
          updated_at: number
        }
        Insert: {
          assigned_user_id?: string
          assigned_user_name?: string
          assigned_username?: string
          branch_id?: string
          branch_name?: string
          created_at?: number
          device_id?: string
          device_name?: string
          id: string
          is_active?: boolean
          is_owner_primary?: boolean
          join_code?: string
          last_synced_at?: number
          monthly_fee_addon_rwf?: number
          role?: string
          shop_name?: string
          shop_sync_key: string
          updated_at?: number
        }
        Update: {
          assigned_user_id?: string
          assigned_user_name?: string
          assigned_username?: string
          branch_id?: string
          branch_name?: string
          created_at?: number
          device_id?: string
          device_name?: string
          id?: string
          is_active?: boolean
          is_owner_primary?: boolean
          join_code?: string
          last_synced_at?: number
          monthly_fee_addon_rwf?: number
          role?: string
          shop_name?: string
          shop_sync_key?: string
          updated_at?: number
        }
        Relationships: []
      }
      shop_stock_transfers: {
        Row: {
          cost_value_rwf: number
          created_at: number
          from_branch_id: string
          from_branch_name: string
          hlc_timestamp: number
          id: string
          last_modified_device_id: string
          notes: string
          product_id: string
          product_name: string
          quantity: number
          received_at: number
          received_by: string
          shop_name: string
          shop_sync_key: string
          status: string
          synced: boolean
          to_branch_id: string
          to_branch_name: string
          transfer_date: number
          transfer_number: string
          transferred_by: string
          unit: string
          updated_at: number
        }
        Insert: {
          cost_value_rwf?: number
          created_at?: number
          from_branch_id?: string
          from_branch_name?: string
          hlc_timestamp?: number
          id: string
          last_modified_device_id?: string
          notes?: string
          product_id?: string
          product_name?: string
          quantity?: number
          received_at?: number
          received_by?: string
          shop_name?: string
          shop_sync_key: string
          status?: string
          synced?: boolean
          to_branch_id?: string
          to_branch_name?: string
          transfer_date?: number
          transfer_number?: string
          transferred_by?: string
          unit?: string
          updated_at?: number
        }
        Update: {
          cost_value_rwf?: number
          created_at?: number
          from_branch_id?: string
          from_branch_name?: string
          hlc_timestamp?: number
          id?: string
          last_modified_device_id?: string
          notes?: string
          product_id?: string
          product_name?: string
          quantity?: number
          received_at?: number
          received_by?: string
          shop_name?: string
          shop_sync_key?: string
          status?: string
          synced?: boolean
          to_branch_id?: string
          to_branch_name?: string
          transfer_date?: number
          transfer_number?: string
          transferred_by?: string
          unit?: string
          updated_at?: number
        }
        Relationships: []
      }
      shop_users: {
        Row: {
          assigned_branch_id: string
          assigned_branch_name: string
          full_name: string
          id: string
          is_active: boolean
          phone: string
          role: string
          shop_name: string
          shop_sync_key: string
          updated_at: number
          user_id: string
          username: string
        }
        Insert: {
          assigned_branch_id?: string
          assigned_branch_name?: string
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string
          role?: string
          shop_name?: string
          shop_sync_key: string
          updated_at?: number
          user_id: string
          username: string
        }
        Update: {
          assigned_branch_id?: string
          assigned_branch_name?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string
          role?: string
          shop_name?: string
          shop_sync_key?: string
          updated_at?: number
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      unlock_code_verification_attempts: {
        Row: {
          created_at: string
          id: string
          ip_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string
        }
        Relationships: []
      }
      unlock_codes: {
        Row: {
          amount_rwf: number
          branch_count: number
          device_challenge: string
          device_count: number
          duration_months: number
          id: string
          issued_at: number
          issued_by_admin: string
          payer_full_name: string
          payer_phone: string
          payment_note: string
          payment_provider: string
          payment_request_id: string | null
          payment_time_ms: number
          plan_days: number
          plan_digest: string
          redeemed_at: number | null
          shop_phone: string
          shop_username: string
          status: string
          tier_code: string
          unlock_code: string
          worker_count: number
        }
        Insert: {
          amount_rwf?: number
          branch_count?: number
          device_challenge?: string
          device_count?: number
          duration_months?: number
          id: string
          issued_at?: number
          issued_by_admin?: string
          payer_full_name?: string
          payer_phone?: string
          payment_note?: string
          payment_provider?: string
          payment_request_id?: string | null
          payment_time_ms?: number
          plan_days?: number
          plan_digest?: string
          redeemed_at?: number | null
          shop_phone: string
          shop_username: string
          status?: string
          tier_code?: string
          unlock_code: string
          worker_count?: number
        }
        Update: {
          amount_rwf?: number
          branch_count?: number
          device_challenge?: string
          device_count?: number
          duration_months?: number
          id?: string
          issued_at?: number
          issued_by_admin?: string
          payer_full_name?: string
          payer_phone?: string
          payment_note?: string
          payment_provider?: string
          payment_request_id?: string | null
          payment_time_ms?: number
          plan_days?: number
          plan_digest?: string
          redeemed_at?: number | null
          shop_phone?: string
          shop_username?: string
          status?: string
          tier_code?: string
          unlock_code?: string
          worker_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "unlock_codes_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_expected_subscription_fee: {
        Args: {
          p_branch_count: number
          p_device_count?: number
          p_duration_months: number
          p_worker_count: number
        }
        Returns: number
      }
      computed_shop_sync_key: {
        Args: { p_phone: string; p_username: string }
        Returns: string
      }
      current_shop_sync_key: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_beboss_admin: { Args: never; Returns: boolean }
      is_beboss_staff: { Args: never; Returns: boolean }
      now_ms: { Args: never; Returns: number }
      issue_shop_device_invite: {
        Args: {
          p_branch_id: string
          p_code_hash: string
          p_created_by_device_id: string
          p_created_by_user_id: string
          p_device_record_id: string
          p_expires_at: number
          p_shop_sync_key: string
        }
        Returns: Json
      }
      revoke_shop_device_invites: {
        Args: {
          p_actor_device_id: string
          p_actor_user_id: string
          p_device_record_id: string
          p_shop_sync_key: string
        }
        Returns: boolean
      }
      public_platform_stats: { Args: never; Returns: Json }
      record_apk_download: {
        Args: { p_channel?: string; p_release_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "support"
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
  public: {
    Enums: {
      app_role: ["admin", "support"],
    },
  },
} as const
