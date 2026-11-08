<?php
/**
 * Parity test: renders every page with the theme's PHP and compares it with the static build in dist/.
 *   python3 src/build.py && python3 src/build.py --theme && php wordpress/tests/render.php
 * Needs PHP 8 on the command line; WordPress itself is not needed (the few functions used are stubbed).
 */

define('ABSPATH', __DIR__);
$root = dirname(__DIR__, 2);
define('WF_DIR', $root . '/theme/webfully');

require WF_DIR . '/inc/engine.php';
require WF_DIR . '/inc/site.php';

$fails = 0;
$count = 0;
foreach (wf_routes() as $url => [$key, $lang, $file, $path]) {
    $page = wf_doc($lang . '/' . $file);
    $out = isset($page['output']) ? ltrim(wf_url($lang, $page['output'], wf_site()), '/') : ltrim($url, '/') . 'index.html';
    $expected = @file_get_contents($root . '/dist/' . $out);
    $html = wf_render_page($key, $lang, $file, $path, []);
    $count++;
    if ($expected !== $html) {
        $fails++;
        $a = explode("\n", $expected ?: '');
        $b = explode("\n", $html);
        foreach ($b as $i => $line) {
            if (($a[$i] ?? null) !== $line) {
                echo "DIFF $url (line " . ($i + 1) . ")\n  static: " . substr($a[$i] ?? '<none>', 0, 200) . "\n  php:    " . substr($line, 0, 200) . "\n";
                break;
            }
        }
    }
}
$sitemap = file_get_contents($root . '/dist/sitemap.xml') === wf_sitemap();
$robots = file_get_contents($root . '/dist/robots.txt') === wf_robots();
$llms = file_get_contents($root . '/dist/llms.txt') === wf_llms();
echo "$count pages, " . ($count - $fails) . " identical; sitemap " . ($sitemap ? 'identical' : 'DIFFERS') . '; robots ' . ($robots ? 'identical' : 'DIFFERS') . '; llms ' . ($llms ? 'identical' : 'DIFFERS') . "\n";
exit($fails || !$sitemap || !$robots || !$llms ? 1 : 0);
