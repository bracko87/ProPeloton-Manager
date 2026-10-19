# ProPeloton Manager — first promo video production brief (draft v1)

**Status:** **V3 57.000-second MP4 REVIEW DRAFT PRODUCED** on 2026-10-19 after owner rejected the eight-cut percussive montage and yellow flashing transitions. V1 30s and V2 45s retained as historical drafts; V3 uses the same authentic user footage with longer readable shots. Video, preview, and editable source bundle delivered as ChatGPT conversation artifacts (not uploaded to GitHub). **Still not approved or published.** **Working branch:** staging. **Owner review required.**

## Editorial direction

Current primary deliverable: **57 seconds exactly** (owner revised after viewing V2 to request 45–60 seconds with no flash effects and much longer individual scenes), English, 1920×1080, 30 fps, 16:9, H.264 MP4, AAC audio, high bitrate (>=8 Mbps; Steam recommends >=5 Mbps). Design for readability with sound muted. Optional companion cut: 15s, with later 9:16 and square reframing. Original 30s cut remains available. Overall direction: dark navy/black and yellow from current PPM brand, clean contemporary sports typography, short overlays, subtle motion, no fictitious UI, no generic AI-rendered gameplay.

**Working tagline:** **Build Your Team. Write Your Cycling Story.**
CTA: **Play at propelotonmanager.com** (not a Steam Wishlist link until a Steam store page exists).

No voice-over in the 30-second v1 (better clarity and easy multi-language repurposing). Do not include an optional narration draft in the first edit.

## Archived V1 shot list — 30 seconds (superseded by 45-second draft V2)

| Time (s) | Visual: REAL game only | On-screen copy | Asset requirement |
|---|---|---|---|
| 0:00–0:04 | Begin immediately on live Overview UI; small branded logo overlay | **BUILD YOUR CYCLING TEAM** | Overview capture; no slow cinematic intro |
| 0:04–0:08 | Squad → rider profile / transfers | **SCOUT. SIGN. DEVELOP.** | Real Squad/Rider/Transfer footage or stills |
| 0:08–0:12 | Training → equipment | **BUILD YOUR CHAMPIONS** | Real functioning screens |
| 0:12–0:17 | Calendar → Race Preparation and tactic controls | **PLAN EVERY RACE** | Real race lineup/strategy footage |
| 0:17–0:24 | High-energy authentic race replay → stage result | **COMPETE FOR VICTORY** | Required real replay; target about 7 seconds |
| 0:24–0:27 | Infrastructure/finance or visible club progression | **GROW YOUR LEGACY** | Real in-game UI |
| 0:27–0:30 | Authentic ProPeloton logo, title, URL (last frame remains legible) | **PLAY PROPELOTON MANAGER** · **propelotonmanager.com** | Actual logo and domain |

**Editorial rules:** Deliver a 28–30-second master, never over 30 seconds. No voice-over in v1; short punchy music-only pacing. Start on gameplay by second 1. In first pass, choose the clearest readable screenshots and one actual replay sequence; omit U16, U23 or other extra features rather than overload the runtime. The 15-second cut will reuse the same master shots.

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

**Capture still needed for final quality:** one clean 7–10 sec replay sequence, 5–10 sec mouse-free Overview, Squad, Transfers, Training, Calendar and Race Preparation, plus U23/YAs only if visually ready. Capture preferably 1920×1080/30 fps with English UI, no browser chrome, personal data, unstable screens or misleading tests. We may animate authentic stills until motion clips are ready, but never present still zooms as if they were interactive gameplay.

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

## Editing / acceptance checklist

- [ ] Producer has verified all image/video files are original **ProPeloton Manager** (not Famioo, Tennis Legacy, Google admin screens, or fictional AI UI).
- [ ] Replay footage is actual working gameplay; no staged engine results presented as production.
- [ ] Official logo and brand colours match current site; screenshot clarity legible on phone/desktop.
- [ ] Real action/gameplay shown in first 5 seconds, and bulk of footage is genuine gameplay.
- [ ] Music cleared explicitly for commercial game promotion and paid ads; license stored.
- [ ] MP4 1920×1080, 30fps, H.264, high bitrate, audio 48 kHz AAC; all text legible muted.
- [ ] Main version strictly 28–30 seconds, plus an optional 15s recut from the same master; crop guides for vertical.
- [ ] Final human review of pacing, CTA, voice/music, UI integrity and privacy.
- [ ] Do **not** submit to Steam until actual downloadable Steam build/store requirements are settled.

## Task boundary

This document is production planning only, on staging. It neither publishes a video nor changes the game engine, assets, database, GitHub production, Supabase storage or live environment. Final MP4 is still owed.


## First video draft — actual output (2026-10-19)

- **Rendered successfully:** `ProPeloton_Manager_Promo_Draft_30s.mp4` (conversation artifact), **30.000 seconds exactly**, H.264 1920×1080 at 30 fps, AAC 48 kHz stereo; about 6.1 MiB preview size. This is a *review encode*, not yet the separately required high-bitrate delivery/Steam master.
- **Source edit bundle:** `ProPeloton_Promo_Source_Package.zip` (conversation artifact), includes user-supplied four footage files, the three still screenshots actually used, branded title PNG overlays, exact 900-frame shot list and an original synthesized WAV music bed.
- **Real-game footage used:** race simulation (recording 4, split opening and climax), Overview/dashboard (recording 1), Rider development (recording 2), Training (recording 3), and screenshots for Transfers, Race Preparation, Infrastructure.
- **Audio:** original procedural instrumental synthesized for this video; no third-party samples or external copyrighted commercial song used. No narration.
- **Brand caveat:** high-resolution logo not supplied separately; closing slate uses branded typography as a first draft. Replace with the official transparent logo if provided, then ensure all copy/CTA are approved.
- **Next:** owner watches first draft and provides timing/music/text comments, then one polish revision. Produce high-bitrate final master and vertical/social variants only after approval. No automatic promotional publishing; do not claim Steam store availability.


