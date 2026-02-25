# rapidroll2.0

Rapid Rolls 2.0 frontend + API in one repo.

## Railway Deploy (Single Service)

This project is configured so Railway can:
1. Build the Vite frontend (`npm run build`)
2. Start the Express API (`npm run start`)
3. Serve the built frontend from `dist/` through Express

### Required Railway Variables

Set these in Railway service variables:

- `MONGODB_URI` (required)
- `JWT_SECRET` (required)
- `NODE_ENV=production`
- `SERVE_STATIC=true`
- `CLIENT_ORIGIN=https://<your-railway-domain>`
- `CLIENT_ORIGINS=https://<your-railway-domain>,https://<your-custom-domain>` (optional)
- `ALLOW_LAN_ORIGINS=false`

`PORT` is provided by Railway automatically.

### Healthcheck

Railway healthcheck path is:

- `/api/health`

### Local Development

```bash
npm install
npm run server   # API on :4000
npm run dev      # Vite on :5173
```

### Production-style Local Run

```bash
npm run build
npm run start
```

Then open `http://localhost:4000`.

## Security Note

If any MongoDB credentials were committed/shared in plain text previously, rotate them immediately.
