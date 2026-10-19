# ProPeloton Manager — first promo video production brief (draft v1)

**Status:** Tool comparison and creative/edit plan complete. **MP4 NOT produced** yet; do not advertise as final before actual real-gameplay footage is acquired, edited and approved. **Working branch:** staging. **Owner review:** required before publication.

## Editorial direction

Primary deliverable: **52 seconds**, English, 1920×1080, 30 fps, 16:9, H.264 MP4, AAC audio, high bitrate (>=8 Mbps; Steam recommends >=5 Mbps). Design for readability with sound muted. Companion cuts: 30s and 15s; later 9:16 and square reframing. Overall direction: dark navy/black and yellow from current PPM brand, clean contemporary sports typography, short overlays, subtle motion, no fictitious UI, no generic AI-rendered gameplay.

**Working tagline:** **Build Your Team. Write Your Cycling Story.**
CTA: **Play at propelotonmanager.com** (not a Steam Wishlist link until a Steam store page exists).

No voice in v1 (better clarity and easy multi-language repurposing). If review says add it, use professional licensed English TTS from Descript or an approved provider; keep voice script below 60 words.

## Shot list — 52 seconds

| Time (s) | Visual: REAL game only | On-screen copy | Asset requirement |
|---|---|---|---|
| 0:00–0:05 | Open on live Overview immediately with light camera crop/scale, logo bug unobtrusively | **BUILD YOUR TEAM** | Overview screen capture; avoid brand-only intro |
| 0:05–0:11 | Squad roster -> rider profile (2 shots) | **EVERY RIDER MATTERS** | Squad screenshot/clip + Rider Profile |
| 0:11–0:17 | Transfers -> Training (2 shots) | **SCOUT. SIGN. DEVELOP.** | Transfers + Training screens |
| 0:17–0:24 | Calendar -> Race Preparation (2 shots) | **PLAN EVERY RACE** | Calendar + race lineup/tactics |
| 0:24–0:35 | Most energetic moment: **actual real race replay** and official stage result; show UI | **MAKE THE TACTICAL CALL** | **Required** 8–11s authentic replay + classification |
| 0:35–0:41 | Equipment/Infrastructure/club finances (2 shots) | **GROW YOUR CLUB** | Real functioning pages |
| 0:41–0:47 | U23 or U16 / National Championships if visually ready (1–2 shots) | **BUILD A LASTING LEGACY** | Real verified UI, not mocked-up |
| 0:47–0:52 | PPM actual brand lockup + gameplay strip/blur | **BUILD YOUR TEAM. WRITE YOUR CYCLING STORY.** and **propelotonmanager.com** | Logo, project URL, studio credit small |

Aim for 70%+ authentic gameplay/UI; keep transitions ~0.25–0.4s and overlays away from key tables, map, replay and race results. All screen recordings should show the actual app; no AI-generated fake riders, race screens, menus or mechanics.

## Available source material

The game's existing public homepage gallery (source `src/components/home/ScreenshotGallery.tsx`) references authentic images in Supabase Storage (paths under `Admin Staff/Brend images/`) for **Overview, Squad, Riders, Transfers, Calendar, Race Preparation, Race Detail, Equipment, Infrastructure, Finance, Statistics and Rankings.**

Starting reference filenames from that source:
- `Overview 1.jpg`, `Overview 2.jpg`
- `Squad Page.jpg`, `Squad Page 2.jpg`
- `Rider profile 1.jpg`, `Rider Profile 2.jpg`
- `Transfer Page 1.jpg`, `Transfer Page 2.jpg`
- `Calendar 1.jpg`, `Calendar 2.jpg`
- `Race preparation 1.jpg`, `Race preparation 2.jpg`
- `Race detail 1.jpg`, `Race Detail 2.jpg`
- `Equipment Page 1.jpg`, `Infrastracture Page.jpg`, `Finance Page 1.jpg`

**Source verification:** URL references exist in production repository. Individual files could not be retrieved through automated public download in the authoring environment. Earlier user screenshot archive contains some PPM UI screenshots, but several were unrelated Famioo captures; do not accidentally include unrelated screenshots or browser/debug decorations.

