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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_daily_summaries: {
        Row: {
          alerts: Json
          company_id: string
          generated_at: string
          generated_by: string | null
          highlights: Json
          id: string
          metrics: Json
          summary_date: string
          summary_text: string
        }
        Insert: {
          alerts?: Json
          company_id: string
          generated_at?: string
          generated_by?: string | null
          highlights?: Json
          id?: string
          metrics?: Json
          summary_date: string
          summary_text: string
        }
        Update: {
          alerts?: Json
          company_id?: string
          generated_at?: string
          generated_by?: string | null
          highlights?: Json
          id?: string
          metrics?: Json
          summary_date?: string
          summary_text?: string
        }
        Relationships: []
      }
      calendar_sync_config: {
        Row: {
          access_token: string | null
          company_id: string
          created_at: string
          google_calendar_id: string
          id: string
          refresh_token: string | null
          sync_channel_id: string | null
          sync_expiration: string | null
          sync_resource_id: string | null
          sync_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          company_id: string
          created_at?: string
          google_calendar_id?: string
          id?: string
          refresh_token?: string | null
          sync_channel_id?: string | null
          sync_expiration?: string | null
          sync_resource_id?: string | null
          sync_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          company_id?: string
          created_at?: string
          google_calendar_id?: string
          id?: string
          refresh_token?: string | null
          sync_channel_id?: string | null
          sync_expiration?: string | null
          sync_resource_id?: string | null
          sync_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_entries: {
        Row: {
          clock_location_id: string | null
          company_id: string
          created_at: string
          distance_meters: number | null
          id: string
          latitude: number
          longitude: number
          notes: string | null
          selfie_url: string | null
          shift_assignment_id: string | null
          timestamp: string
          type: string
          user_id: string
          valid: boolean
        }
        Insert: {
          clock_location_id?: string | null
          company_id: string
          created_at?: string
          distance_meters?: number | null
          id?: string
          latitude: number
          longitude: number
          notes?: string | null
          selfie_url?: string | null
          shift_assignment_id?: string | null
          timestamp?: string
          type: string
          user_id: string
          valid?: boolean
        }
        Update: {
          clock_location_id?: string | null
          company_id?: string
          created_at?: string
          distance_meters?: number | null
          id?: string
          latitude?: number
          longitude?: number
          notes?: string | null
          selfie_url?: string | null
          shift_assignment_id?: string | null
          timestamp?: string
          type?: string
          user_id?: string
          valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clock_entries_clock_location_id_fkey"
            columns: ["clock_location_id"]
            isOneToOne: false
            referencedRelation: "clock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_entries_shift_assignment_id_fkey"
            columns: ["shift_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_invoices: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          hourly_rate: number
          id: string
          inss_amount: number
          inss_rate: number
          irrf_amount: number
          irrf_rate: number
          iss_amount: number
          iss_rate: number
          municipal_code: string | null
          net_amount: number
          notes: string | null
          period_from: string
          period_to: string
          professional_cpf_cnpj: string | null
          professional_name: string
          professional_role: string | null
          service_description: string | null
          status: string
          total_amount: number
          total_hours: number
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          hourly_rate?: number
          id?: string
          inss_amount?: number
          inss_rate?: number
          irrf_amount?: number
          irrf_rate?: number
          iss_amount?: number
          iss_rate?: number
          municipal_code?: string | null
          net_amount?: number
          notes?: string | null
          period_from: string
          period_to: string
          professional_cpf_cnpj?: string | null
          professional_name: string
          professional_role?: string | null
          service_description?: string | null
          status?: string
          total_amount?: number
          total_hours?: number
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          hourly_rate?: number
          id?: string
          inss_amount?: number
          inss_rate?: number
          irrf_amount?: number
          irrf_rate?: number
          iss_amount?: number
          iss_rate?: number
          municipal_code?: string | null
          net_amount?: number
          notes?: string | null
          period_from?: string
          period_to?: string
          professional_cpf_cnpj?: string | null
          professional_name?: string
          professional_role?: string | null
          service_description?: string | null
          status?: string
          total_amount?: number
          total_hours?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_locations: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          id: string
          latitude: number
          longitude: number
          name: string
          radius_meters: number
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          name: string
          radius_meters?: number
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          radius_meters?: number
        }
        Relationships: [
          {
            foreignKeyName: "clock_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_qr_tokens: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          token: string
          user_id: string
          user_name: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          token?: string
          user_id: string
          user_name: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          token?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_qr_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          cnpj: string
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          main_activity: string | null
          name: string
          phone: string | null
          trade_name: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          cnpj: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          main_activity?: string | null
          name: string
          phone?: string | null
          trade_name?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          cnpj?: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          main_activity?: string | null
          name?: string
          phone?: string | null
          trade_name?: string | null
        }
        Relationships: []
      }
      company_chatwoot_config: {
        Row: {
          chatwoot_account_id: string
          chatwoot_api_token: string
          chatwoot_base_url: string
          company_id: string
          created_at: string
          id: string
          inbox_id: number | null
          inbox_name: string | null
        }
        Insert: {
          chatwoot_account_id: string
          chatwoot_api_token: string
          chatwoot_base_url: string
          company_id: string
          created_at?: string
          id?: string
          inbox_id?: number | null
          inbox_name?: string | null
        }
        Update: {
          chatwoot_account_id?: string
          chatwoot_api_token?: string
          chatwoot_base_url?: string
          company_id?: string
          created_at?: string
          id?: string
          inbox_id?: number | null
          inbox_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_chatwoot_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          category: string
          company_id: string
          document_name: string
          document_type: string
          employee_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          observation: string | null
          reference_month: string | null
          reference_year: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: string
          company_id: string
          document_name: string
          document_type: string
          employee_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          observation?: string | null
          reference_month?: string | null
          reference_year?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          document_name?: string
          document_type?: string
          employee_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          observation?: string | null
          reference_month?: string | null
          reference_year?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          admission_date: string | null
          company_id: string
          cpf: string | null
          created_at: string
          created_by: string | null
          department: string | null
          dismissal_date: string | null
          full_name: string
          id: string
          notes: string | null
          position: string
          rg: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admission_date?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          dismissal_date?: string | null
          full_name: string
          id?: string
          notes?: string | null
          position: string
          rg?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admission_date?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          dismissal_date?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          position?: string
          rg?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          color: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string
          google_event_id: string | null
          id: string
          location: string | null
          start_at: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          color?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at: string
          google_event_id?: string | null
          id?: string
          location?: string | null
          start_at: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          color?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string
          google_event_id?: string | null
          id?: string
          location?: string | null
          start_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_backfill_audit: {
        Row: {
          action: string | null
          batch: string
          company_id: string | null
          created_at: string
          field: string
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          reason: string | null
          transaction_id: string
          user_id: string | null
        }
        Insert: {
          action?: string | null
          batch: string
          company_id?: string | null
          created_at?: string
          field: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          transaction_id: string
          user_id?: string | null
        }
        Update: {
          action?: string | null
          batch?: string
          company_id?: string | null
          created_at?: string
          field?: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          transaction_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      financial_categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_document_staging: {
        Row: {
          attempt_count: number
          company_id: string
          created_at: string
          extracted_amount: number | null
          extracted_due_date: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          legacy_transaction_id: string | null
          resolved_at: string | null
          source_document_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          company_id: string
          created_at?: string
          extracted_amount?: number | null
          extracted_due_date?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          legacy_transaction_id?: string | null
          resolved_at?: string | null
          source_document_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          company_id?: string
          created_at?: string
          extracted_amount?: number | null
          extracted_due_date?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          legacy_transaction_id?: string | null
          resolved_at?: string | null
          source_document_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_document_staging_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_staging_legacy_transaction_id_fkey"
            columns: ["legacy_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_staging_legacy_transaction_id_fkey"
            columns: ["legacy_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_financial_transactions_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_staging_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: true
            referencedRelation: "financial_source_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_staging_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: true
            referencedRelation: "v_financial_transactions_enriched"
            referencedColumns: ["source_document_id"]
          },
        ]
      }
      financial_snapshot_audit: {
        Row: {
          amount_value: number | null
          batch: string
          captured_at: string
          company_id: string | null
          count_value: number | null
          id: string
          metric: string
        }
        Insert: {
          amount_value?: number | null
          batch: string
          captured_at?: string
          company_id?: string | null
          count_value?: number | null
          id?: string
          metric: string
        }
        Update: {
          amount_value?: number | null
          batch?: string
          captured_at?: string
          company_id?: string | null
          count_value?: number | null
          id?: string
          metric?: string
        }
        Relationships: []
      }
      financial_source_documents: {
        Row: {
          attachment_message_id: number | null
          attachment_status: string
          caption_message_id: number | null
          chatwoot_account_id: number | null
          company_id: string
          conversation_id: number | null
          created_at: string
          document_sha256: string | null
          duplicate_of_document_id: string | null
          file_size_bytes: number | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          metadata: Json
          mime_type: string | null
          original_filename: string | null
          processed_at: string | null
          processing_status: string
          source_key: string
          source_type: string
          storage_bucket: string | null
          storage_path: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          attachment_message_id?: number | null
          attachment_status?: string
          caption_message_id?: number | null
          chatwoot_account_id?: number | null
          company_id: string
          conversation_id?: number | null
          created_at?: string
          document_sha256?: string | null
          duplicate_of_document_id?: string | null
          file_size_bytes?: number | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          metadata?: Json
          mime_type?: string | null
          original_filename?: string | null
          processed_at?: string | null
          processing_status?: string
          source_key: string
          source_type: string
          storage_bucket?: string | null
          storage_path?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          attachment_message_id?: number | null
          attachment_status?: string
          caption_message_id?: number | null
          chatwoot_account_id?: number | null
          company_id?: string
          conversation_id?: number | null
          created_at?: string
          document_sha256?: string | null
          duplicate_of_document_id?: string | null
          file_size_bytes?: number | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          metadata?: Json
          mime_type?: string | null
          original_filename?: string | null
          processed_at?: string | null
          processing_status?: string
          source_key?: string
          source_type?: string
          storage_bucket?: string | null
          storage_path?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_source_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_source_documents_duplicate_of_document_id_fkey"
            columns: ["duplicate_of_document_id"]
            isOneToOne: false
            referencedRelation: "financial_source_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_source_documents_duplicate_of_document_id_fkey"
            columns: ["duplicate_of_document_id"]
            isOneToOne: false
            referencedRelation: "v_financial_transactions_enriched"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "financial_source_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_source_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_financial_transactions_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          attachment_url: string | null
          category_id: string | null
          city: string | null
          company_id: string
          cost_center: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          file_hash: string | null
          id: string
          notes: string | null
          payment_date: string | null
          recurrence: string | null
          source_payment_id: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          category_id?: string | null
          city?: string | null
          company_id: string
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          file_hash?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          recurrence?: string | null
          source_payment_id?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category_id?: string | null
          city?: string | null
          company_id?: string
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          file_hash?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          recurrence?: string | null
          source_payment_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "professional_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_unassigned_documents: {
        Row: {
          chatwoot_account_id: number | null
          company_id: string | null
          conversation_id: number | null
          created_at: string
          document_sha256: string
          extracted_amount: number | null
          extracted_description: string | null
          extracted_due_date: string | null
          extracted_payment_date: string | null
          file_size_bytes: number | null
          id: string
          message_id: number | null
          metadata: Json
          mime_type: string | null
          original_filename: string | null
          payer_cnpj: string | null
          payer_name: string | null
          promoted_transaction_id: string | null
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_type: string
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          chatwoot_account_id?: number | null
          company_id?: string | null
          conversation_id?: number | null
          created_at?: string
          document_sha256: string
          extracted_amount?: number | null
          extracted_description?: string | null
          extracted_due_date?: string | null
          extracted_payment_date?: string | null
          file_size_bytes?: number | null
          id?: string
          message_id?: number | null
          metadata?: Json
          mime_type?: string | null
          original_filename?: string | null
          payer_cnpj?: string | null
          payer_name?: string | null
          promoted_transaction_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_type?: string
          status?: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          chatwoot_account_id?: number | null
          company_id?: string | null
          conversation_id?: number | null
          created_at?: string
          document_sha256?: string
          extracted_amount?: number | null
          extracted_description?: string | null
          extracted_due_date?: string | null
          extracted_payment_date?: string | null
          file_size_bytes?: number | null
          id?: string
          message_id?: number | null
          metadata?: Json
          mime_type?: string | null
          original_filename?: string | null
          payer_cnpj?: string | null
          payer_name?: string | null
          promoted_transaction_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_type?: string
          status?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_unassigned_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_unassigned_documents_promoted_transaction_id_fkey"
            columns: ["promoted_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_unassigned_documents_promoted_transaction_id_fkey"
            columns: ["promoted_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_financial_transactions_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_maintenances: {
        Row: {
          attachment_url: string | null
          company_id: string
          cost: number
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          items_replaced: string[] | null
          mileage_at_service: number | null
          notes: string | null
          type: string
          vehicle_id: string
          vendor: string | null
        }
        Insert: {
          attachment_url?: string | null
          company_id: string
          cost?: number
          created_at?: string
          created_by?: string | null
          date: string
          description: string
          id?: string
          items_replaced?: string[] | null
          mileage_at_service?: number | null
          notes?: string | null
          type?: string
          vehicle_id: string
          vendor?: string | null
        }
        Update: {
          attachment_url?: string | null
          company_id?: string
          cost?: number
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          items_replaced?: string[] | null
          mileage_at_service?: number | null
          notes?: string | null
          type?: string
          vehicle_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_maintenances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_maintenances_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_reminders: {
        Row: {
          attachment_url: string | null
          company_id: string
          cost: number | null
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          notes: string | null
          paid_date: string | null
          status: string
          title: string
          type: string
          vehicle_id: string
        }
        Insert: {
          attachment_url?: string | null
          company_id: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          status?: string
          title: string
          type: string
          vehicle_id: string
        }
        Update: {
          attachment_url?: string | null
          company_id?: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          status?: string
          title?: string
          type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicles: {
        Row: {
          acquisition_cost: number | null
          acquisition_date: string | null
          brand: string
          chassis: string | null
          color: string | null
          company_id: string
          created_at: string
          current_mileage: number | null
          fuel_type: string | null
          id: string
          insurance_company: string | null
          insurance_due_date: string | null
          ipva_due_date: string | null
          licensing_due_date: string | null
          model: string
          notes: string | null
          plate: string
          renavam: string | null
          status: string
          updated_at: string
          year: number | null
        }
        Insert: {
          acquisition_cost?: number | null
          acquisition_date?: string | null
          brand: string
          chassis?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          current_mileage?: number | null
          fuel_type?: string | null
          id?: string
          insurance_company?: string | null
          insurance_due_date?: string | null
          ipva_due_date?: string | null
          licensing_due_date?: string | null
          model: string
          notes?: string | null
          plate: string
          renavam?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          acquisition_cost?: number | null
          acquisition_date?: string | null
          brand?: string
          chassis?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          current_mileage?: number | null
          fuel_type?: string | null
          id?: string
          insurance_company?: string | null
          insurance_due_date?: string | null
          ipva_due_date?: string | null
          licensing_due_date?: string | null
          model?: string
          notes?: string | null
          plate?: string
          renavam?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_professional_contacts: {
        Row: {
          company_id: string
          created_at: string
          doctor_name_original: string
          id: string
          name_key: string
          phone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          doctor_name_original: string
          id?: string
          name_key: string
          phone: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          doctor_name_original?: string
          id?: string
          name_key?: string
          phone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      professional_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          doctor_cnpj: string | null
          doctor_company_name: string | null
          doctor_name: string
          drive_file_id: string | null
          error_message: string | null
          id: string
          location: string | null
          nf_description: string | null
          nf_file_url: string | null
          nf_issue_date: string | null
          nf_number: string | null
          nf_raw_text: string | null
          payment_date: string | null
          receipt_url: string | null
          sicredi_end_to_end: string | null
          sicredi_id_pagamento: string | null
          sicredi_id_transacao: string | null
          sicredi_status: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validation_data: Json | null
          validation_issues: Json | null
          validation_status: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          doctor_cnpj?: string | null
          doctor_company_name?: string | null
          doctor_name: string
          drive_file_id?: string | null
          error_message?: string | null
          id?: string
          location?: string | null
          nf_description?: string | null
          nf_file_url?: string | null
          nf_issue_date?: string | null
          nf_number?: string | null
          nf_raw_text?: string | null
          payment_date?: string | null
          receipt_url?: string | null
          sicredi_end_to_end?: string | null
          sicredi_id_pagamento?: string | null
          sicredi_id_transacao?: string | null
          sicredi_status?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validation_data?: Json | null
          validation_issues?: Json | null
          validation_status?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          doctor_cnpj?: string | null
          doctor_company_name?: string | null
          doctor_name?: string
          drive_file_id?: string | null
          error_message?: string | null
          id?: string
          location?: string | null
          nf_description?: string | null
          nf_file_url?: string | null
          nf_issue_date?: string | null
          nf_number?: string | null
          nf_raw_text?: string | null
          payment_date?: string | null
          receipt_url?: string | null
          sicredi_end_to_end?: string | null
          sicredi_id_pagamento?: string | null
          sicredi_id_transacao?: string | null
          sicredi_status?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validation_data?: Json | null
          validation_issues?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      schedule_closings: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          period_end: string
          period_start: string
          schedule_id: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          schedule_id: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          schedule_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_closings_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_grades: {
        Row: {
          color: string | null
          created_at: string
          end_time: string
          id: string
          name: string
          schedule_id: string
          shift_type: string | null
          sort_order: number
          specialty: string | null
          start_time: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          end_time?: string
          id?: string
          name: string
          schedule_id: string
          shift_type?: string | null
          sort_order?: number
          specialty?: string | null
          start_time?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          end_time?: string
          id?: string
          name?: string
          schedule_id?: string
          shift_type?: string | null
          sort_order?: number
          specialty?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_grades_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_payment_rules: {
        Row: {
          base_hourly_rate: number | null
          conditions: Json
          created_at: string
          description: string
          fixed_value: number | null
          grade_id: string | null
          id: string
          multiplier: number
          rule_type: string
          schedule_id: string
        }
        Insert: {
          base_hourly_rate?: number | null
          conditions?: Json
          created_at?: string
          description?: string
          fixed_value?: number | null
          grade_id?: string | null
          id?: string
          multiplier?: number
          rule_type?: string
          schedule_id: string
        }
        Update: {
          base_hourly_rate?: number | null
          conditions?: Json
          created_at?: string
          description?: string
          fixed_value?: number | null
          grade_id?: string | null
          id?: string
          multiplier?: number
          rule_type?: string
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_payment_rules_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "schedule_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_payment_rules_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_rotation_patterns: {
        Row: {
          created_at: string
          cycle_days: number
          grade_id: string
          id: string
          pattern_config: Json
          pattern_name: string
          schedule_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          cycle_days?: number
          grade_id: string
          id?: string
          pattern_config?: Json
          pattern_name?: string
          schedule_id: string
          start_date?: string
        }
        Update: {
          created_at?: string
          cycle_days?: number
          grade_id?: string
          id?: string
          pattern_config?: Json
          pattern_name?: string
          schedule_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_rotation_patterns_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "schedule_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_rotation_patterns_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_swap_email_queue: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          recipient_user_ids: string[]
          sent_at: string | null
          status: string
          swap_request_id: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          recipient_user_ids?: string[]
          sent_at?: string | null
          status?: string
          swap_request_id: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          recipient_user_ids?: string[]
          sent_at?: string | null
          status?: string
          swap_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_swap_email_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_swap_email_queue_swap_request_id_fkey"
            columns: ["swap_request_id"]
            isOneToOne: false
            referencedRelation: "shift_swap_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          max_weekly_hours: number | null
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          max_weekly_hours?: number | null
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          max_weekly_hours?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          custom_end_time: string | null
          custom_start_time: string | null
          date: string
          grade_id: string
          id: string
          original_user_id: string | null
          slot_index: number
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_end_time?: string | null
          custom_start_time?: string | null
          date: string
          grade_id: string
          id?: string
          original_user_id?: string | null
          slot_index?: number
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_end_time?: string | null
          custom_start_time?: string | null
          date?: string
          grade_id?: string
          id?: string
          original_user_id?: string | null
          slot_index?: number
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "schedule_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_swap_requests: {
        Row: {
          admin_notes: string | null
          admin_responded_at: string | null
          approved_by: string | null
          assignment_id: string
          counterparty_assignment_id: string | null
          counterparty_notes: string | null
          counterparty_responded_at: string | null
          counterparty_responded_by: string | null
          created_at: string
          executed_at: string | null
          from_user_id: string
          id: string
          notes: string | null
          status: string
          to_user_id: string | null
          type: string
        }
        Insert: {
          admin_notes?: string | null
          admin_responded_at?: string | null
          approved_by?: string | null
          assignment_id: string
          counterparty_assignment_id?: string | null
          counterparty_notes?: string | null
          counterparty_responded_at?: string | null
          counterparty_responded_by?: string | null
          created_at?: string
          executed_at?: string | null
          from_user_id: string
          id?: string
          notes?: string | null
          status?: string
          to_user_id?: string | null
          type?: string
        }
        Update: {
          admin_notes?: string | null
          admin_responded_at?: string | null
          approved_by?: string | null
          assignment_id?: string
          counterparty_assignment_id?: string | null
          counterparty_notes?: string | null
          counterparty_responded_at?: string | null
          counterparty_responded_by?: string | null
          created_at?: string
          executed_at?: string | null
          from_user_id?: string
          id?: string
          notes?: string | null
          status?: string
          to_user_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_counterparty_assignment_id_fkey"
            columns: ["counterparty_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_counterparty_responded_by_fkey"
            columns: ["counterparty_responded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          value?: string
        }
        Relationships: []
      }
      user_company_access: {
        Row: {
          company_id: string
          created_at: string
          id: string
          modules: string[] | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          modules?: string[] | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          modules?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_company_access_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          notification_preferences: Json | null
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          notification_preferences?: Json | null
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          notification_preferences?: Json | null
          phone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_send_history: {
        Row: {
          amount: number | null
          company_id: string
          doctor_name: string
          id: string
          message_preview: string | null
          notes: string | null
          payment_id: string | null
          sent_at: string
          sent_by: string | null
          status: string
        }
        Insert: {
          amount?: number | null
          company_id: string
          doctor_name: string
          id?: string
          message_preview?: string | null
          notes?: string | null
          payment_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Update: {
          amount?: number | null
          company_id?: string
          doctor_name?: string
          id?: string
          message_preview?: string | null
          notes?: string | null
          payment_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_financial_transactions_enriched: {
        Row: {
          amount: number | null
          attachment_status: string | null
          attachment_url: string | null
          category_id: string | null
          city: string | null
          company_id: string | null
          cost_center: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          file_hash: string | null
          has_persistent_attachment: boolean | null
          has_real_sha256: boolean | null
          id: string | null
          is_possible_duplicate: boolean | null
          is_whatsapp_import: boolean | null
          needs_review: boolean | null
          notes: string | null
          payment_date: string | null
          processing_status: string | null
          recurrence: string | null
          source_document_id: string | null
          source_key: string | null
          source_payment_id: string | null
          source_type: string | null
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "professional_payments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_company_folder: { Args: { _name: string }; Returns: boolean }
      extract_whatsapp_message: { Args: { _notes: string }; Returns: string }
      get_assignment_company_id: {
        Args: { _assignment_id: string }
        Returns: string
      }
      get_grade_company_id: { Args: { _grade_id: string }; Returns: string }
      get_schedule_company_id: {
        Args: { _schedule_id: string }
        Returns: string
      }
      has_company_access: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      infer_financial_category_name: {
        Args: { _message: string }
        Returns: string
      }
      infer_financial_city_from_message: {
        Args: { _company_id: string; _message: string }
        Returns: string
      }
      is_master: { Args: { _user_id: string }; Returns: boolean }
      mark_transaction_paid: {
        Args: {
          _notes?: string
          _payment_date: string
          _transaction_id: string
        }
        Returns: Json
      }
      normalize_cnpj: { Args: { _v: string }; Returns: string }
      normalize_financial_city: {
        Args: { _city: string; _company_id: string }
        Returns: string
      }
      normalize_nf_number: { Args: { _v: string }; Returns: string }
      normalize_professional_location: { Args: { _v: string }; Returns: string }
      normalize_text: { Args: { _v: string }; Returns: string }
      notify_schedule_admins: {
        Args: {
          _company_id: string
          _exclude_user_ids?: string[]
          _link: string
          _message: string
          _title: string
        }
        Returns: undefined
      }
      request_shift_swap: {
        Args: {
          p_assignment_id: string
          p_counterparty_assignment_id?: string
          p_notes?: string
          p_to_user_id: string
          p_type: string
        }
        Returns: string
      }
      respond_shift_swap_request: {
        Args: { p_accept: boolean; p_notes?: string; p_request_id: string }
        Returns: undefined
      }
      reverse_transaction_payment: {
        Args: { _reason: string; _transaction_id: string }
        Returns: Json
      }
      review_shift_swap_request: {
        Args: { p_approve: boolean; p_notes?: string; p_request_id: string }
        Returns: undefined
      }
      upsert_financial_category: {
        Args: { _company_id: string; _name: string; _type: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "super-admin" | "master" | "operacional" | "profissional"
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
      app_role: ["super-admin", "master", "operacional", "profissional"],
    },
  },
} as const
