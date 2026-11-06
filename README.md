# Nebula Frontend

Vue 3 + Vite + TypeScript frontend for the Nebula AI assistant.

This is the standalone frontend repository. The API service,
CosyVoice2/RVC runtime, database migrations, model downloader and Docker Compose
orchestration live in the sibling backend repository:

```text
https://github.com/wangcheng11111111111111111111/web-agent_backed.git
```

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Development

```bash
npm ci
npm run dev
```

The development server listens on `http://127.0.0.1:5173` and proxies `/api` to
`http://127.0.0.1:8000`.

For the complete stack, clone both repositories into the same parent directory
as `backend/` and `frontend/`, then run the backend's
`scripts/docker-up.ps1` or `scripts/docker-up.sh`.

## Production build

```bash
npm run build
npm test
```

The production output is written to `dist/`.

## Docker

```bash
docker build -t nebula-frontend .
docker run --rm -p 8080:80 nebula-frontend
```

The container serves the SPA through Nginx and proxies `/api` to
`http://backend:8000`. It is intended to run in the same Docker network as the
backend service.

For separate origins, create `.env` from `.env.example` and set
`VITE_API_BASE_URL` to the public backend origin before building.
