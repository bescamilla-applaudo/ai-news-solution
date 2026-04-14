// Auto-generated types from Supabase schema.
// Run: supabase gen types typescript --linked > lib/database.types.ts
// to regenerate after schema changes.

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
      news_items: {
        Row: {
          id: string
          source_url: string
          source_name: string
          title: string
          raw_content: string | null
          technical_summary: string | null
          impact_score: number | null
          depth_score: number | null
          implementation_steps: ImplementationStep[] | null
          affected_workflows: string[] | null
          embedding: number[] | null
          category: string | null
          tags: string[] | null
          published_at: string | null
          ingested_at: string
          is_filtered: boolean
        }
        Insert: {
          id?: string
          source_url: string
          source_name: string
          title: string
          raw_content?: string | null
          technical_summary?: string | null
          impact_score?: number | null
          depth_score?: number | null
          implementation_steps?: ImplementationStep[] | null
          affected_workflows?: string[] | null
          embedding?: number[] | null
          category?: string | null
          tags?: string[] | null
          published_at?: string | null
          ingested_at?: string
          is_filtered: boolean
        }
        Update: {
          id?: string
          source_url?: string
          source_name?: string
          title?: string
          raw_content?: string | null
          technical_summary?: string | null
          impact_score?: number | null
          depth_score?: number | null
          implementation_steps?: ImplementationStep[] | null
          affected_workflows?: string[] | null
          embedding?: number[] | null
          category?: string | null
          tags?: string[] | null
          published_at?: string | null
          ingested_at?: string
          is_filtered?: boolean
        }
        Relationships: []
      }
      tech_tags: {
        Row: {
          id: string
          name: string
          category: string
        }
        Insert: {
          id?: string
          name: string
          category: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
        }
        Relationships: []
      }
      news_item_tags: {
        Row: {
          news_item_id: string
          tech_tag_id: string
        }
        Insert: {
          news_item_id: string
          tech_tag_id: string
        }
        Update: {
          news_item_id?: string
          tech_tag_id?: string
        }
        Relationships: []
      }
      user_watchlist: {
        Row: {
          user_id: string
          tech_tag_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          tech_tag_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          tech_tag_id?: string
          created_at?: string
        }
        Relationships: []
      }
      email_subscriptions: {
        Row: {
          user_id: string
          email: string
          active: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          email: string
          active?: boolean
          created_at?: string
        }
        Update: {
          user_id?: string
          email?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      llm_usage_log: {
        Row: {
          id: string
          timestamp: string
          model: string
          input_tokens: number | null
          output_tokens: number | null
          job_id: string | null
        }
        Insert: {
          id?: string
          timestamp?: string
          model: string
          input_tokens?: number | null
          output_tokens?: number | null
          job_id?: string | null
        }
        Update: {
          id?: string
          timestamp?: string
          model?: string
          input_tokens?: number | null
          output_tokens?: number | null
          job_id?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export interface ImplementationStep {
  step: number
  description: string
  code: string | null
  link: string | null
}

// Convenience aliases
export type NewsItem = Database['public']['Tables']['news_items']['Row']
export type NewsItemInsert = Database['public']['Tables']['news_items']['Insert']
export type TechTag = Database['public']['Tables']['tech_tags']['Row']
export type NewsItemTag = Database['public']['Tables']['news_item_tags']['Row']
export type UserWatchlist = Database['public']['Tables']['user_watchlist']['Row']
export type EmailSubscription = Database['public']['Tables']['email_subscriptions']['Row']
export type LlmUsageLog = Database['public']['Tables']['llm_usage_log']['Row']

// Enriched type returned by /api/news and /api/article/[id]
export interface NewsItemWithTags extends NewsItem {
  news_item_tags: Array<{
    tech_tags: TechTag
  }>
}
