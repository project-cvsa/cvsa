# @cvsa/web

The web frontend for CVSA, built with [Astro](https://astro.build) and [SolidJS](https://www.solidjs.com/). It provides public catalog search and song archive browsing, as well as the crawler admin console.

## Development

```bash
# Start Astro development server (http://localhost:10199)
bun dev

# Build production SSR bundle
bun run build

# Run unit and design token tests
bun test
```

## Environment

| Variable | Description |
| --- | --- |
| `PUBLIC_API_URL` | Public backend API origin used by the browser (e.g. `https://api.projectcvsa.com`) |
| `INTERNAL_API_URL` | Internal backend API origin used during server-side rendering (default `http://localhost:16412`) |
| `PORT` | Web server listening port (default `10199`) |
