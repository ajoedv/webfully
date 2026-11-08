<?php
/**
 * Smoke test of the WordPress side (router and contact form) with the few WordPress functions stubbed.
 *   php wordpress/tests/wp-smoke.php            runs every case, each in its own process
 */

$cases = ['home', 'social-setting', 'company-setting', 'en-service', 'redirect', 'missing', 'sitemap', 'robots', 'wp-json', 'contact-ok', 'contact-trap', 'contact-fast', 'contact-missing', 'contact-limit', 'www-host'];
if (!isset($argv[1])) {
    $fails = 0;
    foreach ($cases as $case) {
        $out = shell_exec('php ' . escapeshellarg(__FILE__) . ' ' . escapeshellarg($case) . ' 2>&1');
        $ok = strpos($out, 'PASS') !== false;
        $fails += $ok ? 0 : 1;
        echo ($ok ? 'pass ' : 'FAIL ') . $case . ($ok ? '' : "\n" . $out) . "\n";
    }
    exit($fails ? 1 : 0);
}

$case = $argv[1];
define('ABSPATH', __DIR__);
define('WF_BASE_URL', 'https://webfully.se');
define('HOUR_IN_SECONDS', 3600);
$GLOBALS['wf_test'] = ['headers' => [], 'mail' => [], 'status' => 200, 'options' => [], 'transients' => []];

