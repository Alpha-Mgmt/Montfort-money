-- Seed invite codes for the private beta. Edit / add as needed.
insert into public.invite_codes (code, note, max_uses) values
  ('montfort-owner', 'Daniel', 5),
  ('montfort-beta-01', 'friends & family batch 1', 25)
on conflict (code) do nothing;

-- To pause a code:
-- update public.invite_codes set active = false where code = 'montfort-beta-01';
