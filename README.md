# Auto-Apply Worker

Browser automation worker that polls [application-os](https://github.com/WilliamK112/application-os) for pending jobs and auto-applies via LinkedIn Easy Apply (and other providers).

## Architecture

```
application-os (Next.js)
    │  /api/auto-apply/worker ← polls this endpoint
    ▼
auto-apply-worker (Node.js / Playwright)
    │  Opens job URL in headless Chromium
    ▼
LinkedIn / Greenhouse / Lever
```

## Setup

```bash
npm install
cp .env.example .env
# Fill in .env (see below)
npx playwright install chromium
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTO_APPLY_APP_OS_URL` | application-os deployment URL | `https://application-os.vercel.app` |
| `AUTO_APPLY_WORKER_SECRET` | Must match `AUTO_APPLY_WORKER_SECRET` in app's `.env.local` | `long-random-string` |
| `AUTO_APPLY_USER_ID` | Your user ID from application-os database | `cuid...` |
| `AUTO_APPLY_EMAIL` | Email for form fields | `you@example.com` |
| `AUTO_APPLY_PHONE` | Phone for form fields | `+13478668326` |
| `AUTO_APPLY_RESUME_PATH` | Absolute path to resume PDF | `/path/to/resume.pdf` |
| `AUTO_APPLY_HEADLESS` | Show browser (`false`) or hide (`true`) | `true` |
| `AUTO_APPLY_DELAY_MS` | Delay between jobs (LinkedIn rate-limits ~50/day) | `8000` |

## Local Run

```bash
./run-local.sh   # shows browser, human-in-the-loop
# or
AUTO_APPLY_HEADLESS=true npm start
```

## Deploy to Railway

### 1. Login

```bash
railway login
```

### 2. Link project

```bash
cd auto-apply-worker
railway init
railway add
```

### 3. Set environment variables

```bash
railway variables set AUTO_APPLY_APP_OS_URL=https://application-os.vercel.app
railway variables set AUTO_APPLY_WORKER_SECRET=<your-secret>
railway variables set AUTO_APPLY_USER_ID=<your-user-id>
railway variables set AUTO_APPLY_EMAIL=<your-email>
railway variables set AUTO_APPLY_PHONE=<your-phone>
railway variables set AUTO_APPLY_RESUME_PATH=/app/resume.pdf
# Upload resume PDF to Railway (Storage → Add File)
```

### 4. Upload resume

In Railway dashboard: **Storage → Add File** → upload your `resume.pdf`.

### 5. Deploy

```bash
railway up
```

Or connect the GitHub repo in Railway dashboard for auto-deploy on push.

## Production Usage

1. Add jobs to your queue in application-os
2. Worker picks them up and applies automatically
3. CAPTCHA → status becomes `NEEDS_VERIFICATION`, you resolve it manually
4. Success/failure logged back to application-os
