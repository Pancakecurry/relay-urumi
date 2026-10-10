<?php
// Executed by the isolated Helm Job. Never echo credentials.
if (!defined('WP_CLI') || !WP_CLI) { exit(1); }
add_filter('pre_wp_mail', '__return_false');
function relay_check($result, $message) {
    if (is_wp_error($result) || $result === false) { WP_CLI::error($message); }
    return $result;
}
foreach ([
    'home' => getenv('RELAY_SITE_URL'), 'siteurl' => getenv('RELAY_SITE_URL'),
    'timezone_string' => getenv('RELAY_TIMEZONE'), 'woocommerce_currency' => getenv('RELAY_CURRENCY'),
    'woocommerce_default_country' => 'IN', 'woocommerce_calc_taxes' => 'no',
    'woocommerce_enable_guest_checkout' => 'yes', 'woocommerce_enable_signup_and_login_from_checkout' => 'no',
    'woocommerce_coming_soon' => 'no', 'woocommerce_store_pages_only' => 'no',
    'woocommerce_store_email' => 'store@example.test', 'blog_public' => '0',
    'woocommerce_onboarding_profile' => ['completed' => true],
] as $key => $value) { update_option($key, $value); }
WC_Install::create_pages();
foreach (['cart' => '[woocommerce_cart]', 'checkout' => '[woocommerce_checkout]', 'myaccount' => '[woocommerce_my_account]'] as $name => $shortcode) {
    $id = (int) get_option('woocommerce_' . $name . '_page_id');
    relay_check(wp_update_post(['ID' => $id, 'post_content' => $shortcode]), 'Could not configure store page');
}
update_option('woocommerce_cod_settings', [
    'enabled' => 'yes', 'title' => 'Cash on delivery',
    'description' => 'Synthetic demo only. No payment is collected.',
    'instructions' => 'Synthetic test order; no fulfilment.', 'enable_for_methods' => [], 'enable_for_virtual' => 'yes',
]);
$product_ids = [];
foreach ([['RELAY-DEMO-MUG', '[SYNTHETIC DEMO] Relay Mug', '199.00'], ['RELAY-DEMO-NOTEBOOK', '[SYNTHETIC DEMO] Relay Notebook', '99.00']] as [$sku, $name, $price]) {
    $id = wc_get_product_id_by_sku($sku);
    $product = $id ? wc_get_product($id) : new WC_Product_Simple();
    if (!$id) {
        $product->set_sku($sku); $product->set_name($name); $product->set_status('publish');
        $product->set_description('Synthetic assessment data. No real merchandise or fulfilment.');
        $product->set_regular_price($price); $product->set_virtual(true); $product->set_catalog_visibility('visible');
        $product->set_manage_stock(false); $product->set_stock_status('instock');
        $id = relay_check($product->save(), 'Could not seed synthetic product');
    }
    $product_ids[] = $id;
}
// A dedicated WooCommerce service identity; no interactive administration role.
add_role('relay_adapter', 'Relay Private Adapter', [
    'read' => true, 'edit_products' => true, 'edit_others_products' => true,
    'publish_products' => true, 'read_private_products' => true,
    'edit_shop_orders' => true, 'edit_others_shop_orders' => true, 'read_private_shop_orders' => true,
]);
$user = get_user_by('login', 'relay_adapter');
if (!$user) {
    $uid = relay_check(wp_insert_user(['user_login' => 'relay_adapter', 'user_pass' => wp_generate_password(64, true, true), 'role' => 'relay_adapter', 'user_email' => 'adapter@example.test']), 'Could not create service identity');
} else { $uid = $user->ID; }
$ck = trim(file_get_contents('/run/adapter/consumer-key'));
$cs = trim(file_get_contents('/run/adapter/consumer-secret'));
if (!preg_match('/^ck_[a-f0-9]{40}$/', $ck) || !preg_match('/^cs_[a-f0-9]{40}$/', $cs)) { WP_CLI::error('Invalid private adapter credential format'); }
global $wpdb;
$table = $wpdb->prefix . 'woocommerce_api_keys';
// Stable pre-generated Secret makes interruption/retry safe: row lookup uses its hash.
$hash = wc_api_hash($ck);
$row = $wpdb->get_row($wpdb->prepare("SELECT key_id, user_id, consumer_secret, permissions FROM $table WHERE consumer_key = %s", $hash));
if (!$row) {
    relay_check($wpdb->insert($table, ['user_id' => $uid, 'description' => 'Relay private adapter M1', 'permissions' => 'read_write', 'consumer_key' => $hash, 'consumer_secret' => $cs, 'truncated_key' => substr($ck, -7)]), 'Could not register private adapter credential');
    $key_id = $wpdb->insert_id;
} else {
    if ((int)$row->user_id !== (int)$uid || !hash_equals($row->consumer_secret, $cs) || $row->permissions !== 'read_write') { WP_CLI::error('Existing credential conflict; refusing silent rotation'); }
    $key_id = $row->key_id;
}
$uploads = wp_upload_dir();
relay_check(wp_mkdir_p($uploads['basedir']), 'Could not initialize content directory');
$marker = $uploads['basedir'] . '/relay-persistence.txt';
if (!file_exists($marker)) { relay_check(file_put_contents($marker, "relay-m1-synthetic-persistent-content\n"), 'Could not write persistence marker'); }
WP_CLI::line(wp_json_encode(['bootstrap' => 'configured', 'wordpress' => get_bloginfo('version'), 'woocommerce' => WC_VERSION, 'synthetic_product_ids' => $product_ids, 'adapter_key_id' => (int)$key_id, 'timezone' => get_option('timezone_string'), 'currency' => get_woocommerce_currency(), 'cod_enabled' => get_option('woocommerce_cod_settings')['enabled']]));
