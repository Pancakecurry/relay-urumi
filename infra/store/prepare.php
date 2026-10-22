<?php
// The pinned WordPress7.1.3 wpdb uses mysqli_init without exposing ssl_set.
// Add verified CA/client setup at that single reviewed anchor. Refuse unknown
// core files rather than overwriting owner changes or guessing another version.
function relay_prepare_database_tls($file) {
    if (!file_exists($file)) { return; }
    $original = file_get_contents($file);
    $hash = hash('sha256', $original);
    if ($hash === '818ab9a92ed598cbae3f0f23634beb19a979b9b8d3c3d639eb58889c2525e304') { return; }
    $extra = <<<'PHP'
$this->dbh = mysqli_init();
        // RELAY_VERIFIED_DATABASE_TLS_V2 — exact-version TLS capability bridge.
        if (getenv('RELAY_DB_TLS') === 'true') {
            $client_flags |= MYSQLI_CLIENT_SSL | MYSQLI_CLIENT_SSL_VERIFY_SERVER_CERT;
            if (!mysqli_ssl_set($this->dbh, '/run/wp-tls/tls.key', '/run/wp-tls/tls.crt', '/run/wp-tls/ca.crt', null, null)) {
                throw new RuntimeException('Verified database TLS setup unavailable');
            }
        }
PHP;
    if ($hash === 'e15403e90032dd0508811301505e491d4212de5152581a98f51b744a1a3903bd') {
        $anchor = '$this->dbh = mysqli_init();';
    } elseif ($hash === 'd963d00cc4dd11e779b4fe1d2af2bac773a3168abf52fb8e2f4711e27175aaed') {
        $anchor = <<<'PHP'
$this->dbh = mysqli_init();
        // RELAY_VERIFIED_DATABASE_TLS_V1 — exact-version TLS capability bridge.
        if (getenv('RELAY_DB_TLS') === 'true') {
            $client_flags |= MYSQLI_CLIENT_SSL;
            if (!mysqli_ssl_set($this->dbh, '/run/wp-tls/tls.key', '/run/wp-tls/tls.crt', '/run/wp-tls/ca.crt', null, null)
                || !mysqli_options($this->dbh, MYSQLI_OPT_SSL_VERIFY_SERVER_CERT, true)) {
                throw new RuntimeException('Verified database TLS setup unavailable');
            }
        }
PHP;
    } else {
        throw new RuntimeException('Unreviewed WordPress database driver; refusing TLS migration');
    }
    if (substr_count($original, $anchor) !== 1) { throw new RuntimeException('Database driver anchor mismatch'); }
    $next = str_replace($anchor, $extra, $original);
    if (hash('sha256', $next) !== '818ab9a92ed598cbae3f0f23634beb19a979b9b8d3c3d639eb58889c2525e304') { throw new RuntimeException('Database driver TLS target mismatch'); }
    $temporary = tempnam(dirname($file), '.relay-db-tls-');
    if ($temporary === false || file_put_contents($temporary, $next) !== strlen($next)
        || !chmod($temporary, fileperms($file) & 0777) || !rename($temporary, $file)) {
        if ($temporary !== false) { @unlink($temporary); }
        throw new RuntimeException('Database driver TLS migration unavailable');
    }
}
if (realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    $file = $argv[1] ?? '/var/www/html/wp-includes/class-wpdb.php';
    relay_prepare_database_tls($file);
    $content = dirname(dirname($file)) . '/wp-content';
    if (is_dir($content)) {
        $directory = $content . '/mu-plugins';
        if (!is_dir($directory) && !mkdir($directory, 0755, true)) { throw new RuntimeException('Private REST plugin directory unavailable'); }
        $target = $directory . '/relay-private-rest.php';
        $source = file_get_contents('/opt/relay/private-rest.php');
        if (file_exists($target) && !hash_equals(hash('sha256', $source), hash_file('sha256', $target))) {
            throw new RuntimeException('Private REST plugin ownership conflict');
        }
        if (!file_exists($target) && file_put_contents($target, $source, LOCK_EX) !== strlen($source)) {
            throw new RuntimeException('Private REST plugin installation unavailable');
        }
    }
}
