# Supabase Database Setup

To enable editing and deleting scans in the app, you must update your Supabase Row Level Security (RLS) policies.

By default, Supabase might not allow anonymous users (the app) to UPDATE or DELETE rows.

## Instructions

1.  Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2.  Open your project.
3.  Go to the **SQL Editor** (icon on the left sidebar).
4.  Paste and run the following SQL commands:

```sql
-- Allow anonymous users to UPDATE rows in the 'scans' table
create policy "Enable update for anon" on "public"."scans"
for update using (true) with check (true);

-- Allow anonymous users to DELETE rows in the 'scans' table
create policy "Enable delete for anon" on "public"."scans"
for delete using (true);
```

5.  Alternatively, you can go to **Authentication > Policies**, select the `scans` table, and manually add policies for `UPDATE` and `DELETE` operations for the `anon` role (or `public` role).

Once these policies are applied, the "Save Changes" and "Delete Scan" buttons in the app will work immediately.
