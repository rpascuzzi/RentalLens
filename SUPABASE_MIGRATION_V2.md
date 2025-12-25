# Supabase Migration Guide - V2 (Multi-Property Support)

To support multiple properties, you need to update your database schema.

## Instructions

1.  Go to your [Supabase Dashboard](https://supabase.com/dashboard) -> **SQL Editor**.
2.  Run the following SQL commands:

```sql
-- 1. Create Properties Table
create table public.properties (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  address text not null,
  image_url text
);

-- 2. Add property_id to Scans Table
alter table public.scans 
add column property_id uuid references public.properties(id) on delete cascade;

-- 3. Enable RLS for Properties
alter table public.properties enable row level security;

-- 4. Create Policies for Properties (Allow Anon access for testing)
create policy "Enable read access for anon" on "public"."properties"
for select using (true);

create policy "Enable insert for anon" on "public"."properties"
for insert with check (true);

create policy "Enable delete for anon" on "public"."properties"
for delete using (true);

-- 5. Update Scans policies if needed (already done in V1, but ensure DELETE/UPDATE work)
-- (If you haven't run V1 setup, ensure anon has all permissions for 'scans' table too)
```

After running this, the app will fully support creating properties and adding scans to them.
