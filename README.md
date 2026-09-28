# Us, Again

Small reconnection activities for couples, played Jackbox-style: the TV shows the room and the reveals, each person answers privately on their own phone.

Activities: The Museum of Us, Build My Current World, Our Relationship Draft, I'd Choose You Here.

## How it works

- `/tv` creates a room and shows a 4-letter code + QR. The TV owns the game state and advances it.
- `/play` is the phone controller. Phones submit answers and send actions (next, pick, steal).
- Supabase stores rooms and answers in an isolated `us_again` schema that is **not** exposed through the Data API. The app only calls `public.us_again_*` security-definer functions, each checking a host or player token. Only the TV can read answers.
- Supabase Realtime broadcast (channel `us-again:<room-id>`) carries signals only, never answer text. Both sides also poll every 3s as a fallback.
- No user accounts. Ending a session deletes the room and all answers; expired rooms (6h idle) are swept when new rooms are created.

## Setup

```bash
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm install
npm run dev
```

Open `http://localhost:3000/tv` on one screen and `http://localhost:3000/play` on two phones (same network: use your machine's LAN IP).

Keyboard on the TV: Right arrow = next, Left arrow = back.
