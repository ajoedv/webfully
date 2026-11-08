<?php
/**
 * Pages: the PHP twin of the page logic in src/build.py (assets, services, service pages, structured data).
 * Content comes from wf_doc(): what was saved in the admin, else the content files shipped with the theme.
 */

defined('ABSPATH') || exit;

const WF_GSAP = ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js'];
const WF_BASE_STYLES = ['base.css', 'components.css', 'nav.css', 'media.css'];
const WF_END_STYLES = ['footer.css', 'cookie.css'];
const WF_BASE_SCRIPTS = ['base.js', 'social.js', 'nav.js', 'media.js'];
const WF_END_SCRIPTS = ['footer.js', 'cookie.js'];

/** Styles and scripts each section needs: written by src/build.py from SECTION_ASSETS (assets.json). */
function wf_section_assets(): array {
    static $map = null;
    if ($map === null) {
        $map = json_decode(file_get_contents(WF_DIR . '/assets.json'), true);
    }
    return $map;
}

function wf_assets_for(array $page, bool $is_home): array {
    $map = wf_section_assets();
    $styles = [];
    $scripts = [];
    foreach ($page['sections'] as $section) {
        [$css, $js] = $map['sections'][$section['type']] ?? [[], []];
        $styles = array_merge($styles, $css);
        $scripts = array_merge($scripts, $js);
    }
    if ($is_home) {
        $scripts = array_merge($scripts, $map['home_scripts']);
    }
    // libraries load first: base.js checks that GSAP is there
    $vendor = array_filter($scripts, fn($s) => strpos($s, 'vendor/') === 0);
    $own = array_filter($scripts, fn($s) => strpos($s, 'vendor/') !== 0);
    return [
        array_values(array_unique(array_merge($map['base_styles'], $styles, $map['end_styles']))),
        array_values(array_unique(array_merge($vendor, $map['base_scripts'], $own, $map['end_scripts']))),
    ];
}

// ---------- Content ----------

/** The content files shipped with the theme: relative path → data. */
function wf_bundled_docs(): array {
    static $docs = null;
    if ($docs === null) {
        $docs = [];
        $base = WF_DIR . '/content/';
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            if ($file->getExtension() !== 'json') {
                continue;
            }
            $key = str_replace('\\', '/', substr($file->getPathname(), strlen($base)));
            $docs[$key] = json_decode(file_get_contents($file->getPathname()), true);
        }
        ksort($docs);
    }
    return $docs;
}

/** Content saved in the admin: one option, read once per request. */
function wf_saved_docs(): array {
    static $saved = null;
    if ($saved === null) {
        $saved = function_exists('get_option') ? get_option('wf_content', []) : [];
        $saved = is_array($saved) ? $saved : [];
    }
    return $saved;
}

/** A content file by its path, e.g. "site.json", "sv/pages/home.json". Null when it does not exist. */
function wf_doc(string $key): ?array {
    $saved = wf_saved_docs();
    if (isset($saved[$key]) && is_array($saved[$key])) {
        return $saved[$key];
    }
    return wf_bundled_docs()[$key] ?? null;
}

function wf_doc_exists(string $key): bool {
    return wf_doc($key) !== null;
}

/** site.json with the live base URL, so no domain is hard-coded on the server. */
function wf_site(): array {
    static $site = null;
    if ($site === null) {
        $site = wf_doc('site.json');
        if (defined('WF_BASE_URL')) {
            $site['base_url'] = WF_BASE_URL;
        }
        // company details and social links are edited under WebFully → Settings
        if (function_exists('wf_settings')) {
            foreach (wf_settings()['company'] as $field => $item) {
                if ($item['value'] !== '') {
                    $site['contact'][$field] = $item['value'];
                }
                if (!$item['show']) {
                    $site['contact'][$field] = '';
                }
            }
            $site['contact']['phone_e164'] = wf_phone_e164($site['contact']['phone']);
            foreach (wf_settings()['social'] as $name => $link) {
                if ($link !== '') {
                    $site['social'][$name] = $link;
                }
            }
        }
    }
    return $site;
}

/** A Swedish phone number for tel: links and structured data: 070-123 45 67 → +46701234567 */
function wf_phone_e164(string $phone): string {
    $digits = preg_replace('/[^\d+]/', '', $phone);
    if (strpos($digits, '+') === 0) {
        return $digits;
    }
    if (strpos($digits, '00') === 0) {
        return '+' . substr($digits, 2);
    }
    return $digits === '' ? '' : '+46' . ltrim($digits, '0');
}

function wf_url(string $lang, string $path, array $site): string {
    return $lang === $site['default_lang'] ? $path : '/' . $lang . $path;
}

