-- =====================================================================
--  MIGRATION — adds photo support to the chat
--  You already ran schema.sql, so run just this one in the SQL Editor.
--  Safe to run more than once.
-- =====================================================================

alter table chat add column if not exists image_path text;
