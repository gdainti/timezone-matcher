# syntax=docker/dockerfile:1

# Base images are pinned by digest so every build starts from the same bytes; Dependabot proposes updates
FROM node:26-trixie-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
	# precompressed copies for nginx's gzip_static, so nothing is compressed per request
	&& find dist -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.json' -o -name '*.txt' \) \
		-size +1k -exec gzip -9 -k {} +

# A static site needs no Node at runtime: unprivileged nginx (uid 101, port 8080) serves the build
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
# Files stay owned by root, so the nginx user can read but not change them
COPY --from=build /app/dist /srv/www
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
	CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
