PRAGMA foreign_keys = ON;

ALTER TABLE schedule_blocks ADD COLUMN end_date TEXT;

UPDATE schedule_blocks
SET end_date = block_date
WHERE end_date IS NULL OR end_date = '';

CREATE TABLE IF NOT EXISTS schedule_block_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id INTEGER NOT NULL,
  exception_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (block_id) REFERENCES schedule_blocks(id) ON DELETE CASCADE,
  UNIQUE(block_id, exception_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_period
ON schedule_blocks(professional_id, block_date, end_date);

CREATE INDEX IF NOT EXISTS idx_schedule_block_exceptions_date
ON schedule_block_exceptions(block_id, exception_date);
