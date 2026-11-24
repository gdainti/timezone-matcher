#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export TAG="${1:-latest}"

# Accept only the tags CI pushes, so a mistyped tag stops here instead of at docker pull
if [[ ! "$TAG" =~ ^(latest|sha-[0-9a-f]{40})$ ]]; then
	echo "Bad image tag '$TAG': expected latest or sha-<full commit hash>" >&2
	exit 1
fi

if [ ! -f compose.yaml ]; then
	echo "Missing $(pwd)/compose.yaml (copy it from the repo)" >&2
	exit 1
fi

echo "Deploying ghcr.io/gdainti/timezone-matcher:${TAG}"
docker compose -f compose.yaml pull
docker compose -f compose.yaml up -d --wait --wait-timeout 60
docker image prune -f

echo 'Deployment complete!'
