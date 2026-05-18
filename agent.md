# Agent Instructions

## Role

You are maintaining a school-network image generation webserver for classroom use. Students sign in with a display name, request image generation, and view personal galleries. Teachers/admins can manage queue, moderation, approvals, trusted browsers, and a public gallery of approved work.

## Product Goals

- Keep the student workflow simple and fast.
- Keep the system safe for a school setting.
- Preserve each image with enough metadata for student, admin, and public galleries.
- Keep image generation server-side only.
- Make the app usable on a school LAN without extra infrastructure.

## Current Product State

The app already includes:

- Student name-based sign-in.
- Student approval workflow with teacher approval tokens.
- Persistent student approval token in browser localStorage.
- Serial image queue with a configurable delay between jobs.
- Public gallery of approved images only.
- Admin gallery with all images and queue controls.
- Content moderation on prompts with configurable blocked terms/patterns.
- Admin moderation queue for approve/reject/hide.
- Trusted admin browser tokens stored server-side.
- One-time enrollment codes to add trusted admin browsers.
- Provider tracking and provider labels in galleries.
- Photos backup copy path under `~/Photos/image2_webserver/` by default.

## Core User Flows

### Student Flow

1. Student opens the site from a browser on the school network.
2. Student enters their name.
3. Student requests approval and waits for teacher approval if needed.
4. Once approved, the student enters the main generator.
5. Student enters a prompt and optional provider preference.
6. Server enqueues the request.
7. Student sees live queue status and a personal gallery.
8. Student can retry failed prompts.

### Public Flow

1. Anyone can open the public gallery.
2. Public gallery shows only completed images approved for public viewing.
3. Public gallery supports search and student filtering.

### Admin Flow

1. Admin opens the admin page.
2. Admin logs in with the shared password.
3. If no trusted browser exists, the browser is enrolled.
4. If trusted browsers already exist, the browser must also present a trusted admin token.
5. Admin can generate a one-time add-browser code to trust another browser.
6. Admin sees the full queue, all images, moderation queue, and trusted browser list.

## Image Generation

Use the installed `foxcode-image` skill as the source of truth for the Foxcode endpoint behavior.

Known details:

- OpenAI-compatible endpoint: `POST https://dm-fox.rjj.cc/codex/v1/images/generations`
- Model: `gpt-image-2`
- Supported sizes: `1024x1024`, `1536x1024`, `1024x1536`
- Supported quality values: `low`, `medium`, `high`
- Preferred environment variable: `FOXCODE_API_KEY`
- Fallback environment variable: `OPENAI_API_KEY`

Gemini is also supported through a Gemini-compatible endpoint and may share the same key, depending on config.

Do not hard-code secrets in source files.

## Data Requirements

Each generated image should have at least:

- Unique image id
- Student display name
- Prompt text
- Image path or URL
- Created timestamp
- Completion timestamp
- Provider label
- Queue/job status
- Moderation status
- Moderation reasons/note
- Generation settings

## Storage Guidance

- Save generated image files locally so galleries can reload.
- Never overwrite existing image files.
- Use stable filenames derived from timestamp, student name, and id.
- Store metadata in JSON while the project remains small.
- Preserve older records with migration-safe defaults when fields are added.

## Security And Privacy

- Do not expose API keys to the browser.
- All generation requests must go through the server.
- Student names are display names, not verified identities.
- Admin access must not rely on password alone once trusted admin browsers exist.
- Keep public gallery limited to approved images.
- Use prompt filtering and teacher moderation for school safety.
- Avoid collecting unnecessary personal information.

## Implementation Priorities

1. Keep the student sign-in and generation flow stable.
2. Preserve queue reliability and prevent deadlocks.
3. Keep public gallery approval rules strict.
4. Keep admin moderation and trusted-browser controls understandable.
5. Add polish only after the core workflow stays stable.

## UX Notes

- Keep the student UI simple and classroom-friendly.
- Show queue status live.
- Show clear errors if generation fails or the API key is missing.
- Keep prompts visible with images.
- Show provider labels clearly as the actual backend path used.
- Keep admin moderation actions obvious and reversible where possible.

## Remaining Gaps / Watchouts

- Pending student-login requests are in-memory and will reset on server restart.
- Trusted admin browsers are token-based, not hardware-backed.
- Browser hardware IDs are not available in standard web browsers.
- Prompt filtering is keyword/pattern-based and should not be treated as perfect content safety.
- The queue is serial by design; adding parallel generation would require a new concurrency model.

## Resume Notes

- Start by reading `project.md` for the exhaustive feature list.
- Use `.trash/` only for anonymized mock pages or temporary screenshot work.
- Keep `docs/screenshots/` for committed README assets only.
- Never reintroduce secrets into tracked files; rely on machine environment variables.
