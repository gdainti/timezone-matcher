
[Demo: tz.gdainti.com](https://tz.gdainti.com)

## Deployment

One Docker container serves the built site with nginx; there is no backend. Shipping works the same
way as slicefall.

Pushing to `main` runs `.github/workflows/deploy.yml`:

1. **check**: `npm run check`. This also runs on pull requests.
2. **image**: builds the Docker image and pushes `ghcr.io/gdainti/timezone-matcher:latest` and
   `:sha-<commit>`. Pull requests only build it.
3. **deploy**: calls the deployment webhook. The server runs
   `/opt/docker/timezone-matcher/deploy.sh`, which pulls the image, restarts the container and
   waits until it is healthy. Without `WEBHOOK_URL` set, this step only warns.

The image is unprivileged nginx (uid 101) on port 8080 with the site in `/srv/www`, owned by root
and read-only to nginx. `nginx/default.conf` serves gzip-precompressed files, caches `/assets/`
(hashed names) for a year and revalidates everything else, answers `/healthz`, allows only GET and
HEAD, and sends the security headers in `nginx/security-headers.conf`: a strict CSP (no inline
scripts or styles; Google Analytics is the only third party), HSTS without `includeSubDomains`,
`nosniff`, no framing, a Permissions-Policy and same-origin COOP/CORP.

`compose.yaml` runs it with a read-only filesystem (only `/tmp` is writable), no Linux
capabilities, `no-new-privileges`, memory, CPU and process limits and rotated logs. Actions are
pinned to commit SHAs and both base images to digests; Dependabot opens a PR when one has an update.

The container joins the external `internet-grid` network, so Nginx Proxy Manager reaches it as
`timezone-matcher:8080`. No port is published on the host.

Test the image locally:

```sh
docker build -t timezone-matcher .
docker run --rm --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  -p 8080:8080 timezone-matcher
```

### One-time setup

**GitHub** (repo → Settings → Environments → `production`): under "Deployment branches and tags"
allow only `main`, then add:

| Name             | Type     | Value                                           |
| ---------------- | -------- | ----------------------------------------------- |
| `WEBHOOK_URL`    | secret   | URL of the timezone-matcher hook on the server  |
| `WEBHOOK_SECRET` | secret   | token the hook checks                           |
| `APP_URL`        | variable | optional, `https://tz.gdainti.com`              |

The first push creates the `timezone-matcher` package on ghcr.io as private. Either make it public
(package → Package settings → Change visibility) or `docker login ghcr.io` on the server with a
token that has `read:packages`.

**Server:**

```sh
mkdir -p /opt/docker/timezone-matcher && cd /opt/docker/timezone-matcher
# copy compose.yaml and deploy.sh from the repo here (chmod +x deploy.sh)
./deploy.sh
```

Point the webhook receiver's timezone-matcher hook at `/opt/docker/timezone-matcher/deploy.sh`. CI
does not sync `compose.yaml` or `deploy.sh`, so copy them to the server again when they change.

**DNS:** an `A` record for `tz.gdainti.com` pointing at the server.

**Nginx Proxy Manager:** add a proxy host for `tz.gdainti.com` → scheme `http`, host
`timezone-matcher`, port `8080`, with a Let's Encrypt certificate, "Force SSL" and HTTP/2. Leave its
HSTS option off (the container already sends the header) and add nothing in the Advanced tab, or
the security headers can end up doubled.

The old address `gdainti.com/timezone-matcher/` (and anything under it) answers with a 301 to
`https://tz.gdainti.com/`, set in gdainti.com's `nginx.conf` on the server.

# Svelte + TS + Vite

This template should help get you started developing with Svelte and TypeScript in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).

## Need an official Svelte framework?

Check out [SvelteKit](https://github.com/sveltejs/kit#readme), which is also powered by Vite. Deploy anywhere with its serverless-first approach and adapt to various platforms, with out of the box support for TypeScript, SCSS, and Less, and easily-added support for mdsvex, GraphQL, PostCSS, Tailwind CSS, and more.

## Technical considerations

**Why use this over SvelteKit?**

- It brings its own routing solution which might not be preferable for some users.
- It is first and foremost a framework that just happens to use Vite under the hood, not a Vite app.

This template contains as little as possible to get started with Vite + TypeScript + Svelte, while taking into account the developer experience with regards to HMR and intellisense. It demonstrates capabilities on par with the other `create-vite` templates and is a good starting point for beginners dipping their toes into a Vite + Svelte project.

Should you later need the extended capabilities and extensibility provided by SvelteKit, the template has been structured similarly to SvelteKit so that it is easy to migrate.

**Why `global.d.ts` instead of `compilerOptions.types` inside `jsconfig.json` or `tsconfig.json`?**

Setting `compilerOptions.types` shuts out all other types not explicitly listed in the configuration. Using triple-slash references keeps the default TypeScript setting of accepting type information from the entire workspace, while also adding `svelte` and `vite/client` type information.

**Why include `.vscode/extensions.json`?**

Other templates indirectly recommend extensions via the README, but this file allows VS Code to prompt the user to install the recommended extension upon opening the project.

**Why enable `allowJs` in the TS template?**

While `allowJs: false` would indeed prevent the use of `.js` files in the project, it does not prevent the use of JavaScript syntax in `.svelte` files. In addition, it would force `checkJs: false`, bringing the worst of both worlds: not being able to guarantee the entire codebase is TypeScript, and also having worse typechecking for the existing JavaScript. In addition, there are valid use cases in which a mixed codebase may be relevant.

**Why is HMR not preserving my local component state?**

HMR state preservation comes with a number of gotchas! It has been disabled by default in both `svelte-hmr` and `@sveltejs/vite-plugin-svelte` due to its often surprising behavior. You can read the details [here](https://github.com/rixo/svelte-hmr#svelte-hmr).

If you have state that's important to retain within a component, consider creating an external store which would not be replaced by HMR.

```ts
// store.ts
// An extremely simple external store
import { writable } from 'svelte/store'
export default writable(0)
```
