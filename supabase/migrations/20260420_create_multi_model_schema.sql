-- Multi-Model LLM Analysis Schema
-- Created: 2026-04-20
-- Purpose: Store and analyze multi-model LLM query results and GEO insights

-- ============================================================================
-- Table: multi_model_queries_v2
-- Stores user question sets, model selections, and query results
-- ============================================================================
CREATE TABLE IF NOT EXISTS multi_model_queries_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Input Configuration
  question_set JSONB NOT NULL,     -- Array of questions: ["Q1", "Q2", ...]
  brand_name TEXT NOT NULL,
  competitor_names TEXT[],
  models TEXT[] NOT NULL,           -- Selected models: ['gpt-4', 'claude-opus', ...]
  region TEXT,
  language TEXT DEFAULT 'en',

  -- Query Parameters
  priority TEXT DEFAULT 'quality' CHECK (priority IN ('speed', 'quality', 'cost')),
  cache_key TEXT,                   -- Optional cache lookup key

  -- Status Tracking
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'partial', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Results Summary (for quick access)
  brand_mention_count INT,
  avg_mention_rate NUMERIC(5, 2),
  consensus_score NUMERIC(5, 2),

  -- Full Response Storage
  raw_responses JSONB,              -- Original model responses
  aggregation_result JSONB,         -- Consensus and divergence analysis
  geo_insights JSONB,               -- Generated GEO recommendations

  -- Metadata
  total_cost_cents INT,             -- Total API cost for this query
  processing_duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_mmq_user_created ON multi_model_queries_v2(user_id, created_at DESC);
CREATE INDEX idx_mmq_brand ON multi_model_queries_v2(brand_name);
CREATE INDEX idx_mmq_status ON multi_model_queries_v2(status);
CREATE INDEX idx_mmq_cache_key ON multi_model_queries_v2(cache_key) WHERE cache_key IS NOT NULL;

