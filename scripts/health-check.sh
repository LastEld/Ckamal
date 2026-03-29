#!/bin/bash
#
# CogniMesh Health Check Script
# For use in container health checks and monitoring
#

set -e

# Configuration
HOST="${HEALTH_CHECK_HOST:-localhost}"
PORT="${HEALTH_CHECK_PORT:-3000}"
ENDPOINT="${HEALTH_CHECK_ENDPOINT:-/health/live}"
TIMEOUT="${HEALTH_CHECK_TIMEOUT:-5}"

# Full URL
URL="http://${HOST}:${PORT}${ENDPOINT}"

# Perform health check
if curl -fsS --max-time "$TIMEOUT" "$URL" > /dev/null 2>&1; then
    echo "Health check passed: $URL"
    exit 0
else
    echo "Health check failed: $URL"
    exit 1
fi