/** Every page: [key, content file, path]. Services come from site.json, in its order. */
function wf_page_list(array $site): array {
    $pages = [];
    foreach ($site['pages'] as $p) {
        $pages[] = [$p['key'], 'pages/' . $p['key'] . '.json', $p['path']];
    }
    foreach ($site['services'] as $s) {
        $pages[] = ['service:' . $s['slug'], 'services/' . $s['slug'] . '.json', '/services/' . $s['slug'] . '/'];
    }
    return $pages;
}

function wf_signature(string $name): string {
    $file = WF_DIR . '/templates/signatures/' . $name . '.html';
    return is_file($file) ? file_get_contents($file) : '';
}

function wf_services_for(string $lang, array $site): array {
    $visible = array_values(array_filter($site['services'], fn($s) => empty($s['hidden'])));
    $out = [];
    foreach ($visible as $s) {
        $data = wf_doc($lang . '/services/' . $s['slug'] . '.json');
        if (!$data) {
            continue;
        }
        $n = count($out);
        $out[] = array_merge($s, $data['chapter'], [
            'tone' => $n % 2 === 0 ? 'tone-b' : 'tone-a',
            'signature_svg' => wf_signature($s['signature']),
            'number' => sprintf('%02d', $n + 1),
            'total' => sprintf('%02d', count($visible)),
            'url' => wf_url($lang, '/services/' . $s['slug'] . '/', $site),
        ]);
    }
    return $out;
}

function wf_service_page(array $page, string $slug, string $lang, array $site, array $common): array {
    $services = wf_services_for($lang, $site);
    $current = null;
    foreach ($services as $s) {
        if ($s['slug'] === $slug) {
            $current = $s;
        }
    }
    $shared = [];
    foreach ($site['services'] as $s) {
        if ($s['slug'] === $slug) {
            $shared = $s;
        }
    }
    $page['service'] = $current ?: array_merge($shared, $page['chapter'], ['number' => '00', 'total' => sprintf('%02d', count($services))]);
    $page['schema_type'] = 'WebPage';
    $page['service_schema'] = ['name' => $page['chapter']['name']];
    $page['breadcrumb'] = [
        ['name' => $common['nav']['home'], 'url' => wf_url($lang, '/', $site)],
        ['name' => $common['nav']['services'], 'url' => wf_url($lang, '/', $site) . '#' . $common['ids']['services']],
        ['name' => $page['chapter']['name'], 'url' => wf_url($lang, '/services/' . $slug . '/', $site)],
    ];
    $page['related'] = array_values(array_filter($services, fn($s) => $s['slug'] !== $slug));
    return $page;
}

// ---------- Structured data ----------

/** json.dumps(..., ensure_ascii=False, indent=2) */
function wf_json_pretty($value): string {
    $json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return preg_replace_callback('/^( +)/m', fn($m) => str_repeat(' ', intdiv(strlen($m[1]), 2)), $json);
}

/** An absolute URL for a file: as it is when absolute already, else under the asset base. */
function wf_abs_asset(string $path, array $site, string $asset_url): string {
    if (preg_match('#^https?://#', $path)) {
        return $path;
    }
    return (preg_match('#^https?://#', $asset_url) ? $asset_url : $site['base_url'] . $asset_url) . $path;
}

