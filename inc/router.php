<?php
/**
 * Router: every front-end URL is answered by the theme. Known paths render their page, the same path without
 * its trailing slash redirects to it, sitemap.xml and robots.txt are written here, anything else is the 404 page.
 * WordPress keeps its own endpoints: the admin, login, REST API, cron, admin-ajax and files.
 */

defined('ABSPATH') || exit;

const WF_CACHE_SECONDS = 604800;   // a week; every save and every deploy empties it

add_action('parse_request', 'wf_route', 0);

function wf_route(): void {
    if (is_admin() || wp_doing_ajax() || wp_doing_cron() || isset($_GET['rest_route'])) {
        return;
    }
    $path = wf_request_path();
    if (preg_match('#^/(wp-json|wp-admin|wp-content|wp-includes|wp-login\.php|xmlrpc\.php|wp-cron\.php)(/|$)#', $path)) {
        return;
    }

    if ($path === '/sitemap.xml') {
        wf_send('application/xml; charset=utf-8', wf_sitemap());
    }
    if ($path === '/robots.txt') {
        wf_send('text/plain; charset=utf-8', wf_robots());
    }
    // icons the browsers ask for at the root (assets/icons)
    $icon = ltrim($path, '/');
    if (in_array($icon, wf_section_assets()['root_icons'], true)) {
        $types = ['ico' => 'image/x-icon', 'png' => 'image/png', 'webmanifest' => 'application/manifest+json'];
        header('Cache-Control: public, max-age=604800');
        wf_send($types[pathinfo($icon, PATHINFO_EXTENSION)], file_get_contents(WF_DIR . '/assets/icons/' . $icon));
    }

    $routes = wf_routes();
    if (isset($routes[$path])) {
        [$key, $lang, $file, $page_path] = $routes[$path];
        wf_cacheable();
        wf_send('text/html; charset=utf-8', wf_render_page($key, $lang, $file, $page_path, wf_env()));
    }
    if (substr($path, -1) !== '/' && isset($routes[$path . '/'])) {
        $query = $_SERVER['QUERY_STRING'] ?? '';
        wp_safe_redirect(home_url($path . '/') . ($query !== '' ? '?' . $query : ''), 301);
        exit;
    }

    // not found: the branded 404 page with a 404 status
    status_header(404);
    nocache_headers();
    do_action('litespeed_control_set_nocache', 'webfully: 404');
    header('X-LiteSpeed-Cache-Control: no-cache');
    foreach ($routes as [$key, $lang, $file, $page_path]) {
        if ($key === '404') {
            wf_send('text/html; charset=utf-8', wf_render_page($key, $lang, $file, $page_path, wf_env()));
        }
    }
    wf_send('text/plain; charset=utf-8', 'Not found');
}

/** The request path relative to the site (WordPress may live in a sub-folder). */
function wf_request_path(): string {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $base = parse_url(home_url('/'), PHP_URL_PATH) ?: '/';
    if ($base !== '/' && strpos($path, rtrim($base, '/')) === 0) {
        $path = substr($path, strlen(rtrim($base, '/'))) ?: '/';
    }
    return rawurldecode($path);
}

/** What the templates need from WordPress. */
function wf_env(): array {
    return [
        'asset_url' => untrailingslashit(get_template_directory_uri()),
        'asset_version' => wf_version(),
        'form_endpoint' => admin_url('admin-ajax.php'),
        'bundle' => true,
    ];
}

/**
 * Pages are the same for every visitor: LiteSpeed (server cache, enabled by the LiteSpeed Cache plugin) may keep
 * them. Saving content or deploying a new theme version empties the cache (wf_purge).
 */
function wf_cacheable(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET' || is_user_logged_in()) {
        do_action('litespeed_control_set_nocache', 'webfully: logged in or not GET');
        header('X-LiteSpeed-Cache-Control: no-cache');
        return;
    }
    // the plugin decides late in a normal WordPress request, which the router never reaches: tell it here
    do_action('litespeed_control_set_cacheable', 'webfully page');
    do_action('litespeed_control_set_ttl', WF_CACHE_SECONDS);
    do_action('litespeed_tag_add', 'wf');
    header('X-LiteSpeed-Cache-Control: public,max-age=' . WF_CACHE_SECONDS);
    header('X-LiteSpeed-Tag: wf');
}

function wf_send(string $type, string $body): void {
    header_remove('X-Powered-By');
    header('Content-Type: ' . $type);
    header('X-WF-Version: ' . wf_version());
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    echo $body;
    exit;
}