## Revised V2 shot list — 45 seconds (owner requested)

The 45.000-second draft uses **1,350 frames at 30 fps** and the original owner-supplied gameplay recordings and screenshots. Files created in conversation: `ProPeloton_Manager_Promo_Draft_v2_45s.mp4`, `ProPeloton_Manager_Promo_Draft_v2_45s_preview.jpg`, `ProPeloton_Promo_Source_Package_v2_45s.zip`. No GitHub upload and no public publication.

| Time (s) | Visual | Message or effect |
|---|---|---|
| 0–3 | Actual race replay | THE RACE IS ON |
| 3–7 | Overview video | BUILD YOUR CYCLING TEAM |
| 7–11 | Rider development video | EVERY RIDER MATTERS |
| 11–14 | Transfer market screenshot | SCOUT. SIGN. DEVELOP. |
| 14–18 | Training video | TRAIN YOUR CHAMPIONS |
| 18–20 | Equipment screenshot | PREPARE TO COMPETE |
| **20–24** | **Eight distinct screenshots, 0.5s each** | **Drum-only, original electronic “dun-dun” rhythm timed to every cut; EVERY DECISION COUNTS** |
| 24–27 | Race Preparation screenshot | PLAN EVERY RACE |
| 27–29.5 | Race Detail screenshot | KNOW THE COURSE |
| 29.5–36 | Actual race replay | COMPETE FOR VICTORY |
| 36–38 | Team Ranking screenshot | RISE THROUGH THE RANKS |
| 38–39.7 | Finance screenshot | BUILD YOUR CLUB |
| 39.7–41.5 | Youth Academy infrastructure screenshot | GROW YOUR LEGACY |
| 41.5–45 | Branded closing title | PLAY AT PROPELOTONMANAGER.COM |

**Revision details:** Removed all previous `NN/09` scene counter graphics. Added gold-and-black framing, kinetic yellow flash on scene transitions, gentle still-image motion, and continuous `PROPELOTONMANAGER.COM` URL at the top right of every gameplay shot, plus larger URL on end card. Synthesized a new original 45-second 120-BPM soundtrack with an isolated 20–24-second percussion-only passage. No third-party copyrighted track, no generated/fabricated in-game screens. No narration. The source ZIP contains four recordings, used screenshots, scene overlays, music WAV, shotlist JSON and FFmpeg/Python render scripts (not a native Canva file).

**V2 technical QC:** 1920×1080 H.264 30 fps, AAC audio, **45.000 seconds exactly (1,350 frames)**; approx. 9.3 MB review export. This is a review export; check music volume/readability, obtain owner approval, then create the final high-bitrate commercial master if requested. Original high-resolution PPM logo asset still not provided separately. Nothing published and no production game code/data touched.



## Revised V3 shot list — 57 seconds (current review version)

**Owner feedback:** Remove the fast, visually harsh 20–24s eight-screenshot, drums-only section and yellow transition flash effects. Slow the pacing; shots of 1–3 seconds were too brief. Keep game branding, authentic UI, background music, and persistent website CTA.

**Created and verified** on 2026-10-19:
- `ProPeloton_Manager_Promo_Draft_v3_57s.mp4` — 57.000 seconds, 1710 video frames, 30fps, H.264 1920×1080, AAC audio, about 8.9 MB.
- `ProPeloton_Manager_Promo_Draft_v3_57s_preview.jpg` — 12-shot visual contact sheet.
- `ProPeloton_Promo_Source_Package_v3_57s.zip` — authentic user gameplay originals, selected still images, titles, original generated WAV, timing list and reproducible Python + FFmpeg source (not a native Canva project).

| Time | Visual | Duration |
|---|---|---:|
| 00–04 | Authentic race simulation | 4s |
| 04–09 | Overview video, team building | 5s |
| 09–14 | Rider development video | 5s |
| 14–19 | Real transfer-market screenshot | 5s |
| 19–24 | Training video | 5s |
| 24–28 | Equipment screenshot | 4s |
| 28–33 | Race Preparation screenshot | 5s |
| 33–41 | Authentic full race replay clip | **8s** |
| 41–45 | Team Ranking screenshot | 4s |
| 45–49 | Finance/Sponsors screenshot | 4s |
| 49–53 | Youth Academy/Infrastructure screenshot | 4s |
| 53–57 | Branded title and URL closing card | 4s |

**Visuals:** No rapid 0.5s screenshots. No gold flash/wipe effect overlays. No scene/slide counters. Hold normal black-and-yellow title bars, original real-game imagery, subtle pan in stills, and `propelotonmanager.com` in every gameplay shot; prominent CTA in final scene. No voice-over.

**Sound:** New in-house synthesised 57-second stereo instrumental with stable rhythmic backing instead of drum-only break; no transition stingers or abrupt accented percussion. No third-party music library used. Sound should be reviewed at normal listening volume before public release.

**Technical QC:** ffprobe confirms 57.000000s, 1920×1080, H.264, 30 fps and AAC. Scene-by-scene contact sheet inspected; remaining unresolved element is the separately supplied official high-resolution logo. This draft remains **unpublished and unapproved**; high-bitrate distribution master/social versions follow owner acceptance. Do not touch production gameplay or move from staging to main for this documentary update.