function wf_json_ld(array $site, array $common, array $page, string $abs_url, string $asset_url): string {
    $base = $site['base_url'];
    $org_id = $base . '/#organization';
    $logo = wf_abs_asset($site['logo'], $site, $asset_url);
    // a hidden email or phone (WebFully → Settings) is left out
    $contact = [];
    if ($site['contact']['email'] !== '') {
        $contact['email'] = $site['contact']['email'];
    }
    if ($site['contact']['phone'] !== '') {
        $contact['telephone'] = $site['contact']['phone_e164'];
    }
    // profiles only: a bare platform address (no account path yet) is not a profile
    $same_as = array_values(array_filter(
        array_values($site['social'] ?? []),
        fn($u) => is_string($u) && preg_match('#^https?://[^/]+/[^/?\#]+#', $u)
    ));
    $org = ['@type' => 'Organization', '@id' => $org_id, 'name' => $site['brand'], 'url' => $base . '/', 'logo' => $logo];
    if ($same_as) {
        $org['sameAs'] = $same_as;
    }
    $graph = [
        // plain Organization: some readers match the type exactly and miss it inside a list
        $org + $contact + ['description' => $common['org_description']],
        [
            '@type' => 'LocalBusiness',
            '@id' => $base . '/#localbusiness',
            'name' => $site['brand'],
            'url' => $base . '/',
            'image' => $logo,
        ] + $contact + [
            'address' => ['@type' => 'PostalAddress', 'addressLocality' => $site['contact']['city'], 'addressCountry' => 'SE'],
            'areaServed' => 'SE',
            'parentOrganization' => ['@id' => $org_id],
        ],
        [
            '@type' => 'WebSite',
            '@id' => $base . '/#website',
            'url' => $base . '/',
            'name' => $site['brand'],
            'inLanguage' => $common['locale_tag'],
            'publisher' => ['@id' => $org_id],
        ],
        [
            '@type' => $page['schema_type'] ?? 'WebPage',
            '@id' => $abs_url . '#webpage',
            'url' => $abs_url,
            'name' => $page['meta']['title'],
            'description' => $page['meta']['description'],
            'inLanguage' => $common['locale_tag'],
            'isPartOf' => ['@id' => $base . '/#website'],
        ],
    ];
    if (!empty($page['breadcrumb'])) {
        $items = [];
        foreach ($page['breadcrumb'] as $i => $c) {
            $items[] = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $c['name'], 'item' => $base . $c['url']];
        }
        $graph[] = ['@type' => 'BreadcrumbList', 'itemListElement' => $items];
    }
    if (!empty($page['service_schema'])) {
        $graph[] = [
            '@type' => 'Service',
            'name' => $page['service_schema']['name'],
            'description' => $page['meta']['description'],
            'provider' => ['@id' => $org_id],
            'areaServed' => 'SE',
            'url' => $abs_url,
        ];
    }
    foreach ($page['sections'] as $section) {
        if ($section['type'] === 'faq') {
            $q = [];
            foreach ($section['items'] as $item) {
                $q[] = ['@type' => 'Question', 'name' => $item['q'], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $item['a']]];
            }
            $graph[] = ['@type' => 'FAQPage', 'mainEntity' => $q];
        }
        if ($section['type'] === 'pricing') {
            $offers = [];
            foreach ($section['packages'] as $p) {
                $offers[] = [
                    '@type' => 'Offer',
                    'name' => $p['name'],
                    'price' => (string) $p['price'],
                    'priceCurrency' => 'SEK',
                    'description' => $p['summary'],
                    'seller' => ['@id' => $org_id],
                ];
            }
            $graph[] = ['@type' => 'OfferCatalog', 'name' => $section['title'], 'itemListElement' => $offers];
        }
    }
    // one script per entity: every reader understands it (some tools do not read an @graph); @id links them
    return implode("\n", array_map(
        fn($node) => "<script type=\"application/ld+json\">\n" . wf_json_pretty(array_merge(['@context' => 'https://schema.org'], $node)) . "\n</script>",
        $graph
    ));
}

// ---------- Routes and rendering ----------

/** Site-relative URL → [key, lang, file, path] for every page that exists in a language. */
function wf_routes(): array {
    static $routes = null;
    if ($routes === null) {
        $site = wf_site();
        $routes = [];
        foreach (wf_page_list($site) as [$key, $file, $path]) {
            foreach ($site['languages'] as $lang) {
                if (wf_doc_exists($lang . '/' . $file)) {
                    $routes[wf_url($lang, $path, $site)] = [$key, $lang, $file, $path];
                }
            }
        }
    }
    return $routes;
}

/**
 * The full HTML of one page. $env: asset_url (theme folder URL; '' renders like the static site),
 * asset_version, form_endpoint.
 */