function add_action(...$a) {}
function do_action(...$a) {}
function is_user_logged_in() { return false; }
function update_option($k, $v) { $GLOBALS['wf_test']['options'][$k] = $v; }
function add_filter(...$a) {}
function is_admin() { return false; }
function wp_doing_ajax() { return false; }
function wp_doing_cron() { return false; }
function home_url($p = '') { return 'https://webfully.se' . $p; }
function untrailingslashit($s) { return rtrim($s, '/'); }
function get_template_directory_uri() { return 'https://webfully.se/wp-content/themes/webfully'; }
function get_template() { return 'webfully'; }
function wp_get_theme() { return new class { function get($k) { return '2026.11.07-test'; } }; }
function admin_url($p = '') { return 'https://webfully.se/wp-admin/' . $p; }
function status_header($c) { $GLOBALS['wf_test']['status'] = $c; }
function nocache_headers() {}
function wp_safe_redirect($to, $code) { echo "REDIRECT $code $to\n"; }
function get_option($k, $d = false) { return $GLOBALS['wf_test']['options'][$k] ?? $d; }
function get_transient($k) { return $GLOBALS['wf_test']['transients'][$k] ?? false; }
function set_transient($k, $v) { $GLOBALS['wf_test']['transients'][$k] = $v; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($s) { return trim(strip_tags($s)); }
function sanitize_textarea_field($s) { return trim(strip_tags($s)); }
function sanitize_email($s) { return trim($s); }
function is_email($s) { return (bool) filter_var($s, FILTER_VALIDATE_EMAIL); }
function wp_salt() { return 'salt'; }
function wp_mail($to, $subject, $body, $headers) { $GLOBALS['wf_test']['mail'][] = compact('to', 'subject', 'body', 'headers'); return true; }
function wp_send_json_success() { echo "JSON success\n"; result(); exit; }
function wp_send_json_error($d, $code) { echo "JSON error $code " . json_encode($d) . "\n"; result(); exit; }

require dirname(__DIR__, 2) . '/theme/webfully/functions.php';

function result() {
    global $case;
    $t = $GLOBALS['wf_test'];
    $out = ob_get_clean();
    $check = [
        'home' => fn() => preg_match_all('#<link rel="stylesheet" href="https://webfully.se/wp-content/themes/webfully/css/bundle-[0-9a-f]{10}\.css\?v=' . preg_quote(wf_version()) . '">#', $out) === 1
            && substr_count($out, 'rel="stylesheet"') === 1 && strpos($out, 'data-endpoint') === false,
        'social-setting' => fn() => strpos($out, 'href="https://www.instagram.com/webfully" target="_blank"') !== false
            && strpos($out, 'href="https://www.facebook.com/" target="_blank"') !== false,
        'company-setting' => fn() => strpos($out, 'href="tel:+46701234567">070-123 45 67</a>') !== false
            && strpos($out, '000000-0000') === false && strpos($out, '"telephone": "+46701234567"') !== false,
        'en-service' => fn() => strpos($out, '<html lang="en"') !== false && strpos($out, 'hreflang="sv" href="https://webfully.se/services/web/"') !== false,
        'redirect' => fn() => strpos($out, 'REDIRECT 301 https://webfully.se/services/web/?x=1') !== false,
        'missing' => fn() => $t['status'] === 404 && strpos($out, 'error-digit--home') !== false,
        'sitemap' => fn() => strpos($out, '<loc>https://webfully.se/en/services/apps/</loc>') !== false,
        'robots' => fn() => strpos($out, 'Sitemap: https://webfully.se/sitemap.xml') !== false,
        'wp-json' => fn() => $out === 'NOT HANDLED',
        'www-host' => fn() => strpos($out, 'https://webfully.se/services/web/?x=1|') !== false && substr_count($out, '|') === 3
            && strpos($out, 'ok-apex|') !== false && strpos($out, 'ok-other|') !== false,
        'contact-ok' => fn() => count($t['mail']) === 1 && $t['mail'][0]['to'] === 'mamered@gmail.com'
            && strpos($t['mail'][0]['body'], "Web, SEO & AEO") !== false && in_array('Reply-To: Anna Test <anna@example.com>', $t['mail'][0]['headers'], true)
            && strpos($out, 'JSON success') !== false,
        'contact-trap' => fn() => !$t['mail'] && strpos($out, 'JSON success') !== false,
        'contact-fast' => fn() => !$t['mail'] && strpos($out, 'JSON success') !== false,
        'contact-missing' => fn() => !$t['mail'] && strpos($out, '"fields":["company","message","consent"]') !== false,
        'contact-limit' => fn() => !$t['mail'] && strpos($out, 'JSON error 429') !== false,
    ][$case];
    echo $out;
    echo $check() ? "PASS\n" : "\nCHECK FAILED\n";
    if (!$check()) {
        print_r($t['mail']);
    }
}

if ($case === 'company-setting') {
    $GLOBALS['wf_test']['options']['wf_settings'] = ['company' => ['phone' => ['value' => '070-123 45 67', 'show' => true], 'org_no' => ['value' => '', 'show' => false]]];
}
if ($case === 'social-setting') {
    $GLOBALS['wf_test']['options']['wf_settings'] = ['social' => ['instagram' => 'https://www.instagram.com/webfully']];
}
$paths = ['home' => '/', 'social-setting' => '/', 'company-setting' => '/contact/', 'en-service' => '/en/services/web/', 'redirect' => '/services/web?x=1', 'missing' => '/nothing-here/',
    'sitemap' => '/sitemap.xml', 'robots' => '/robots.txt', 'wp-json' => '/wp-json/wp/v2/posts'];
ob_start();
register_shutdown_function(function () { if (ob_get_level()) { result(); } });
if ($case === 'www-host') {
    echo wf_canonical_host_url('www.webfully.se', '/services/web/?x=1', 'https://webfully.se') . "|\n";
    echo (wf_canonical_host_url('webfully.se', '/', 'https://webfully.se') === '' ? 'ok-apex' : 'bad') . "|\n";
    echo (wf_canonical_host_url('www.other.se', '/', 'https://webfully.se') === '' ? 'ok-other' : 'bad') . "|\n";
    result();
    exit;
}
if (isset($paths[$case])) {
    [$p, $q] = array_pad(explode('?', $paths[$case], 2), 2, '');
    $_SERVER['REQUEST_URI'] = $paths[$case];
    $_SERVER['QUERY_STRING'] = $q;
    wf_route();
    echo 'NOT HANDLED';
    result();
    exit;
}
$_SERVER['REMOTE_ADDR'] = '203.0.113.9';
$valid = ['lang' => 'en', 'started' => (string) ((time() - 30) * 1000), 'fax' => '', 'name' => 'Anna Test', 'company' => 'Test AB',
    'email' => 'anna@example.com', 'type' => ['web', 'seo-aeo'], 'message' => 'We need a new site.', 'consent' => 'on'];
$_POST = [
    'contact-ok' => $valid,
    'contact-trap' => array_merge($valid, ['fax' => 'spam']),
    'contact-fast' => array_merge($valid, ['started' => (string) (time() * 1000)]),
    'contact-missing' => array_merge($valid, ['company' => '', 'message' => '', 'consent' => '']),
    'contact-limit' => $valid,
][$case];
if ($case === 'contact-limit') {
    $GLOBALS['wf_test']['transients']['wf_sends_' . md5('203.0.113.9salt')] = 5;
}
wf_contact();
