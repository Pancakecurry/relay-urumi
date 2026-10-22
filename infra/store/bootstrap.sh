#!/usr/bin/env bash
set -euo pipefail
php /opt/relay/prepare.php /var/www/html/wp-includes/class-wpdb.php
wp --allow-root eval-file /opt/relay/install.php --skip-wordpress
wp --allow-root plugin activate woocommerce
wp --allow-root eval-file /opt/relay/bootstrap.php
wp --allow-root rewrite structure '/%postname%/' --hard
chown www-data:www-data /var/www/html/.htaccess