-- RLS Policy: Users can only see their own queries
ALTER TABLE multi_model_queries_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own queries" ON multi_model_queries_v2
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create queries" ON multi_model_queries_v2
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queries" ON multi_model_queries_v2
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Table: query_aggregations
-- Stores aggregated analysis results (consensus, divergence, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS query_aggregations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES multi_model_queries_v2(id) ON DELETE CASCADE,

  -- Consensus Metrics
  overall_consensus NUMERIC(5, 2),        -- 0-100: agreement level across models
  brand_perception_consensus NUMERIC(5, 2), -- Brand positioning agreement
  information_completeness JSONB,         -- Per-model completeness scores

  -- Brand Perceptions by Model
  brand_perceptions JSONB,                -- Detailed positioning by model
  shared_perceptions TEXT[],              -- Common findings across models
  divergent_perceptions JSONB,            -- Areas of disagreement

  -- GEO-Relevant Findings
  citation_likelihood JSONB,              -- Probability of brand mention per model
  knowledge_gaps TEXT[],                  -- Identified misconceptions/gaps
  content_preferences JSONB,              -- What each model prefers to cite

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_aggregations_query ON query_aggregations(query_id);

ALTER TABLE query_aggregations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aggregations inherit query permissions" ON query_aggregations
  FOR SELECT
  USING (
    query_id IN (
      SELECT id FROM multi_model_queries_v2
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Table: generated_insights
-- Stores GEO strategy recommendations and insights
-- ============================================================================
CREATE TABLE IF NOT EXISTS generated_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES multi_model_queries_v2(id) ON DELETE CASCADE,
  aggregation_id UUID REFERENCES query_aggregations(id) ON DELETE SET NULL,

  -- Structured Insights
  executive_summary TEXT,
  geo_optimization_strategy JSONB,       -- Overall strategy and priority
  model_specific_recommendations JSONB,  -- Per-model optimization guidance
  content_strategies JSONB,              -- Actionable content strategies
  recommended_content_structure JSONB,   -- How to restructure brand info
  cognitive_gap_repair JSONB,            -- Fix misconceptions per model

  -- Generation Metadata
  generated_by_model TEXT,               -- Which LLM generated (usually Claude)
  confidence_score NUMERIC(5, 2),

  -- Timestamps
  generation_timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_insights_query ON generated_insights(query_id);

ALTER TABLE generated_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insights inherit query permissions" ON generated_insights
  FOR SELECT
  USING (
    query_id IN (
      SELECT id FROM multi_model_queries_v2
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Table: geo_analysis_cache
-- Caches aggregation and insight results for rapid retrieval
-- ============================================================================
CREATE TABLE IF NOT EXISTS geo_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache Key (deterministic hash of query parameters)
  query_hash VARCHAR(64) UNIQUE NOT NULL,
  question_set_hash VARCHAR(64),
  model_set VARCHAR(100),  -- Sorted, comma-separated model names

  -- Cached Results
  aggregation_result JSONB,
  geo_insights JSONB,

  -- Cache Lifecycle
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',
  hit_count INT DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cache_hash ON geo_analysis_cache(query_hash);
CREATE INDEX idx_cache_expires ON geo_analysis_cache(expires_at);
CREATE INDEX idx_cache_hits ON geo_analysis_cache(hit_count DESC);

-- ============================================================================
-- Table: extended geo_sov_data (if not already exists)
-- Enhance existing table with multi-model tracking
-- ============================================================================
-- This assumes geo_sov_data table exists from previous migrations
-- We add columns to link individual SOV data to multi-model queries

ALTER TABLE geo_sov_data
ADD COLUMN IF NOT EXISTS source_query_id UUID REFERENCES multi_model_queries_v2(id),
ADD COLUMN IF NOT EXISTS model_agreement_score NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS is_consensus_finding BOOLEAN DEFAULT FALSE;

-- Indexes for consensus queries
CREATE INDEX IF NOT EXISTS idx_geo_sov_consensus ON geo_sov_data(is_consensus_finding, user_id);
CREATE INDEX IF NOT EXISTS idx_geo_sov_query ON geo_sov_data(source_query_id) WHERE source_query_id IS NOT NULL;

-- ============================================================================
-- Table: model_performance_metrics (Optional for future)
-- Tracks accuracy and performance of each model over time
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  model_name TEXT NOT NULL,
  query_id UUID REFERENCES multi_model_queries_v2(id),

  -- Quality Metrics
  response_quality_score NUMERIC(5, 2),
  accuracy_score NUMERIC(5, 2),
  relevance_score NUMERIC(5, 2),
  unique_insights_count INT,

  -- Performance Metrics
  response_time_ms INT,
  token_usage INT,
  cost_cents INT,

  -- Engagement
  user_feedback JSONB,              -- User rating/comments

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_model_perf_user ON model_performance_metrics(user_id);
CREATE INDEX idx_model_perf_model ON model_performance_metrics(model_name);
CREATE INDEX idx_model_perf_created ON model_performance_metrics(created_at DESC);

ALTER TABLE model_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own metrics" ON model_performance_metrics
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- Stored Procedures (Future Enhancement)
-- ============================================================================

-- Cleanup expired cache entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM geo_analysis_cache
  WHERE expires_at < now();

  RAISE NOTICE 'Cleaned up expired cache entries';
END;
$$ LANGUAGE plpgsql;

-- Reset daily cost tracking for users
CREATE OR REPLACE FUNCTION reset_daily_cost_tracking()
RETURNS void AS $$
BEGIN
  -- This could be called daily to reset daily cost tracking
  -- Implementation depends on how you track daily costs
  RAISE NOTICE 'Daily cost tracking reset';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Permissions
-- ============================================================================

-- Ensure public cannot access these tables
REVOKE ALL ON multi_model_queries_v2 FROM public;
REVOKE ALL ON query_aggregations FROM public;
REVOKE ALL ON generated_insights FROM public;
REVOKE ALL ON geo_analysis_cache FROM public;
REVOKE ALL ON model_performance_metrics FROM public;

-- Grant appropriate permissions to authenticated users (via RLS)
GRANT SELECT, INSERT, UPDATE ON multi_model_queries_v2 TO authenticated;
GRANT SELECT ON query_aggregations TO authenticated;
GRANT SELECT ON generated_insights TO authenticated;
GRANT SELECT ON geo_analysis_cache TO authenticated;
GRANT SELECT, INSERT ON model_performance_metrics TO authenticated;
