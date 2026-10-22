<?php
/** Plugin Name: Relay private WooCommerce REST boundary */
if (getenv('RELAY_DB_TLS') !== 'true') { return; }
// Also covers ?rest_route=/wc/v3/... and encoded/rewrite variants. Apache's
// location rule is supplementary; authorization follows WordPress's route.
add_filter('rest_pre_dispatch', function ($result, $server, $request) {
    if (preg_match('#^/wc/v3(?:/|$)#', $request->get_route())) {
        $peer = $_SERVER['SSL_CLIENT_S_DN_CN'] ?? '';
        $verified = $_SERVER['SSL_CLIENT_VERIFY'] ?? '';
        $expected = getenv('RELAY_ADAPTER_CN');
        if ($verified !== 'SUCCESS' || !$expected || !hash_equals($expected, $peer)) {
            return new WP_Error('relay_private_adapter_required', 'A verified private adapter connection is required.', ['status' => 403]);
        }
    }
    return $result;
}, 5, 3);
