<?php
/**
 * WebFully fields panel (Admin → WebFully). Every content file becomes a form: texts, images, links and lists,
 * built from the file's own shape (admin/editor.js). Saved content lives in one option, wf_content; a file
 * that was never saved shows the version shipped with the theme. Structure keys (type, kind, key) stay read-only.
 */

defined('ABSPATH') || exit;

const WF_CAP = 'edit_theme_options';

add_action('admin_menu', function () {
    add_menu_page('WebFully', 'WebFully', WF_CAP, 'wf-content', 'wf_admin_content', 'dashicons-admin-site-alt3', 3);
    add_submenu_page('wf-content', 'Content', 'Content', WF_CAP, 'wf-content', 'wf_admin_content');
    add_submenu_page('wf-content', 'Settings', 'Settings', WF_CAP, 'wf-settings', 'wf_admin_settings');
});

add_action('admin_enqueue_scripts', function ($hook) {
    if (strpos($hook, 'wf-') === false) {
        return;
    }
    $version = wf_version();
    wp_enqueue_style('wf-editor', get_template_directory_uri() . '/admin/editor.css', [], $version);
    if (!empty($_GET['doc'])) {
        wp_enqueue_media();
        wp_enqueue_script('wf-editor', get_template_directory_uri() . '/admin/editor.js', [], $version, true);
    }
});

/** Every content file: shipped ones plus any saved one, in a stable order. */
function wf_doc_keys(): array {
    $keys = array_unique(array_merge(array_keys(wf_bundled_docs()), array_keys(wf_saved_docs())));
    sort($keys);
    return $keys;
}

/** A readable name for a content file. */
function wf_doc_label(string $key): string {
    $langs = ['sv' => 'Svenska', 'en' => 'English'];
    if ($key === 'site.json') {
        return 'Shared: brand, contact details, packages, services';
    }
    $parts = explode('/', preg_replace('/\.json$/', '', $key));
    $lang = $langs[$parts[0]] ?? strtoupper($parts[0]);
    if (($parts[1] ?? '') === 'common') {
        return $lang . ' · Shared texts (nav, footer, cookies, labels)';
    }
    $doc = wf_doc($key);
    $title = $doc['chapter']['name'] ?? ($doc['meta']['title'] ?? end($parts));
    $kind = ($parts[1] ?? '') === 'services' ? 'Service' : 'Page';
    return $lang . ' · ' . $kind . ' · ' . $title;
}

/** The public URL of a content file, when it is a page. */
function wf_doc_url(string $key): ?string {
    foreach (wf_routes() as $url => [$route_key, $lang, $file]) {
        if ($lang . '/' . $file === $key) {
            return home_url($url);
        }
    }
    return null;
}

function wf_admin_content(): void {
    if (!current_user_can(WF_CAP)) {
        return;
    }
    $key = isset($_GET['doc']) ? sanitize_text_field(wp_unslash($_GET['doc'])) : '';
    if ($key !== '' && in_array($key, wf_doc_keys(), true)) {
        wf_admin_edit($key);
        return;
    }
    $saved = wf_saved_docs();
    echo '<div class="wrap wf-admin"><h1>WebFully · Content</h1>';
    wf_admin_notice();
    echo '<p>Every text, image and link of the site. Pick a page to edit it; the site updates when you save.</p>';
    $groups = [];
    foreach (wf_doc_keys() as $k) {
        $group = $k === 'site.json' ? 'Shared' : (strpos($k, 'sv/') === 0 ? 'Svenska' : (strpos($k, 'en/') === 0 ? 'English' : 'Other'));
        $groups[$group][] = $k;
    }
    foreach ($groups as $group => $keys) {
        echo '<h2>' . esc_html($group) . '</h2><table class="widefat striped wf-docs"><tbody>';
        foreach ($keys as $k) {
            $edit = add_query_arg(['page' => 'wf-content', 'doc' => $k], admin_url('admin.php'));
            $url = wf_doc_url($k);
            echo '<tr><td><a class="row-title" href="' . esc_url($edit) . '">' . esc_html(wf_doc_label($k)) . '</a>'
                . '<div class="wf-doc-key">' . esc_html($k) . '</div></td>'
                . '<td class="wf-doc-state">' . (isset($saved[$k]) ? 'Edited' : 'Theme version') . '</td>'
                . '<td class="wf-doc-view">' . ($url ? '<a href="' . esc_url($url) . '" target="_blank" rel="noopener">View</a>' : '') . '</td></tr>';
        }
        echo '</tbody></table>';
    }
    $export = wp_nonce_url(admin_url('admin-post.php?action=wf_export'), 'wf_export');
    echo '<p class="wf-actions"><a class="button" href="' . esc_url($export) . '">Download all content (backup)</a></p></div>';
}

