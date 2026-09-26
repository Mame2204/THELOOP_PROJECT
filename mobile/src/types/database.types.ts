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
      admin_automation_jobs: {
        Row: {
          city: string | null
          country_code: string
          created_at: string
          id: string
          job_type: string
          last_run_at: string | null
          last_run_count: number | null
          last_run_summary: string | null
          name: string
          payload: Json
          schedule: string
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          country_code?: string
          created_at?: string
          id: string
          job_type: string
          last_run_at?: string | null
          last_run_count?: number | null
          last_run_summary?: string | null
          name: string
          payload?: Json
          schedule?: string
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          country_code?: string
          created_at?: string
          id?: string
          job_type?: string
          last_run_at?: string | null
          last_run_count?: number | null
          last_run_summary?: string | null
          name?: string
          payload?: Json
          schedule?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_benefit_draws: {
        Row: {
          catalog_id: string
          catalog_title: string
          country_code: string
          custom_note: string | null
          draw_city: string | null
          drawn_at: string
          drawn_by: string | null
          id: string
          partner_key: string | null
          partner_name: string | null
          roles: string[]
          validity_days: number
          validity_starts_on_activation: boolean
          winner_count: number
          winners: Json
        }
        Insert: {
          catalog_id: string
          catalog_title: string
          country_code?: string
          custom_note?: string | null
          draw_city?: string | null
          drawn_at?: string
          drawn_by?: string | null
          id?: string
          partner_key?: string | null
          partner_name?: string | null
          roles: string[]
          validity_days: number
          validity_starts_on_activation?: boolean
          winner_count: number
          winners?: Json
        }
        Update: {
          catalog_id?: string
          catalog_title?: string
          country_code?: string
          custom_note?: string | null
          draw_city?: string | null
          drawn_at?: string
          drawn_by?: string | null
          id?: string
          partner_key?: string | null
          partner_name?: string | null
          roles?: string[]
          validity_days?: number
          validity_starts_on_activation?: boolean
          winner_count?: number
          winners?: Json
        }
        Relationships: [
          {
            foreignKeyName: "admin_benefit_draws_drawn_by_fkey"
            columns: ["drawn_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_permission_overrides: {
        Row: {
          created_at: string
          granted_by: string | null
          mode: string
          permission: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          mode: string
          permission: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          mode?: string
          permission?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_push_campaigns: {
        Row: {
          audience: string
          country_code: string | null
          created_at: string
          created_by: string | null
          favorite_event_categories: Json
          favorite_event_id: string | null
          favorite_spot_categories: Json
          favorite_spot_id: string | null
          favorite_tool_categories: Json
          id: string
          message: string
          recipient_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: string
          target_email: string | null
          target_phone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          favorite_event_categories?: Json
          favorite_event_id?: string | null
          favorite_spot_categories?: Json
          favorite_spot_id?: string | null
          favorite_tool_categories?: Json
          id?: string
          message: string
          recipient_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_email?: string | null
          target_phone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          favorite_event_categories?: Json
          favorite_event_id?: string | null
          favorite_spot_categories?: Json
          favorite_spot_id?: string | null
          favorite_tool_categories?: Json
          id?: string
          message?: string
          recipient_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_email?: string | null
          target_phone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_push_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_push_campaigns_favorite_event_id_fkey"
            columns: ["favorite_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_push_campaigns_favorite_spot_id_fkey"
            columns: ["favorite_spot_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_invites: {
        Row: {
          activated_at: string | null
          country_code: string
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          otp_sent_at: string
          phone_number: string | null
          user_role: string
        }
        Insert: {
          activated_at?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          otp_sent_at?: string
          phone_number?: string | null
          user_role?: string
        }
        Update: {
          activated_at?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          otp_sent_at?: string
          phone_number?: string | null
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_content_pages: {
        Row: {
          body: string
          key: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          key: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_faq: {
        Row: {
          answer: string
          category: string
          display_order: number
          id: string
          is_active: boolean
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string
          display_order?: number
          id: string
          is_active?: boolean
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          display_order?: number
          id?: string
          is_active?: boolean
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_legal_content: {
        Row: {
          body: string
          key: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          key: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      benefit_catalog: {
        Row: {
          benefit_kind: string
          benefit_purpose: string
          city: string | null
          country_code: string | null
          created_at: string
          default_validity_days: number
          description: string
          id: string
          is_active: boolean
          local_id: string | null
          max_uses_per_grant: number | null
          offering_partners: Json
          partner_name: string | null
          quantity_per_grant: number | null
          title: string
          updated_at: string
          validity_ends_at: string | null
          validity_starts_on_activation: boolean
        }
        Insert: {
          benefit_kind?: string
          benefit_purpose?: string
          city?: string | null
          country_code?: string | null
          created_at?: string
          default_validity_days?: number
          description: string
          id?: string
          is_active?: boolean
          local_id?: string | null
          max_uses_per_grant?: number | null
          offering_partners?: Json
          partner_name?: string | null
          quantity_per_grant?: number | null
          title: string
          updated_at?: string
          validity_ends_at?: string | null
          validity_starts_on_activation?: boolean
        }
        Update: {
          benefit_kind?: string
          benefit_purpose?: string
          city?: string | null
          country_code?: string | null
          created_at?: string
          default_validity_days?: number
          description?: string
          id?: string
          is_active?: boolean
          local_id?: string | null
          max_uses_per_grant?: number | null
          offering_partners?: Json
          partner_name?: string | null
          quantity_per_grant?: number | null
          title?: string
          updated_at?: string
          validity_ends_at?: string | null
          validity_starts_on_activation?: boolean
        }
        Relationships: []
      }
      benefit_redemptions: {
        Row: {
          benefit_id: string
          content_id: string | null
          content_title: string | null
          content_type: string | null
          created_at: string
          expires_at: string
          id: string
          local_id: string | null
          partner_code: string
          partner_key: string
          partner_name: string
          status: string
          user_id: string | null
          validated_at: string | null
        }
        Insert: {
          benefit_id: string
          content_id?: string | null
          content_title?: string | null
          content_type?: string | null
          created_at?: string
          expires_at: string
          id?: string
          local_id?: string | null
          partner_code: string
          partner_key: string
          partner_name: string
          status?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Update: {
          benefit_id?: string
          content_id?: string | null
          content_title?: string | null
          content_type?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          local_id?: string | null
          partner_code?: string
          partner_key?: string
          partner_name?: string
          status?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benefit_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chronique_features: {
        Row: {
          advice: string | null
          click_count: number
          contact_email: string | null
          contact_phone: string | null
          country_code: string
          cover_image_url: string | null
          created_at: string
          cta_enabled: boolean
          cta_label: string
          favorite_pick: string | null
          footnote: string | null
          hook: string
          id: string
          is_active: boolean
          journey: string | null
          location_label: string | null
          period_end: string | null
          period_label: string | null
          period_start: string | null
          person_name: string
          person_role: string | null
          place_locality: string | null
          portrait_url: string | null
          slug: string
          story: string | null
          target_id: string | null
          target_slug: string | null
          target_type: string | null
          title: string
          updated_at: string
          useful_links: Json
        }
        Insert: {
          advice?: string | null
          click_count?: number
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string
          cover_image_url?: string | null
          created_at?: string
          cta_enabled?: boolean
          cta_label?: string
          favorite_pick?: string | null
          footnote?: string | null
          hook: string
          id?: string
          is_active?: boolean
          journey?: string | null
          location_label?: string | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          person_name: string
          person_role?: string | null
          place_locality?: string | null
          portrait_url?: string | null
          slug: string
          story?: string | null
          target_id?: string | null
          target_slug?: string | null
          target_type?: string | null
          title: string
          updated_at?: string
          useful_links?: Json
        }
        Update: {
          advice?: string | null
          click_count?: number
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string
          cover_image_url?: string | null
          created_at?: string
          cta_enabled?: boolean
          cta_label?: string
          favorite_pick?: string | null
          footnote?: string | null
          hook?: string
          id?: string
          is_active?: boolean
          journey?: string | null
          location_label?: string | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          person_name?: string
          person_role?: string | null
          place_locality?: string | null
          portrait_url?: string | null
          slug?: string
          story?: string | null
          target_id?: string | null
          target_slug?: string | null
          target_type?: string | null
          title?: string
          updated_at?: string
          useful_links?: Json
        }
        Relationships: []
      }
      community_suggestions: {
        Row: {
          admin_notes: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country_code: string
          created_at: string
          description: string
          id: string
          place_name: string | null
          status: string
          suggestion_type: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country_code?: string
          created_at?: string
          description: string
          id?: string
          place_name?: string | null
          status?: string
          suggestion_type: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country_code?: string
          created_at?: string
          description?: string
          id?: string
          place_name?: string | null
          status?: string
          suggestion_type?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_categories: {
        Row: {
          created_at: string
          emoji: string
          id: string
          is_active: boolean
          is_builtin: boolean
          kind: string
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          kind: string
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          kind?: string
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      creator_corner_features: {
        Row: {
          advice: string | null
          badge_tag: string | null
          category: string | null
          click_count: number
          core_quote: string | null
          country_code: string
          cover_image_url: string | null
          created_at: string
          cta_label: string
          favorite_pick: string | null
          hook: string
          id: string
          impact_description: string | null
          is_active: boolean
          journey: string | null
          location_label: string | null
          media_url: string | null
          period_end: string | null
          period_label: string | null
          period_start: string | null
          person_name: string
          person_role: string | null
          portrait_url: string | null
          related_target_id: string | null
          related_target_slug: string | null
          related_target_type: string | null
          slug: string
          story: string | null
          title: string
          updated_at: string
          useful_links: Json
        }
        Insert: {
          advice?: string | null
          badge_tag?: string | null
          category?: string | null
          click_count?: number
          core_quote?: string | null
          country_code?: string
          cover_image_url?: string | null
          created_at?: string
          cta_label?: string
          favorite_pick?: string | null
          hook: string
          id?: string
          impact_description?: string | null
          is_active?: boolean
          journey?: string | null
          location_label?: string | null
          media_url?: string | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          person_name: string
          person_role?: string | null
          portrait_url?: string | null
          related_target_id?: string | null
          related_target_slug?: string | null
          related_target_type?: string | null
          slug: string
          story?: string | null
          title: string
          updated_at?: string
          useful_links?: Json
        }
        Update: {
          advice?: string | null
          badge_tag?: string | null
          category?: string | null
          click_count?: number
          core_quote?: string | null
          country_code?: string
          cover_image_url?: string | null
          created_at?: string
          cta_label?: string
          favorite_pick?: string | null
          hook?: string
          id?: string
          impact_description?: string | null
          is_active?: boolean
          journey?: string | null
          location_label?: string | null
          media_url?: string | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          person_name?: string
          person_role?: string | null
          portrait_url?: string | null
          related_target_id?: string | null
          related_target_slug?: string | null
          related_target_type?: string | null
          slug?: string
          story?: string | null
          title?: string
          updated_at?: string
          useful_links?: Json
        }
        Relationships: []
      }
      djomy_accounting_settlements: {
        Row: {
          bank_reference: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payout_date: string
          period_end: string
          period_start: string
          wired_amount_gnf: number
        }
        Insert: {
          bank_reference?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payout_date: string
          period_end: string
          period_start: string
          wired_amount_gnf: number
        }
        Update: {
          bank_reference?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payout_date?: string
          period_end?: string
          period_start?: string
          wired_amount_gnf?: number
        }
        Relationships: []
      }
      djomy_bank_payout_lines: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          payment_method: string
          payout_id: string
          period_end: string | null
          period_start: string | null
          wired_amount_gnf: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          payout_id: string
          period_end?: string | null
          period_start?: string | null
          wired_amount_gnf: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          payout_id?: string
          period_end?: string | null
          period_start?: string | null
          wired_amount_gnf?: number
        }
        Relationships: [
          {
            foreignKeyName: "djomy_bank_payout_lines_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "djomy_bank_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      djomy_bank_payouts: {
        Row: {
          bank_reference: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payout_date: string
        }
        Insert: {
          bank_reference?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payout_date: string
        }
        Update: {
          bank_reference?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payout_date?: string
        }
        Relationships: []
      }
      establishment_photos: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          is_primary: boolean
          photo_url: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          is_primary?: boolean
          photo_url: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          is_primary?: boolean
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_photos_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_ratings: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_ratings_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_schedules: {
        Row: {
          closing_time: string | null
          day_of_week: number
          establishment_id: string
          id: string
          is_closed: boolean
          opening_time: string | null
        }
        Insert: {
          closing_time?: string | null
          day_of_week: number
          establishment_id: string
          id?: string
          is_closed?: boolean
          opening_time?: string | null
        }
        Update: {
          closing_time?: string | null
          day_of_week?: number
          establishment_id?: string
          id?: string
          is_closed?: boolean
          opening_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishment_schedules_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          action_link: string | null
          admin_star_override: number | null
          admin_star_override_at: string | null
          admin_star_override_by: string | null
          category_slugs: string[]
          click_count: number
          content_origin: string | null
          content_status: string
          country_code: string
          created_at: string
          description: string
          engagement_score: number
          facebook_url: string | null
          favorite_count: number
          featured_end_date: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          is_featured: boolean
          last_star_calc_at: string | null
          latitude: number | null
          location_id: number
          longitude: number | null
          master_id: string
          name: string
          opening_hours_label: string | null
          phone_contact: string
          price_indicator: string
          rating_avg: number
          rating_count: number
          star_count: number
          stars_source: string
          website_url: string | null
        }
        Insert: {
          action_link?: string | null
          admin_star_override?: number | null
          admin_star_override_at?: string | null
          admin_star_override_by?: string | null
          category_slugs?: string[]
          click_count?: number
          content_origin?: string | null
          content_status?: string
          country_code?: string
          created_at?: string
          description: string
          engagement_score?: number
          facebook_url?: string | null
          favorite_count?: number
          featured_end_date?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          last_star_calc_at?: string | null
          latitude?: number | null
          location_id: number
          longitude?: number | null
          master_id: string
          name: string
          opening_hours_label?: string | null
          phone_contact: string
          price_indicator: string
          rating_avg?: number
          rating_count?: number
          star_count?: number
          stars_source?: string
          website_url?: string | null
        }
        Update: {
          action_link?: string | null
          admin_star_override?: number | null
          admin_star_override_at?: string | null
          admin_star_override_by?: string | null
          category_slugs?: string[]
          click_count?: number
          content_origin?: string | null
          content_status?: string
          country_code?: string
          created_at?: string
          description?: string
          engagement_score?: number
          facebook_url?: string | null
          favorite_count?: number
          featured_end_date?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          last_star_calc_at?: string | null
          latitude?: number | null
          location_id?: number
          longitude?: number | null
          master_id?: string
          name?: string
          opening_hours_label?: string | null
          phone_contact?: string
          price_indicator?: string
          rating_avg?: number
          rating_count?: number
          star_count?: number
          stars_source?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishments_admin_star_override_by_fkey"
            columns: ["admin_star_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishments_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "partner_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      event_schedules: {
        Row: {
          activity_title: string
          event_id: string
          id: string
          order_index: number
          time_label: string
        }
        Insert: {
          activity_title: string
          event_id: string
          id?: string
          order_index: number
          time_label: string
        }
        Update: {
          activity_title?: string
          event_id?: string
          id?: string
          order_index?: number
          time_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_schedules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_speakers: {
        Row: {
          company_name: string
          event_id: string
          full_name: string
          id: string
          photo_url: string | null
          professional_title: string
        }
        Insert: {
          company_name: string
          event_id: string
          full_name: string
          id?: string
          photo_url?: string | null
          professional_title: string
        }
        Update: {
          company_name?: string
          event_id?: string
          full_name?: string
          id?: string
          photo_url?: string | null
          professional_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          action_link: string | null
          banner_url: string | null
          category_slugs: string[]
          click_count: number
          content_origin: string | null
          content_status: string
          country_code: string
          created_at: string
          custom_location_name: string | null
          description: string
          end_date: string
          establishment_id: string | null
          facebook_url: string | null
          fallback_color: string
          favorite_count: number
          featured_end_date: string | null
          gallery_images: Json
          guinea_location_id: number | null
          id: string
          instagram_url: string | null
          is_active: boolean
          is_external_location: boolean
          is_featured: boolean
          is_free: boolean
          is_invitation_only: boolean
          is_loop_x: boolean
          location_id: number
          master_id: string | null
          organizer_id: string
          organizer_name: string | null
          reveal_price: number | null
          start_date: string
          ticket_price: number | null
          title: string
          venue_location: Json | null
          website_url: string | null
        }
        Insert: {
          action_link?: string | null
          banner_url?: string | null
          category_slugs?: string[]
          click_count?: number
          content_origin?: string | null
          content_status?: string
          country_code?: string
          created_at?: string
          custom_location_name?: string | null
          description: string
          end_date: string
          establishment_id?: string | null
          facebook_url?: string | null
          fallback_color?: string
          favorite_count?: number
          featured_end_date?: string | null
          gallery_images?: Json
          guinea_location_id?: number | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_external_location?: boolean
          is_featured?: boolean
          is_free?: boolean
          is_invitation_only?: boolean
          is_loop_x?: boolean
          location_id: number
          master_id?: string | null
          organizer_id: string
          organizer_name?: string | null
          reveal_price?: number | null
          start_date: string
          ticket_price?: number | null
          title: string
          venue_location?: Json | null
          website_url?: string | null
        }
        Update: {
          action_link?: string | null
          banner_url?: string | null
          category_slugs?: string[]
          click_count?: number
          content_origin?: string | null
          content_status?: string
          country_code?: string
          created_at?: string
          custom_location_name?: string | null
          description?: string
          end_date?: string
          establishment_id?: string | null
          facebook_url?: string | null
          fallback_color?: string
          favorite_count?: number
          featured_end_date?: string | null
          gallery_images?: Json
          guinea_location_id?: number | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_external_location?: boolean
          is_featured?: boolean
          is_free?: boolean
          is_invitation_only?: boolean
          is_loop_x?: boolean
          location_id?: number
          master_id?: string | null
          organizer_id?: string
          organizer_name?: string | null
          reveal_price?: number | null
          start_date?: string
          ticket_price?: number | null
          title?: string
          venue_location?: Json | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_guinea_location_id_fkey"
            columns: ["guinea_location_id"]
            isOneToOne: false
            referencedRelation: "guinea_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_events: {
        Row: {
          created_at: string
          event_id: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_spots: {
        Row: {
          created_at: string
          establishment_id: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_spots_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_spots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_tools: {
        Row: {
          created_at: string
          id: string
          tool_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tool_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_tools_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_walks: {
        Row: {
          created_at: string
          id: string
          user_id: string
          walk_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          walk_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          walk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_walks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_walks_walk_id_fkey"
            columns: ["walk_id"]
            isOneToOne: false
            referencedRelation: "loop_walks"
            referencedColumns: ["id"]
          },
        ]
      }
      guinea_locations: {
        Row: {
          commune: string
          country_code: string
          created_at: string
          district: string
          id: number
          prefecture: string
          region: string
        }
        Insert: {
          commune: string
          country_code?: string
          created_at?: string
          district: string
          id?: number
          prefecture: string
          region: string
        }
        Update: {
          commune?: string
          country_code?: string
          created_at?: string
          district?: string
          id?: number
          prefecture?: string
          region?: string
        }
        Relationships: []
      }
      home_partner_logos: {
        Row: {
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          logo_url: string
          name: string
          partner_key: string | null
          sort_order: number
          source: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url: string
          name: string
          partner_key?: string | null
          sort_order?: number
          source?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string
          name?: string
          partner_key?: string | null
          sort_order?: number
          source?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      home_poll_votes: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          option_id: string
          poll_id: string
          user_id: string | null
          voter_phone: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          option_id: string
          poll_id: string
          user_id?: string | null
          voter_phone?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          option_id?: string
          poll_id?: string
          user_id?: string | null
          voter_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "home_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "home_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      home_polls: {
        Row: {
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          options: Json
          period_end: string | null
          period_start: string | null
          question: string
          updated_at: string
          view_count: number
          week_key: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          options: Json
          period_end?: string | null
          period_start?: string | null
          question: string
          updated_at?: string
          view_count?: number
          week_key: string
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          options?: Json
          period_end?: string | null
          period_start?: string | null
          question?: string
          updated_at?: string
          view_count?: number
          week_key?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          city: string
          country: string
          country_code: string | null
          created_at: string
          id: number
          neighborhood_name: string
        }
        Insert: {
          city?: string
          country?: string
          country_code?: string | null
          created_at?: string
          id?: number
          neighborhood_name: string
        }
        Update: {
          city?: string
          country?: string
          country_code?: string | null
          created_at?: string
          id?: number
          neighborhood_name?: string
        }
        Relationships: []
      }
      loop_walks: {
        Row: {
          admin_star_override: number | null
          admin_star_override_at: string | null
          admin_star_override_by: string | null
          category: string
          category_label: string
          click_count: number
          contact_phone: string | null
          contact_url: string | null
          country_code: string
          cover_image_url: string
          created_at: string
          description: string | null
          duration_minutes: number
          engagement_score: number
          favorite_count: number
          id: string
          is_featured_week: boolean
          is_published: boolean
          last_star_calc_at: string | null
          partner_ids: string[]
          price_label: string | null
          price_type: string
          rating_avg: number
          rating_count: number
          slug: string
          sort_order: number
          star_count: number
          stars_source: string
          steps: Json
          steps_count: number
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          admin_star_override?: number | null
          admin_star_override_at?: string | null
          admin_star_override_by?: string | null
          category: string
          category_label: string
          click_count?: number
          contact_phone?: string | null
          contact_url?: string | null
          country_code?: string
          cover_image_url: string
          created_at?: string
          description?: string | null
          duration_minutes: number
          engagement_score?: number
          favorite_count?: number
          id?: string
          is_featured_week?: boolean
          is_published?: boolean
          last_star_calc_at?: string | null
          partner_ids?: string[]
          price_label?: string | null
          price_type?: string
          rating_avg?: number
          rating_count?: number
          slug: string
          sort_order?: number
          star_count?: number
          stars_source?: string
          steps?: Json
          steps_count: number
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          admin_star_override?: number | null
          admin_star_override_at?: string | null
          admin_star_override_by?: string | null
          category?: string
          category_label?: string
          click_count?: number
          contact_phone?: string | null
          contact_url?: string | null
          country_code?: string
          cover_image_url?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          engagement_score?: number
          favorite_count?: number
          id?: string
          is_featured_week?: boolean
          is_published?: boolean
          last_star_calc_at?: string | null
          partner_ids?: string[]
          price_label?: string | null
          price_type?: string
          rating_avg?: number
          rating_count?: number
          slug?: string
          sort_order?: number
          star_count?: number
          stars_source?: string
          steps?: Json
          steps_count?: number
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loop_walks_admin_star_override_by_fkey"
            columns: ["admin_star_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_event_submissions: {
        Row: {
          category: string
          category_slugs: string[]
          content_origin: string | null
          country_code: string
          cover_image_url: string | null
          created_at: string
          currency: string | null
          description: string
          ends_at: string | null
          entry_price: number | null
          facebook_url: string | null
          gallery_images: Json
          guinea_location_id: number | null
          id: string
          info_url: string | null
          instagram_url: string | null
          is_invitation_only: boolean
          local_id: string
          master_user_id: string | null
          organizer_name: string | null
          partner_name: string
          partner_user_id: string | null
          program: string | null
          published_event_id: string | null
          rejection_reason: string | null
          speakers: Json
          spot_id: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          venue_address: string | null
          venue_location: Json | null
          venue_name: string
          website_url: string | null
        }
        Insert: {
          category?: string
          category_slugs?: string[]
          content_origin?: string | null
          country_code?: string
          cover_image_url?: string | null
          created_at?: string
          currency?: string | null
          description?: string
          ends_at?: string | null
          entry_price?: number | null
          facebook_url?: string | null
          gallery_images?: Json
          guinea_location_id?: number | null
          id?: string
          info_url?: string | null
          instagram_url?: string | null
          is_invitation_only?: boolean
          local_id: string
          master_user_id?: string | null
          organizer_name?: string | null
          partner_name: string
          partner_user_id?: string | null
          program?: string | null
          published_event_id?: string | null
          rejection_reason?: string | null
          speakers?: Json
          spot_id?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          venue_address?: string | null
          venue_location?: Json | null
          venue_name?: string
          website_url?: string | null
        }
        Update: {
          category?: string
          category_slugs?: string[]
          content_origin?: string | null
          country_code?: string
          cover_image_url?: string | null
          created_at?: string
          currency?: string | null
          description?: string
          ends_at?: string | null
          entry_price?: number | null
          facebook_url?: string | null
          gallery_images?: Json
          guinea_location_id?: number | null
          id?: string
          info_url?: string | null
          instagram_url?: string | null
          is_invitation_only?: boolean
          local_id?: string
          master_user_id?: string | null
          organizer_name?: string | null
          partner_name?: string
          partner_user_id?: string | null
          program?: string | null
          published_event_id?: string | null
          rejection_reason?: string | null
          speakers?: Json
          spot_id?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          venue_address?: string | null
          venue_location?: Json | null
          venue_name?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_event_submissions_guinea_location_id_fkey"
            columns: ["guinea_location_id"]
            isOneToOne: false
            referencedRelation: "guinea_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_event_submissions_master_user_id_fkey"
            columns: ["master_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_event_submissions_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_event_submissions_published_event_id_fkey"
            columns: ["published_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_member_attributions: {
        Row: {
          first_validated_at: string
          id: string
          partner_key: string
          user_id: string
        }
        Insert: {
          first_validated_at?: string
          id?: string
          partner_key: string
          user_id: string
        }
        Update: {
          first_validated_at?: string
          id?: string
          partner_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_member_attributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_milestone_rewards: {
        Row: {
          activated_at: string | null
          content_id: string | null
          content_kind: string | null
          content_title: string | null
          duration_days: number
          earned_at: string
          expires_at: string | null
          id: string
          metric_type: string
          metric_value: number
          partner_key: string
          partner_name: string
          partner_user_id: string | null
          period_key: string
          push_message: string | null
          push_title: string | null
          reward_type: string
          rule_id: string
          selected_at: string | null
          status: string
          used_at: string | null
          validity_days: number
        }
        Insert: {
          activated_at?: string | null
          content_id?: string | null
          content_kind?: string | null
          content_title?: string | null
          duration_days?: number
          earned_at?: string
          expires_at?: string | null
          id?: string
          metric_type: string
          metric_value: number
          partner_key: string
          partner_name: string
          partner_user_id?: string | null
          period_key?: string
          push_message?: string | null
          push_title?: string | null
          reward_type: string
          rule_id: string
          selected_at?: string | null
          status?: string
          used_at?: string | null
          validity_days?: number
        }
        Update: {
          activated_at?: string | null
          content_id?: string | null
          content_kind?: string | null
          content_title?: string | null
          duration_days?: number
          earned_at?: string
          expires_at?: string | null
          id?: string
          metric_type?: string
          metric_value?: number
          partner_key?: string
          partner_name?: string
          partner_user_id?: string | null
          period_key?: string
          push_message?: string | null
          push_title?: string | null
          reward_type?: string
          rule_id?: string
          selected_at?: string | null
          status?: string
          used_at?: string | null
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_milestone_rewards_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_milestone_rewards_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "partner_milestone_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_milestone_rules: {
        Row: {
          archived: boolean
          country_code: string
          created_at: string
          description: string | null
          duration_days: number
          id: string
          is_active: boolean
          metric_type: string
          name: string
          period_months: number
          push_message: string | null
          push_title: string | null
          reward_type: string
          sort_order: number
          threshold: number
          updated_at: string
          validity_days: number
        }
        Insert: {
          archived?: boolean
          country_code?: string
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          metric_type: string
          name: string
          period_months?: number
          push_message?: string | null
          push_title?: string | null
          reward_type: string
          sort_order?: number
          threshold: number
          updated_at?: string
          validity_days?: number
        }
        Update: {
          archived?: boolean
          country_code?: string
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          metric_type?: string
          name?: string
          period_months?: number
          push_message?: string | null
          push_title?: string | null
          reward_type?: string
          sort_order?: number
          threshold?: number
          updated_at?: string
          validity_days?: number
        }
        Relationships: []
      }
      partner_spot_submissions: {
        Row: {
          address: string
          category_slugs: string[]
          content_origin: string | null
          country_code: string
          cover_image_url: string | null
          created_at: string
          cta_url: string | null
          description: string
          developer: string | null
          district: string | null
          facebook_url: string | null
          gallery_images: Json
          guinea_location_id: number | null
          id: string
          instagram_url: string | null
          is_verified: boolean
          local_id: string
          logo_url: string | null
          name: string
          opening_hours: string | null
          organizer_name: string | null
          partner_name: string
          partner_user_id: string | null
          partnership_status: string | null
          phone: string | null
          price_label: string | null
          published_establishment_id: string | null
          published_tool_id: string | null
          rejection_reason: string | null
          status: string
          sub_category: string
          tool_category: string | null
          updated_at: string
          venue_location: Json | null
          website: string | null
        }
        Insert: {
          address?: string
          category_slugs?: string[]
          content_origin?: string | null
          country_code?: string
          cover_image_url?: string | null
          created_at?: string
          cta_url?: string | null
          description?: string
          developer?: string | null
          district?: string | null
          facebook_url?: string | null
          gallery_images?: Json
          guinea_location_id?: number | null
          id?: string
          instagram_url?: string | null
          is_verified?: boolean
          local_id: string
          logo_url?: string | null
          name: string
          opening_hours?: string | null
          organizer_name?: string | null
          partner_name: string
          partner_user_id?: string | null
          partnership_status?: string | null
          phone?: string | null
          price_label?: string | null
          published_establishment_id?: string | null
          published_tool_id?: string | null
          rejection_reason?: string | null
          status?: string
          sub_category?: string
          tool_category?: string | null
          updated_at?: string
          venue_location?: Json | null
          website?: string | null
        }
        Update: {
          address?: string
          category_slugs?: string[]
          content_origin?: string | null
          country_code?: string
          cover_image_url?: string | null
          created_at?: string
          cta_url?: string | null
          description?: string
          developer?: string | null
          district?: string | null
          facebook_url?: string | null
          gallery_images?: Json
          guinea_location_id?: number | null
          id?: string
          instagram_url?: string | null
          is_verified?: boolean
          local_id?: string
          logo_url?: string | null
          name?: string
          opening_hours?: string | null
          organizer_name?: string | null
          partner_name?: string
          partner_user_id?: string | null
          partnership_status?: string | null
          phone?: string | null
          price_label?: string | null
          published_establishment_id?: string | null
          published_tool_id?: string | null
          rejection_reason?: string | null
          status?: string
          sub_category?: string
          tool_category?: string | null
          updated_at?: string
          venue_location?: Json | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_spot_submissions_guinea_location_id_fkey"
            columns: ["guinea_location_id"]
            isOneToOne: false
            referencedRelation: "guinea_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_spot_submissions_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_spot_submissions_published_establishment_id_fkey"
            columns: ["published_establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_spot_submissions_published_tool_id_fkey"
            columns: ["published_tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_staff: {
        Row: {
          created_at: string
          id: string
          staff_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          staff_role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          staff_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          partner_name: string
          status: string
          token_code: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          partner_name: string
          status?: string
          token_code: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          partner_name?: string
          status?: string
          token_code?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_validation_codes: {
        Row: {
          created_at: string
          establishment_id: string | null
          id: string
          partner_key: string
          partner_name: string
          partner_token_id: string | null
          updated_at: string
          user_id: string | null
          validation_code: string
        }
        Insert: {
          created_at?: string
          establishment_id?: string | null
          id?: string
          partner_key: string
          partner_name: string
          partner_token_id?: string | null
          updated_at?: string
          user_id?: string | null
          validation_code: string
        }
        Update: {
          created_at?: string
          establishment_id?: string | null
          id?: string
          partner_key?: string
          partner_name?: string
          partner_token_id?: string | null
          updated_at?: string
          user_id?: string | null
          validation_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_validation_codes_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_validation_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partnership_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          partnership_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          partnership_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          partnership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partnership_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_notes_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "partnership_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      partnership_requests: {
        Row: {
          admin_notes: string | null
          admin_notified_at: string | null
          country_code: string
          created_at: string
          email: string
          establishment_name: string
          id: string
          manager_name: string
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          admin_notified_at?: string | null
          country_code?: string
          created_at?: string
          email: string
          establishment_name: string
          id?: string
          manager_name: string
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          admin_notified_at?: string | null
          country_code?: string
          created_at?: string
          email?: string
          establishment_name?: string
          id?: string
          manager_name?: string
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount_gnf: number
          billing_period: string
          created_at: string
          djomy_paid_amount: number | null
          djomy_provider_reference: string | null
          djomy_status: string | null
          djomy_transaction_id: string | null
          fulfillment_status: string
          id: string
          last_checked_at: string | null
          last_webhook_at: string | null
          last_webhook_event: string | null
          local_pass_id: string
          merchant_reference: string
          paid_at: string | null
          pass_grant_status: string | null
          payer_phone: string
          payment_method: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_gnf: number
          billing_period: string
          created_at?: string
          djomy_paid_amount?: number | null
          djomy_provider_reference?: string | null
          djomy_status?: string | null
          djomy_transaction_id?: string | null
          fulfillment_status?: string
          id?: string
          last_checked_at?: string | null
          last_webhook_at?: string | null
          last_webhook_event?: string | null
          local_pass_id: string
          merchant_reference: string
          paid_at?: string | null
          pass_grant_status?: string | null
          payer_phone: string
          payment_method?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_gnf?: number
          billing_period?: string
          created_at?: string
          djomy_paid_amount?: number | null
          djomy_provider_reference?: string | null
          djomy_status?: string | null
          djomy_transaction_id?: string | null
          fulfillment_status?: string
          id?: string
          last_checked_at?: string | null
          last_webhook_at?: string | null
          last_webhook_event?: string | null
          local_pass_id?: string
          merchant_reference?: string
          paid_at?: string | null
          pass_grant_status?: string | null
          payer_phone?: string
          payment_method?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roles: {
        Row: {
          app_role: string
          created_at: string
          is_admin: boolean
          label: string
          slug: string
          sort_order: number
          theme_id: string
          updated_at: string
        }
        Insert: {
          app_role: string
          created_at?: string
          is_admin?: boolean
          label: string
          slug: string
          sort_order?: number
          theme_id: string
          updated_at?: string
        }
        Update: {
          app_role?: string
          created_at?: string
          is_admin?: boolean
          label?: string
          slug?: string
          sort_order?: number
          theme_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prime_benefit_grants: {
        Row: {
          activated_at: string | null
          catalog_id: string | null
          catalog_local_id: string | null
          created_at: string
          description: string
          expires_at: string
          grant_audience: string
          grant_city: string | null
          grant_country_code: string | null
          granted_at: string
          granted_by: string | null
          id: string
          local_id: string | null
          partner_name: string | null
          role_entitlement: string | null
          scheduled_at: string | null
          status: string
          title: string
          used_at: string | null
          user_id: string
          validity_days: number | null
          validity_starts_on_activation: boolean
        }
        Insert: {
          activated_at?: string | null
          catalog_id?: string | null
          catalog_local_id?: string | null
          created_at?: string
          description: string
          expires_at: string
          grant_audience: string
          grant_city?: string | null
          grant_country_code?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          local_id?: string | null
          partner_name?: string | null
          role_entitlement?: string | null
          scheduled_at?: string | null
          status?: string
          title: string
          used_at?: string | null
          user_id: string
          validity_days?: number | null
          validity_starts_on_activation?: boolean
        }
        Update: {
          activated_at?: string | null
          catalog_id?: string | null
          catalog_local_id?: string | null
          created_at?: string
          description?: string
          expires_at?: string
          grant_audience?: string
          grant_city?: string | null
          grant_country_code?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          local_id?: string | null
          partner_name?: string | null
          role_entitlement?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string
          used_at?: string | null
          user_id?: string
          validity_days?: number | null
          validity_starts_on_activation?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "prime_benefit_grants_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "benefit_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prime_benefit_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prime_benefit_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_rewards: {
        Row: {
          created_at: string
          id: string
          months_granted: number
          referrals_count: number
          referrer_user_id: string
          reward_year: number
        }
        Insert: {
          created_at?: string
          id?: string
          months_granted: number
          referrals_count: number
          referrer_user_id: string
          reward_year: number
        }
        Update: {
          created_at?: string
          id?: string
          months_granted?: number
          referrals_count?: number
          referrer_user_id?: string
          reward_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_settings: {
        Row: {
          id: number
          max_reward_months_per_year: number
          referrals_per_reward: number
          reward_months: number
          updated_at: string
        }
        Insert: {
          id?: number
          max_reward_months_per_year?: number
          referrals_per_reward?: number
          reward_months?: number
          updated_at?: string
        }
        Update: {
          id?: number
          max_reward_months_per_year?: number
          referrals_per_reward?: number
          reward_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_benefit_grants: {
        Row: {
          audience: string
          catalog_ids: string[]
          created_at: string
          custom_note: string | null
          expires_at: string
          grant_city: string | null
          grant_country_code: string | null
          granted_by: string | null
          id: string
          scheduled_at: string
          status: string
          target_phones: string | null
        }
        Insert: {
          audience: string
          catalog_ids: string[]
          created_at?: string
          custom_note?: string | null
          expires_at: string
          grant_city?: string | null
          grant_country_code?: string | null
          granted_by?: string | null
          id?: string
          scheduled_at: string
          status?: string
          target_phones?: string | null
        }
        Update: {
          audience?: string
          catalog_ids?: string[]
          created_at?: string
          custom_note?: string | null
          expires_at?: string
          grant_city?: string | null
          grant_country_code?: string | null
          granted_by?: string | null
          id?: string
          scheduled_at?: string
          status?: string
          target_phones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_benefit_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_attempts: {
        Row: {
          attempted_at: string
          email_normalized: string
          id: string
        }
        Insert: {
          attempted_at?: string
          email_normalized: string
          id?: string
        }
        Update: {
          attempted_at?: string
          email_normalized?: string
          id?: string
        }
        Relationships: []
      }
      spot_star_calc_runs: {
        Row: {
          country_code: string
          created_at: string
          id: string
          run_date: string
          spots_updated: number
        }
        Insert: {
          country_code: string
          created_at?: string
          id?: string
          run_date?: string
          spots_updated?: number
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          run_date?: string
          spots_updated?: number
        }
        Relationships: []
      }
      spot_star_settings: {
        Row: {
          click_weight: number
          country_code: string | null
          created_at: string
          favorite_weight: number
          id: string
          is_active: boolean
          rating_weight: number
          updated_at: string
        }
        Insert: {
          click_weight?: number
          country_code?: string | null
          created_at?: string
          favorite_weight?: number
          id?: string
          is_active?: boolean
          rating_weight?: number
          updated_at?: string
        }
        Update: {
          click_weight?: number
          country_code?: string | null
          created_at?: string
          favorite_weight?: number
          id?: string
          is_active?: boolean
          rating_weight?: number
          updated_at?: string
        }
        Relationships: []
      }
      spot_star_tiers: {
        Row: {
          created_at: string
          id: string
          max_score: number | null
          min_score: number
          settings_id: string
          sort_order: number
          star_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_score?: number | null
          min_score?: number
          settings_id: string
          sort_order?: number
          star_count: number
        }
        Update: {
          created_at?: string
          id?: string
          max_score?: number | null
          min_score?: number
          settings_id?: string
          sort_order?: number
          star_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "spot_star_tiers_settings_id_fkey"
            columns: ["settings_id"]
            isOneToOne: false
            referencedRelation: "spot_star_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_benefit_overrides: {
        Row: {
          enabled_catalog_ids: Json
          extra: Json
          revoked_catalog_ids: Json
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          enabled_catalog_ids?: Json
          extra?: Json
          revoked_catalog_ids?: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          enabled_catalog_ids?: Json
          extra?: Json
          revoked_catalog_ids?: Json
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_benefit_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_benefit_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_photos: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          photo_url: string
          tool_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          photo_url: string
          tool_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          photo_url?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_photos_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          tool_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          tool_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          tool_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_ratings_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          action_link: string | null
          admin_star_override: number | null
          admin_star_override_at: string | null
          admin_star_override_by: string | null
          category_slugs: string[]
          click_count: number
          content_origin: string | null
          content_status: string
          country_code: string
          created_at: string
          description: string
          developer: string | null
          engagement_score: number
          facebook_url: string | null
          favorite_count: number
          featured_end_date: string | null
          featured_start_date: string | null
          id: string
          instagram_url: string | null
          is_active: boolean
          is_featured: boolean
          is_verified: boolean
          logo_url: string | null
          master_id: string | null
          name: string
          partnership_status: string | null
          phone_contact: string | null
          rating_avg: number
          rating_count: number
          star_count: number
          stars_source: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          action_link?: string | null
          admin_star_override?: number | null
          admin_star_override_at?: string | null
          admin_star_override_by?: string | null
          category_slugs?: string[]
          click_count?: number
          content_origin?: string | null
          content_status?: string
          country_code?: string
          created_at?: string
          description?: string
          developer?: string | null
          engagement_score?: number
          facebook_url?: string | null
          favorite_count?: number
          featured_end_date?: string | null
          featured_start_date?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_verified?: boolean
          logo_url?: string | null
          master_id?: string | null
          name: string
          partnership_status?: string | null
          phone_contact?: string | null
          rating_avg?: number
          rating_count?: number
          star_count?: number
          stars_source?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          action_link?: string | null
          admin_star_override?: number | null
          admin_star_override_at?: string | null
          admin_star_override_by?: string | null
          category_slugs?: string[]
          click_count?: number
          content_origin?: string | null
          content_status?: string
          country_code?: string
          created_at?: string
          description?: string
          developer?: string | null
          engagement_score?: number
          facebook_url?: string | null
          favorite_count?: number
          featured_end_date?: string | null
          featured_start_date?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_verified?: boolean
          logo_url?: string | null
          master_id?: string | null
          name?: string
          partnership_status?: string | null
          phone_contact?: string | null
          rating_avg?: number
          rating_count?: number
          star_count?: number
          stars_source?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          audience: string
          campaign_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          recipient_phone: string | null
          sent_at: string
          title: string
          user_id: string | null
        }
        Insert: {
          audience?: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          recipient_phone?: string | null
          sent_at?: string
          title?: string
          user_id?: string | null
        }
        Update: {
          audience?: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          recipient_phone?: string | null
          sent_at?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "admin_push_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_pass_grants: {
        Row: {
          amount_gnf: number | null
          billing_period: string | null
          created_at: string
          expires_at: string | null
          frozen_pass_snapshot: Json | null
          grant_note: string | null
          granted_by: string | null
          id: string
          label: string
          local_id: string | null
          paid_at: string | null
          pass_catalog_id: string
          pass_kind: string
          payment_method: string | null
          role_freeze_intermediate_id: string | null
          scheduled_start_at: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_gnf?: number | null
          billing_period?: string | null
          created_at?: string
          expires_at?: string | null
          frozen_pass_snapshot?: Json | null
          grant_note?: string | null
          granted_by?: string | null
          id?: string
          label: string
          local_id?: string | null
          paid_at?: string | null
          pass_catalog_id: string
          pass_kind?: string
          payment_method?: string | null
          role_freeze_intermediate_id?: string | null
          scheduled_start_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_gnf?: number | null
          billing_period?: string | null
          created_at?: string
          expires_at?: string | null
          frozen_pass_snapshot?: Json | null
          grant_note?: string | null
          granted_by?: string | null
          id?: string
          label?: string
          local_id?: string | null
          paid_at?: string | null
          pass_catalog_id?: string
          pass_kind?: string
          payment_method?: string | null
          role_freeze_intermediate_id?: string | null
          scheduled_start_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_pass_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_pass_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          expo_push_token: string
          id: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          expo_push_token: string
          id?: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          expo_push_token?: string
          id?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          account_status: string
          birth_date: string | null
          city: string | null
          company: string | null
          country_code: string
          created_at: string
          email: string
          first_name: string
          id: string
          interest_country_code: string | null
          is_active: boolean
          job_title: string | null
          last_name: string
          last_seen_at: string | null
          partner_can_manage_events: boolean
          partner_can_manage_spots: boolean
          partner_can_manage_tools: boolean
          password_hash: string
          phone_number: string | null
          prime_role_locked: boolean
          qr_code_token: string
          referral_code: string | null
          referred_by_code: string | null
          updated_at: string
          user_role: string
        }
        Insert: {
          account_status?: string
          birth_date?: string | null
          city?: string | null
          company?: string | null
          country_code?: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          interest_country_code?: string | null
          is_active?: boolean
          job_title?: string | null
          last_name: string
          last_seen_at?: string | null
          partner_can_manage_events?: boolean
          partner_can_manage_spots?: boolean
          partner_can_manage_tools?: boolean
          password_hash: string
          phone_number?: string | null
          prime_role_locked?: boolean
          qr_code_token: string
          referral_code?: string | null
          referred_by_code?: string | null
          updated_at?: string
          user_role?: string
        }
        Update: {
          account_status?: string
          birth_date?: string | null
          city?: string | null
          company?: string | null
          country_code?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          interest_country_code?: string | null
          is_active?: boolean
          job_title?: string | null
          last_name?: string
          last_seen_at?: string | null
          partner_can_manage_events?: boolean
          partner_can_manage_spots?: boolean
          partner_can_manage_tools?: boolean
          password_hash?: string
          phone_number?: string | null
          prime_role_locked?: boolean
          qr_code_token?: string
          referral_code?: string | null
          referred_by_code?: string | null
          updated_at?: string
          user_role?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          city: string | null
          country_code: string | null
          created_at: string
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          invite_id: string | null
          invited_at: string | null
          last_name: string | null
          metadata: Json
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          invite_id?: string | null
          invited_at?: string | null
          last_name?: string | null
          metadata?: Json
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          invite_id?: string | null
          invited_at?: string | null
          last_name?: string | null
          metadata?: Json
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "admin_user_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      walk_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          updated_at: string
          user_id: string
          walk_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
          walk_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
          walk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "walk_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walk_ratings_walk_id_fkey"
            columns: ["walk_id"]
            isOneToOne: false
            referencedRelation: "loop_walks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _admin_user_linked_content_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      admin_cancel_pending_invite: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      admin_create_establishment_direct: {
        Args: { p_payload: Json }
        Returns: string
      }
      admin_create_event_direct: { Args: { p_payload: Json }; Returns: string }
      admin_create_tool_direct: { Args: { p_payload: Json }; Returns: string }
      admin_delete_benefit_catalog_by_local_id: {
        Args: { p_local_id: string }
        Returns: boolean
      }
      admin_delete_user_if_orphan: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      admin_distribute_notifications: {
        Args: {
          p_audience?: string
          p_campaign_id?: string
          p_country_code?: string
          p_message: string
          p_title: string
        }
        Returns: string[]
      }
      admin_get_content_owner: {
        Args: { p_content_id: string; p_kind: string }
        Returns: Json
      }
      admin_has_permission: { Args: { p_permission: string }; Returns: boolean }
      admin_inbox_broadcast: {
        Args: {
          p_country_code?: string
          p_message: string
          p_notif_title: string
        }
        Returns: string[]
      }
      admin_purge_benefit_catalog_content_refs: {
        Args: { p_content_ids: string[] }
        Returns: number
      }
      admin_reassign_content_owner: {
        Args: {
          p_content_id: string
          p_kind: string
          p_partner_user_id?: string
        }
        Returns: Json
      }
      admin_set_app_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: Json
      }
      admin_update_referral_settings: {
        Args: {
          p_max_reward_months_per_year: number
          p_referrals_per_reward: number
          p_reward_months: number
        }
        Returns: Json
      }
      admin_upsert_benefit_catalog: { Args: { p_row: Json }; Returns: string }
      admin_upsert_partner_benefit_offer: {
        Args: { p_row: Json }
        Returns: string
      }
      admin_users_with_favorite_categories: {
        Args: {
          p_event_categories?: string[]
          p_spot_categories?: string[]
          p_tool_categories?: string[]
        }
        Returns: {
          user_id: string
        }[]
      }
      admin_withdraw_partner_content: {
        Args: { p_catalog_id?: string; p_kind: string; p_local_id?: string }
        Returns: Json
      }
      apply_partner_benefit_validation: {
        Args: {
          p_partner_code: string
          p_redemption_local_ids: string[]
          p_validate?: boolean
        }
        Returns: number
      }
      apply_referral_rewards_for: {
        Args: { p_referrer_id: string }
        Returns: number
      }
      assert_partner_submission_actor: {
        Args: { p_partner_user_id: string }
        Returns: undefined
      }
      assert_signup_email_allowed: {
        Args: { p_email: string }
        Returns: undefined
      }
      bulk_update_user_pass_grants: {
        Args: {
          p_exclude_catalog_id?: string
          p_match_statuses: string[]
          p_new_status: string
          p_only_catalog_id?: string
          p_only_unexpired?: boolean
          p_user_id: string
        }
        Returns: number
      }
      can_read_public_catalog_row: {
        Args: { p_content_status: string; p_is_active: boolean }
        Returns: boolean
      }
      can_read_public_event: {
        Args: {
          p_content_status: string
          p_is_active: boolean
          p_is_loop_x: boolean
        }
        Returns: boolean
      }
      check_signup_email_available: {
        Args: { p_email: string }
        Returns: string
      }
      check_admin_invite_activation_eligibility: {
        Args: { p_email: string }
        Returns: string
      }
      claim_home_poll_votes: { Args: { p_phone_id: string }; Returns: number }
      count_my_partner_validation_metrics: {
        Args: { p_since?: string }
        Returns: Json
      }
      ensure_partner_staff: { Args: { p_user_id: string }; Returns: string }
      ensure_partner_validation_code: {
        Args: {
          p_establishment_id?: string
          p_partner_key: string
          p_partner_name: string
          p_user_id?: string
        }
        Returns: {
          partner_key: string
          partner_name: string
          validation_code: string
        }[]
      }
      ensure_user_profile: {
        Args: {
          p_first_name?: string
          p_last_name?: string
          p_phone?: string
          p_qr_token?: string
          p_user_role?: string
        }
        Returns: undefined
      }
      establishment_is_readable: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      event_is_readable: { Args: { p_event_id: string }; Returns: boolean }
      expire_due_pass_grants: { Args: { p_limit?: number }; Returns: Json }
      expire_due_pass_grants_internal: {
        Args: { p_limit?: number }
        Returns: Json
      }
      extract_category_slugs: {
        Args: { p_fallback: string; p_payload: Json; p_single_key: string }
        Returns: string[]
      }
      fetch_member_benefit_grants_public: {
        Args: { p_user_id: string }
        Returns: {
          activated_at: string | null
          catalog_id: string | null
          catalog_local_id: string | null
          created_at: string
          description: string
          expires_at: string
          grant_audience: string
          grant_city: string | null
          grant_country_code: string | null
          granted_at: string
          granted_by: string | null
          id: string
          local_id: string | null
          partner_name: string | null
          role_entitlement: string | null
          scheduled_at: string | null
          status: string
          title: string
          used_at: string | null
          user_id: string
          validity_days: number | null
          validity_starts_on_activation: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "prime_benefit_grants"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      find_partner_by_validation_code: {
        Args: { p_code: string }
        Returns: {
          partner_key: string
          partner_name: string
          validation_code: string
        }[]
      }
      find_pending_admin_invite_by_email: {
        Args: { p_email: string }
        Returns: Json
      }
      format_guinea_location_label: {
        Args: { p_commune: string; p_district?: string }
        Returns: string
      }
      fulfill_djomy_pass_payment: {
        Args: {
          p_amount_gnf: number
          p_billing_period: string
          p_djomy_transaction_id: string
          p_expires_at: string
          p_label: string
          p_local_pass_id: string
          p_merchant_reference: string
          p_paid_at: string
          p_pass_catalog_id: string
          p_payment_method: string
          p_promote_prime: boolean
          p_scheduled_start_at: string
          p_started_at: string
          p_status: string
          p_user_id: string
        }
        Returns: string
      }
      get_admin_default_permissions: { Args: never; Returns: string[] }
      get_home_poll_results: {
        Args: { p_phone_id?: string; p_poll_id: string }
        Returns: Json
      }
      get_my_admin_permissions: { Args: never; Returns: string[] }
      get_my_user_role: { Args: never; Returns: string }
      get_public_catalog_fingerprint: { Args: never; Returns: string }
      get_user_admin_permissions: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      increment_chronique_click: {
        Args: { p_chronique_id: string }
        Returns: undefined
      }
      increment_creator_corner_click: {
        Args: { p_corner_id: string }
        Returns: undefined
      }
      increment_event_click: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      increment_home_poll_view: {
        Args: { p_poll_id: string }
        Returns: undefined
      }
      increment_spot_click: {
        Args: { p_establishment_id: string }
        Returns: undefined
      }
      increment_walk_click: { Args: { p_walk_id: string }; Returns: undefined }
      infer_country_code_from_phone: {
        Args: { p_phone: string }
        Returns: string
      }
      insert_user_notifications: { Args: { p_rows: Json }; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_admin_user: { Args: { p_user_id?: string }; Returns: boolean }
      is_partner_user: { Args: never; Returns: boolean }
      is_prime_member: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      list_admin_partner_benefit_offers: {
        Args: { p_country_code?: string }
        Returns: Json
      }
      list_member_pending_benefit_redemptions: {
        Args: { p_member_user_id: string }
        Returns: {
          benefit_description: string
          benefit_id: string
          benefit_title: string
          content_id: string
          content_title: string
          content_type: string
          expires_at: string
          partner_code: string
          partner_key: string
          partner_name: string
          redemption_local_id: string
        }[]
      }
      list_my_partner_active_benefits: { Args: never; Returns: Json }
      list_my_partner_benefit_offers: { Args: never; Returns: Json }
      list_my_partner_published_content_ids: { Args: never; Returns: Json }
      list_notifications_for_phone: {
        Args: { p_phone: string }
        Returns: {
          audience: string
          campaign_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          recipient_phone: string | null
          sent_at: string
          title: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_partner_pending_validations: {
        Args: { p_member_user_id: string; p_partner_code: string }
        Returns: {
          benefit_description: string
          benefit_id: string
          benefit_title: string
          content_id: string
          content_title: string
          content_type: string
          expires_at: string
          partner_code: string
          partner_key: string
          partner_name: string
          redemption_local_id: string
        }[]
      }
      list_partner_token_directory: {
        Args: never
        Returns: {
          partner_name: string
          user_id: string
        }[]
      }
      mark_admin_user_invite_activated: {
        Args: { p_email: string; p_invite_id: string }
        Returns: boolean
      }
      normalize_content_category_slugs: {
        Args: { p_fallback?: string; p_kind: string; p_slugs: string[] }
        Returns: string[]
      }
      notify_admins_for_partner_submission: {
        Args: {
          p_country_code?: string
          p_kind?: string
          p_local_id?: string
          p_message_override?: string
          p_notif_title?: string
          p_partner_name?: string
          p_title?: string
        }
        Returns: string[]
      }
      notify_admins_for_partnership_request: {
        Args: { p_email?: string; p_request_id?: string }
        Returns: string[]
      }
      notify_partner_user: {
        Args: {
          p_audience?: string
          p_local_id?: string
          p_message?: string
          p_partner_user_id?: string
          p_submission_kind?: string
          p_title?: string
        }
        Returns: string[]
      }
      notify_user: {
        Args: {
          p_audience?: string
          p_message: string
          p_recipient_phone?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      partner_listed_in_offering_partners: {
        Args: { p_offering_partners: Json; p_user_id?: string }
        Returns: boolean
      }
      partner_owns_content: {
        Args: { p_master_id: string; p_organizer_id?: string }
        Returns: boolean
      }
      partner_owns_master_id: {
        Args: { p_master_id: string }
        Returns: boolean
      }
      partner_respond_benefit_offer: {
        Args: {
          p_accept: boolean
          p_catalog_local_id?: string
          p_local_id: string
          p_note?: string
        }
        Returns: Json
      }
      partner_set_benefit_catalog_active: {
        Args: { p_is_active: boolean; p_local_id: string }
        Returns: boolean
      }
      pass_grant_never_expires: {
        Args: {
          p_amount_gnf: number
          p_frozen_pass_snapshot: Json
          p_granted_by: string
          p_label: string
          p_pass_catalog_id: string
          p_pass_kind: string
          p_payment_method: string
        }
        Returns: boolean
      }
      process_referrer_reward_for_referred: { Args: never; Returns: number }
      publish_partner_event_submission: {
        Args: { p_local_id: string }
        Returns: string
      }
      publish_partner_spot_submission: {
        Args: { p_local_id: string }
        Returns: string
      }
      recalculate_establishment_engagement: {
        Args: { p_establishment_id: string }
        Returns: undefined
      }
      recalculate_tool_engagement: {
        Args: { p_tool_id: string }
        Returns: undefined
      }
      recalculate_walk_engagement: {
        Args: { p_walk_id: string }
        Returns: undefined
      }
      reconcile_my_referral_rewards: { Args: never; Returns: number }
      record_partner_member_attribution: {
        Args: { p_partner_key: string; p_user_id: string }
        Returns: boolean
      }
      refresh_establishment_favorite_count: {
        Args: { p_establishment_id: string }
        Returns: undefined
      }
      refresh_establishment_rating_stats: {
        Args: { p_establishment_id: string }
        Returns: undefined
      }
      refresh_event_favorite_count: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      refresh_tool_favorite_count: {
        Args: { p_tool_id: string }
        Returns: undefined
      }
      refresh_tool_rating_stats: {
        Args: { p_tool_id: string }
        Returns: undefined
      }
      refresh_walk_favorite_count: {
        Args: { p_walk_id: string }
        Returns: undefined
      }
      refresh_walk_rating_stats: {
        Args: { p_walk_id: string }
        Returns: undefined
      }
      reject_partner_event_submission: {
        Args: { p_local_id: string; p_reason?: string }
        Returns: undefined
      }
      reject_partner_spot_submission: {
        Args: { p_local_id: string; p_reason?: string }
        Returns: undefined
      }
      request_benefit_redemption: {
        Args: {
          p_benefit_description?: string
          p_benefit_id: string
          p_benefit_title?: string
          p_content_id?: string
          p_content_title?: string
          p_content_type?: string
          p_expires_at: string
          p_grant_status?: string
          p_local_id: string
          p_partner_code: string
          p_partner_key: string
          p_partner_name: string
          p_user_id: string
        }
        Returns: string
      }
      resolve_guinea_location_from_payload: {
        Args: { p_payload: Json }
        Returns: number
      }
      resolve_guinea_location_id: {
        Args: { p_commune: string; p_district?: string }
        Returns: number
      }
      resolve_location_id: {
        Args: { p_city?: string; p_country?: string; p_neighborhood: string }
        Returns: number
      }
      resolve_partner_staff_user_id: {
        Args: { p_staff_id: string }
        Returns: string
      }
      resolve_partner_token_user_id: {
        Args: { p_token_id: string }
        Returns: string
      }
      resolve_spot_star_settings: {
        Args: { p_country_code: string }
        Returns: {
          click_weight: number
          favorite_weight: number
          rating_weight: number
          settings_id: string
        }[]
      }
      resolve_submission_neighborhood: {
        Args: {
          p_guinea_location_id?: number
          p_venue_address: string
          p_venue_location?: Json
        }
        Returns: string
      }
      score_to_star_count: {
        Args: { p_score: number; p_settings_id: string }
        Returns: number
      }
      set_admin_default_permissions: {
        Args: { p_permissions: string[] }
        Returns: Json
      }
      set_admin_permission_overrides: {
        Args: {
          p_grants: string[]
          p_revokes: string[]
          p_target_user_id: string
        }
        Returns: Json
      }
      submit_partnership_request: {
        Args: {
          p_admin_notes?: string
          p_country_code?: string
          p_email: string
          p_establishment_name: string
          p_manager_name: string
          p_phone: string
        }
        Returns: string
      }
      sync_benefit_catalog_on_content_owner_change: {
        Args: {
          p_content_id: string
          p_content_origin: string
          p_owner_user_id: string
          p_partner_name: string
        }
        Returns: number
      }
      sync_event_speakers: {
        Args: { p_event_id: string; p_speakers: Json }
        Returns: undefined
      }
      sync_event_speakers_core: {
        Args: { p_event_id: string; p_speakers: Json }
        Returns: undefined
      }
      sync_my_pass_role: { Args: { p_desired?: string }; Returns: string }
      tool_is_readable: { Args: { p_tool_id: string }; Returns: boolean }
      upsert_benefit_home_partner_logos: {
        Args: { p_country_code?: string; p_logos: Json }
        Returns: number
      }
      upsert_establishment_rating: {
        Args: { p_establishment_id: string; p_rating: number }
        Returns: Json
      }
      upsert_partner_event_submission: {
        Args: {
          p_local_id: string
          p_master_user_id: string
          p_partner_name: string
          p_partner_user_id: string
          p_payload: Json
          p_status?: string
        }
        Returns: string
      }
      upsert_partner_spot_submission: {
        Args: {
          p_local_id: string
          p_partner_name: string
          p_partner_user_id: string
          p_payload: Json
          p_status?: string
        }
        Returns: string
      }
      upsert_prime_benefit_grant:
        | {
            Args: {
              p_description: string
              p_expires_at: string
              p_grant_audience: string
              p_grant_city?: string
              p_grant_country_code?: string
              p_granted_at: string
              p_local_id: string
              p_partner_name: string
              p_status: string
              p_title: string
              p_used_at: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_catalog_local_id?: string
              p_description: string
              p_expires_at: string
              p_grant_audience: string
              p_grant_city?: string
              p_grant_country_code?: string
              p_granted_at: string
              p_local_id: string
              p_partner_name: string
              p_role_entitlement?: string
              p_status: string
              p_title: string
              p_used_at: string
              p_user_id: string
            }
            Returns: string
          }
      upsert_tool_rating: {
        Args: { p_rating: number; p_tool_id: string }
        Returns: Json
      }
      upsert_user_pass_grant_admin: {
        Args: {
          p_amount_gnf?: number
          p_billing_period?: string
          p_expires_at?: string
          p_frozen_pass_snapshot?: Json
          p_grant_note?: string
          p_granted_by?: string
          p_label: string
          p_local_id?: string
          p_paid_at?: string
          p_pass_catalog_id: string
          p_pass_kind?: string
          p_payment_method?: string
          p_role_freeze_intermediate_id?: string
          p_scheduled_start_at?: string
          p_started_at?: string
          p_status?: string
          p_user_id: string
        }
        Returns: string
      }
      upsert_user_pass_purchase: {
        Args: {
          p_amount_gnf?: number
          p_billing_period?: string
          p_expires_at?: string
          p_label: string
          p_local_id?: string
          p_paid_at?: string
          p_pass_catalog_id: string
          p_pass_kind?: string
          p_payment_method?: string
          p_scheduled_start_at?: string
          p_started_at?: string
          p_status?: string
          p_user_id: string
        }
        Returns: string
      }
      upsert_walk_rating: {
        Args: { p_rating: number; p_walk_id: string }
        Returns: Json
      }
      validate_partner_spot_token: {
        Args: { p_code: string }
        Returns: {
          company: string
          expires_at: string
          first_name: string
          last_name: string
          linked_email: string
          partner_name: string
          phone_number: string
          token_id: string
          user_id: string
        }[]
      }
      verify_member_qr_partner: { Args: { p_payload: string }; Returns: Json }
      verify_member_qr_payload: { Args: { p_payload: string }; Returns: Json }
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
  public: {
    Enums: {},
  },
} as const
