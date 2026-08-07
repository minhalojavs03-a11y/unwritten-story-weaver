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
      ai_config: {
        Row: {
          address: string | null
          business_description: string | null
          created_at: string
          differentials: string | null
          enabled: boolean
          extra_notes: string | null
          id: string
          insurance_plans: string | null
          is_active: boolean
          metadata: Json
          model: string
          payment_methods: string | null
          phone: string | null
          services: string | null
          system_prompt: string | null
          temperature: number
          tenant_id: string
          tone: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          business_description?: string | null
          created_at?: string
          differentials?: string | null
          enabled?: boolean
          extra_notes?: string | null
          id?: string
          insurance_plans?: string | null
          is_active?: boolean
          metadata?: Json
          model?: string
          payment_methods?: string | null
          phone?: string | null
          services?: string | null
          system_prompt?: string | null
          temperature?: number
          tenant_id?: string
          tone?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          business_description?: string | null
          created_at?: string
          differentials?: string | null
          enabled?: boolean
          extra_notes?: string | null
          id?: string
          insurance_plans?: string | null
          is_active?: boolean
          metadata?: Json
          model?: string
          payment_methods?: string | null
          phone?: string | null
          services?: string | null
          system_prompt?: string | null
          temperature?: number
          tenant_id?: string
          tone?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      app_notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json
          read: boolean
          recipient_user_id: string
          tenant_id: string
          title: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          read?: boolean
          recipient_user_id: string
          tenant_id?: string
          title: string
          type?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          read?: boolean
          recipient_user_id?: string
          tenant_id?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          attendees: Json
          consultant_member_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          google_calendar_id: string | null
          google_event_id: string | null
          google_sync_status: string | null
          google_synced_at: string | null
          id: string
          lead_id: string | null
          meet_link: string | null
          meeting_type: string | null
          metadata: Json
          notes: string | null
          outcome: string | null
          outcome_notes: string | null
          scheduled_at: string
          service: string | null
          status: string
          tenant_id: string
          title: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          attendees?: Json
          consultant_member_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_sync_status?: string | null
          google_synced_at?: string | null
          id?: string
          lead_id?: string | null
          meet_link?: string | null
          meeting_type?: string | null
          metadata?: Json
          notes?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          scheduled_at: string
          service?: string | null
          status?: string
          tenant_id?: string
          title?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          attendees?: Json
          consultant_member_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_sync_status?: string | null
          google_synced_at?: string | null
          id?: string
          lead_id?: string | null
          meet_link?: string | null
          meeting_type?: string | null
          metadata?: Json
          notes?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          scheduled_at?: string
          service?: string | null
          status?: string
          tenant_id?: string
          title?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      automations: {
        Row: {
          actions: Json
          active: boolean
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          trigger: string | null
          trigger_config: Json
          trigger_type: string | null
          updated_at: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id?: string
          trigger?: string | null
          trigger_config?: Json
          trigger_type?: string | null
          updated_at?: string
        }
        Update: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          trigger?: string | null
          trigger_config?: Json
          trigger_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          created_at: string
          currency: string
          id: string
          per_instance_amount: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          per_instance_amount?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          per_instance_amount?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_hours: {
        Row: {
          close_time: string | null
          created_at: string
          id: string
          is_closed: boolean
          open_time: string | null
          tenant_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          id?: string
          is_closed?: boolean
          open_time?: string | null
          tenant_id?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          close_time?: string | null
          created_at?: string
          id?: string
          is_closed?: boolean
          open_time?: string | null
          tenant_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          audience_filter: Json
          created_at: string
          created_by: string | null
          delivered_count: number
          description: string | null
          failed_count: number
          finished_at: string | null
          id: string
          message_body: string | null
          metadata: Json
          name: string
          read_count: number
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          template_id: string | null
          tenant_id: string
          total_recipients: number
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          audience_filter?: Json
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          message_body?: string | null
          metadata?: Json
          name: string
          read_count?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          tenant_id?: string
          total_recipients?: number
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          audience_filter?: Json
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          message_body?: string | null
          metadata?: Json
          name?: string
          read_count?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          tenant_id?: string
          total_recipients?: number
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
      coaching_insights: {
        Row: {
          consultant_quote: string | null
          conversation_id: string
          created_at: string
          detail: string | null
          id: string
          insight_type: string
          lead_id: string | null
          member_id: string | null
          message_id: string | null
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          signal_quote: string | null
          suggestion: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          consultant_quote?: string | null
          conversation_id: string
          created_at?: string
          detail?: string | null
          id?: string
          insight_type: string
          lead_id?: string | null
          member_id?: string | null
          message_id?: string | null
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          signal_quote?: string | null
          suggestion?: string | null
          tenant_id?: string
          title: string
        }
        Update: {
          consultant_quote?: string | null
          conversation_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          insight_type?: string
          lead_id?: string | null
          member_id?: string | null
          message_id?: string | null
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          signal_quote?: string | null
          suggestion?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: []
      }
      coaching_message_analysis: {
        Row: {
          analyzed_at: string
          clean_count: number
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          inserted_count: number
          message_id: string
          skipped_count: number
          status: string
          tenant_id: string
        }
        Insert: {
          analyzed_at?: string
          clean_count?: number
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          inserted_count?: number
          message_id: string
          skipped_count?: number
          status?: string
          tenant_id?: string
        }
        Update: {
          analyzed_at?: string
          clean_count?: number
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          inserted_count?: number
          message_id?: string
          skipped_count?: number
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          lead_id: string | null
          metadata: Json
          status: string
          tenant_id: string
          unread_count: number
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          metadata?: Json
          status?: string
          tenant_id?: string
          unread_count?: number
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          metadata?: Json
          status?: string
          tenant_id?: string
          unread_count?: number
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          position: number
          question: string
          tenant_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          position?: number
          question: string
          tenant_id?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          position?: number
          question?: string
          tenant_id?: string
        }
        Relationships: []
      }
      gamification_config: {
        Row: {
          commission_per_sale: number
          created_at: string
          fast_response_threshold_seconds: number
          id: string
          levels: Json
          points_contact_made: number
          points_fast_response_bonus: number
          points_lead_assumed: number
          points_lead_lost: number
          points_meeting_scheduled: number
          points_sale_closed: number
          points_simulation_sent: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          commission_per_sale?: number
          created_at?: string
          fast_response_threshold_seconds?: number
          id?: string
          levels?: Json
          points_contact_made?: number
          points_fast_response_bonus?: number
          points_lead_assumed?: number
          points_lead_lost?: number
          points_meeting_scheduled?: number
          points_sale_closed?: number
          points_simulation_sent?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          commission_per_sale?: number
          created_at?: string
          fast_response_threshold_seconds?: number
          id?: string
          levels?: Json
          points_contact_made?: number
          points_fast_response_bonus?: number
          points_lead_assumed?: number
          points_lead_lost?: number
          points_meeting_scheduled?: number
          points_sale_closed?: number
          points_simulation_sent?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      gamification_events: {
        Row: {
          appointment_id: string | null
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          member_id: string
          message_id: string | null
          metadata: Json
          occurred_at: string
          points: number
          tenant_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          lead_id?: string | null
          member_id: string
          message_id?: string | null
          metadata?: Json
          occurred_at?: string
          points?: number
          tenant_id?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          member_id?: string
          message_id?: string | null
          metadata?: Json
          occurred_at?: string
          points?: number
          tenant_id?: string
        }
        Relationships: []
      }
      gamification_goal_history: {
        Row: {
          achieved_value: number
          created_at: string
          id: string
          member_id: string
          metric: string
          period: string
          period_end: string
          period_start: string
          target_value: number
          tenant_id: string
        }
        Insert: {
          achieved_value: number
          created_at?: string
          id?: string
          member_id: string
          metric: string
          period: string
          period_end: string
          period_start: string
          target_value: number
          tenant_id?: string
        }
        Update: {
          achieved_value?: number
          created_at?: string
          id?: string
          member_id?: string
          metric?: string
          period?: string
          period_end?: string
          period_start?: string
          target_value?: number
          tenant_id?: string
        }
        Relationships: []
      }
      gamification_goals: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          member_id: string | null
          metric: string
          period: string
          start_date: string
          target_value: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          member_id?: string | null
          metric: string
          period: string
          start_date?: string
          target_value?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          member_id?: string | null
          metric?: string
          period?: string
          start_date?: string
          target_value?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      gamification_streaks: {
        Row: {
          best_streak: number
          current_streak: number
          id: string
          last_active_date: string | null
          member_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          best_streak?: number
          current_streak?: number
          id?: string
          last_active_date?: string | null
          member_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          best_streak?: number
          current_streak?: number
          id?: string
          last_active_date?: string | null
          member_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      google_integration: {
        Row: {
          auto_sync_calendar: boolean
          auto_sync_recordings: boolean
          calendar_id: string | null
          created_at: string
          drive_recordings_folder_id: string | null
          google_account_email: string | null
          is_connected: boolean
          last_calendar_sync_at: string | null
          last_recordings_sync_at: string | null
          last_sync_error: string | null
          metadata: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_sync_calendar?: boolean
          auto_sync_recordings?: boolean
          calendar_id?: string | null
          created_at?: string
          drive_recordings_folder_id?: string | null
          google_account_email?: string | null
          is_connected?: boolean
          last_calendar_sync_at?: string | null
          last_recordings_sync_at?: string | null
          last_sync_error?: string | null
          metadata?: Json
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          auto_sync_calendar?: boolean
          auto_sync_recordings?: boolean
          calendar_id?: string | null
          created_at?: string
          drive_recordings_folder_id?: string | null
          google_account_email?: string | null
          is_connected?: boolean
          last_calendar_sync_at?: string | null
          last_recordings_sync_at?: string | null
          last_sync_error?: string | null
          metadata?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      impersonation_log: {
        Row: {
          admin_user_id: string
          ended_at: string | null
          id: string
          reason: string | null
          started_at: string
          target_user_id: string
          tenant_id: string
        }
        Insert: {
          admin_user_id: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          target_user_id: string
          tenant_id?: string
        }
        Update: {
          admin_user_id?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          target_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_charges: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          notified_at: string | null
          seller_name: string | null
          seller_phone: string | null
          status: string
          tenant_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notified_at?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          status?: string
          tenant_id?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notified_at?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          status?: string
          tenant_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
      knowledge_files: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: string
          metadata: Json
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string | null
          tenant_id: string
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path?: string | null
          tenant_id?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string | null
          tenant_id?: string
          url?: string | null
        }
        Relationships: []
      }
      lead_notifications: {
        Row: {
          delivered: boolean
          id: string
          lead_id: string | null
          message_sent: string | null
          recipient_member_id: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          sent_at: string
          tenant_id: string
          type: string
        }
        Insert: {
          delivered?: boolean
          id?: string
          lead_id?: string | null
          message_sent?: string | null
          recipient_member_id?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          sent_at?: string
          tenant_id?: string
          type: string
        }
        Update: {
          delivered?: boolean
          id?: string
          lead_id?: string | null
          message_sent?: string | null
          recipient_member_id?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          sent_at?: string
          tenant_id?: string
          type?: string
        }
        Relationships: []
      }
      lead_takeover_requests: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          message: string | null
          owner_member_id: string | null
          owner_user_id: string | null
          requester_member_id: string | null
          requester_user_id: string
          responded_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          message?: string | null
          owner_member_id?: string | null
          owner_user_id?: string | null
          requester_member_id?: string | null
          requester_user_id: string
          responded_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          message?: string | null
          owner_member_id?: string | null
          owner_user_id?: string | null
          requester_member_id?: string | null
          requester_user_id?: string
          responded_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_takeover_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_takeover_requests_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "tenant_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_takeover_requests_requester_member_id_fkey"
            columns: ["requester_member_id"]
            isOneToOne: false
            referencedRelation: "tenant_members"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_transfer_requests: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          message: string | null
          owner_member_id: string
          requester_member_id: string
          resolved_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          message?: string | null
          owner_member_id: string
          requester_member_id: string
          resolved_at?: string | null
          status?: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          message?: string | null
          owner_member_id?: string
          requester_member_id?: string
          resolved_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          asset_type: string | null
          assigned_member_at: string | null
          assigned_member_id: string | null
          assigned_to: string | null
          contact_attempts: number
          created_at: string
          credit_value: number | null
          disqualification_reason: string | null
          email: string | null
          id: string
          imported_from_sheet: boolean
          interest: string | null
          kind: string
          last_contact_at: string | null
          last_interaction_at: string | null
          last_message_at: string | null
          lead_phase: string | null
          metadata: Json
          name: string | null
          next_followup_at: string | null
          notes: string | null
          opportunity_type: string | null
          phone: string | null
          qualification_status: string | null
          score: number
          sheet_row_index: number | null
          source: string | null
          stage: string | null
          status: string
          tags: string[]
          temperature: string | null
          tenant_id: string
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          asset_type?: string | null
          assigned_member_at?: string | null
          assigned_member_id?: string | null
          assigned_to?: string | null
          contact_attempts?: number
          created_at?: string
          credit_value?: number | null
          disqualification_reason?: string | null
          email?: string | null
          id?: string
          imported_from_sheet?: boolean
          interest?: string | null
          kind?: string
          last_contact_at?: string | null
          last_interaction_at?: string | null
          last_message_at?: string | null
          lead_phase?: string | null
          metadata?: Json
          name?: string | null
          next_followup_at?: string | null
          notes?: string | null
          opportunity_type?: string | null
          phone?: string | null
          qualification_status?: string | null
          score?: number
          sheet_row_index?: number | null
          source?: string | null
          stage?: string | null
          status?: string
          tags?: string[]
          temperature?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          asset_type?: string | null
          assigned_member_at?: string | null
          assigned_member_id?: string | null
          assigned_to?: string | null
          contact_attempts?: number
          created_at?: string
          credit_value?: number | null
          disqualification_reason?: string | null
          email?: string | null
          id?: string
          imported_from_sheet?: boolean
          interest?: string | null
          kind?: string
          last_contact_at?: string | null
          last_interaction_at?: string | null
          last_message_at?: string | null
          lead_phase?: string | null
          metadata?: Json
          name?: string | null
          next_followup_at?: string | null
          notes?: string | null
          opportunity_type?: string | null
          phone?: string | null
          qualification_status?: string | null
          score?: number
          sheet_row_index?: number | null
          source?: string | null
          stage?: string | null
          status?: string
          tags?: string[]
          temperature?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
      meeting_recordings: {
        Row: {
          appointment_id: string | null
          category: string | null
          consultant_member_id: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          google_drive_file_id: string | null
          id: string
          is_featured: boolean
          is_training_pick: boolean
          lead_id: string | null
          meeting_type: string | null
          metadata: Json
          recorded_at: string
          source: string
          tags: string[]
          tenant_id: string
          thumbnail_url: string | null
          title: string
          transcript_url: string | null
          updated_at: string
          video_url: string | null
          view_count: number
        }
        Insert: {
          appointment_id?: string | null
          category?: string | null
          consultant_member_id?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          google_drive_file_id?: string | null
          id?: string
          is_featured?: boolean
          is_training_pick?: boolean
          lead_id?: string | null
          meeting_type?: string | null
          metadata?: Json
          recorded_at?: string
          source?: string
          tags?: string[]
          tenant_id?: string
          thumbnail_url?: string | null
          title: string
          transcript_url?: string | null
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Update: {
          appointment_id?: string | null
          category?: string | null
          consultant_member_id?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          google_drive_file_id?: string | null
          id?: string
          is_featured?: boolean
          is_training_pick?: boolean
          lead_id?: string | null
          meeting_type?: string | null
          metadata?: Json
          recorded_at?: string
          source?: string
          tags?: string[]
          tenant_id?: string
          thumbnail_url?: string | null
          title?: string
          transcript_url?: string | null
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Relationships: []
      }
      menu_permissions: {
        Row: {
          created_at: string
          hidden: boolean
          id: string
          menu_key: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hidden?: boolean
          id?: string
          menu_key: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hidden?: boolean
          id?: string
          menu_key?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          content: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          external_id: string | null
          id: string
          lead_id: string | null
          media_url: string | null
          message_type: string
          metadata: Json
          read_at: string | null
          sent_by: string | null
          status: string
          tenant_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          body?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          lead_id?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json
          read_at?: string | null
          sent_by?: string | null
          status?: string
          tenant_id?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          body?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          lead_id?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json
          read_at?: string | null
          sent_by?: string | null
          status?: string
          tenant_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      nilton_leads: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          assigned_to: string | null
          campaign_id: string | null
          campaign_name: string | null
          carta_value: string | null
          created_time: string | null
          form_id: string | null
          form_name: string | null
          id: string
          imported_at: string
          is_organic: boolean | null
          lead_status: string | null
          nome_completo: string | null
          notes: string | null
          platform: string | null
          sheet_id: string
          status: string
          telefone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          assigned_to?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          carta_value?: string | null
          created_time?: string | null
          form_id?: string | null
          form_name?: string | null
          id?: string
          imported_at?: string
          is_organic?: boolean | null
          lead_status?: string | null
          nome_completo?: string | null
          notes?: string | null
          platform?: string | null
          sheet_id: string
          status?: string
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          assigned_to?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          carta_value?: string | null
          created_time?: string | null
          form_id?: string | null
          form_name?: string | null
          id?: string
          imported_at?: string
          is_organic?: boolean | null
          lead_status?: string | null
          nome_completo?: string | null
          notes?: string | null
          platform?: string | null
          sheet_id?: string
          status?: string
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nilton_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      nilton_sync_log: {
        Row: {
          duration_ms: number
          error_message: string | null
          id: string
          ran_at: string
          rows_fetched: number
          rows_inserted: number
          rows_skipped: number
        }
        Insert: {
          duration_ms?: number
          error_message?: string | null
          id?: string
          ran_at?: string
          rows_fetched?: number
          rows_inserted?: number
          rows_skipped?: number
        }
        Update: {
          duration_ms?: number
          error_message?: string | null
          id?: string
          ran_at?: string
          rows_fetched?: number
          rows_inserted?: number
          rows_skipped?: number
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          attempts: number
          created_at: string
          due_at: string
          id: string
          last_error: string | null
          lead_id: string | null
          message_text: string | null
          processed_at: string | null
          recipient_phone: string | null
          status: string
          tenant_id: string
          type: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          due_at?: string
          id?: string
          last_error?: string | null
          lead_id?: string | null
          message_text?: string | null
          processed_at?: string | null
          recipient_phone?: string | null
          status?: string
          tenant_id?: string
          type: string
        }
        Update: {
          attempts?: number
          created_at?: string
          due_at?: string
          id?: string
          last_error?: string | null
          lead_id?: string | null
          message_text?: string | null
          processed_at?: string | null
          recipient_phone?: string | null
          status?: string
          tenant_id?: string
          type?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          metadata: Json
          name: string
          price: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          metadata?: Json
          name: string
          price?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          metadata?: Json
          name?: string
          price?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_color: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          last_seen_at: string | null
          monthly_goal: number
          notification_email: boolean
          notification_whatsapp: boolean
          onboarding_completed: boolean
          phone: string | null
          pin_hash: string | null
          role_label: string | null
          tenant_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_color?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          monthly_goal?: number
          notification_email?: boolean
          notification_whatsapp?: boolean
          onboarding_completed?: boolean
          phone?: string | null
          pin_hash?: string | null
          role_label?: string | null
          tenant_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_color?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          monthly_goal?: number
          notification_email?: boolean
          notification_whatsapp?: boolean
          onboarding_completed?: boolean
          phone?: string | null
          pin_hash?: string | null
          role_label?: string | null
          tenant_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      recording_views: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          recording_id: string
          tenant_id: string
          updated_at: string
          viewer_member_id: string | null
          viewer_user_id: string | null
          watched_seconds: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          recording_id: string
          tenant_id?: string
          updated_at?: string
          viewer_member_id?: string | null
          viewer_user_id?: string | null
          watched_seconds?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          recording_id?: string
          tenant_id?: string
          updated_at?: string
          viewer_member_id?: string | null
          viewer_user_id?: string | null
          watched_seconds?: number
        }
        Relationships: []
      }
      sheet_imported_rows: {
        Row: {
          id: string
          imported_at: string
          lead_id: string | null
          raw_data: Json
          row_index: number
          sheet_sync_config_id: string
          tenant_id: string
        }
        Insert: {
          id?: string
          imported_at?: string
          lead_id?: string | null
          raw_data?: Json
          row_index: number
          sheet_sync_config_id: string
          tenant_id?: string
        }
        Update: {
          id?: string
          imported_at?: string
          lead_id?: string | null
          raw_data?: Json
          row_index?: number
          sheet_sync_config_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      sheet_sync_config: {
        Row: {
          column_mapping: Json
          created_at: string
          distribution_tenant_ids: string[]
          header_row: number
          id: string
          is_active: boolean
          last_row_synced: number
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          notify_vendors: boolean
          sheet_id: string
          sheet_url: string
          source_label: string
          tab_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          distribution_tenant_ids?: string[]
          header_row?: number
          id?: string
          is_active?: boolean
          last_row_synced?: number
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          notify_vendors?: boolean
          sheet_id: string
          sheet_url: string
          source_label?: string
          tab_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          distribution_tenant_ids?: string[]
          header_row?: number
          id?: string
          is_active?: boolean
          last_row_synced?: number
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          notify_vendors?: boolean
          sheet_id?: string
          sheet_url?: string
          source_label?: string
          tab_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sheet_sync_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          new_leads_count: number
          sheet_sync_config_id: string | null
          status: string
          summary: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          new_leads_count?: number
          sheet_sync_config_id?: string | null
          status: string
          summary?: string | null
          tenant_id?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          new_leads_count?: number
          sheet_sync_config_id?: string | null
          status?: string
          summary?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          role_label: string | null
          status: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          role_label?: string | null
          status?: string
          tenant_id?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          role_label?: string | null
          status?: string
          tenant_id?: string
          token?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          body: string | null
          category: string | null
          content: string | null
          created_at: string
          created_by_member_id: string | null
          id: string
          is_active: boolean
          is_global: boolean
          name: string | null
          tenant_id: string | null
          title: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          created_by_member_id?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          name?: string | null
          tenant_id?: string | null
          title?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          created_by_member_id?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          name?: string | null
          tenant_id?: string | null
          title?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      tenant_credentials: {
        Row: {
          category: string
          created_at: string
          id: string
          identifier: string | null
          label: string
          notes: string | null
          password: string | null
          position: number
          tenant_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          identifier?: string | null
          label: string
          notes?: string | null
          password?: string | null
          position?: number
          tenant_id?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          identifier?: string | null
          label?: string
          notes?: string | null
          password?: string | null
          position?: number
          tenant_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      tenant_invites: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          avatar_color: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          daily_lead_limit: number | null
          display_name: string
          distribution_priority: number
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          max_credit_value: number | null
          min_credit_value: number | null
          monthly_goal: number
          notification_email: boolean
          notification_whatsapp: boolean
          notify_inapp: boolean
          notify_whatsapp: boolean
          password_hash: string
          phone: string | null
          receive_leads_when_offline: boolean
          receives_leads: boolean
          receives_leads_02: boolean
          role_label: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          avatar_color?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          daily_lead_limit?: number | null
          display_name: string
          distribution_priority?: number
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          max_credit_value?: number | null
          min_credit_value?: number | null
          monthly_goal?: number
          notification_email?: boolean
          notification_whatsapp?: boolean
          notify_inapp?: boolean
          notify_whatsapp?: boolean
          password_hash: string
          phone?: string | null
          receive_leads_when_offline?: boolean
          receives_leads?: boolean
          receives_leads_02?: boolean
          role_label?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          username: string
        }
        Update: {
          avatar_color?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          daily_lead_limit?: number | null
          display_name?: string
          distribution_priority?: number
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          max_credit_value?: number | null
          min_credit_value?: number | null
          monthly_goal?: number
          notification_email?: boolean
          notification_whatsapp?: boolean
          notify_inapp?: boolean
          notify_whatsapp?: boolean
          password_hash?: string
          phone?: string | null
          receive_leads_when_offline?: boolean
          receives_leads?: boolean
          receives_leads_02?: boolean
          role_label?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      tenant_memberships: {
        Row: {
          avatar_color: string | null
          created_at: string
          display_name: string | null
          id: string
          last_seen_at: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_color?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen_at?: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_color?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen_at?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_role_invites: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          role: Database["public"]["Enums"]["tenant_role"]
          role_label: string | null
          tenant_id: string
          token: string
          updated_at: string
          uses_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          role: Database["public"]["Enums"]["tenant_role"]
          role_label?: string | null
          tenant_id?: string
          token?: string
          updated_at?: string
          uses_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          role?: Database["public"]["Enums"]["tenant_role"]
          role_label?: string | null
          tenant_id?: string
          token?: string
          updated_at?: string
          uses_count?: number
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          onboarding_completed: boolean
          plan: string
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          onboarding_completed?: boolean
          plan?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          onboarding_completed?: boolean
          plan?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          connected_agents_count: number
          created_at: string
          created_by_user_id: string | null
          device_name: string
          id: string
          instance_id: string | null
          instance_name: string | null
          instance_token: string | null
          is_connected: boolean
          last_connection_at: string | null
          metadata: Json
          name: string | null
          phone_label: string | null
          phone_number: string | null
          qr_code: string | null
          seller_name: string | null
          seller_phone: string | null
          seller_user_id: string | null
          server_url: string | null
          status: string
          tenant_id: string
          token: string | null
          updated_at: string
          webhook_secret: string
          webhook_url: string | null
        }
        Insert: {
          connected_agents_count?: number
          created_at?: string
          created_by_user_id?: string | null
          device_name?: string
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          instance_token?: string | null
          is_connected?: boolean
          last_connection_at?: string | null
          metadata?: Json
          name?: string | null
          phone_label?: string | null
          phone_number?: string | null
          qr_code?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          seller_user_id?: string | null
          server_url?: string | null
          status?: string
          tenant_id?: string
          token?: string | null
          updated_at?: string
          webhook_secret?: string
          webhook_url?: string | null
        }
        Update: {
          connected_agents_count?: number
          created_at?: string
          created_by_user_id?: string | null
          device_name?: string
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          instance_token?: string | null
          is_connected?: boolean
          last_connection_at?: string | null
          metadata?: Json
          name?: string | null
          phone_label?: string | null
          phone_number?: string | null
          qr_code?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          seller_user_id?: string | null
          server_url?: string | null
          status?: string
          tenant_id?: string
          token?: string | null
          updated_at?: string
          webhook_secret?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      whatsapp_notification_log: {
        Row: {
          consultant_member_id: string | null
          error_message: string | null
          id: string
          lead_id: string | null
          sent_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          consultant_member_id?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          sent_at?: string
          status?: string
          tenant_id?: string
        }
        Update: {
          consultant_member_id?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          sent_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      whatsapp_sellers: {
        Row: {
          created_at: string
          id: string
          name: string
          notify_on_new_lead: boolean
          phone: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
          whatsapp_instance_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notify_on_new_lead?: boolean
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_instance_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notify_on_new_lead?: boolean
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_instance_id?: string
        }
        Relationships: []
      }
      whatsapp_silence: {
        Row: {
          created_at: string
          id: string
          phone: string
          silenced_until: string
          tenant_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          phone: string
          silenced_until: string
          tenant_id?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          phone?: string
          silenced_until?: string
          tenant_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_role_invite: {
        Args: { _token: string }
        Returns: {
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
        }[]
      }
      accept_tenant_invite: {
        Args: { _token: string }
        Returns: {
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
        }[]
      }
      admin_create_tenant: {
        Args: { _name: string; _plan?: string; _slug?: string }
        Returns: string
      }
      approve_lead_takeover: {
        Args: { _request_id: string }
        Returns: undefined
      }
      assume_lead:
        | { Args: { _lead_id: string }; Returns: undefined }
        | { Args: { _lead_id: string; _member_id: string }; Returns: undefined }
      check_username_available: {
        Args: { _username: string }
        Returns: boolean
      }
      claim_manual_lead: {
        Args: {
          _email?: string
          _member_id?: string
          _name?: string
          _phone: string
          _user_id?: string
        }
        Returns: {
          action: string
          lead_id: string
          previous_member_id: string
        }[]
      }
      classify_lead_kind: {
        Args: { _phone: string; _tenant: string }
        Returns: string
      }
      complete_onboarding: {
        Args: { _display_name: string; _pin: string; _username: string }
        Returns: undefined
      }
      create_tenant_with_owner: {
        Args: { _display_name: string; _tenant_name: string }
        Returns: string
      }
      current_tenant_id: { Args: never; Returns: string }
      delete_manual_lead: { Args: { _lead_id: string }; Returns: undefined }
      deny_lead_takeover: { Args: { _request_id: string }; Returns: undefined }
      ensure_distribution_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: string
      }
      ensure_owner_member: { Args: { _tenant_id: string }; Returns: string }
      ensure_tenant_role_invites: { Args: never; Returns: undefined }
      gamification_executive_overview: {
        Args: { _period?: string }
        Returns: Json
      }
      gamification_member_summary: {
        Args: { _member_id: string; _period?: string }
        Returns: {
          contacts: number
          fast_responses: number
          leads_assumed: number
          meetings: number
          points: number
          rank_position: number
          sales: number
          total_members: number
        }[]
      }
      gamification_period_start: { Args: { _period: string }; Returns: string }
      gamification_ranking: {
        Args: { _period?: string }
        Returns: {
          avatar_color: string
          avatar_url: string
          contacts: number
          display_name: string
          fast_responses: number
          leads_assumed: number
          meetings: number
          member_id: string
          points: number
          role_label: string
          sales: number
        }[]
      }
      gamification_team_overview: {
        Args: { _period?: string }
        Returns: {
          active_leads: number
          avatar_color: string
          contacts: number
          display_name: string
          last_seen_at: string
          leads_assumed: number
          meetings: number
          member_id: string
          points: number
          role_label: string
          sales: number
          stalled_leads: number
        }[]
      }
      get_dashboard_metrics_v2: {
        Args: { _member_id?: string; _tenant_id?: string }
        Returns: {
          active_conversations: number
          appointments_today: number
          awaiting_response: number
          hot_opportunities: number
          leads_today: number
        }[]
      }
      get_invite_by_token: {
        Args: { _token: string }
        Returns: {
          accepted_at: string
          display_name: string
          email: string
          expires_at: string
          revoked_at: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_name: string
        }[]
      }
      get_my_auth_context: {
        Args: never
        Returns: {
          onboarding_completed: boolean
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          username: string
        }[]
      }
      get_role_invite_by_token: {
        Args: { _token: string }
        Returns: {
          expires_at: string
          is_active: boolean
          max_uses: number
          role: Database["public"]["Enums"]["tenant_role"]
          role_label: string
          tenant_id: string
          tenant_name: string
          uses_count: number
        }[]
      }
      get_superadmin_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      get_team_funnel: {
        Args: { p_end?: string; p_start?: string; p_tenant_id: string }
        Returns: Json
      }
      get_tenant_role: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["tenant_role"]
      }
      has_app_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ediane_phone: { Args: { _phone: string }; Returns: boolean }
      is_lead_source: {
        Args: { _imported_from_sheet: boolean; _source: string }
        Returns: boolean
      }
      is_nilton_user: { Args: { _user_id: string }; Returns: boolean }
      is_owner_or_superadmin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      list_distribution_consultants: {
        Args: { _tenant_id?: string }
        Returns: {
          avatar_color: string
          avatar_url: string
          daily_lead_limit: number
          display_name: string
          distribution_priority: number
          id: string
          is_active: boolean
          max_credit_value: number
          min_credit_value: number
          notify_inapp: boolean
          notify_whatsapp: boolean
          phone: string
          receive_leads_when_offline: boolean
          receives_leads: boolean
          receives_leads_02: boolean
          role_label: string
          tenant_id: string
          user_id: string
          username: string
        }[]
      }
      list_tenant_members_public: {
        Args: { _tenant_id: string }
        Returns: {
          avatar_color: string
          avatar_url: string
          display_name: string
          id: string
          role_label: string
          username: string
        }[]
      }
      normalize_phone: { Args: { _phone: string }; Returns: string }
      parse_credit_from_interest: {
        Args: { _interest: string }
        Returns: number
      }
      reclassify_leads: { Args: { _tenant?: string }; Returns: number }
      regenerate_role_invite: { Args: { _id: string }; Returns: string }
      release_lead:
        | { Args: { _lead_id: string }; Returns: undefined }
        | {
            Args: { _lead_id: string; _member_id?: string }
            Returns: undefined
          }
      request_lead_takeover: {
        Args: { _lead_id: string; _message?: string }
        Returns: string
      }
      response_rate_stats: {
        Args: { _end: string; _member_id?: string; _start: string }
        Returns: Json
      }
      set_ai_pre_attendance: {
        Args: { _enabled: boolean; _lead_id: string }
        Returns: undefined
      }
      set_distribution_priority: { Args: { _orders: Json }; Returns: undefined }
      touch_my_last_seen: { Args: never; Returns: undefined }
      update_member_distribution: {
        Args: {
          _daily_lead_limit: number
          _max_credit_value: number
          _member_id: string
          _min_credit_value: number
          _receives_leads: boolean
        }
        Returns: undefined
      }
      update_member_distribution_v2: {
        Args: {
          _daily_lead_limit: number
          _max_credit_value: number
          _member_id: string
          _min_credit_value: number
          _receives_leads_01: boolean
          _receives_leads_02: boolean
        }
        Returns: undefined
      }
      update_member_notification_channels: {
        Args: {
          _member_id: string
          _notify_inapp: boolean
          _notify_whatsapp: boolean
        }
        Returns: undefined
      }
      update_my_tenant_member:
        | { Args: { _data: Json }; Returns: undefined }
        | {
            Args: {
              _avatar_color?: string
              _avatar_url?: string
              _bio?: string
              _display_name?: string
              _full_name?: string
              _member_id: string
              _monthly_goal?: number
              _notification_email?: boolean
              _notification_whatsapp?: boolean
              _phone?: string
              _role_label?: string
            }
            Returns: undefined
          }
      user_tenant_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "owner"
        | "supervisor"
        | "consultant"
        | "attendant"
      tenant_role:
        | "owner"
        | "supervisor"
        | "consultor"
        | "consultant"
        | "attendant"
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
      app_role: [
        "superadmin",
        "owner",
        "supervisor",
        "consultant",
        "attendant",
      ],
      tenant_role: [
        "owner",
        "supervisor",
        "consultor",
        "consultant",
        "attendant",
      ],
    },
  },
} as const
