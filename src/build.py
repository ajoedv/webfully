#!/usr/bin/env python3
"""WebFully site generator.

Builds the static site in dist/ from:
  src/templates/   layout, partials, sections, signatures (HTML with a small template syntax)
  content/         site.json (shared data) and one JSON file per page and per service, per language
  css/ js/ assets/ copied as they are

Template syntax (kept close to what PHP template parts will do later):
  {{ path }}               escaped value          {{ path|raw }}   value without escaping
  {% if path %}..{% else %}..{% endif %}         {% if not path %}
  {% for item in path %}..{% endfor %}            loop.index, loop.index0, loop.first, loop.last
  {% include "partials/nav.html" %}

Usage:
  python3 src/build.py            build once
  python3 src/build.py --serve    build, serve dist/ on http://localhost:5500 and rebuild on every change
  python3 src/build.py --theme    build the WordPress theme into theme/webfully/ (and theme/webfully.zip)

Standard library only (Python 3.8+). Python never runs on the server: dist/ is plain HTML, CSS and JS.
The WordPress theme renders the same templates and content with a PHP twin of this engine (wordpress/inc/).
"""

import html
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import zipfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / 'src' / 'templates'
CONTENT = ROOT / 'content'
DIST = ROOT / 'dist'
STAGE = ROOT / '.dist-build'   # set per build: a fresh folder, swapped in when finished, so two builds never share one
LOCK = ROOT / '.dist-lock'     # held only while swapping the finished build into dist/
STATIC = ['css', 'js', 'assets']
PORT = 5500
ROOT_ICONS = ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest']
THEME_SRC = ROOT / 'wordpress'           # the theme's own PHP, admin files and tests
THEME_OUT = ROOT / 'theme' / 'webfully'  # the theme as WordPress installs it (git-ignored; the deploy branch)

# Styles and scripts each section needs, in load order. Every page also gets the base files below.
GSAP = ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js']
BASE_STYLES = ['fonts.css', 'base.css', 'components.css', 'nav.css', 'media.css']
END_STYLES = ['footer.css', 'cookie.css']
BASE_SCRIPTS = ['base.js', 'social.js', 'nav.js', 'media.js']
END_SCRIPTS = ['footer.js', 'cookie.js']
SECTION_ASSETS = {
    'hero-scene': (['hero.css', 'intro.css'], GSAP + ['hero.js']),
    'chapters': (['chapters.css'], GSAP + ['chapters.js']),
    'process': (['process.css'], []),
    'pricing': (['pricing.css'], ['pricing.js']),
    'special-teaser': (['special.css'], []),
    'ticker': (['ticker.css'], []),
    'cta': (['cta.css'], ['cta.js']),
    'testimonials': (['testimonials.css'], ['testimonials.js']),
    'service-hero': (['page.css', 'chapters.css'], ['sign.js']),
    'page-hero': (['page.css', 'chapters.css'], ['sign.js']),
    'capabilities': (['page.css', 'accordion.css'], ['accordion.js']),
    'builds': (['page.css'], []),
    'phases': (['page.css'], []),
    'proof': (['page.css'], []),
    'faq': (['page.css', 'accordion.css'], ['accordion.js']),
    'related': (['page.css'], []),
    'columns': (['page.css'], []),
    'contact': (['contact.css'], ['form.js']),
    'legal': (['legal.css'], []),
    'error': (['error.css'], ['error.js']),
}
# The dot journey runs only on the home page, after every section script
HOME_SCRIPTS = GSAP + ['journey.js']


def unique(items):
    return list(dict.fromkeys(items))


def assets_for(page, is_home):
    styles, scripts = [], []
    for section in page['sections']:
        css, js = SECTION_ASSETS[section['type']]
        styles += css
        scripts += js
    if is_home:
        scripts += HOME_SCRIPTS
    # libraries load first: base.js checks that GSAP is there
    vendor = [s for s in scripts if s.startswith('vendor/')]
    own = [s for s in scripts if not s.startswith('vendor/')]
    return unique(BASE_STYLES + styles + END_STYLES), unique(vendor + BASE_SCRIPTS + own + END_SCRIPTS)


# ---------- Template engine ----------

