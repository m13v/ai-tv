# AI TV

Next.js app (v15, Turbopack) — AI-powered YouTube video discovery with chat.

## Dev Server

- `npx next dev --turbopack --port 3000`
- Server goes stale after file changes — **always restart** after edits: `kill $(lsof -ti :3000) 2>/dev/null; sleep 1; npx next dev --turbopack --port 3000`
- Always verify with `curl -so /dev/null -w "%{http_code}" http://localhost:3000` before telling user it's ready
- Ignore the "multiple lockfiles" warning — it's harmless

## Architecture

- `src/app/page.tsx` — Main page with landing screen, two layout modes (split/overlay), all state
- `src/components/Player.tsx` — YouTube iframe player with swipe/wheel/keyboard navigation
- `src/components/Chat.tsx` — Chat UI with overlay mode support (transparent bubbles, pointer-events passthrough)
- `src/app/globals.css` — Custom CSS for split layout panels, text shadows
- API routes: `/api/chat` (Gemini), `/api/search` (YouTube), `/api/react` (video reaction)

## Mobile Overlay Mode

- Video fullscreen, chat overlaid with transparent background
- Chat bubbles are non-interactable (`pointer-events-none`), only input/replies are tappable
- Single tap toggles entire overlay visibility (messages + input + top buttons)
- Player controls (mute, prev/next) use `z-30` to stay above chat overlay (`z-20`)
- Uses `dvh` units and `env(safe-area-inset-top)` for mobile browser chrome
- `viewport-fit: cover` enabled in layout.tsx

## Common Gotchas

- Never put CSS comments (`/* */`) inside JSX className template literals — they become literal class names
- All hooks must be called before any early returns (React rules of hooks)
- `h-screen` → `h-dvh` on mobile to account for browser URL bar
- Build check: `npx next build 2>&1 | grep -E "✓|✗|error"`
