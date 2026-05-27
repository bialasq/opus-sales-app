#!/bin/sh
set -e

CONFIG=/usr/share/nginx/html/config.js
sed -i "s|__API_URL__|${API_URL:-/api}|g" "$CONFIG"
sed -i "s|__API_KEY__|${API_KEY:-}|g" "$CONFIG"
sed -i "s|__SENTRY_DSN__|${SENTRY_DSN:-}|g" "$CONFIG"

exec "$@"
