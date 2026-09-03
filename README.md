# Bert & Beth Wedding Memories

A mobile-friendly QR-code wedding photo/video upload website.

## Quick start

1. Create a Supabase project.
2. Create a Storage bucket named `wedding-media`.
3. Put your Supabase project URL and anon/public key in `config.js`.
4. Configure the bucket's Storage policies so guests can upload.
5. Deploy this folder to Vercel, Netlify, GitHub Pages (with suitable storage configuration), or another static host.
6. Create a QR code pointing to your deployed website, e.g. `https://your-domain.com/#upload`.

## Important

Do NOT place a Supabase `service_role` key in the website. Only use the public anon key.

For a production wedding site, consider:
- upload size limits
- file type validation
- moderation before public display
- storage quotas
- private storage if guest uploads should not be public
- a database table for guest names/messages


## Gallery fix

The gallery now reads the root of the `wedding-media` Storage bucket, creates public URLs for each photo/video, displays existing uploads on page load, refreshes after an upload, and polls for new uploads every 15 seconds.

### Required Supabase Storage policies

Because the gallery uses Storage's `list` endpoint, the anon/public role needs permission to list objects. In Supabase, open:

**Storage → Policies → `wedding-media`**

Make sure you have:

- an **INSERT** policy for `anon` so guests can upload;
- a **SELECT** policy for `anon` so the gallery can list uploaded files.

The bucket itself should remain **PUBLIC** because the gallery uses public object URLs.

A typical SELECT policy for a public wedding gallery is:

```sql
create policy "Public can list wedding media"
on storage.objects
for select
to anon
using (bucket_id = 'wedding-media');
```

Only put the Supabase project URL and **anon/public key** in `config.js`. Never put a `service_role` key in the website.


Photos and videos are now automatically separated into their own gallery sections.