TOKEN = re.compile(r'({{.*?}}|{%.*?%})', re.S)


class TemplateError(Exception):
    pass


def lookup(ctx, path):
    """Resolve a dotted path (a.b.0.c) in the context stack; missing values are None."""
    value = ctx
    for part in path.strip().split('.'):
        if isinstance(value, dict):
            value = value.get(part)
        elif isinstance(value, list) and part.isdigit() and int(part) < len(value):
            value = value[int(part)]
        else:
            return None
    return value


def parse(source):
    """Turn template source into a tree of nodes."""
    root = []
    stack = [('root', root)]
    for piece in TOKEN.split(source):
        if not piece:
            continue
        nodes = stack[-1][1]
        if piece.startswith('{{'):
            expr = piece[2:-2].strip()
            raw = expr.endswith('|raw')
            nodes.append(('var', expr[:-4].strip() if raw else expr, raw))
        elif piece.startswith('{%'):
            tag = piece[2:-2].strip()
            word = tag.split()[0]
            if word == 'if':
                node = ['if', tag[3:].strip(), [], []]
                nodes.append(node)
                stack.append(('if', node[2], node))
            elif word == 'else':
                if stack[-1][0] != 'if':
                    raise TemplateError('else without if')
                stack[-1] = ('else', stack[-1][2][3], stack[-1][2])
            elif word == 'endif':
                if stack[-1][0] not in ('if', 'else'):
                    raise TemplateError('endif without if')
                stack.pop()
            elif word == 'for':
                m = re.match(r'for\s+(\w+)\s+in\s+([\w.]+)$', tag)
                if not m:
                    raise TemplateError('bad for: ' + tag)
                node = ['for', m.group(1), m.group(2), []]
                nodes.append(node)
                stack.append(('for', node[3], node))
            elif word == 'endfor':
                if stack[-1][0] != 'for':
                    raise TemplateError('endfor without for')
                stack.pop()
            elif word == 'include':
                nodes.append(('include', tag.split(None, 1)[1].strip().strip('"\'')))
            else:
                raise TemplateError('unknown tag: ' + tag)
        else:
            nodes.append(('text', piece))
    if len(stack) != 1:
        raise TemplateError('unclosed block: ' + stack[-1][0])
    return root


_cache = {}


def template(name):
    path = TEMPLATES / name
    key = (path, path.stat().st_mtime)
    if key not in _cache:
        _cache[key] = parse(path.read_text(encoding='utf-8'))
    return _cache[key]


def truthy(ctx, expr):
    negate = expr.startswith('not ')
    value = lookup(ctx, expr[4:] if negate else expr)
    return not value if negate else bool(value)


def render_nodes(nodes, ctx):
    out = []
    for node in nodes:
        kind = node[0]
        if kind == 'text':
            out.append(node[1])
        elif kind == 'var':
            value = lookup(ctx, node[1])
            if value is None:
                continue
            text = value if isinstance(value, str) else json.dumps(value) if isinstance(value, (dict, list)) else str(value)
            out.append(text if node[2] else html.escape(text))
        elif kind == 'if':
            out.append(render_nodes(node[2] if truthy(ctx, node[1]) else node[3], ctx))
        elif kind == 'for':
            items = lookup(ctx, node[2]) or []
            for i, item in enumerate(items):
                loop = {'index': i + 1, 'index0': i, 'first': i == 0, 'last': i == len(items) - 1}
                out.append(render_nodes(node[3], {**ctx, node[1]: item, 'loop': loop}))
        elif kind == 'include':
            out.append(render(node[1], ctx))
    return ''.join(out)


def render(name, ctx):
    try:
        return render_nodes(template(name), ctx)
    except TemplateError as e:
        raise TemplateError(f'{name}: {e}') from None


# ---------- Content ----------

def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def url(lang, path, site):
    """Site-relative URL of a page in a language. Swedish lives at the root, other languages under /<lang>/."""
    return path if lang == site['default_lang'] else '/' + lang + path


def page_list(site):
    """Every page to build: (key, content file, path). Services come from site.json, in its order."""
    pages = [(p['key'], 'pages/' + p['key'] + '.json', p['path']) for p in site['pages']]
    for s in site['services']:
        pages.append(('service:' + s['slug'], 'services/' + s['slug'] + '.json', '/services/' + s['slug'] + '/'))
    return pages


