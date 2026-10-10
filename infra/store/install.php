<?php
// Runs with --skip-wordpress so a genuinely uninstalled site can be initialized.
define('WP_INSTALLING', true);
require getcwd() . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
add_filter('pre_wp_mail', '__return_false'); // Synthetic local store has no SMTP service.
if (!is_blog_installed()) {
    $result = wp_install(getenv('RELAY_SITE_TITLE'), 'relay_admin', 'admin@example.test', false, '', trim(file_get_contents('/run/admin/password')));
    if (is_wp_error($result)) { WP_CLI::error('WordPress installation failed'); }
    WP_CLI::line('WordPress installed; credential values suppressed.');
} else {
    // Synchronize the explicit installation input; never generate a new user.
    $user = get_user_by('login', 'relay_admin');
    if (!$user || !in_array('administrator', $user->roles, true)) { WP_CLI::error('Administrator identity conflict'); }
    $password = trim(file_get_contents('/run/admin/password'));
    if (!wp_check_password($password, $user->user_pass, $user->ID)) { wp_set_password($password, $user->ID); }
    WP_CLI::line('Existing WordPress administrator verified.');
}
