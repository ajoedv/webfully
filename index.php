<?php
/**
 * WordPress requires this file in every theme. The router (inc/router.php) answers every front-end URL
 * before WordPress picks a template, so this only runs if it was bypassed: show the 404 page.
 */

defined('ABSPATH') || exit;

status_header(404);
foreach (wf_routes() as [$key, $lang, $file, $path]) {
    if ($key === '404') {
        echo wf_render_page($key, $lang, $file, $path, wf_env());
        exit;
    }
}
