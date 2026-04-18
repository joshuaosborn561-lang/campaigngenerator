# Agency Intelligence Platform

A central data warehouse + Apollo-style contact search UI for B2B outbound cold email campaigns. Pulls all contacts and campaign data from SmartLead and HeyReach into Supabase, with an AI assistant powered by Gemini Flash 2.5.

## Architecture

```
SmartLead + HeyReach (all client accounts)
    ↓ API sync (Gemini Flash 2.5 classifies during ingestion)
Supabase (Postgres warehouse)
    ↓ queried by
Next.js web app (Apollo-style UI + Gemini-powered AI search)
```

**Three components:**

| Component | Directory | Deploys to |
|-----------|-----------|------------|
| Database schema | `supabase/` | Supabase |
| Sync service | `sync/` | Railway (cron) |
| Web UI | `web/` | Vercel |

## Features

### Apollo-style Contact Search
- Full filter sidebar: title, seniority, department, company, industry, size, location, status, source
- Sortable data table with selection checkboxes
- Pagination (50 per page)
- CSV export (selected rows or full filtered results)
- Active filter tags with one-click removal

### AI Assistant
Type natural language in the AI bar at the top:
- "Find me MSP owners" → auto-applies filters: industry=MSP, title=owner, seniority=c-suite
- "VPs of Sales at SaaS companies" → title=VP of Sales, industry=SaaS, department=sales
- "Cybersecurity directors in California" → industry=Cybersecurity, seniority=director, state=California

### Campaign Analytics (via /api/chat)
Conversational interface where Gemini queries the warehouse:
- "What subject lines have the highest reply rates for MSP clients?"
- "Which offer type converts best across all campaigns?"
- "What copy patterns show up in campaigns with over 5% reply rates?"

### Apollo CSV Diff + Prospeo enrichment (`/import`)
Stop burning Apollo credits revealing emails twice:
1. In Apollo, build your list and export the CSV (no need to reveal emails)
2. Drop the CSV at `/import` — the server matches each row against Supabase by LinkedIn URL → email → name+company
3. Optionally, the new (un-matched) rows get enriched via Prospeo (LinkedIn finder → name+company fallback)
4. Fresh emails are saved back to the contacts table so the next CSV upload finds them as cached
5. You get an Excel back with `in_database`, `match_method`, and `prospeo_email` columns plus a Summary sheet

## Setup

### 1. Supabase — Create the database

Run both migrations:

```bash
# Via Supabase CLI
supabase db push

# Or manually paste these into the SQL editor:
# supabase/migrations/001_schema.sql
# supabase/migrations/002_contacts_and_heyreach.sql
```

Add your first client:

```sql
INSERT INTO clients (name, industry_vertical, smartlead_api_key, heyreach_api_key)
VALUES ('Client Name', 'MSP', 'sl_api_key_here', 'hr_api_key_here');
```

### 2. Sync service — Load historical data

```bash
cd sync
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY

npm install

# Run the one-time historical load
npm run historical

# Test the nightly sync
npm run nightly
```

**What the sync does:**
- Pulls all campaigns, sequences, leads, and stats from SmartLead and HeyReach
- Uses Gemini Flash 2.5 to classify each campaign's offer type and copy patterns
- Populates the unified `contacts` table (deduplicated by email)
- Auto-detects seniority and department from job titles
- Nightly sync is additive — never overwrites historical data

### 3. Web UI — Deploy the app

```bash
cd web
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY
# Optional: PROSPEO_API_KEY (only needed if you want to use the /import enrichment flow)

npm install
npm run dev
```

Open `http://localhost:3000` — you'll land on the Apollo-style contacts page.

## Deployment

### Sync service → Railway

1. Create a new Railway project
2. Connect this repo, set root directory to `sync/`
3. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`
4. The cron schedule (`0 2 * * *`) runs the nightly sync at 2am UTC

### Web app → Vercel

1. Import the repo to Vercel
2. Set root directory to `web/`
3. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`
4. Deploy

## Data Model

### Contacts (Apollo-style fields)
- Name, email, phone, LinkedIn URL
- Title, seniority (c-suite/vp/director/manager/senior/entry), department
- Company name, domain, industry, size, revenue
- City, state, country
- Tags, custom fields
- Source platform (smartlead/heyreach/manual/csv)
- Engagement: total campaigns, emails sent, replies, last contacted, status

### Campaigns
- Client identity and industry vertical
- Target segment (company size, industry, geography, title)
- Offer type (AI-classified: roi-based, pain-based, social-proof, etc.)
- Subject lines and email body per sequence step
- Send volume, open rate, reply rate, bounce rate
- Reply sentiment breakdown
- Copy patterns (AI-classified)

## What you need to provide

1. **Supabase project URL + service role key**
2. **SmartLead API keys** — one per client sub-account
3. **HeyReach API keys** — one per client (Settings → API)
4. **Gemini API key** — for AI classification and the query interface
5. **Prospeo API key** (optional) — for the Apollo CSV diff + enrich flow at `/import`
