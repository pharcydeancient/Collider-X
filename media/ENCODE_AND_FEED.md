# Collider media ingest

Buckets: media-public (public posters + free 720), media-premium (private paid streams).

Paths:
- live/<category>/<slug>/poster.webp
- live/<category>/<slug>/720.mp4
- live/<category>/<slug>/1080.mp4
- still/<category>/<slug>/poster.webp
- audio/<category>/<slug>.m4a

Run 001_media_assets.sql. Mount LiveLayer with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.
Locked premium: dim/mist/smoke. Never blur. Poster paints first. Stream after unlock.
