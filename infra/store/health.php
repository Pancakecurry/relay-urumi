<?php
// Readiness includes a real database connection; liveness tests Apache separately.
define('SHORTINIT', true);
require_once __DIR__ . '/wp-config.php';
global $wpdb;
if ($wpdb->get_var('SELECT 1') !== '1') { http_response_code(503); exit; }
header('Content-Type: text/plain'); echo "ready\n";
