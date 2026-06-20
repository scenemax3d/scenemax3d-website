# SceneMax3D Website

Phase 1 foundation for the SceneMax3D game engine website.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Fuse.js
- Lucide icons

## Content

The site is driven by `src/content/siteContent.json`. Add tutorial YouTube IDs, real screenshots, download links, docs entries, and showcase items there as the next phases progress.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

## Production Server

Build the static app once on your development machine:

```bash
npm run build
```

For old Ubuntu servers where modern Node.js is difficult to install, build the Zig backend as a static Linux binary:

```bash
zig build-exe server/scenemax_server.zig -target x86_64-linux-musl -lc -O ReleaseSmall -femit-bin=zig-out/scenemax-server
```

On this Windows machine, if Zig is not on `PATH`, use:

```powershell
& 'C:\dev\zig-x86_64-windows-0.16.0\zig.exe' build-exe server\scenemax_server.zig -target x86_64-linux-musl -lc -O ReleaseSmall -femit-bin=zig-out/scenemax-server
```

Upload these items to the remote server folder:

- `zig-out/scenemax-server`
- `dist/`
- `src/content/`
- `public/assets/tutorials/`

Run the server from the uploaded folder:

```bash
chmod +x scenemax-server
ADMIN_USERNAME=admin ADMIN_PASSWORD=change-me PORT=8080 ./scenemax-server
```

The backend uses `src/content/` as the live tutorial content store.

The production server:

- serves the built SPA from `dist/`
- serves `/assets/tutorials/*` from `public/assets/tutorials/` so admin uploads are immediately available
- serves `/api/admin/*` for tutorial, sample, script, asset, and hero carousel editing
- serves `/api/content/tutorials*` so public tutorial pages read current tutorial content at refresh time
- protects `/admin/*` and `/api/admin/*` with Basic Auth when `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set

Tutorial edits are written back to `src/content/` and uploaded media is written to `public/assets/tutorials/`. Public tutorial list and detail pages fetch that tutorial content from the backend on refresh, so tutorial clip/script/sample changes do not require a rebuild or restart. Changes to the general website structure still require `npm run build`.

The Node backend can still be used on machines with a modern Node.js install:

```bash
npm ci
npm run build
ADMIN_USERNAME=admin ADMIN_PASSWORD=change-me PORT=8080 npm start
```
