// Generates the three static pages (FR at /, EN at /en/, AR at /ar/) + sitemap.xml + robots.txt
// Usage:  node _build/build.mjs        (from E:\grbsys)
// Edit copy in _build/template.html (French) and _build/i18n.json (EN / AR), then rebuild.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const B = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(B, '..');
const SITE = 'https://grbsys.com';

const template = fs.readFileSync(path.join(B, 'template.html'), 'utf8');
const dicts = JSON.parse(fs.readFileSync(path.join(B, 'i18n.json'), 'utf8'));

const LANGS = {
  fr: { dir: 'ltr', slug: '', locale: 'fr_MA', switchLabel: 'Langue', text: 'FR', name: 'Français' },
  en: { dir: 'ltr', slug: 'en/', locale: 'en_GB', switchLabel: null, text: 'EN', name: 'English' },
  ar: { dir: 'rtl', slug: 'ar/', locale: 'ar_MA', switchLabel: null, text: 'عربي', name: 'العربية' },
};

const escText = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (v) => escText(v).replace(/"/g, '&quot;');

/** Locate every element carrying data-i18n (with matching closing tag, nesting-safe). */
function findI18nElements(html) {
  const out = [];
  const open = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>/g;
  let m;
  while ((m = open.exec(html))) {
    const tag = m[1];
    const openEnd = m.index + m[0].length;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    re.lastIndex = openEnd;
    let depth = 1, n, closeStart = -1;
    while ((n = re.exec(html))) {
      depth += n[1] ? -1 : 1;
      if (depth === 0) { closeStart = n.index; break; }
    }
    if (closeStart < 0) throw new Error(`no closing tag for ${m[2]}`);
    out.push({ key: m[2], isHtml: /\sdata-i18n-html\b/.test(m[0]), openEnd, closeStart });
  }
  return out;
}

function translate(html, lang) {
  if (lang === 'fr') return html; // French is the template as written
  const dict = dicts[lang];

  // text / inner HTML (process from the end so earlier indices stay valid)
  const els = findI18nElements(html).sort((a, b) => b.openEnd - a.openEnd);
  for (const el of els) {
    const v = dict[el.key];
    if (v == null) throw new Error(`missing ${lang} translation: ${el.key}`);
    html = html.slice(0, el.openEnd) + (el.isHtml ? v : escText(v)) + html.slice(el.closeStart);
  }
  // aria-label attributes
  html = html.replace(/<[^>]*\sdata-i18n-aria="([^"]+)"[^>]*>/g, (tag, key) => {
    const v = dict[key];
    if (v == null) throw new Error(`missing ${lang} aria translation: ${key}`);
    return tag.replace(/aria-label="[^"]*"/, `aria-label="${escAttr(v)}"`);
  });
  return html;
}

function langSwitch(cur) {
  const label = LANGS[cur].switchLabel ?? dicts[cur]['lang.label'];
  const links = Object.keys(LANGS).map((code) => {
    const href = code === cur ? './' : (cur === 'fr' ? LANGS[code].slug : (code === 'fr' ? '../' : `../${LANGS[code].slug}`));
    const current = code === cur ? ' aria-current="page"' : '';
    return `<a href="${href}" hreflang="${code}" lang="${code}" aria-label="${LANGS[code].name}"${current}>${LANGS[code].text}</a>`;
  });
  return `<nav class="lang-switch" aria-label="${escAttr(label)}">\n                    ${links.join('\n                    ')}\n                </nav>`;
}

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Gharb Advanced Systems & Consulting',
  alternateName: ['GrbSys', 'الغرب للأنظمة المتطورة والاستشارات'],
  url: `${SITE}/`,
  email: 'contact@grbsys.com',
  areaServed: 'MA',
}).replace(/</g, '\\u003c');

const hreflang = [
  ...Object.entries(LANGS).map(([c, l]) => `    <link rel="alternate" hreflang="${c}" href="${SITE}/${l.slug}">`),
  `    <link rel="alternate" hreflang="x-default" href="${SITE}/">`,
].join('\n');

for (const [lang, cfg] of Object.entries(LANGS)) {
  const dict = dicts[lang];
  const canonical = `${SITE}/${cfg.slug}`;
  const ogLocale = [
    `    <meta property="og:locale" content="${cfg.locale}">`,
    ...Object.entries(LANGS).filter(([c]) => c !== lang).map(([, l]) => `    <meta property="og:locale:alternate" content="${l.locale}">`),
  ].join('\n');

  let html = translate(template, lang);
  const rep = {
    '{{LANG}}': lang,
    '{{DIR}}': cfg.dir,
    '{{TITLE}}': escText(dict['meta.title']),
    '{{DESC}}': escAttr(dict['meta.desc']),
    '{{CANONICAL}}': canonical,
    '{{HREFLANG}}': hreflang,
    '{{JSONLD}}': jsonLd,
    '{{OGLOCALE}}': ogLocale,
    '{{ASSETS}}': lang === 'fr' ? '' : '../',
    '{{LANGSWITCH}}': langSwitch(lang),
  };
  for (const [k, v] of Object.entries(rep)) html = html.split(k).join(v);
  if (/\{\{[A-Z]+\}\}/.test(html)) throw new Error(`unresolved placeholder in ${lang}`);

  const outDir = path.join(ROOT, cfg.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log('wrote', path.join(cfg.slug, 'index.html'));
}

/* ---------- sitemap + robots ---------- */
const alt = Object.entries(LANGS).map(([c, l]) => `      <xhtml:link rel="alternate" hreflang="${c}" href="${SITE}/${l.slug}"/>`)
  .concat(`      <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${Object.values(LANGS).map((l) => `  <url>\n    <loc>${SITE}/${l.slug}</loc>\n${alt}\n  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log('wrote sitemap.xml, robots.txt');
