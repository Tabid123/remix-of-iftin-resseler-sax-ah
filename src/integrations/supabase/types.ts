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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_verification_codes: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string
          id: string
          used: boolean | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at: string
          id?: string
          used?: boolean | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          used?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      android_devices: {
        Row: {
          archived_at: string | null
          battery_level: number | null
          created_at: string | null
          device_config: Json | null
          device_id: string
          device_name: string
          failed_deliveries: number | null
          id: string
          is_active: boolean | null
          last_ping_at: string | null
          provider_name: string
          sim_number: string
          sim1_provider: string | null
          sim2_number: string | null
          sim2_provider: string | null
          tenant_id: string | null
          total_deliveries: number | null
        }
        Insert: {
          archived_at?: string | null
          battery_level?: number | null
          created_at?: string | null
          device_config?: Json | null
          device_id: string
          device_name: string
          failed_deliveries?: number | null
          id?: string
          is_active?: boolean | null
          last_ping_at?: string | null
          provider_name: string
          sim_number: string
          sim1_provider?: string | null
          sim2_number?: string | null
          sim2_provider?: string | null
          tenant_id?: string | null
          total_deliveries?: number | null
        }
        Update: {
          archived_at?: string | null
          battery_level?: number | null
          created_at?: string | null
          device_config?: Json | null
          device_id?: string
          device_name?: string
          failed_deliveries?: number | null
          id?: string
          is_active?: boolean | null
          last_ping_at?: string | null
          provider_name?: string
          sim_number?: string
          sim1_provider?: string | null
          sim2_number?: string | null
          sim2_provider?: string | null
          tenant_id?: string | null
          total_deliveries?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "android_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      apk_builds: {
        Row: {
          build_number: number
          created_at: string | null
          file_name: string
          file_size: number | null
          github_sha: string | null
          id: string
          is_latest: boolean | null
          storage_path: string
          tenant_id: string | null
          version: string
        }
        Insert: {
          build_number: number
          created_at?: string | null
          file_name: string
          file_size?: number | null
          github_sha?: string | null
          id?: string
          is_latest?: boolean | null
          storage_path: string
          tenant_id?: string | null
          version: string
        }
        Update: {
          build_number?: number
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          github_sha?: string | null
          id?: string
          is_latest?: boolean | null
          storage_path?: string
          tenant_id?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "apk_builds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: boolean | null
          tenant_id: string | null
          text_value: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: boolean | null
          tenant_id?: string | null
          text_value?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: boolean | null
          tenant_id?: string | null
          text_value?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_numbers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          phone_number: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_numbers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      banners_config: {
        Row: {
          alt_text: string | null
          banner_image: string
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean | null
          media_type: string | null
          rotation_interval: number | null
          tenant_id: string | null
          updated_at: string | null
          video_duration: number | null
        }
        Insert: {
          alt_text?: string | null
          banner_image: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          media_type?: string | null
          rotation_interval?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          video_duration?: number | null
        }
        Update: {
          alt_text?: string | null
          banner_image?: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          media_type?: string | null
          rotation_interval?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          video_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "banners_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          is_active: boolean
          phone_number: string
          reason: string | null
          tenant_id: string | null
          unblocked_at: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number: string
          reason?: string | null
          tenant_id?: string | null
          unblocked_at?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number?: string
          reason?: string | null
          tenant_id?: string | null
          unblocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_sms_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          device_id: string | null
          failed_count: number
          id: string
          message: string
          sent_count: number
          sim_slot: number | null
          status: string
          target_filter: Json | null
          target_type: string
          tenant_id: string | null
          total_recipients: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          failed_count?: number
          id?: string
          message: string
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_filter?: Json | null
          target_type?: string
          tenant_id?: string | null
          total_recipients?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          failed_count?: number
          id?: string
          message?: string
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_filter?: Json | null
          target_type?: string
          tenant_id?: string | null
          total_recipients?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulk_sms_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_sms_queue: {
        Row: {
          campaign_id: string
          created_at: string
          device_id: string | null
          error_message: string | null
          id: string
          phone_number: string
          sent_at: string | null
          sim_slot: number | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          phone_number: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          phone_number?: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_sms_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_sms_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_sms_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_discounts: {
        Row: {
          applicable_to: string | null
          created_at: string | null
          customer_phone: string
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          notes: string | null
          package_id: string | null
          provider_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          applicable_to?: string | null
          created_at?: string | null
          customer_phone: string
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          applicable_to?: string | null
          created_at?: string | null
          customer_phone?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_discounts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_discounts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_discounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_discounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_packages_config: {
        Row: {
          category_id: string | null
          connection_type_label: string | null
          cost_price: number
          created_at: string | null
          data_amount: string
          id: string
          is_active: boolean | null
          package_name: string
          profit_margin: number
          provider_id: string
          selling_price: number
          tenant_id: string | null
          updated_at: string | null
          ussd_code: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"] | null
          validity_days: string
        }
        Insert: {
          category_id?: string | null
          connection_type_label?: string | null
          cost_price: number
          created_at?: string | null
          data_amount: string
          id?: string
          is_active?: boolean | null
          package_name: string
          profit_margin: number
          provider_id: string
          selling_price: number
          tenant_id?: string | null
          updated_at?: string | null
          ussd_code?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"] | null
          validity_days: string
        }
        Update: {
          category_id?: string | null
          connection_type_label?: string | null
          cost_price?: number
          created_at?: string | null
          data_amount?: string
          id?: string
          is_active?: boolean | null
          package_name?: string
          profit_margin?: number
          provider_id?: string
          selling_price?: number
          tenant_id?: string | null
          updated_at?: string | null
          ussd_code?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"] | null
          validity_days?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_packages_config_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_packages_config_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_packages_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_instructions: {
        Row: {
          category_id: string | null
          code_template: string | null
          created_at: string | null
          id: string
          instruction_template: string
          notes: string | null
          package_id: string | null
          provider_id: string
          sim_password: string | null
          tenant_id: string | null
          updated_at: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"]
        }
        Insert: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string | null
          id?: string
          instruction_template: string
          notes?: string | null
          package_id?: string | null
          provider_id: string
          sim_password?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"]
        }
        Update: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string | null
          id?: string
          instruction_template?: string
          notes?: string | null
          package_id?: string | null
          provider_id?: string
          sim_password?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_instructions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_queue: {
        Row: {
          android_device_id: string | null
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          flow_progress: Json
          id: string
          last_attempt_at: string | null
          order_id: string | null
          package_code: string | null
          pin_code: string | null
          provider_name: string
          provider_response: string | null
          receiver_phone: string
          scheduled_at: string | null
          sim_slot: number | null
          status: string | null
          tenant_id: string | null
          topup_amount: number | null
          ussd_code: string
        }
        Insert: {
          android_device_id?: string | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          flow_progress?: Json
          id?: string
          last_attempt_at?: string | null
          order_id?: string | null
          package_code?: string | null
          pin_code?: string | null
          provider_name: string
          provider_response?: string | null
          receiver_phone: string
          scheduled_at?: string | null
          sim_slot?: number | null
          status?: string | null
          tenant_id?: string | null
          topup_amount?: number | null
          ussd_code: string
        }
        Update: {
          android_device_id?: string | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          flow_progress?: Json
          id?: string
          last_attempt_at?: string | null
          order_id?: string | null
          package_code?: string | null
          pin_code?: string | null
          provider_name?: string
          provider_response?: string | null
          receiver_phone?: string
          scheduled_at?: string | null
          sim_slot?: number | null
          status?: string | null
          tenant_id?: string | null
          topup_amount?: number | null
          ussd_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string | null
          device_id: string
          device_name: string
          id: string
          is_acknowledged: boolean | null
          last_sms_at: string | null
          sms_count: number | null
          tenant_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string | null
          device_id: string
          device_name: string
          id?: string
          is_acknowledged?: boolean | null
          last_sms_at?: string | null
          sms_count?: number | null
          tenant_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string | null
          device_id?: string
          device_name?: string
          id?: string
          is_acknowledged?: boolean | null
          last_sms_at?: string | null
          sms_count?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          is_active: boolean
          last_seen: string | null
          sim1_number: string | null
          sim2_number: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string | null
          sim1_number?: string | null
          sim2_number?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string | null
          sim1_number?: string | null
          sim2_number?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          applicable_to: string | null
          code: string
          created_at: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          package_id: string | null
          provider_id: string | null
          tenant_id: string | null
          times_used: number | null
          updated_at: string | null
          usage_limit: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_to?: string | null
          code: string
          created_at?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          package_id?: string | null
          provider_id?: string | null
          tenant_id?: string | null
          times_used?: number | null
          updated_at?: string | null
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_to?: string | null
          code?: string
          created_at?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          package_id?: string | null
          provider_id?: string | null
          tenant_id?: string | null
          times_used?: number | null
          updated_at?: string | null
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      error_messages: {
        Row: {
          created_at: string
          error_type: string
          icon_type: string
          icon_value: string
          id: string
          is_animated: boolean | null
          message: string
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_type: string
          icon_type: string
          icon_value: string
          id?: string
          is_animated?: boolean | null
          message: string
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_type?: string
          icon_type?: string
          icon_value?: string
          id?: string
          is_animated?: boolean | null
          message?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_packages: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          package_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: true
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "featured_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: true
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "featured_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          amount: number
          created_at: string
          description: string | null
          id: string
          is_reviewed: boolean
          notes: string | null
          payment_receipt_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_phone: string
          severity: string
          tenant_id: string | null
        }
        Insert: {
          alert_type: string
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          payment_receipt_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone: string
          severity?: string
          tenant_id?: string | null
        }
        Update: {
          alert_type?: string
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          payment_receipt_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone?: string
          severity?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_payment_receipt_id_fkey"
            columns: ["payment_receipt_id"]
            isOneToOne: false
            referencedRelation: "payment_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          message: string
          tenant_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          tenant_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_registrations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          provider_id: string | null
          provider_name: string
          receiver_phone: string
          sender_phone: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider_id?: string | null
          provider_name: string
          receiver_phone: string
          sender_phone: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider_id?: string | null
          provider_name?: string
          receiver_phone?: string
          sender_phone?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offline_registrations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_registrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_phone: string
          data_amount: string
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string | null
          id: string
          intent_id: string | null
          invoice_url: string | null
          is_manual: boolean | null
          package_id: string | null
          package_name: string
          payment_number: string
          payment_provider_id: string
          payment_source: string | null
          provider_id: string
          receiver_phone: string
          selling_price: number
          sender_phone: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_phone: string
          data_amount: string
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          id?: string
          intent_id?: string | null
          invoice_url?: string | null
          is_manual?: boolean | null
          package_id?: string | null
          package_name: string
          payment_number: string
          payment_provider_id: string
          payment_source?: string | null
          provider_id: string
          receiver_phone: string
          selling_price: number
          sender_phone?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_phone?: string
          data_amount?: string
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          id?: string
          intent_id?: string | null
          invoice_url?: string | null
          is_manual?: boolean | null
          package_id?: string | null
          package_name?: string
          payment_number?: string
          payment_provider_id?: string
          payment_source?: string | null
          provider_id?: string
          receiver_phone?: string
          selling_price?: number
          sender_phone?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "pending_online_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_settings: {
        Row: {
          cooldown_days: number
          created_at: string
          daily_quota: number
          follow_up_days: number
          id: string
          sms_template: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cooldown_days?: number
          created_at?: string
          daily_quota?: number
          follow_up_days?: number
          id?: string
          sms_template?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cooldown_days?: number
          created_at?: string
          daily_quota?: number
          follow_up_days?: number
          id?: string
          sms_template?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_targets: {
        Row: {
          assigned_date: string
          assigned_to: string | null
          contact_method: string | null
          contacted_at: string | null
          converted_at: string | null
          created_at: string
          follow_up_count: number
          follow_up_due_at: string | null
          id: string
          last_follow_up_at: string | null
          notes: string | null
          phone_number: string
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_date?: string
          assigned_to?: string | null
          contact_method?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string
          follow_up_count?: number
          follow_up_due_at?: string | null
          id?: string
          last_follow_up_at?: string | null
          notes?: string | null
          phone_number: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_date?: string
          assigned_to?: string | null
          contact_method?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string
          follow_up_count?: number
          follow_up_due_at?: string | null
          id?: string
          last_follow_up_at?: string | null
          notes?: string | null
          phone_number?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_categories: {
        Row: {
          category_image: string | null
          category_name: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean | null
          provider_id: string | null
          tenant_id: string | null
          updated_at: string
          ussd_method: Database["public"]["Enums"]["ussd_method"] | null
        }
        Insert: {
          category_image?: string | null
          category_name: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean | null
          provider_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          ussd_method?: Database["public"]["Enums"]["ussd_method"] | null
        }
        Update: {
          category_image?: string | null
          category_name?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean | null
          provider_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          ussd_method?: Database["public"]["Enums"]["ussd_method"] | null
        }
        Relationships: [
          {
            foreignKeyName: "package_categories_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_delivery_rules: {
        Row: {
          created_at: string | null
          delay_minutes: number
          delivery_count: number
          execution_order: number
          id: string
          is_active: boolean | null
          notes: string | null
          source_package_id: string
          target_package_id: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean | null
          notes?: string | null
          source_package_id: string
          target_package_id: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean | null
          notes?: string | null
          source_package_id?: string
          target_package_id?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_delivery_rules_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_delivery_rules_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_delivery_rules_target_package_id_fkey"
            columns: ["target_package_id"]
            isOneToOne: false
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_delivery_rules_target_package_id_fkey"
            columns: ["target_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_delivery_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_profit_overrides: {
        Row: {
          created_at: string | null
          custom_profit_margin: number
          id: string
          notes: string | null
          package_id: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_profit_margin: number
          id?: string
          notes?: string | null
          package_id: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_profit_margin?: number
          id?: string
          notes?: string | null
          package_id?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_profit_overrides_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: true
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_profit_overrides_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: true
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_profit_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers_config: {
        Row: {
          api_credentials: Json | null
          commission_rate: number
          created_at: string | null
          id: string
          is_active: boolean | null
          payment_number: string | null
          prefix_code: string | null
          provider_logo: string | null
          provider_name: string
          tenant_id: string | null
          updated_at: string | null
          ussd_code_template: string | null
          ussd_prefix: string | null
        }
        Insert: {
          api_credentials?: Json | null
          commission_rate: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          payment_number?: string | null
          prefix_code?: string | null
          provider_logo?: string | null
          provider_name: string
          tenant_id?: string | null
          updated_at?: string | null
          ussd_code_template?: string | null
          ussd_prefix?: string | null
        }
        Update: {
          api_credentials?: Json | null
          commission_rate?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          payment_number?: string | null
          prefix_code?: string | null
          provider_logo?: string | null
          provider_name?: string
          tenant_id?: string | null
          updated_at?: string | null
          ussd_code_template?: string | null
          ussd_prefix?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_providers_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          id: string
          matched_order_id: string | null
          matching_strategy: string | null
          payment_hash: string | null
          processed_at: string | null
          receiver_sim: string
          sender_phone: string
          sms_body: string | null
          status: string | null
          tenant_id: string | null
          tx_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          payment_hash?: string | null
          processed_at?: string | null
          receiver_sim: string
          sender_phone: string
          sms_body?: string | null
          status?: string | null
          tenant_id?: string | null
          tx_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          payment_hash?: string | null
          processed_at?: string | null
          receiver_sim?: string
          sender_phone?: string
          sms_body?: string | null
          status?: string | null
          tenant_id?: string | null
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_online_payments: {
        Row: {
          created_at: string | null
          expected_amount: number
          expires_at: string | null
          id: string
          intent_type: string
          package_id: string | null
          payment_provider: string | null
          provider_id: string | null
          receiver_phone: string
          sender_phone: string | null
          status: string | null
          tenant_id: string | null
          tier_id: string | null
          topup_amount: number | null
          ussd_code: string | null
          verified_phone: string
        }
        Insert: {
          created_at?: string | null
          expected_amount: number
          expires_at?: string | null
          id?: string
          intent_type?: string
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone: string
          sender_phone?: string | null
          status?: string | null
          tenant_id?: string | null
          tier_id?: string | null
          topup_amount?: number | null
          ussd_code?: string | null
          verified_phone: string
        }
        Update: {
          created_at?: string | null
          expected_amount?: number
          expires_at?: string | null
          id?: string
          intent_type?: string
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone?: string
          sender_phone?: string | null
          status?: string | null
          tenant_id?: string | null
          tier_id?: string | null
          topup_amount?: number | null
          ussd_code?: string | null
          verified_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_online_payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_online_payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_online_payments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_online_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_online_payments_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "customer_wholesale_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_online_payments_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "provider_wholesale_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_wholesale_tiers: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          max_amount: number
          min_amount: number
          profit_rate: number
          provider_id: string
          tenant_id: string | null
          tier_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          max_amount: number
          min_amount: number
          profit_rate: number
          provider_id: string
          tenant_id?: string | null
          tier_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          max_amount?: number
          min_amount?: number
          profit_rate?: number
          provider_id?: string
          tenant_id?: string | null
          tier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_wholesale_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      providers_config: {
        Row: {
          api_endpoint: string | null
          api_key: string | null
          created_at: string | null
          display_order: number
          evoucher_rate: number | null
          id: string
          is_active: boolean | null
          promotional_text: string | null
          provider_logo: string | null
          provider_name: string
          tenant_id: string | null
          updated_at: string | null
          ussd_flow_id: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"]
          ussd_single_template: string | null
        }
        Insert: {
          api_endpoint?: string | null
          api_key?: string | null
          created_at?: string | null
          display_order?: number
          evoucher_rate?: number | null
          id?: string
          is_active?: boolean | null
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name: string
          tenant_id?: string | null
          updated_at?: string | null
          ussd_flow_id?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"]
          ussd_single_template?: string | null
        }
        Update: {
          api_endpoint?: string | null
          api_key?: string | null
          created_at?: string | null
          display_order?: number
          evoucher_rate?: number | null
          id?: string
          is_active?: boolean | null
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name?: string
          tenant_id?: string | null
          updated_at?: string | null
          ussd_flow_id?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"]
          ussd_single_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_config_ussd_flow_id_fkey"
            columns: ["ussd_flow_id"]
            isOneToOne: false
            referencedRelation: "ussd_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_balances: {
        Row: {
          balance: number
          balance_source: string | null
          balance_type: string
          created_at: string
          id: string
          last_updated: string
          notes: string | null
          sim_id: string
          sim_slot: number | null
          tenant_id: string | null
          updated_by: string | null
        }
        Insert: {
          balance?: number
          balance_source?: string | null
          balance_type?: string
          created_at?: string
          id?: string
          last_updated?: string
          notes?: string | null
          sim_id: string
          sim_slot?: number | null
          tenant_id?: string | null
          updated_by?: string | null
        }
        Update: {
          balance?: number
          balance_source?: string | null
          balance_type?: string
          created_at?: string
          id?: string
          last_updated?: string
          notes?: string | null
          sim_id?: string
          sim_slot?: number | null
          tenant_id?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sim_balances_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_otp_queue: {
        Row: {
          created_at: string
          device_id: string | null
          error_message: string | null
          id: string
          otp_code: string
          phone_number: string
          processed_at: string | null
          provider: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          otp_code: string
          phone_number: string
          processed_at?: string | null
          provider?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          otp_code?: string
          phone_number?: string
          processed_at?: string | null
          provider?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_otp_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_admin_credentials: {
        Row: {
          created_at: string
          email: string
          id: string
          initial_password: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          initial_password?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          initial_password?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_admin_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          member_role: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_role?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_role?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          contact_phone: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          owner_id: string | null
          plan: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ussd_flow_steps: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          is_pin_field: boolean
          match_keywords: string[]
          response_template: string
          step_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          is_pin_field?: boolean
          match_keywords?: string[]
          response_template?: string
          step_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          is_pin_field?: boolean
          match_keywords?: string[]
          response_template?: string
          step_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ussd_flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "ussd_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ussd_flow_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ussd_flows: {
        Row: {
          created_at: string
          flow_name: string
          id: string
          is_enabled: boolean
          notes: string | null
          provider_id: string | null
          tenant_id: string | null
          trigger_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          flow_name: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          provider_id?: string | null
          tenant_id?: string | null
          trigger_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          flow_name?: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          provider_id?: string | null
          tenant_id?: string | null
          trigger_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ussd_flows_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ussd_flows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ussd_unmatched_dialogs: {
        Row: {
          auto_learned: boolean
          created_at: string
          device_id: string | null
          dialog_text: string
          flow_id: string | null
          id: string
          matched: boolean
          resolved: boolean
          step_order: number | null
          suggested_step_id: string | null
          tenant_id: string | null
        }
        Insert: {
          auto_learned?: boolean
          created_at?: string
          device_id?: string | null
          dialog_text: string
          flow_id?: string | null
          id?: string
          matched?: boolean
          resolved?: boolean
          step_order?: number | null
          suggested_step_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          auto_learned?: boolean
          created_at?: string
          device_id?: string | null
          dialog_text?: string
          flow_id?: string | null
          id?: string
          matched?: boolean
          resolved?: boolean
          step_order?: number | null
          suggested_step_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ussd_unmatched_dialogs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "ussd_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ussd_unmatched_dialogs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_phones: {
        Row: {
          created_at: string
          id: string
          last_login_at: string
          phone_number: string
          tenant_id: string | null
          updated_at: string
          verification_code: string | null
          verified_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login_at?: string
          phone_number: string
          tenant_id?: string | null
          updated_at?: string
          verification_code?: string | null
          verified_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login_at?: string
          phone_number?: string
          tenant_id?: string | null
          updated_at?: string
          verification_code?: string | null
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_phones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_data_packages: {
        Row: {
          category_id: string | null
          connection_type_label: string | null
          created_at: string | null
          data_amount: string | null
          id: string | null
          is_active: boolean | null
          package_name: string | null
          provider_id: string | null
          selling_price: number | null
          tenant_id: string | null
          updated_at: string | null
          ussd_code: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"] | null
          validity_days: string | null
        }
        Insert: {
          category_id?: string | null
          connection_type_label?: string | null
          created_at?: string | null
          data_amount?: string | null
          id?: string | null
          is_active?: boolean | null
          package_name?: string | null
          provider_id?: string | null
          selling_price?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          ussd_code?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"] | null
          validity_days?: string | null
        }
        Update: {
          category_id?: string | null
          connection_type_label?: string | null
          created_at?: string | null
          data_amount?: string | null
          id?: string | null
          is_active?: boolean | null
          package_name?: string | null
          provider_id?: string | null
          selling_price?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          ussd_code?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"] | null
          validity_days?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_packages_config_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_packages_config_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_packages_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_delivery_instructions: {
        Row: {
          category_id: string | null
          code_template: string | null
          created_at: string | null
          id: string | null
          instruction_template: string | null
          notes: string | null
          package_id: string | null
          provider_id: string | null
          tenant_id: string | null
          updated_at: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"] | null
        }
        Insert: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string | null
          id?: string | null
          instruction_template?: string | null
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"] | null
        }
        Update: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string | null
          id?: string | null
          instruction_template?: string | null
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          ussd_method?: Database["public"]["Enums"]["ussd_method"] | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_instructions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "customer_data_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wholesale_tiers: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string | null
          is_active: boolean | null
          max_amount: number | null
          min_amount: number | null
          profit_rate: number | null
          provider_id: string | null
          tenant_id: string | null
          tier_name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string | null
          is_active?: boolean | null
          max_amount?: number | null
          min_amount?: number | null
          profit_rate?: number | null
          provider_id?: string | null
          tenant_id?: string | null
          tier_name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string | null
          is_active?: boolean | null
          max_amount?: number | null
          min_amount?: number | null
          profit_rate?: number | null
          provider_id?: string | null
          tenant_id?: string | null
          tier_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_wholesale_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_exists: { Args: never; Returns: boolean }
      auto_recover_stuck_deliveries: { Args: never; Returns: Json }
      bootstrap_first_admin: { Args: never; Returns: Json }
      bump_outreach_follow_up: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      can_manage_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      claim_next_delivery: {
        Args: { p_device_id: string; p_providers: string[] }
        Returns: {
          android_device_id: string | null
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          flow_progress: Json
          id: string
          last_attempt_at: string | null
          order_id: string | null
          package_code: string | null
          pin_code: string | null
          provider_name: string
          provider_response: string | null
          receiver_phone: string
          scheduled_at: string | null
          sim_slot: number | null
          status: string | null
          tenant_id: string | null
          topup_amount: number | null
          ussd_code: string
        }[]
        SetofOptions: {
          from: "*"
          to: "delivery_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clone_tenant_catalog: {
        Args: { _source_slug?: string; _target_tenant: string }
        Returns: Json
      }
      clone_tenant_providers: {
        Args: {
          _provider_names: string[]
          _source_slug?: string
          _target_tenant: string
        }
        Returns: Json
      }
      create_jumlo_payment_reservation: {
        Args: {
          p_data_phone: string
          p_expected_amount: number
          p_payment_provider: string
          p_provider_id: string
          p_sender_phone: string
          p_tier_id: string
          p_topup_amount: number
          p_verified_phone: string
        }
        Returns: Json
      }
      create_online_payment_reservation: {
        Args: {
          p_expected_amount: number
          p_package_id: string
          p_payment_provider: string
          p_provider_id: string
          p_receiver_phone: string
          p_sender_phone: string
          p_verified_phone: string
        }
        Returns: Json
      }
      current_tenant_id: { Args: never; Returns: string }
      force_delete_provider: { Args: { p_provider_id: string }; Returns: Json }
      generate_daily_outreach_targets: {
        Args: { p_admin_id?: string }
        Returns: {
          inserted_count: number
        }[]
      }
      get_active_categories: {
        Args: { p_tenant_id?: string; provider_uuid?: string }
        Returns: {
          category_image: string | null
          category_name: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean | null
          provider_id: string | null
          tenant_id: string | null
          updated_at: string
          ussd_method: Database["public"]["Enums"]["ussd_method"] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "package_categories"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_active_payment_providers: {
        Args: { p_tenant_id?: string }
        Returns: {
          api_credentials: Json | null
          commission_rate: number
          created_at: string | null
          id: string
          is_active: boolean | null
          payment_number: string | null
          prefix_code: string | null
          provider_logo: string | null
          provider_name: string
          tenant_id: string | null
          updated_at: string | null
          ussd_code_template: string | null
          ussd_prefix: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_providers_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_active_providers: {
        Args: { p_tenant_id?: string }
        Returns: {
          api_endpoint: string | null
          api_key: string | null
          created_at: string | null
          display_order: number
          evoucher_rate: number | null
          id: string
          is_active: boolean | null
          promotional_text: string | null
          provider_logo: string | null
          provider_name: string
          tenant_id: string | null
          updated_at: string | null
          ussd_flow_id: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"]
          ussd_single_template: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "providers_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_admin_analytics_summary: { Args: never; Returns: Json }
      get_admin_date_range_breakdown: {
        Args: {
          p_end_date: string
          p_provider_id?: string
          p_start_date: string
        }
        Returns: Json[]
      }
      get_admin_provider_daily_stats: {
        Args: { p_date?: string }
        Returns: Json[]
      }
      get_admin_transactions_paginated: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_period?: string
          p_provider_id?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json[]
      }
      get_admin_transactions_summary: {
        Args: { p_period?: string; p_provider_id?: string }
        Returns: Json
      }
      get_featured_packages: {
        Args: { p_tenant_id?: string }
        Returns: {
          category_id: string | null
          connection_type_label: string | null
          cost_price: number
          created_at: string | null
          data_amount: string
          id: string
          is_active: boolean | null
          package_name: string
          profit_margin: number
          provider_id: string
          selling_price: number
          tenant_id: string | null
          updated_at: string | null
          ussd_code: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"] | null
          validity_days: string
        }[]
        SetofOptions: {
          from: "*"
          to: "data_packages_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_most_purchased_packages: {
        Args: { p_tenant_id?: string }
        Returns: {
          category_id: string | null
          connection_type_label: string | null
          cost_price: number
          created_at: string | null
          data_amount: string
          id: string
          is_active: boolean | null
          package_name: string
          profit_margin: number
          provider_id: string
          selling_price: number
          tenant_id: string | null
          updated_at: string | null
          ussd_code: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"] | null
          validity_days: string
        }[]
        SetofOptions: {
          from: "*"
          to: "data_packages_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_outreach_follow_ups: {
        Args: never
        Returns: {
          assigned_date: string
          assigned_to: string | null
          contact_method: string | null
          contacted_at: string | null
          converted_at: string | null
          created_at: string
          follow_up_count: number
          follow_up_due_at: string | null
          id: string
          last_follow_up_at: string | null
          notes: string | null
          phone_number: string
          status: string
          tenant_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outreach_targets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_provider_wholesale_tiers: {
        Args: { p_tenant_id?: string; provider_uuid: string }
        Returns: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          max_amount: number
          min_amount: number
          profit_rate: number
          provider_id: string
          tenant_id: string | null
          tier_name: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "provider_wholesale_tiers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_packages: {
        Args: { p_tenant_id?: string; provider_uuid: string }
        Returns: {
          category_id: string | null
          connection_type_label: string | null
          cost_price: number
          created_at: string | null
          data_amount: string
          id: string
          is_active: boolean | null
          package_name: string
          profit_margin: number
          provider_id: string
          selling_price: number
          tenant_id: string | null
          updated_at: string | null
          ussd_code: string | null
          ussd_method: Database["public"]["Enums"]["ussd_method"] | null
          validity_days: string
        }[]
        SetofOptions: {
          from: "*"
          to: "data_packages_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_tenant_by_slug: {
        Args: { _slug: string }
        Returns: {
          contact_phone: string
          id: string
          logo_url: string
          name: string
          primary_color: string
          slug: string
        }[]
      }
      get_user_tenant_ids: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_tenant_manager: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
      learn_ussd_keyword: {
        Args: { _kw: string; _step_id: string }
        Returns: undefined
      }
      resolve_public_tenant: { Args: { p_tenant_id?: string }; Returns: string }
      resolve_unmatched_dialog: {
        Args: { _id: string; _step_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "super_admin" | "reseller"
      ussd_method: "single_step" | "interactive"
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
      app_role: ["admin", "moderator", "user", "super_admin", "reseller"],
      ussd_method: ["single_step", "interactive"],
    },
  },
} as const
