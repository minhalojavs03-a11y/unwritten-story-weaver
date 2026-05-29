
insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', true)
on conflict (id) do update set public = true;

create policy "Voice messages are publicly readable"
on storage.objects for select
using (bucket_id = 'voice-messages');

create policy "Authenticated can upload voice messages"
on storage.objects for insert
to authenticated
with check (bucket_id = 'voice-messages');

create policy "Authenticated can update own voice messages"
on storage.objects for update
to authenticated
using (bucket_id = 'voice-messages');

create policy "Authenticated can delete own voice messages"
on storage.objects for delete
to authenticated
using (bucket_id = 'voice-messages');