def services_for(lang, site):
    """Shared service data merged with the language's chapter text, in site order."""
    out = []
    visible = [s for s in site['services'] if not s.get('hidden')]
    for s in visible:
        data = load(CONTENT / lang / 'services' / (s['slug'] + '.json'))
        out.append({
            **s,
            **data['chapter'],
            'tone': 'tone-b' if len(out) % 2 == 0 else 'tone-a',
            'signature_svg': (TEMPLATES / 'signatures' / (s['signature'] + '.html')).read_text(encoding='utf-8'),
            'number': f'{len(out) + 1:02d}',
            'total': f'{len(visible):02d}',
            'url': url(lang, '/services/' + s['slug'] + '/', site),
        })
    return out


# ---------- Structured data ----------

def json_ld(site, common, page, lang, abs_url):
    org_id = site['base_url'] + '/#organization'
    contact = {
        **({'email': site['contact']['email']} if site['contact']['email'] else {}),
        **({'telephone': site['contact']['phone_e164']} if site['contact']['phone'] else {}),
    }
    # profiles only: a bare platform address (no account path yet) is not a profile
    same_as = [u for u in site.get('social', {}).values() if re.match(r'https?://[^/]+/[^/?#]+', u or '')]
    graph = [
        # plain Organization: some readers match the type exactly and miss it inside a list
        {
            '@type': 'Organization',
            '@id': org_id,
            'name': site['brand'],
            'url': site['base_url'] + '/',
            'logo': site['base_url'] + site['logo'],
            **({'sameAs': same_as} if same_as else {}),
            **contact,
            'description': common['org_description'],
        },
        {
            '@type': 'LocalBusiness',
            '@id': site['base_url'] + '/#localbusiness',
            'name': site['brand'],
            'url': site['base_url'] + '/',
            'image': site['base_url'] + site['logo'],
            **contact,
            'address': {'@type': 'PostalAddress', 'addressLocality': site['contact']['city'], 'addressCountry': 'SE'},
            'areaServed': 'SE',
            'parentOrganization': {'@id': org_id},
        },
        {
            '@type': 'WebSite',
            '@id': site['base_url'] + '/#website',
            'url': site['base_url'] + '/',
            'name': site['brand'],
            'inLanguage': common['locale_tag'],
            'publisher': {'@id': org_id},
        },
        {
            '@type': page.get('schema_type', 'WebPage'),
            '@id': abs_url + '#webpage',
            'url': abs_url,
            'name': page['meta']['title'],
            'description': page['meta']['description'],
            'inLanguage': common['locale_tag'],
            'isPartOf': {'@id': site['base_url'] + '/#website'},
        },
    ]
    if page.get('breadcrumb'):
        graph.append({
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': i + 1, 'name': c['name'], 'item': site['base_url'] + c['url']}
                for i, c in enumerate(page['breadcrumb'])
            ],
        })
    if page.get('service_schema'):
        graph.append({
            '@type': 'Service',
            'name': page['service_schema']['name'],
            'description': page['meta']['description'],
            'provider': {'@id': org_id},
            'areaServed': 'SE',
            'url': abs_url,
        })
    for section in page['sections']:
        if section['type'] == 'faq':
            graph.append({
                '@type': 'FAQPage',
                'mainEntity': [
                    {'@type': 'Question', 'name': q['q'], 'acceptedAnswer': {'@type': 'Answer', 'text': q['a']}}
                    for q in section['items']
                ],
            })
        if section['type'] == 'pricing':
            graph.append({
                '@type': 'OfferCatalog',
                'name': section['title'],
                'itemListElement': [
                    {
                        '@type': 'Offer',
                        'name': p['name'],
                        'price': str(p['price']),
                        'priceCurrency': 'SEK',
                        'description': p['summary'],
                        'seller': {'@id': org_id},
                    }
                    for p in section['packages']
                ],
            })
    # one script per entity: every reader understands it (some tools do not read an @graph); @id links them
    return '\n'.join(
        '<script type="application/ld+json">\n'
        + json.dumps({'@context': 'https://schema.org', **node}, ensure_ascii=False, indent=2)
        + '\n</script>'
        for node in graph)