function wf_admin_edit(string $key): void {
    $doc = wf_doc($key);
    $saved = isset(wf_saved_docs()[$key]);
    $url = wf_doc_url($key);
    $back = admin_url('admin.php?page=wf-content');
    echo '<div class="wrap wf-admin"><p><a href="' . esc_url($back) . '">← All content</a></p>';
    echo '<h1>' . esc_html(wf_doc_label($key)) . '</h1>';
    wf_admin_notice();
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" class="wf-form" id="wf-form">';
    wp_nonce_field('wf_save_' . $key);
    echo '<input type="hidden" name="action" value="wf_save_doc"><input type="hidden" name="doc" value="' . esc_attr($key) . '">';
    echo '<textarea name="json" id="wf-json" data-doc="' . esc_attr($key) . '" hidden>' . esc_textarea(wp_json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . '</textarea>';
    echo '<div id="wf-editor" class="wf-editor"><p>Loading the editor…</p></div>';
    echo '<div class="wf-savebar"><button class="button button-primary button-large" type="submit">Save</button>';
    if ($url) {
        echo ' <a class="button button-large" href="' . esc_url($url) . '" target="_blank" rel="noopener">View page</a>';
    }
    echo '<span class="wf-doc-key">' . esc_html($key) . ' · ' . ($saved ? 'edited' : 'theme version') . '</span></div></form>';
    if ($saved && isset(wf_bundled_docs()[$key])) {
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" class="wf-reset" onsubmit="return confirm(\'Replace your edits with the version shipped with the theme?\')">';
        wp_nonce_field('wf_reset_' . $key);
        echo '<input type="hidden" name="action" value="wf_reset_doc"><input type="hidden" name="doc" value="' . esc_attr($key) . '">';
        echo '<button class="button-link wf-danger" type="submit">Go back to the theme version of this page</button></form>';
    }
    echo '</div>';
}

function wf_admin_notice(): void {
    $notices = [
        'saved' => ['success', 'Saved. The site shows the new version now.'],
        'reset' => ['success', 'Back to the theme version.'],
        'invalid' => ['error', 'Not saved: the content could not be read.'],
        'settings' => ['success', 'Settings saved.'],
    ];
    $n = isset($_GET['wf']) ? sanitize_key($_GET['wf']) : '';
    if (isset($notices[$n])) {
        echo '<div class="notice notice-' . $notices[$n][0] . ' is-dismissible"><p>' . esc_html($notices[$n][1]) . '</p></div>';
    }
}

/** Saves after any change, and clears the page cache when a cache plugin is there. */
function wf_store(array $docs): void {
    update_option('wf_content', $docs, false);
    wf_write_llms();
    wf_purge();
    if (function_exists('wp_cache_flush')) {
        wp_cache_flush();
    }
}

add_action('admin_post_wf_save_doc', function () {
    $key = sanitize_text_field(wp_unslash($_POST['doc'] ?? ''));
    if (!current_user_can(WF_CAP) || !in_array($key, wf_doc_keys(), true)) {
        wp_die('Not allowed.', 403);
    }
    check_admin_referer('wf_save_' . $key);
    $data = json_decode(wp_unslash($_POST['json'] ?? ''), true);
    $back = add_query_arg(['page' => 'wf-content', 'doc' => $key], admin_url('admin.php'));
    if (!is_array($data)) {
        wp_safe_redirect(add_query_arg('wf', 'invalid', $back));
        exit;
    }
    // only administrators may save markup; for everyone else text stays text
    if (!current_user_can('unfiltered_html')) {
        array_walk_recursive($data, function (&$v) {
            if (is_string($v)) {
                $v = wp_kses_post($v);
            }
        });
    }
    $docs = wf_saved_docs();
    $docs[$key] = $data;
    wf_store($docs);
    wp_safe_redirect(add_query_arg('wf', 'saved', $back));
    exit;
});

add_action('admin_post_wf_reset_doc', function () {
    $key = sanitize_text_field(wp_unslash($_POST['doc'] ?? ''));
    if (!current_user_can(WF_CAP)) {
        wp_die('Not allowed.', 403);
    }
    check_admin_referer('wf_reset_' . $key);
    $docs = wf_saved_docs();
    unset($docs[$key]);
    wf_store($docs);
    wp_safe_redirect(add_query_arg(['page' => 'wf-content', 'doc' => $key, 'wf' => 'reset'], admin_url('admin.php')));
    exit;
});

add_action('admin_post_wf_export', function () {
    if (!current_user_can(WF_CAP)) {
        wp_die('Not allowed.', 403);
    }
    check_admin_referer('wf_export');
    $all = [];
    foreach (wf_doc_keys() as $k) {
        $all[$k] = wf_doc($k);
    }
    nocache_headers();
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="webfully-content-' . gmdate('Y-m-d') . '.json"');
    echo wp_json_encode($all, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
});

// ---------- Settings ----------

function wf_admin_settings(): void {
    if (!current_user_can(WF_CAP)) {
        return;
    }
    $s = wf_settings();
    echo '<div class="wrap wf-admin"><h1>WebFully · Settings</h1>';
    wf_admin_notice();
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('wf_settings');
    echo '<input type="hidden" name="action" value="wf_settings">';
    echo '<table class="form-table"><tr><th scope="row"><label for="wf-recipient">Contact form goes to</label></th>'
        . '<td><input class="regular-text" type="email" id="wf-recipient" name="recipient" value="' . esc_attr($s['recipient']) . '" required>'
        . '<p class="description">Every message from the contact form is emailed here. Messages are not stored on the site.</p></td></tr></table>';
    echo '<h2>Company details</h2><p>Shown in the footer, the CTA, the contact page and the business data Google reads. Untick "Show" to hide one everywhere until it is ready. An empty field keeps the value from the theme.</p>';
    echo '<table class="form-table">';
    $site = wf_doc('site.json');
    foreach (WF_COMPANY as $key => $label) {
        $item = $s['company'][$key];
        $id = 'wf-company-' . $key;
        echo '<tr><th scope="row"><label for="' . esc_attr($id) . '">' . esc_html($label) . '</label></th>'
            . '<td><input class="regular-text" type="' . ($key === 'email' ? 'email' : 'text') . '" id="' . esc_attr($id) . '" name="company[' . esc_attr($key) . '][value]" value="'
            . esc_attr($item['value']) . '" placeholder="' . esc_attr($site['contact'][$key] ?? '') . '"> '
            . '<label><input type="checkbox" name="company[' . esc_attr($key) . '][show]" value="1"' . checked($item['show'], true, false) . '> Show</label></td></tr>';
    }
    echo '</table>';
    echo '<h2>Social media</h2><p>The links behind the social icons in the hero and the footer. They always open in a new tab. Leave a field empty to keep the platform\'s start page.</p>';
    echo '<table class="form-table">';
    foreach (WF_SOCIAL as $key => $label) {
        echo '<tr><th scope="row"><label for="wf-social-' . esc_attr($key) . '">' . esc_html($label) . '</label></th>'
            . '<td><input class="regular-text code" type="url" id="wf-social-' . esc_attr($key) . '" name="social[' . esc_attr($key) . ']" value="'
            . esc_attr($s['social'][$key]) . '" placeholder="https://www.' . esc_attr($key) . '.com/webfully"></td></tr>';
    }
    echo '</table>';
    submit_button('Save settings');
    echo '</form></div>';
}

add_action('admin_post_wf_settings', function () {
    if (!current_user_can(WF_CAP)) {
        wp_die('Not allowed.', 403);
    }
    check_admin_referer('wf_settings');
    $email = sanitize_email(wp_unslash($_POST['recipient'] ?? ''));
    $settings = wf_settings();
    if (is_email($email)) {
        $settings['recipient'] = $email;
    }
    $company = (array) wp_unslash($_POST['company'] ?? []);
    foreach (array_keys(WF_COMPANY) as $key) {
        $value = sanitize_text_field((string) ($company[$key]['value'] ?? ''));
        if ($key === 'email' && $value !== '' && !is_email($value)) {
            $value = $settings['company'][$key]['value'];
        }
        $settings['company'][$key] = ['value' => $value, 'show' => !empty($company[$key]['show'])];
    }
    $social = (array) wp_unslash($_POST['social'] ?? []);
    foreach (array_keys(WF_SOCIAL) as $key) {
        $link = esc_url_raw(trim((string) ($social[$key] ?? '')), ['https', 'http']);
        $settings['social'][$key] = $link;
    }
    update_option('wf_settings', $settings, false);
    wf_purge();
    wp_safe_redirect(admin_url('admin.php?page=wf-settings&wf=settings'));
    exit;
});
