#!/usr/bin/env bash
set -euo pipefail
# Existing persistent content keeps its UID/GID. Only the reviewed database
# driver bridge is migrated; all products, configuration and uploads persist.
php /opt/relay/prepare.php /var/www/html/wp-includes/class-wpdb.php
exec docker-entrypoint.sh "$@"
