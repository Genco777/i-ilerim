CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default config values
INSERT INTO system_config (key, value, description) VALUES
  ('agent_system_prompt_extra', '', 'Extra instructions injected into the agent system prompt'),
  ('agent_max_tool_turns', '8', 'Maximum tool turns per conversation (default 8)'),
  ('agent_safety_timeout_ms', '28000', 'Safety timeout in milliseconds (default 28000)'),
  ('agent_swarm_enabled', 'true', 'Whether swarm agent routing is enabled'),
  ('agent_verbose_logging', 'false', 'Enable verbose debug logging')
ON CONFLICT (key) DO NOTHING;
