-- Tasks: store the assignee's name directly so tasks can be assigned to real
-- people (coaches + owner) without waiting on Clerk login user rows.
-- The existing assigned_to (uuid -> users) stays for when logins exist; the
-- assignee picker and the read layer prefer assignee_name when it is set.
alter table public.tasks
  add column if not exists assignee_name text;
