-- Brand Intelligence Records Table
-- 存储自动生成的品牌分析问题和分析结果

CREATE TABLE IF NOT EXISTS brand_intelligence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Brand Information
  brand_name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  target_markets TEXT[],
  industry TEXT,
  language TEXT DEFAULT 'en',

  -- Generated Analysis
  analysis JSONB,                    -- 品牌定位、优势、目标受众等
  generated_questions JSONB,         -- 生成的GEO问题列表
  questions_by_category JSONB,       -- 按类别分组的问题
  executive_context TEXT,            -- 执行摘要

  -- Integration with Multi-Model Query
  multi_model_query_id UUID REFERENCES multi_model_queries_v2(id) ON DELETE SET NULL,

  -- Status and Tracking
  status TEXT DEFAULT 'ready-for-analysis' CHECK (status IN ('ready-for-analysis', 'auto-analyzing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_bir_user_created ON brand_intelligence_records(user_id, created_at DESC);
CREATE INDEX idx_bir_brand_name ON brand_intelligence_records(brand_name);
CREATE INDEX idx_bir_status ON brand_intelligence_records(status);
CREATE INDEX idx_bir_query_id ON brand_intelligence_records(multi_model_query_id) WHERE multi_model_query_id IS NOT NULL;

-- RLS Policy
ALTER TABLE brand_intelligence_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own intelligence" ON brand_intelligence_records
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create intelligence" ON brand_intelligence_records
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own intelligence" ON brand_intelligence_records
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Permissions
REVOKE ALL ON brand_intelligence_records FROM public;
GRANT SELECT, INSERT, UPDATE ON brand_intelligence_records TO authenticated;