# ---------- Build ----------

def build():
    global STAGE
    STAGE = Path(tempfile.mkdtemp(prefix='.dist-build-', dir=ROOT))
    try:
        render_site()
    finally:
        # a failed build leaves nothing behind; a finished one has already been swapped in
        shutil.rmtree(STAGE, ignore_errors=True)


def render_site():
    started = time.time()
    site = load(CONTENT / 'site.json')
    langs = site['languages']
    for folder in STATIC:
        if (ROOT / folder).exists():
            shutil.copytree(ROOT / folder, STAGE / folder)

    sitemap = []
    for key, file, path in page_list(site):
        available = [l for l in langs if (CONTENT / l / file).exists()]
        alternates = [{'lang': l, 'href': site['base_url'] + url(l, path, site)} for l in available]
        for lang in available:
            common = load(CONTENT / lang / 'common.json')
            page = load(CONTENT / lang / file)
            if key.startswith('service:'):
                page = service_page(page, key.split(':', 1)[1], lang, site, common)
            page_url = url(lang, path, site)
            abs_url = site['base_url'] + page_url
            ctx = {
                # the static site serves files from the root; the theme passes its own folder URL
                'asset_url': '',
                'asset_version': '',
                'form_endpoint': '',
                # the share image: the language's own (common.json), else the site's
                'og_image': (lambda img: img if img.startswith('http') else site['base_url'] + img)(common.get('og_image') or site['og_image']),
                'site': site,
                'common': common,
                'page': page,
                'lang': lang,
                'page_url': page_url,
                'abs_url': abs_url,
                'home_url': url(lang, '/', site),
                'contact_url': url(lang, '/contact/', site),
                'privacy_url': url(lang, '/privacy/', site),
                'special_url': url(lang, '/special-projects/', site),
                'alternates': alternates,
                'x_default': site['base_url'] + url(site['default_lang'], path, site),
                'lang_links': [
                    {'lang': l, 'label': l.upper(), 'href': url(l, path, site) if l in available else None, 'current': l == lang}
                    for l in langs
                ],
                'services': services_for(lang, site),
                'is_home': key == 'home',
                'ticker_copies': [False, True],
            }
            sections = []
            # a page hero takes the drawing named for its page in site.json
            drawing = next((p.get('signature') for p in site['pages'] if p['key'] == key), None)
            for section in page['sections']:
                if section['type'] == 'page-hero' and drawing:
                    section['signature_svg'] = (TEMPLATES / 'signatures' / (drawing + '.html')).read_text(encoding='utf-8')
                if section['type'] == 'pricing':
                    content = {p['key']: p for p in section['packages']}
                    section['packages'] = [{**p, **content[p['key']]} for p in site['packages']]
            ctx['json_ld'] = json_ld(site, common, page, lang, abs_url)
            ctx['styles'], ctx['scripts'] = assets_for(page, key == 'home')
            # "Start a project" goes to the CTA section of the page, or to the contact page where there is none
            has_cta = any(sec['type'] == 'cta' for sec in page['sections'])
            ctx['cta_href'] = '#' + common['ids']['contact'] if has_cta else ctx['contact_url']
            for i, section in enumerate(page['sections']):
                sections.append(render('sections/' + section['type'] + '.html', {**ctx, 's': section, 'section_index': i}))
            ctx['content'] = '\n'.join(sections)
            out = render('layout.html', ctx)
            target = STAGE / page_url.lstrip('/') / 'index.html' if page.get('output') is None else STAGE / url(lang, page['output'], site).lstrip('/')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(out, encoding='utf-8')
            if not page.get('noindex'):
                sitemap.append((abs_url, alternates))

    write_seo_files(site, sitemap)
    # icons the browsers ask for at the root
    for name in ROOT_ICONS:
        shutil.copy(ROOT / 'assets' / 'icons' / name, STAGE / name)
    swap()
    print(f'Built {len(sitemap)} indexable pages in {time.time() - started:.2f}s')


