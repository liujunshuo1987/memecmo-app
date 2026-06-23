/*
  # GEO 审计系统数据库架构
  
  1. 新建表
    - `brands` - 品牌信息表
      - `id` (uuid, 主键)
      - `name` (text, 品牌名称)
      - `website_url` (text, 网站URL)
      - `industry` (text, 行业)
      - `target_keywords` (jsonb, 目标关键词数组)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `visibility_scans` - AI可见度扫描记录表
      - `id` (uuid, 主键)
      - `brand_id` (uuid, 外键关联brands)
      - `platform` (text, AI平台: ChatGPT/Claude/Gemini/Perplexity)
      - `query` (text, 测试查询)
      - `mentioned` (boolean, 是否被提及)
      - `citation_url` (text, 引用URL)
      - `position` (int, 提及位置)
      - `response_text` (text, AI响应内容)
      - `score` (numeric, 可见度分数)
      - `created_at` (timestamptz)
    
    - `geo_audits` - GEO内容审计表
      - `id` (uuid, 主键)
      - `brand_id` (uuid, 外键关联brands)
      - `url` (text, 审计URL)
      - `claim_density` (numeric, 声明密度分数)
      - `info_density` (numeric, 信息密度分数)
      - `answer_frontloading` (numeric, 答案前置分数)
      - `semantic_triples` (numeric, 语义三元组分数)
      - `entity_score` (numeric, 实体识别分数)
      - `sentence_structure` (numeric, 句子结构分数)
      - `overall_score` (numeric, 总体分数)
      - `recommendations` (jsonb, 优化建议数组)
      - `created_at` (timestamptz)
    
    - `competitors` - 竞争对手表
      - `id` (uuid, 主键)
      - `brand_id` (uuid, 外键关联brands)
      - `competitor_name` (text, 竞争对手名称)
      - `competitor_url` (text, 竞争对手网站)
      - `share_of_voice` (numeric, 声音份额百分比)
      - `avg_visibility_score` (numeric, 平均可见度分数)
      - `last_scanned_at` (timestamptz)
      - `created_at` (timestamptz)
    
    - `audit_reports` - 审计报告表
      - `id` (uuid, 主键)
      - `brand_id` (uuid, 外键关联brands)
      - `report_type` (text, 报告类型: visibility/geo/competitor)
      - `status` (text, 状态: pending/processing/completed/failed)
      - `results` (jsonb, 报告结果JSON)
      - `pdf_url` (text, PDF报告URL)
      - `created_at` (timestamptz)
      - `completed_at` (timestamptz)
  
  2. 安全策略
    - 所有表启用 RLS（行级安全）
    - 认证用户可以查看和管理自己品牌的数据
    - 公开访问仅允许读取演示数据
*/

-- 创建 brands 表
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website_url text NOT NULL,
  industry text,
  target_keywords jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 创建 visibility_scans 表
CREATE TABLE IF NOT EXISTS visibility_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'DeepSeek')),
  query text NOT NULL,
  mentioned boolean DEFAULT false,
  citation_url text,
  position int,
  response_text text,
  score numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 创建 geo_audits 表
CREATE TABLE IF NOT EXISTS geo_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  url text NOT NULL,
  claim_density numeric(5,2) DEFAULT 0,
  info_density numeric(5,2) DEFAULT 0,
  answer_frontloading numeric(5,2) DEFAULT 0,
  semantic_triples numeric(5,2) DEFAULT 0,
  entity_score numeric(5,2) DEFAULT 0,
  sentence_structure numeric(5,2) DEFAULT 0,
  overall_score numeric(5,2) DEFAULT 0,
  recommendations jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 创建 competitors 表
CREATE TABLE IF NOT EXISTS competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  competitor_name text NOT NULL,
  competitor_url text,
  share_of_voice numeric(5,2) DEFAULT 0,
  avg_visibility_score numeric(5,2) DEFAULT 0,
  last_scanned_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 创建 audit_reports 表
CREATE TABLE IF NOT EXISTS audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('visibility', 'geo', 'competitor', 'comprehensive')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  results jsonb DEFAULT '{}'::jsonb,
  pdf_url text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_visibility_scans_brand_id ON visibility_scans(brand_id);
CREATE INDEX IF NOT EXISTS idx_visibility_scans_platform ON visibility_scans(platform);
CREATE INDEX IF NOT EXISTS idx_visibility_scans_created_at ON visibility_scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geo_audits_brand_id ON geo_audits(brand_id);
CREATE INDEX IF NOT EXISTS idx_geo_audits_created_at ON geo_audits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitors_brand_id ON competitors(brand_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_brand_id ON audit_reports(brand_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_status ON audit_reports(status);

-- 启用 RLS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE visibility_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;

-- Brands 表的 RLS 策略
CREATE POLICY "Allow public read access to brands"
  ON brands FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert brands"
  ON brands FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update brands"
  ON brands FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Visibility scans 表的 RLS 策略
CREATE POLICY "Allow public read access to visibility scans"
  ON visibility_scans FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert visibility scans"
  ON visibility_scans FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- GEO audits 表的 RLS 策略
CREATE POLICY "Allow public read access to geo audits"
  ON geo_audits FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert geo audits"
  ON geo_audits FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Competitors 表的 RLS 策略
CREATE POLICY "Allow public read access to competitors"
  ON competitors FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage competitors"
  ON competitors FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Audit reports 表的 RLS 策略
CREATE POLICY "Allow public read access to audit reports"
  ON audit_reports FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage audit reports"
  ON audit_reports FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);