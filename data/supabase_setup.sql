-- Run this SQL in your Supabase SQL Editor
CREATE TABLE IF NOT EXISTS bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  session_data JSONB DEFAULT '{}',
  is_paired BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster phone lookup
CREATE INDEX IF NOT EXISTS idx_bot_sessions_phone ON bot_sessions(phone_number);

-- Enable RLS and add basic policy (optional)
-- ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;
