# FPL League Tracker

A Vercel-ready Next.js dashboard for an FPL classic mini-league. It is preconfigured for league **658721** and join code **qkq9x5**.

## What it shows

- Full classic mini-league standings (including leagues with multiple pages)
- Current gameweek points and rank movement
- Next FPL deadline with a live countdown
- Current gameweek fixtures and scores
- Price changes during the current gameweek
- League average, biggest mover, manager count and top five
- Links from each manager to their official FPL team page

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Put this folder in a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Vercel should detect Next.js automatically.
4. Add these environment variables if you want to change the default league:
   - `FPL_LEAGUE_ID` — numeric classic league ID
   - `NEXT_PUBLIC_FPL_JOIN_CODE` — league join code (optional)
5. Deploy.

No API key is required. The app fetches the public, undocumented FPL endpoints from the server, avoiding browser CORS issues.

## Use another league

Change `.env.local`:

```env
FPL_LEAGUE_ID=123456
NEXT_PUBLIC_FPL_JOIN_CODE=abcdef
```

Then restart the dev server or redeploy.

## Notes

The Fantasy Premier League API is undocumented and can change between seasons. This project is unofficial and not affiliated with the Premier League.