def service_page(page, slug, lang, site, common):
    """Fill a service page with shared data: number, total, breadcrumb, schema, chapter data."""
    services = services_for(lang, site)
    current = next((s for s in services if s['slug'] == slug), None)
    shared = next(s for s in site['services'] if s['slug'] == slug)
    page = dict(page)
    page['service'] = current or {**shared, **page['chapter'], 'number': '00', 'total': f'{len(services):02d}'}
    page['schema_type'] = 'WebPage'
    page['service_schema'] = {'name': page['chapter']['name']}
    page['breadcrumb'] = [
        {'name': common['nav']['home'], 'url': url(lang, '/', site)},
        {'name': common['nav']['services'], 'url': url(lang, '/', site) + '#' + common['ids']['services']},
        {'name': page['chapter']['name'], 'url': url(lang, '/services/' + slug + '/', site)},
    ]
    others = [s for s in services if s['slug'] != slug]
    page['related'] = others
    return page


def llms_txt(site):
    """llms.txt (llmstxt.org): what WebFully is and every page with its description. Twin of wf_llms()."""
    base = site['base_url']
    first = load(CONTENT / site['default_lang'] / 'common.json')
    out = '# ' + site['brand'] + '\n\n> ' + first.get('org_description', '') + '\n\n'
    for lang in site['languages']:
        out += '## ' + ('Svenska' if lang == 'sv' else 'English') + '\n\n'
        for key, file, path in page_list(site):
            f = CONTENT / lang / file
            if not f.exists():
                continue
            page = load(f)
            if page.get('noindex') or key in ('404', '500'):
                continue
            name = page.get('chapter', {}).get('name') or page['meta']['title']
            out += f'- [{name}]({base}{url(lang, path, site)}): {page["meta"]["description"]}\n'
        out += '\n'
    c = site['contact']
    out += '## Contact\n\n'
    out += f'- Email: {c["email"]}\n' if c['email'] else ''
    out += f'- Phone: {c["phone_e164"]}\n' if c['phone'] else ''
    return out + f'- Location: {c["city"]}, Sweden\n'


def write_seo_files(site, sitemap):
    rows = []
    for loc, alternates in sitemap:
        links = ''.join(f'\n    <xhtml:link rel="alternate" hreflang="{a["lang"]}" href="{a["href"]}"/>' for a in alternates)
        rows.append(f'  <url>\n    <loc>{loc}</loc>{links}\n  </url>')
    (STAGE / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + '\n'.join(rows) + '\n</urlset>\n', encoding='utf-8')
    (STAGE / 'llms.txt').write_text(llms_txt(site), encoding='utf-8')
    (STAGE / 'robots.txt').write_text(
        f'User-agent: *\nAllow: /\n\nSitemap: {site["base_url"]}/sitemap.xml\n', encoding='utf-8')
    # Apache / LiteSpeed (Hostinger): branded error pages
    (STAGE / '.htaccess').write_text('ErrorDocument 404 /404.html\nErrorDocument 500 /500.html\n', encoding='utf-8')


def swap():
    """Puts the finished build in place of dist/. A lock file keeps a second build (another terminal) from swapping at the same moment."""
    deadline = time.time() + 10
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL)
            break
        except FileExistsError:
            if time.time() > deadline:  # a crashed build left it behind
                LOCK.unlink(missing_ok=True)
            time.sleep(.05)
    try:
        old = Path(tempfile.mkdtemp(prefix='.dist-old-', dir=ROOT))
        if DIST.exists():
            DIST.rename(old / 'dist')
        STAGE.rename(DIST)
    finally:
        os.close(fd)
        LOCK.unlink(missing_ok=True)
    shutil.rmtree(old, ignore_errors=True)


# ---------- WordPress theme ----------

def theme_version():
    """Date and commit, so browsers fetch new CSS/JS after every deploy."""
    stamp = time.strftime('%Y.%m.%d.%H%M')
    head = ROOT / '.git' / 'HEAD'
    try:
        ref = head.read_text().strip()
        sha = (ROOT / '.git' / ref[5:]).read_text().strip() if ref.startswith('ref: ') else ref
        return stamp + '-' + sha[:7]
    except OSError:
        return stamp


