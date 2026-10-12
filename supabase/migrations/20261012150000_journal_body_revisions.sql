-- Remembers journal body text so a Notion page open is not shown as an update.

create table if not exists public.journal_body_revisions (
  page_id text primary key,
  content_hash text not null,
  body_edited_at timestamptz null,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.journal_body_revisions to service_role;

notify pgrst, 'reload schema';
