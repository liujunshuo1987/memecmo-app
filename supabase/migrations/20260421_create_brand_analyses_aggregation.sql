-- Brand Analyses Aggregation Table
-- 中央聚合表，链接所有分析结果
-- 用于统一的Answer Dashboard和GEO洞察引擎

-- 主聚合表
CREATE TABLE IF NOT EXISTS brand_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  -- 基本信息
  analysis_name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'completed', 'partial', 'failed')),

  -- 关联分析结果（外键关系）
  brand_intelligence_id UUID REFERENCES brand_intelligence_records(id) ON DELETE SET NULL,
  multi_model_query_id UUID REFERENCES multi_model_queries_v2(id) ON DELETE SET NULL,

  -- 综合分析结果（聚合存储）
  analysis_metadata JSONB,  -- {questions: [], models: [], strategies: []}
  consensus_result JSONB,   -- 共识分析结果
  geo_insights JSONB,       -- GEO优化建议
  market_intelligence JSONB, -- 市场情报（来自Sea Intelligence）
  content_optimization JSONB, -- 内容优化建议
  competitor_analysis JSONB, -- 竞争分析

  -- 快速指标（用于Dashboard显示）
  consensus_score NUMERIC(5,2), -- 0-100
  brand_mention_rate NUMERIC(5,2), -- 品牌提及率
  overall_geo_score NUMERIC(5,2), -- 整体GEO评分

  -- 分析参数
  target_models TEXT[] DEFAULT ARRAY['gpt-4', 'claude-opus', 'gemini-pro']::TEXT[],
  target_markets TEXT[] DEFAULT ARRAY[]::TEXT[],
  language TEXT DEFAULT 'en',

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  analysis_started_at TIMESTAMPTZ,
  analysis_completed_at TIMESTAMPTZ
);

-- 关键索引
CREATE INDEX idx_ba_user_brand ON brand_analyses(user_id, brand_id);
CREATE INDEX idx_ba_user_created ON brand_analyses(user_id, created_at DESC);
CREATE INDEX idx_ba_brand_created ON brand_analyses(brand_id, created_at DESC);
CREATE INDEX idx_ba_status ON brand_analyses(status);
CREATE INDEX idx_ba_multi_model_query ON brand_analyses(multi_model_query_id) WHERE multi_model_query_id IS NOT NULL;
CREATE INDEX idx_ba_brand_intelligence ON brand_analyses(brand_intelligence_id) WHERE brand_intelligence_id IS NOT NULL;

-- RLS 策略
ALTER TABLE brand_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analyses" ON brand_analyses
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create analyses" ON brand_analyses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analyses" ON brand_analyses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 权限
REVOKE ALL ON brand_analyses FROM public;
GRANT SELECT, INSERT, UPDATE ON brand_analyses TO authenticated;

-- 审计历史表（可选，用于跟踪分析历史）
CREATE TABLE IF NOT EXISTS brand_analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES brand_analyses(id) ON DELETE CASCADE,

  -- 历史快照
  status TEXT,
  consensus_score NUMERIC(5,2),
  geo_insights JSONB,

  -- 时间
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bah_analysis ON brand_analysis_history(analysis_id);
CREATE INDEX idx_bah_created ON brand_analysis_history(created_at DESC);

-- RLS for history table
ALTER TABLE brand_analysis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analysis history" ON brand_analysis_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM brand_analyses
      WHERE brand_analyses.id = brand_analysis_history.analysis_id
      AND brand_analyses.user_id = auth.uid()
    )
  );

GRANT SELECT ON brand_analysis_history TO authenticated;
