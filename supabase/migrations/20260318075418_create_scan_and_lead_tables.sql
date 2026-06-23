/*
  # Create Scan Submissions and Lead Contacts Tables

  ## Overview
  This migration creates the core database schema for collecting AI visibility scan data and user contact information.

  ## 1. New Tables
  
  ### `scan_submissions`
  Stores all AI visibility scan requests and their results
  - `id` (uuid, primary key) - Unique identifier for each scan
  - `brand_name` (text, not null) - The brand being scanned
  - `competitor_name` (text) - Optional competitor for comparison
  - `keywords` (text) - Search keywords used in the scan
  - `audit_results` (jsonb) - Complete audit results including AIGVR score, visibility metrics, etc.
  - `created_at` (timestamptz) - Timestamp of scan creation
  
  ### `lead_contacts`
  Stores user contact information linked to scan submissions
  - `id` (uuid, primary key) - Unique identifier for each lead
  - `scan_id` (uuid, foreign key) - References the related scan submission
  - `name` (text, not null) - User's name
  - `email` (text, not null) - User's email address
  - `company` (text) - Optional company name
  - `phone` (text) - Optional phone number
  - `message` (text) - Optional message from user
  - `status` (text) - Lead status (new, contacted, qualified, etc.)
  - `notified_at` (timestamptz) - When admin was notified about this lead
  - `created_at` (timestamptz) - Timestamp of contact submission

  ## 2. Security
  - Enable RLS on both tables
  - Public can insert (anonymous submissions allowed)
  - Only authenticated admins can read/update/delete

  ## 3. Indexes
  - Index on scan_submissions.created_at for efficient time-based queries
  - Index on lead_contacts.email for quick lookups
  - Index on lead_contacts.scan_id for join performance
*/

-- Create scan_submissions table
CREATE TABLE IF NOT EXISTS scan_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  competitor_name text,
  keywords text,
  audit_results jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create lead_contacts table
CREATE TABLE IF NOT EXISTS lead_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES scan_submissions(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  company text,
  phone text,
  message text,
  status text DEFAULT 'new',
  notified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scan_submissions_created_at ON scan_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_email ON lead_contacts(email);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_scan_id ON lead_contacts(scan_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_created_at ON lead_contacts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE scan_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_contacts ENABLE ROW LEVEL SECURITY;

-- Policies for scan_submissions
-- Allow anyone to insert scan data (for public form submissions)
CREATE POLICY "Anyone can insert scan submissions"
  ON scan_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users can view scan submissions (for future admin dashboard)
CREATE POLICY "Authenticated users can view scan submissions"
  ON scan_submissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Policies for lead_contacts
-- Allow anyone to insert lead contact data (for public form submissions)
CREATE POLICY "Anyone can insert lead contacts"
  ON lead_contacts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users can view lead contacts (for future admin dashboard)
CREATE POLICY "Authenticated users can view lead contacts"
  ON lead_contacts
  FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can update lead contacts (for status updates)
CREATE POLICY "Authenticated users can update lead contacts"
  ON lead_contacts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);