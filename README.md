# 🐳 Prophetable Scorecard

Official scorecard web app for Prophetable.tv

## Deploy to Railway

1. Push this folder to a GitHub repo (or use Railway's CLI)
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Add environment variable: `ADMIN_PASSWORD` = your secret password
5. Railway will auto-detect Node.js, install deps, and deploy

Your app will be live at `https://your-project.up.railway.app`

## Custom Domain

In Railway dashboard → Settings → Domains → Add custom domain
Point your DNS (e.g. `scorecard.prophetable.tv`) to Railway's provided CNAME.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port (Railway sets this automatically) | 3000 |
| `ADMIN_PASSWORD` | Password for admin panel | prophet2026 |

## How It Works

- **Public view**: Anyone with the link sees the scorecard with all results, stats, and tier breakdowns
- **Admin view**: Click "Admin" → enter password → edit any pick, add new days/picks, update results
- **Data**: Stored in `data/scorecard.json` on the server. Persists across deploys on Railway with a volume (recommended)

## Adding a Railway Volume (Recommended)

To persist data across deploys:
1. In Railway dashboard → your service → Settings → Volumes
2. Add a volume mounted at `/app/data`
3. This ensures your scorecard data survives redeploys

## File Structure

```
prophetable-scorecard/
├── server.js           # Express API server
├── package.json        # Dependencies
├── railway.toml        # Railway config
├── public/
│   └── index.html      # Full frontend (vanilla JS, no build step)
└── data/
    └── scorecard.json  # Scorecard data (auto-created)
```
