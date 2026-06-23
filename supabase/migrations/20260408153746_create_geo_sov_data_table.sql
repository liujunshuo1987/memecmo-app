/*
  # Create GEO Share of Voice Data Table

  1. New Tables
    - `geo_sov_data`
      - `id` (bigint, primary key, auto-increment)
      - `brand_name` (text) - target brand being tracked
      - `ai_model` (text) - which AI model was queried (e.g. GPT-4, Claude, Gemini)
      - `question_asked` (text) - the test question sent to the model
      - `mention_rate` (numeric) - percentage 0-100 representing brand mention likelihood
      - `sentiment` (text) - positive / neutral / negative
      - `intelligence_summary` (text) - brief AI-generated insight
      - `alert_level` (text) - low / medium / high / critical
      - `created_at` (timestamptz) - insertion timestamp

  2. Security
    - Enable RLS on `geo_sov_data` table
    - Add policy for authenticated users to insert their own data
    - Add policy for authenticated users to read their own data

  3. Notes
    - Used by the /geo-dashboard matrix engine for AEO/GEO testing
    - Each row represents one model response for one question
*/

CREATE TABLE IF NOT EXISTS geo_sov_data (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid DEFAULT auth.uid(),
  brand_name text NOT NULL DEFAULT '',
  ai_model text NOT NULL DEFAULT '',
  question_asked text NOT NULL DEFAULT '',
  mention_rate numeric NOT NULL DEFAULT 0,
  sentiment text NOT NULL DEFAULT 'neutral',
  intelligence_summary text NOT NULL DEFAULT '',
  alert_level text NOT NULL DEFAULT 'low',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE geo_sov_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own sov data"
  ON geo_sov_data
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own sov data"
  ON geo_sov_data
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
