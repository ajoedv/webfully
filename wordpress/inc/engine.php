<?php
/**
 * Template engine: the PHP twin of the one in src/build.py, so the same templates render the same HTML.
 *
 *   {{ path }}               escaped value          {{ path|raw }}   value without escaping
 *   {% if path %}..{% else %}..{% endif %}         {% if not path %}
 *   {% for item in path %}..{% endfor %}            loop.index, loop.index0, loop.first, loop.last
 *   {% include "partials/nav.html" %}
 */

defined('ABSPATH') || exit;

const WF_TOKEN = '/({{.*?}}|{%.*?%})/s';

/** Template source → node tree. */
function wf_tpl_parse(string $source): array {
    $tokens = preg_split(WF_TOKEN, $source, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);
    $i = 0;
    [$nodes, $end] = wf_tpl_block($tokens, $i, []);
    if ($end !== null) {
        throw new RuntimeException('unexpected ' . $end);
    }
    return $nodes;
}

/** Parses until one of $ends; returns [nodes, the end tag met or null at the end of input]. */
function wf_tpl_block(array $tokens, int &$i, array $ends): array {
    $nodes = [];
    while ($i < count($tokens)) {
        $piece = $tokens[$i++];
        if (strncmp($piece, '{{', 2) === 0) {
            $expr = trim(substr($piece, 2, -2));
            $raw = substr($expr, -4) === '|raw';
            $nodes[] = ['var', $raw ? trim(substr($expr, 0, -4)) : $expr, $raw];
            continue;
        }
        if (strncmp($piece, '{%', 2) === 0) {
            $tag = trim(substr($piece, 2, -2));
            $word = strtok($tag, " \t\n");
            if (in_array($word, $ends, true)) {
                return [$nodes, $word];
            }
            if ($word === 'if') {
                [$yes, $end] = wf_tpl_block($tokens, $i, ['else', 'endif']);
                $no = [];
                if ($end === 'else') {
                    [$no, $end] = wf_tpl_block($tokens, $i, ['endif']);
                }
                if ($end !== 'endif') {
                    throw new RuntimeException('unclosed if');
                }
                $nodes[] = ['if', trim(substr($tag, 2)), $yes, $no];
            } elseif ($word === 'for') {
                if (!preg_match('/^for\s+(\w+)\s+in\s+([\w.]+)$/', $tag, $m)) {
                    throw new RuntimeException('bad for: ' . $tag);
                }
                [$body, $end] = wf_tpl_block($tokens, $i, ['endfor']);
                if ($end !== 'endfor') {
                    throw new RuntimeException('unclosed for');
                }
                $nodes[] = ['for', $m[1], $m[2], $body];
            } elseif ($word === 'include') {
                $nodes[] = ['include', trim(trim(substr($tag, 7)), '"\'')];
            } else {
                throw new RuntimeException('unknown tag: ' . $tag);
            }
            continue;
        }
        $nodes[] = ['text', $piece];
    }
    return [$nodes, null];
}

/** A dotted path (a.b.0.c) in the context; missing values are null. */
function wf_tpl_lookup(array $ctx, string $path) {
    $value = $ctx;
    foreach (explode('.', trim($path)) as $part) {
        if (is_array($value) && array_key_exists($part, $value)) {
            $value = $value[$part];
        } else {
            return null;
        }
    }
    return $value;
}

/** Truth the way Python sees it: "", 0, [] and null are false; "0" is true. */
function wf_tpl_truthy($value): bool {
    if (is_string($value)) {
        return $value !== '';
    }
    if (is_array($value)) {
        return count($value) > 0;
    }
    return (bool) $value;
}

function wf_tpl_escape(string $text): string {
    return str_replace(['&', '<', '>', '"', "'"], ['&amp;', '&lt;', '&gt;', '&quot;', '&#x27;'], $text);
}

function wf_tpl_text($value): string {
    if (is_string($value)) {
        return $value;
    }
    if (is_bool($value)) {
        return $value ? 'True' : 'False';
    }
    if (is_array($value)) {
        return wf_json_py($value);
    }
    return (string) $value;
}

/** json.dumps(value) with Python's default separators and ASCII escapes. */
function wf_json_py($value): string {
    $json = json_encode($value, JSON_UNESCAPED_SLASHES);
    // Python separates with ", " and ": " outside strings
    return preg_replace_callback('/"(?:\\\\.|[^"\\\\])*"|[,:]/', fn($m) => $m[0] === ',' ? ', ' : ($m[0] === ':' ? ': ' : $m[0]), $json);
}

function wf_tpl_nodes(array $nodes, array $ctx): string {
    $out = '';
    foreach ($nodes as $node) {
        switch ($node[0]) {
            case 'text':
                $out .= $node[1];
                break;
            case 'var':
                $value = wf_tpl_lookup($ctx, $node[1]);
                if ($value === null) {
                    break;
                }
                $text = wf_tpl_text($value);
                $out .= $node[2] ? $text : wf_tpl_escape($text);
                break;
            case 'if':
                $expr = $node[1];
                $negate = strncmp($expr, 'not ', 4) === 0;
                $truth = wf_tpl_truthy(wf_tpl_lookup($ctx, $negate ? substr($expr, 4) : $expr));
                $out .= wf_tpl_nodes(($negate ? !$truth : $truth) ? $node[2] : $node[3], $ctx);
                break;
            case 'for':
                $items = wf_tpl_lookup($ctx, $node[2]);
                $items = is_array($items) ? array_values($items) : [];
                $count = count($items);
                foreach ($items as $i => $item) {
                    $loop = ['index' => $i + 1, 'index0' => $i, 'first' => $i === 0, 'last' => $i === $count - 1];
                    $out .= wf_tpl_nodes($node[3], array_merge($ctx, [$node[1] => $item, 'loop' => $loop]));
                }
                break;
            case 'include':
                $out .= wf_render($node[1], $ctx);
                break;
        }
    }
    return $out;
}

/** Renders a template from the theme's templates/ folder. */
function wf_render(string $name, array $ctx): string {
    static $cache = [];
    if (!isset($cache[$name])) {
        $file = WF_DIR . '/templates/' . $name;
        if (!is_file($file)) {
            throw new RuntimeException('missing template: ' . $name);
        }
        $cache[$name] = wf_tpl_parse(file_get_contents($file));
    }
    return wf_tpl_nodes($cache[$name], $ctx);
}
