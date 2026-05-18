# Recovery Checklist

Use this when resuming the project after a break.

## Start Here

1. Read `README.md` for setup and public-facing usage.
2. Read `agent.md` for current system state and watchouts.
3. Read `project.md` for the exhaustive feature and ops summary.
4. Check `docs/screenshots/` if you need README assets.

## Do Not Reintroduce

- `.env`
- `data/`
- `images/`
- `.screenshots/`
- `.trash/`
- `node_modules/`
- logs or `.pid`

## Environment

- Set `FOXCODE_API_KEY` in the machine environment before starting the server.
- Use `ADMIN_PASSWORD` if you want a non-default admin password.
- Keep the queue serial unless you intentionally redesign it.

## Useful Paths

- `server.js` - routes and boot
- `queue.js` - serial queue and SSE
- `imageGenerator.js` - Foxcode/Gemini calls
- `storage.js` - image metadata and file helpers
- `auth.js` - student/admin trust state
- `moderation.js` - prompt filtering and moderation helpers