function wf_render_page(string $key, string $lang, string $file, string $path, array $env): string {
    $site = wf_site();
    $langs = $site['languages'];
    $common = wf_doc($lang . '/common.json');
    $page = wf_doc($lang . '/' . $file);
    if (strpos($key, 'service:') === 0) {
        $page = wf_service_page($page, substr($key, 8), $lang, $site, $common);
    }
    $available = array_values(array_filter($langs, fn($l) => wf_doc_exists($l . '/' . $file)));
    $alternates = array_map(fn($l) => ['lang' => $l, 'href' => $site['base_url'] . wf_url($l, $path, $site)], $available);
    $page_url = wf_url($lang, $path, $site);
    $abs_url = $site['base_url'] . $page_url;
    $asset_url = $env['asset_url'] ?? '';
    $ctx = [
        'site' => $site,
        'common' => $common,
        'page' => $page,
        'lang' => $lang,
        'page_url' => $page_url,
        'abs_url' => $abs_url,
        'home_url' => wf_url($lang, '/', $site),
        'contact_url' => wf_url($lang, '/contact/', $site),
        'privacy_url' => wf_url($lang, '/privacy/', $site),
        'special_url' => wf_url($lang, '/special-projects/', $site),
        'alternates' => $alternates,
        'x_default' => $site['base_url'] . wf_url($site['default_lang'], $path, $site),
        'lang_links' => array_map(fn($l) => [
            'lang' => $l,
            'label' => strtoupper($l),
            'href' => in_array($l, $available, true) ? wf_url($l, $path, $site) : null,
            'current' => $l === $lang,
        ], $langs),
        'services' => wf_services_for($lang, $site),
        'is_home' => $key === 'home',
        'ticker_copies' => [false, true],
        'asset_url' => $asset_url,
        'asset_version' => $env['asset_version'] ?? '',
        'form_endpoint' => $env['form_endpoint'] ?? '',
        // the share image: the language's own (common.json), else the site's
        'og_image' => wf_abs_asset(($common['og_image'] ?? '') ?: $site['og_image'], $site, $asset_url),
    ];
    // a page hero takes the drawing named for its page in site.json
    $drawing = null;
    foreach ($site['pages'] as $p) {
        if ($p['key'] === $key) {
            $drawing = $p['signature'] ?? null;
        }
    }
    foreach ($page['sections'] as &$section) {
        if ($section['type'] === 'page-hero' && $drawing) {
            $section['signature_svg'] = wf_signature($drawing);
        }
        if ($section['type'] === 'pricing') {
            $content = [];
            foreach ($section['packages'] as $p) {
                $content[$p['key']] = $p;
            }
            $section['packages'] = array_map(fn($p) => array_merge($p, $content[$p['key']] ?? []), $site['packages']);
        }
    }
    unset($section);
    $ctx['page'] = $page;
    $ctx['json_ld'] = wf_json_ld($site, $common, $page, $abs_url, $asset_url);
    [$ctx['styles'], $ctx['scripts']] = wf_assets_for($page, $key === 'home');
    // the live site loads one stylesheet per page type, built by build.py --theme from exactly these files
    $bundle = wf_section_assets()['bundles'][implode('|', $ctx['styles'])] ?? null;
    if (!empty($env['bundle']) && $bundle) {
        $ctx['styles'] = [$bundle];
    }
    // "Start a project" goes to the CTA section of the page, or to the contact page where there is none
    $has_cta = (bool) array_filter($page['sections'], fn($s) => $s['type'] === 'cta');
    $ctx['cta_href'] = $has_cta ? '#' . $common['ids']['contact'] : $ctx['contact_url'];
    $sections = [];
    foreach ($page['sections'] as $i => $section) {
        $sections[] = wf_render('sections/' . $section['type'] . '.html', array_merge($ctx, ['s' => $section, 'section_index' => $i]));
    }
    $ctx['content'] = implode("\n", $sections);
    return wf_render('layout.html', $ctx);
}

function wf_sitemap(): string {
    $site = wf_site();
    $rows = [];
    foreach (wf_page_list($site) as [$key, $file, $path]) {
        $available = array_values(array_filter($site['languages'], fn($l) => wf_doc_exists($l . '/' . $file)));
        foreach ($available as $lang) {
            if (!empty(wf_doc($lang . '/' . $file)['noindex'])) {
                continue;
            }
            $links = '';
            foreach ($available as $l) {
                $links .= "\n    <xhtml:link rel=\"alternate\" hreflang=\"$l\" href=\"" . $site['base_url'] . wf_url($l, $path, $site) . '"/>';
            }
            $rows[] = "  <url>\n    <loc>" . $site['base_url'] . wf_url($lang, $path, $site) . "</loc>$links\n  </url>";
        }
    }
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        . "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n"
        . implode("\n", $rows) . "\n</urlset>\n";
}

/**
 * llms.txt: a plain map of the site for AI assistants (llmstxt.org): what WebFully is, every page with its
 * description, per language, and how to get in touch.
 */
function wf_llms(): string {
    $site = wf_site();
    $base = $site['base_url'];
    $out = '# ' . $site['brand'] . "\n\n";
    $first = wf_doc($site['default_lang'] . '/common.json');
    $out .= '> ' . ($first['org_description'] ?? '') . "\n\n";
    foreach ($site['languages'] as $lang) {
        $common = wf_doc($lang . '/common.json');
        $out .= '## ' . ($lang === 'sv' ? 'Svenska' : 'English') . "\n\n";
        foreach (wf_page_list($site) as [$key, $file, $path]) {
            $page = wf_doc($lang . '/' . $file);
            if (!$page || !empty($page['noindex']) || in_array($key, ['404', '500'], true)) {
                continue;
            }
            $name = $page['chapter']['name'] ?? $page['meta']['title'];
            $out .= '- [' . $name . '](' . $base . wf_url($lang, $path, $site) . '): ' . $page['meta']['description'] . "\n";
        }
        $out .= "\n";
    }
    $c = $site['contact'];
    $out .= "## Contact\n\n";
    $out .= $c['email'] !== '' ? '- Email: ' . $c['email'] . "\n" : '';
    $out .= $c['phone'] !== '' ? '- Phone: ' . $c['phone_e164'] . "\n" : '';
    return $out . '- Location: ' . $c['city'] . ", Sweden\n";
}

function wf_robots(): string {
    return "User-agent: *\nAllow: /\n\nSitemap: " . wf_site()['base_url'] . "/sitemap.xml\n";
}
