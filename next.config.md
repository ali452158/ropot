# Project Structure

This is a **Next.js 16 App Router** project. The application code lives in:

- `src/app/` — App Router pages and API routes
- `src/components/` — React components
- `src/lib/` — Shared libraries (MetaApi, bot runner, strategy, etc.)
- `prisma/` — Prisma schema
- `public/` — Static assets (including alfa-robot.png)

## Deployment

This project is configured for **Hostinger VPS Docker deployment**:

1. `Dockerfile` — Multi-stage build (Bun → Next.js standalone → Runner)
2. `docker-compose.yml` — Service definition with Traefik labels for `bot.scalper.com`
3. `traefik.yml` + `traefik-dynamic.yml` — Traefik static/dynamic config
4. `traefik-stack.yml` — Traefik proxy itself

See `DEPLOY-HOSTINGER.md` for the complete deployment guide.