def build_theme():
    """theme/webfully/: the theme's PHP (wordpress/), the same templates, content, CSS, JS and assets."""
    started = time.time()
    if THEME_OUT.exists():
        shutil.rmtree(THEME_OUT)
    shutil.copytree(THEME_SRC, THEME_OUT, ignore=shutil.ignore_patterns('tests', '.DS_Store'))
    version = theme_version()
    shutil.copytree(TEMPLATES, THEME_OUT / 'templates')
    shutil.copytree(CONTENT, THEME_OUT / 'content')
    for folder in STATIC:
        if (ROOT / folder).exists():
            shutil.copytree(ROOT / folder, THEME_OUT / folder, ignore=shutil.ignore_patterns('.DS_Store'))
    # one stylesheet per page type: the page's own files joined in their order (the live site loads one file,
    # the local build keeps them apart for work)
    bundles = {}
    site = load(CONTENT / 'site.json')
    for key, file, path in page_list(site):
        for lang in site['languages']:
            if (CONTENT / lang / file).exists():
                styles, _ = assets_for(load(CONTENT / lang / file), key == 'home')
                bundles['|'.join(styles)] = None
    import hashlib
    for styles in bundles:
        text = ''.join(f'/* ==== {name} ==== */\n' + (THEME_OUT / 'css' / name).read_text(encoding='utf-8') + '\n' for name in styles.split('|'))
        # fonts carry the deploy version like the CSS, so the year-long browser cache never keeps an old font
        text = text.replace('.woff")', f'.woff?v={version}")')
        name = 'bundle-' + hashlib.sha1(text.encode()).hexdigest()[:10] + '.css'
        (THEME_OUT / 'css' / name).write_text(text, encoding='utf-8')
        bundles[styles] = name
    # one list of section assets for both renderers
    (THEME_OUT / 'assets.json').write_text(json.dumps({
        'bundles': bundles,
        'sections': SECTION_ASSETS,
        'home_scripts': HOME_SCRIPTS,
        'base_styles': BASE_STYLES,
        'end_styles': END_STYLES,
        'base_scripts': BASE_SCRIPTS,
        'end_scripts': END_SCRIPTS,
        'root_icons': ROOT_ICONS,
    }, indent=2), encoding='utf-8')
    style = THEME_OUT / 'style.css'
    style.write_text(style.read_text(encoding='utf-8').replace('{{version}}', version), encoding='utf-8')
    (THEME_OUT / 'version.txt').write_text(version + '\n', encoding='utf-8')
    archive = THEME_OUT.parent / 'webfully.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(THEME_OUT.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(THEME_OUT.parent))
    print(f'Built the theme in {time.time() - started:.2f}s: {THEME_OUT.relative_to(ROOT)}/ and {archive.relative_to(ROOT)}')


# ---------- Serve and watch ----------

def snapshot():
    folders = ['src', 'content'] + STATIC
    return {p: p.stat().st_mtime for f in folders for p in (ROOT / f).rglob('*') if p.is_file()}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        # a request that lands in the instant of a swap finds no file: wait for the new build and try again
        for _ in range(20):
            if Path(self.translate_path(self.path)).exists() or not LOCK.exists():
                break
            time.sleep(.05)
        return super().send_head()

    def send_error(self, code, message=None, explain=None):
        # serve the branded 404 page like the host will
        page = DIST / '404.html'
        if code == 404 and page.exists():
            body = page.read_bytes()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def log_message(self, *args):
        pass


def serve():
    build()
    server = ThreadingHTTPServer(('127.0.0.1', PORT), partial(Handler, directory=str(DIST)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f'Serving dist/ on http://localhost:{PORT} (rebuilds on change, Ctrl+C to stop)')
    seen = snapshot()
    me = Path(__file__).resolve()
    try:
        while True:
            time.sleep(.6)
            now = snapshot()
            if now.get(me) != seen.get(me):
                # the generator itself changed: restart so the new code builds
                print('build.py changed, restarting')
                server.shutdown()
                server.server_close()
                os.execv(sys.executable, [sys.executable] + sys.argv)
            if now != seen:
                seen = now
                try:
                    build()
                except Exception as e:  # keep serving the last good build
                    print('Build failed:', e)
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == '__main__':
    if '--theme' in sys.argv:
        build_theme()
    elif '--serve' in sys.argv:
        serve()
    else:
        build()
