-- Chat Sessions Log Table
-- Stores all chat interactions with metadata for analytics

CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  conversation_history JSONB,
  
  -- Metadata
  top_k INTEGER,
  min_score DECIMAL(5,4),
  kb_only BOOLEAN DEFAULT false,
  route VARCHAR(50), -- KB_ONLY, KB_EMPTY, KB_WEB, OUT_OF_DOMAIN
  top_scores JSONB,
  top_score DECIMAL(5,4),
  response_time_ms INTEGER,
  model VARCHAR(100),
  rewritten_query TEXT,
  in_domain BOOLEAN DEFAULT true,
  sources JSONB,
  
  -- Request tracking
  request_id VARCHAR(255),
  user_agent TEXT,
  ip_hash VARCHAR(64), -- Hashed for privacy
  
  -- Indexes for common queries
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_timestamp ON chat_sessions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_route ON chat_sessions(route);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_in_domain ON chat_sessions(in_domain);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_chat_sessions_route_timestamp ON chat_sessions(route, timestamp DESC);

