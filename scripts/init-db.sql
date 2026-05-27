-- FlowForge PostgreSQL initialization
-- Run by Docker Compose on first startup

-- Ensure UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure pg_trgm for fuzzy search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant all privileges to flowforge user
GRANT ALL PRIVILEGES ON DATABASE flowforge TO flowforge;
GRANT ALL PRIVILEGES ON SCHEMA public TO flowforge;

-- Set default search path
ALTER USER flowforge SET search_path = public;
