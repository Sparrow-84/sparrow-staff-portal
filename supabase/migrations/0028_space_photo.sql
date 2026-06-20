-- Migration 0028: add photo_url to spaces (one orientation photo per lot)
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS photo_url text;
