<?php
/**
 * Contact form → one email to the address set under WebFully → Settings. Nothing is stored in the database.
 * The fields and their rules come from the contact page content, so the form and the check never drift apart.
 * Spam: a hidden trap field, a minimum time on the page, and a send limit per visitor.
 * No nonce: cached pages would carry a stale one; the request changes nothing on the site.
 */

defined('ABSPATH') || exit;

const WF_MIN_SECONDS = 3;        // a person needs at least this long to fill the form
const WF_SENDS_PER_HOUR = 5;     // per visitor (hashed IP)
const WF_DEFAULT_RECIPIENT = 'mamered@gmail.com';

add_action('wp_ajax_wf_contact', 'wf_contact');
add_action('wp_ajax_nopriv_wf_contact', 'wf_contact');

/** The platforms with a social icon, in the icons' order (partials/social-template.html). */
const WF_SOCIAL = ['instagram' => 'Instagram', 'facebook' => 'Facebook', 'linkedin' => 'LinkedIn', 'tiktok' => 'TikTok'];

/** Company details shown on the site, each with a show/hide switch (WebFully → Settings). */
const WF_COMPANY = ['email' => 'Email', 'phone' => 'Phone', 'org_no' => 'Organisation number'];

/** WebFully → Settings: the contact form's recipient, company details and social links. */
function wf_settings(): array {
    $saved = function_exists('get_option') ? get_option('wf_settings', []) : [];
    $saved = is_array($saved) ? $saved : [];
    $settings = array_merge(['recipient' => WF_DEFAULT_RECIPIENT], $saved);
    $company = is_array($saved['company'] ?? null) ? $saved['company'] : [];
    $settings['company'] = [];
    foreach (array_keys(WF_COMPANY) as $key) {
        $item = is_array($company[$key] ?? null) ? $company[$key] : [];
        $settings['company'][$key] = ['value' => (string) ($item['value'] ?? ''), 'show' => (bool) ($item['show'] ?? true)];
    }
    $settings['social'] = array_merge(array_fill_keys(array_keys(WF_SOCIAL), ''), is_array($saved['social'] ?? null) ? $saved['social'] : []);
    return $settings;
}

function wf_contact(): void {
    $post = wp_unslash($_POST);
    $site = wf_site();
    $lang = in_array($post['lang'] ?? '', $site['languages'], true) ? $post['lang'] : $site['default_lang'];

    // bots: the trap is filled in, or the form came back too fast
    $started = (int) ($post['started'] ?? 0) / 1000;
    if (!empty($post['fax']) || !$started || time() - $started < WF_MIN_SECONDS) {
        wp_send_json_success(); // look like success, send nothing
    }

    $visitor = 'wf_sends_' . md5(($_SERVER['REMOTE_ADDR'] ?? '') . wp_salt('nonce'));
    $sends = (int) get_transient($visitor);
    if ($sends >= WF_SENDS_PER_HOUR) {
        wp_send_json_error(['reason' => 'limit'], 429);
    }

    $section = null;
    foreach ((wf_doc($lang . '/pages/contact.json')['sections'] ?? []) as $s) {
        if ($s['type'] === 'contact') {
            $section = $s;
        }
    }
    if (!$section) {
        wp_send_json_error(['reason' => 'form'], 500);
    }

    $rows = [];
    $errors = [];
    $email = '';
    $name = '';
    foreach ($section['fields'] as $field) {
        $key = $field['name'];
        $label = $field['label'] ?? $key;
        $raw = $post[$key] ?? '';
        if (!empty($field['multiple'])) {
            $allowed = array_column($field['options'] ?? [], 'label', 'value');
            $picked = array_values(array_intersect(array_keys($allowed), (array) $raw));
            $value = implode(', ', array_map(fn($v) => $allowed[$v], $picked));
        } elseif (!empty($field['options'])) {
            $allowed = array_column($field['options'], 'label', 'value');
            $value = isset($allowed[$raw]) ? $allowed[$raw] : '';
        } elseif (!empty($field['textarea'])) {
            $value = sanitize_textarea_field((string) $raw);
        } else {
            $value = sanitize_text_field((string) $raw);
        }
        if (($field['type'] ?? '') === 'email') {
            $value = sanitize_email($value);
            if ($value !== '' && !is_email($value)) {
                $errors[] = $key;
            }
            $email = $value;
        }
        if ($key === 'name') {
            $name = $value;
        }
        if (!empty($field['required']) && $value === '') {
            $errors[] = $key;
        }
        $value = mb_substr($value, 0, 5000);
        if ($value !== '') {
            $rows[] = $label . ":\n" . $value;
        }
    }
    if (empty($post['consent'])) {
        $errors[] = 'consent';
    }
    if ($errors) {
        wp_send_json_error(['reason' => 'fields', 'fields' => array_values(array_unique($errors))], 422);
    }

    $subject = sprintf('[%s] %s', $site['brand'], $name !== '' ? $name : $email);
    $body = implode("\n\n", $rows) . "\n\n—\n" . wf_site()['base_url'] . wf_url($lang, '/contact/', $site) . ' (' . strtoupper($lang) . ')';
    $headers = ['Content-Type: text/plain; charset=UTF-8'];
    if ($email !== '') {
        $headers[] = 'Reply-To: ' . str_replace(["\r", "\n", '<', '>'], '', $name) . ' <' . $email . '>';
    }
    if (!wp_mail(wf_settings()['recipient'], $subject, $body, $headers)) {
        wp_send_json_error(['reason' => 'mail'], 500);
    }
    set_transient($visitor, $sends + 1, HOUR_IN_SECONDS);
    wp_send_json_success();
}
