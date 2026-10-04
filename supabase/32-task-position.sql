-- Migration 32: order of tasks inside a day (seconds-scale number; null = use created_at)
alter table public.tasks add column if not exists position double precision;