**Capture still needed for final quality:** one clean 10–15 sec replay sequence, 5–10 sec mouse-free Overview, Squad, Transfers, Training, Calendar and Race Preparation, plus U23/YAs only if visually ready. Capture preferably 1920×1080/30 fps with English UI, no browser chrome, personal data, unstable screens or misleading tests. We may animate authentic stills until motion clips are ready, but never present still zooms as if they were interactive gameplay.

## AI-assisted editor comparison (research date: 2026-10-19)

| Editor | Cost and export | Strengths | Caveats |
|---|---|---|---|
| **Canva (recommended v1)** | Free; default MP4 export **1080p** and **no watermark if only free elements** | Upload real footage, multi-track editing, AI Magic Video, subtitles/text animation, easy alternate sizes | Paid assets watermarked on Free; check each asset and music license; avoid the **Popular Music** category (non-commercial). Pro price varies by market. |
| **Descript Hobbyist (voice-focused alternative)** | **$24/mo** month-to-month or $16/mo billed annually; 1080p watermark-free; includes AI editor and voice features | AI-assisted editing, speech, captioning and transcript | Free plan watermark/720p limits; mainly worthwhile if professional narration is desired. |
| **CapCut Desktop** | Free tier and optional Pro. Pro price varies by country/device; confirm checkout locally | Strong motion effects and fast social reframing | Pro assets/features sometimes block export; check commercial licensing on templates/audio. |
| **Runway Standard** | **$15/mo** monthly or $12/mo billed annually; 625 credits/mo; paid no-watermark | AI transitions/background atmospheric effects, generative effects | **Not suitable for generating fake gameplay.** Optional decorative-only use. |

Commercial rights:
- Actual user-owned PPM UI and logos should be used only as authorized game materials.
- Canva Free/Pro **stock** items can be used in designs for commercial marketing within Canva content license, but **Popular Music is non-commercial**. Select only items marked **Commercial use allowed** / appropriately licensed Stock Music, or use independently licensed original music.
- Save the music track/license evidence and check usage separately for Steam trailers, advertising and YouTube.
- Prefer a dedicated original/sublicensable instrumental with energetic 118–130 BPM, modern sporting electronic percussion, no copyrighted song sample. Never claim a license if not obtained.

References:
- Canva video editor and exports: https://www.canva.com/video-editor/ ; https://www.canva.com/help/download-video-as-separate-files/
- Canva commercial licensing: https://www.canva.com/licensing-explained/ ; https://www.canva.com/policies/popular-music-license/
- Descript pricing: https://www.descript.com/pricing
- CapCut price caveat: https://www.capcut.com/help/how-much-does-capcut-pro-cost
- Runway pricing: https://runway.com/pricing
- Steam trailer guidance: https://partner.steamgames.com/doc/store/trailer

## Optional narration version

> Build your cycling team. Scout talented riders and shape their future. Plan every race, choose your tactics and take on the world's toughest challenges. Build a club that lasts. ProPeloton Manager — write your cycling story.

Narration intentionally optional and not included in v1.

## Editing / acceptance checklist

- [ ] Producer has verified all image/video files are original **ProPeloton Manager** (not Famioo, Tennis Legacy, Google admin screens, or fictional AI UI).
- [ ] Replay footage is actual working gameplay; no staged engine results presented as production.
- [ ] Official logo and brand colours match current site; screenshot clarity legible on phone/desktop.
- [ ] Real action/gameplay shown in first 5 seconds, and bulk of footage is genuine gameplay.
- [ ] Music cleared explicitly for commercial game promotion and paid ads; license stored.
- [ ] MP4 1920×1080, 30fps, H.264, high bitrate, audio 48 kHz AAC; all text legible muted.
- [ ] 52s main version, 30s and 15s recuts from same master, crop guides for vertical.
- [ ] Final human review of pacing, CTA, voice/music, UI integrity and privacy.
- [ ] Do **not** submit to Steam until actual downloadable Steam build/store requirements are settled.

## Task boundary

This document is production planning only, on staging. It neither publishes a video nor changes the game engine, assets, database, GitHub production, Supabase storage or live environment. Final MP4 is still owed.
