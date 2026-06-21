// Auto-generiert via Supabase MCP, regenerate mit
//   pnpm exec supabase gen types typescript --project-id <id>
// (oder über die MCP-Tools).

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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          body: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published: boolean
          published_at: string | null
          read_minutes: number | null
          slug: string
          spotlight_listing_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          read_minutes?: number | null
          slug: string
          spotlight_listing_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          read_minutes?: number | null
          slug?: string
          spotlight_listing_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_spotlight_listing_id_fkey"
            columns: ["spotlight_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_clicks: {
        Row: {
          clicked_at: string
          country: string | null
          id: number
          ip_hash: string | null
          listing_id: string
          referrer: string | null
        }
        Insert: {
          clicked_at?: string
          country?: string | null
          id?: never
          ip_hash?: string | null
          listing_id: string
          referrer?: string | null
        }
        Update: {
          clicked_at?: string
          country?: string | null
          id?: never
          ip_hash?: string | null
          listing_id?: string
          referrer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_clicks_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_views: {
        Row: {
          ip_hash: string
          last_viewed_at: string
          listing_id: string
        }
        Insert: {
          ip_hash: string
          last_viewed_at?: string
          listing_id: string
        }
        Update: {
          ip_hash?: string
          last_viewed_at?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_views_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          accent_color: string | null
          approved_at: string | null
          badge_missing_since: string | null
          badge_verified: boolean
          badge_verified_at: string | null
          badge_verified_since: string | null
          category: string
          content_blocks: Json | null
          country: string
          created_at: string
          demo_url: string | null
          docs_url: string | null
          features: string[] | null
          founded_year: number | null
          gallery_urls: string[] | null
          hero_url: string | null
          id: string
          ideal_for: string | null
          integrations: string | null
          last_badge_check_at: string | null
          logo_url: string | null
          long_description: string | null
          mcp: boolean
          name: string
          not_for: string | null
          owner_id: string
          pricing_detail: string | null
          pricing_model: string | null
          published_at: string | null
          short_description: string
          slug: string
          status: string
          tags: string[]
          team_size: string | null
          updated_at: string
          url: string
          use_cases: string | null
          view_count: number
        }
        Insert: {
          accent_color?: string | null
          approved_at?: string | null
          badge_missing_since?: string | null
          badge_verified?: boolean
          badge_verified_at?: string | null
          badge_verified_since?: string | null
          category: string
          content_blocks?: Json | null
          country: string
          created_at?: string
          demo_url?: string | null
          docs_url?: string | null
          features?: string[] | null
          founded_year?: number | null
          gallery_urls?: string[] | null
          hero_url?: string | null
          id?: string
          ideal_for?: string | null
          integrations?: string | null
          last_badge_check_at?: string | null
          logo_url?: string | null
          long_description?: string | null
          mcp: boolean
          name: string
          not_for?: string | null
          owner_id: string
          pricing_detail?: string | null
          pricing_model?: string | null
          published_at?: string | null
          short_description: string
          slug: string
          status?: string
          tags?: string[]
          team_size?: string | null
          updated_at?: string
          url: string
          use_cases?: string | null
          view_count?: number
        }
        Update: {
          accent_color?: string | null
          approved_at?: string | null
          badge_missing_since?: string | null
          badge_verified?: boolean
          badge_verified_at?: string | null
          badge_verified_since?: string | null
          category?: string
          content_blocks?: Json | null
          country?: string
          created_at?: string
          demo_url?: string | null
          docs_url?: string | null
          features?: string[] | null
          founded_year?: number | null
          gallery_urls?: string[] | null
          hero_url?: string | null
          id?: string
          ideal_for?: string | null
          integrations?: string | null
          last_badge_check_at?: string | null
          logo_url?: string | null
          long_description?: string | null
          mcp?: boolean
          name?: string
          not_for?: string | null
          owner_id?: string
          pricing_detail?: string | null
          pricing_model?: string | null
          published_at?: string | null
          short_description?: string
          slug?: string
          status?: string
          tags?: string[]
          team_size?: string | null
          updated_at?: string
          url?: string
          use_cases?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "listings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          display_name: string | null
          email: string
          github_url: string | null
          id: string
          instagram_url: string | null
          is_admin: boolean
          is_curator: boolean
          is_public: boolean
          language: string
          last_active_at: string | null
          linkedin_url: string | null
          name: string | null
          newsletter_subscribed: boolean
          newsletter_subscribed_at: string | null
          other_url: string | null
          slug: string | null
          streak_days: number
          twitter_url: string | null
          updated_at: string
          website_url: string | null
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          github_url?: string | null
          id: string
          instagram_url?: string | null
          is_admin?: boolean
          is_curator?: boolean
          is_public?: boolean
          language?: string
          last_active_at?: string | null
          linkedin_url?: string | null
          name?: string | null
          newsletter_subscribed?: boolean
          newsletter_subscribed_at?: string | null
          other_url?: string | null
          slug?: string | null
          streak_days?: number
          twitter_url?: string | null
          updated_at?: string
          website_url?: string | null
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          github_url?: string | null
          id?: string
          instagram_url?: string | null
          is_admin?: boolean
          is_curator?: boolean
          is_public?: boolean
          language?: string
          last_active_at?: string | null
          linkedin_url?: string | null
          name?: string | null
          newsletter_subscribed?: boolean
          newsletter_subscribed_at?: string | null
          other_url?: string | null
          slug?: string | null
          streak_days?: number
          twitter_url?: string | null
          updated_at?: string
          website_url?: string | null
          xp?: number
        }
        Relationships: []
      }
      releases: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          published: boolean
          published_at: string | null
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "releases_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          listing_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          listing_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      stack_items: {
        Row: {
          note: string | null
          position: number
          stack_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          note?: string | null
          position?: number
          stack_id: string
          target_id: string
          target_type: string
        }
        Update: {
          note?: string | null
          position?: number
          stack_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stack_items_stack_id_fkey"
            columns: ["stack_id"]
            isOneToOne: false
            referencedRelation: "stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      stacks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_curated: boolean
          is_published: boolean
          name: string
          owner_id: string
          posted_to_feed: boolean
          published_at: string | null
          short_id: string
          slug: string
          updated_at: string
          view_count: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_curated?: boolean
          is_published?: boolean
          name: string
          owner_id: string
          posted_to_feed?: boolean
          published_at?: string | null
          short_id: string
          slug: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_curated?: boolean
          is_published?: boolean
          name?: string
          owner_id?: string
          posted_to_feed?: boolean
          published_at?: string | null
          short_id?: string
          slug?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "stacks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string | null
          resolved: boolean
          subject: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          email: string
          id?: string
          message: string
          name?: string | null
          resolved?: boolean
          subject: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string | null
          resolved?: boolean
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_requests: {
        Row: {
          content: string
          created_at: string
          id: string
          requested_by: string
          status: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          requested_by: string
          status?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          requested_by?: string
          status?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          category: string
          created_at: string
          description: string
          homepage_url: string | null
          id: string
          logo_url: string | null
          name: string
          popularity: number
          slug: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          homepage_url?: string | null
          id?: string
          logo_url?: string | null
          name: string
          popularity?: number
          slug: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          homepage_url?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          popularity?: number
          slug?: string
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          action: string
          created_at: string
          id: number
          points: number
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          points: number
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_xp: {
        Args: { p_action: string; p_points: number; p_user_id: string }
        Returns: undefined
      }
      community_stats: {
        Args: { p_since?: string }
        Returns: {
          listings_count: number
          views_count: number
        }[]
      }
      get_owner_click_stats: {
        Args: never
        Returns: {
          all_time: number
          last_30d: number
          last_7d: number
          listing_id: string
          listing_name: string
          listing_slug: string
          today: number
        }[]
      }
      get_user_badge_data: {
        Args: { p_user_id: string }
        Returns: {
          comments_count: number
          founder_rank: number
          likes_given: number
          listings_count: number
          posts_count: number
          reviews_count: number
          stacks_count: number
          streak_days: number
        }[]
      }
      inc_listing_view: {
        Args: { p_ip_hash: string; p_listing_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      likes_count_for: {
        Args: { p_target_ids: string[]; p_target_type: string }
        Returns: {
          n: number
          target_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      top_listings_by_likes: {
        Args: { p_limit?: number }
        Returns: {
          category: string
          country: string
          id: string
          like_count: number
          logo_url: string
          mcp: boolean
          name: string
          short_description: string
          slug: string
          view_count: number
        }[]
      }
      top_listings_by_likes_window: {
        Args: { p_limit?: number; p_since?: string }
        Returns: {
          id: string
          like_count: number
          logo_url: string
          name: string
          slug: string
        }[]
      }
      top_makers_by_likes: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          listing_count: number
          name: string
          slug: string
          total_likes: number
          xp: number
        }[]
      }
      top_users_by_xp_window: {
        Args: { p_limit?: number; p_since?: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          name: string
          slug: string
          xp_total: number
        }[]
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
    Enums: {},
  },
} as const
