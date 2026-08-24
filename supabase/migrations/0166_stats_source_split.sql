-- 0166_stats_source_split.sql
-- Splits the single "Source" field on a stat into two: source_publisher (who put out the
-- report, e.g. "US Census Bureau") and source_report_name (which report, e.g. "2023
-- American Community Survey"). Both required, same as the old single field was.
-- source_url and source_date are unaffected -- already separate, already optional.
-- No data to preserve: confirmed zero rows exist in `stats` at the time of writing.

alter table stats
  add column if not exists source_publisher text,
  add column if not exists source_report_name text;

-- Best-effort backfill in case a stat gets added before this actually runs (none existed as
-- of writing) -- reuses the old combined value into both new fields rather than leaving them
-- blank. Guarded so re-running this migration after `source` is dropped is still safe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'stats' and column_name = 'source'
  ) then
    update stats
       set source_publisher = coalesce(source_publisher, source),
           source_report_name = coalesce(source_report_name, source)
     where source_publisher is null or source_report_name is null;
  end if;
end $$;

alter table stats drop column if exists source;

alter table stats
  alter column source_publisher set not null,
  alter column source_report_name set not null;
