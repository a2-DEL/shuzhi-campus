#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

# Production deployments must inject AUTH_SECRET through the secret manager.
# It must be at least 32 characters; never hard-code or commit it to the repository.
# Optional DeepSeek credentials must also come from the secret manager; never print or commit them.
# Without a valid key, White Ze starts in basic-rule mode and model readiness remains false.
# Bind on the deployment interface; local QA should explicitly use HOSTNAME=127.0.0.1.
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export NODE_ENV=production

if [[ -z "${AUTH_SECRET:-}" || ${#AUTH_SECRET} -lt 32 ]]; then
    echo "AUTH_SECRET must be provided and contain at least 32 characters in production." >&2
    exit 78
fi

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"


start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    PORT=${DEPLOY_RUN_PORT} NODE_ENV=production node dist/server.js
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
