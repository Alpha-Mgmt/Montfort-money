-- Migration 33: time planning for tasks
-- duration_min: how long a task takes (5-minute steps, null = no time)
-- profiles.task_day_starts: { "default": "08:00", "2026-10-06": "07:30" }
alter table public.tasks add column if not exists duration_min smallint
  check (duration_min is null or (duration_min between 0 and 1440));
alter table public.profiles add column if not exists task_day_starts jsonb not null default '{}'::jsonb;
