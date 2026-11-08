<?php
/**
 * WebFully theme. WordPress is the editor and the mail sender; the pages themselves come from the theme:
 *   inc/engine.php   template engine (twin of src/build.py)
 *   inc/site.php     pages, services, structured data, sitemap
 *   inc/router.php   answers every front-end URL with a theme page
 *   inc/contact.php  contact form → email (nothing is stored)
 *   inc/admin.php    the WebFully fields panel in the admin
 */

defined('ABSPATH') || exit;

define('WF_DIR', __DIR__);

require WF_DIR . '/inc/engine.php';
require WF_DIR . '/inc/site.php';
require WF_DIR . '/inc/router.php';
require WF_DIR . '/inc/contact.php';

if (is_admin()) {
    require WF_DIR . '/inc/admin.php';
}

/**
 * One address per page: www.webfully.se answers with a permanent redirect to webfully.se (the address set in
 * WordPress), keeping path and query. Search engines and the SEO checkers treat the two hosts as separate sites otherwise.
 */
function wf_canonical_host_url(string $request_host, string $request_uri, string $home): string {
    $want = strtolower((string) parse_url($home, PHP_URL_HOST));
    $have = strtolower(preg_replace('/:\d+$/', '', $request_host));
    if ($want === '' || $have === $want || $have !== 'www.' . $want) {
        return '';
    }
    return rtrim($home, '/') . ($request_uri !== '' ? $request_uri : '/');
}

add_action('init', function () {
    if (PHP_SAPI === 'cli' || headers_sent() || empty($_SERVER['HTTP_HOST'])) {
        return;
    }
    $to = wf_canonical_host_url($_SERVER['HTTP_HOST'], $_SERVER['REQUEST_URI'] ?? '/', home_url());
    if ($to !== '') {
        header('X-LiteSpeed-Cache-Control: no-cache');
        wp_redirect($to, 301);
        exit;
    }
}, 0);

add_action('after_setup_theme', function () {
    if (!defined('WF_BASE_URL')) {
        define('WF_BASE_URL', untrailingslashit(home_url()));
    }
});

/**
 * The deployed version (date + commit), written by build.py --theme. Read from the file itself: WordPress keeps
 * theme headers in its object cache, which can still hold the previous version after a deploy.
 */
function wf_version(): string {
    static $version = null;
    if ($version === null) {
        $file = WF_DIR . '/version.txt';
        $version = is_file($file) ? trim(file_get_contents($file)) : 'dev';
    }
    return $version;
}

/**
 * llms.txt sits as a real file in the site root (the web server serves it before WordPress runs), so the theme
 * writes it: after every deploy and every content save. It replaces the one a host plugin may have written.
 */
function wf_write_llms(): void {
    @file_put_contents(ABSPATH . 'llms.txt', wf_llms());
}

/** The root icons as real files too: the host answers /favicon.ico itself and never asks WordPress. */
function wf_write_icons(): void {
    foreach (wf_section_assets()['root_icons'] as $name) {
        @copy(WF_DIR . '/assets/icons/' . $name, ABSPATH . $name);
    }
}

/** Empties the page cache: LiteSpeed Cache's own hook, plus the header LiteSpeed reads even without it. */
function wf_purge(): void {
    do_action('litespeed_purge_all');
    if (!headers_sent()) {
        header('X-LiteSpeed-Purge: *');
    }
}

// A new theme version (a deploy): empty the cache once, so no page refers to the old CSS and JS.
// The deploy workflow requests a fresh URL right after deploying, which runs this.
add_action('init', function () {
    $version = wf_version();
    if (get_option('wf_version') !== $version) {
        update_option('wf_version', $version, true);
        wf_write_llms();
        wf_write_icons();
        wf_purge();
    }
});

// The list of user accounts stays private: only logged-in users see the users endpoint of the REST API
add_filter('rest_endpoints', function ($endpoints) {
    if (!is_user_logged_in()) {
        unset($endpoints['/wp/v2/users'], $endpoints['/wp/v2/users/(?P<id>[\d]+)']);
    }
    return $endpoints;
});

// The theme writes its own sitemap.xml, robots.txt and head: switch off WordPress' versions
add_filter('wp_sitemaps_enabled', '__return_false');
add_filter('xmlrpc_enabled', '__return_false');
