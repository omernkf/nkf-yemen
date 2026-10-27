import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Run after build.mjs has created dist/, copied assets, and exported published CMS JSON.
// Social crawlers do not execute client JavaScript, so each entry needs real static HTML.
const dist = 'dist';
const base = (process.env.SITE_URL || 'https://nkf-yemen.netlify.app').replace(/\/+$/, '');
const site = JSON.parse(await readFile(path.join(dist, 'data/site.json'), 'utf8'));
const news = JSON.parse(await readFile(path.join(dist, 'data/news.json'), 'utf8'));
const articles = JSON.parse(await readFile(path.join(dist, 'data/articles.json'), 'utf8'));
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const short = (value, max = 195) => String(value || '').trim().slice(0, max);
const postUrl = (kind, post) => '/' + kind + '/' + encodeURIComponent(post.slug) + '.html';

const logoBytes = await readFile(path.join(dist, 'logo.png'));
const logoExt = logoBytes[0] === 0xff && logoBytes[1] === 0xd8 ? '.jpg' :
  logoBytes[0] === 0x89 && logoBytes[1] === 0x50 ? '.png' : null;
const previewFile = logoExt ? '/social-preview' + logoExt : '/logo.png';
if (logoExt) await copyFile(path.join(dist, 'logo.png'), path.join(dist, previewFile.slice(1)));
const previewImage = base + previewFile;

function imageUrl(candidate) {
  const s = String(candidate || '').trim();
  if (s.startsWith('/') && !s.startsWith('//')) return base + encodeURI(s);
  if (/^https:\/\//i.test(s)) return s;
  return previewImage;
}
function mime(image) {
  if (/\.(?:jpe?g)(?:[?#]|$)/i.test(image)) return 'image/jpeg';
  if (/\.png(?:[?#]|$)/i.test(image)) return 'image/png';
  if (/\.webp(?:[?#]|$)/i.test(image)) return 'image/webp';
  return '';
}
function socialTags({ title, description, url, image, type = 'website', date }) {
  const pairs = [
    ['property', 'og:site_name', 'المؤسسة الوطنية للكلى – اليمن'],
    ['property', 'og:locale', 'ar_YE'],
    ['property', 'og:type', type],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', url],
    ['property', 'og:image', image],
    ['property', 'og:image:secure_url', image],
    ['property', 'og:image:alt', title],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image]
  ];
  const m = mime(image);
  if (m) pairs.push(['property', 'og:image:type', m]);
  if (date) pairs.push(['property', 'article:published_time', date]);
  return '<link rel="canonical" href="' + esc(url) + '">\n' +
    pairs.map(([attr, key, val]) => '<meta ' + attr + '="' + key + '" content="' + esc(val) + '">').join('\n');
}
function withSocial(html, data) {
  // Replace old og:url and og:image referring to the unused nkfyemen.org domain.
  html = html.replace(/<meta\b[^>]*\bproperty\s*=\s*["'](?:og:|article:)[^"']+["'][^>]*>\s*/gi, '');
  html = html.replace(/<meta\b[^>]*\bname\s*=\s*["']twitter:[^"']+["'][^>]*>\s*/gi, '');
  html = html.replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>\s*/gi, '');
  html = html.replace(/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>\s*/gi, '');
  return html.replace('</head>', '<meta name="description" content="' + esc(data.description) + '">\n' +
    socialTags(data) + '\n</head>');
}
const cmsPreview = post => imageUrl(post.image);
function newsCard(post, kind) {
  const titleAr = post.title_ar || post.title_en || '';
  const titleEn = post.title_en || titleAr;
  const summaryAr = short(post.summary_ar || '');
  const summaryEn = short(post.summary_en || post.summary_ar || '');
  return [
    '<a class="nkf-story-link" href="', esc(postUrl(kind, post)), '">',
    '<img class="nkf-story-thumb" loading="lazy" alt="" src="', esc(cmsPreview(post)), '">',
    '<span class="nkf-story-copy">',
    '<span class="nkf-story-date">', esc(String(post.date || '').slice(0, 10)), '</span>',
    '<strong data-i18n-ar="', esc(titleAr), '" data-i18n-en="', esc(titleEn), '">', esc(titleEn), '</strong>',
    '<span data-i18n-ar="', esc(summaryAr), '" data-i18n-en="', esc(summaryEn), '">', esc(summaryEn), '</span>',
    '</span></a>'
  ].join('');
}
function panel(kind, list, titleAr, titleEn, ctaAr, ctaEn) {
  const href = kind === 'news' ? '/news.html' : '/articles.html';
  const cards = list.length
    ? list.slice(0, 2).map(post => newsCard(post, kind)).join('')
    : '<div class="nkf-story-empty" data-i18n-ar="ستجد هنا أحدث المواد عند نشرها." data-i18n-en="New updates will appear here when published.">New updates will appear here when published.</div>';
  return [
    '<div class="nkf-updates-panel"><div class="nkf-panel-heading">',
    '<h3 data-i18n-ar="', esc(titleAr), '" data-i18n-en="', esc(titleEn), '">', esc(titleEn), '</h3>',
    '<a class="nkf-view-all" href="', href, '" data-i18n-ar="', esc(ctaAr), '" data-i18n-en="', esc(ctaEn), '">', esc(ctaEn), '</a></div>',
    '<div class="nkf-story-items">', cards, '</div></div>'
  ].join('');
}
function homepageBlock() {
  return [
    '<section class="nkf-updates" id="latest-updates" aria-labelledby="nkf-updates-title"><div class="wrap">',
    '<div class="nkf-updates-heading">',
    '<span class="kicker" data-i18n-ar="المركز الإعلامي" data-i18n-en="Knowledge & Updates">Knowledge & Updates</span>',
    '<h2 id="nkf-updates-title" data-i18n-ar="الأخبار والمقالات" data-i18n-en="News & Articles">News & Articles</h2>',
    '<p data-i18n-ar="تابع أحدث أخبار أبحاث الكلى، وتجارب العلاج، والمقالات المتخصصة." data-i18n-en="Read the latest kidney research news, treatment updates, and expert articles.">Read the latest kidney research news, treatment updates, and expert articles.</p>',
    '</div><div class="nkf-updates-columns">',
    panel('news', news, 'آخر الأخبار', 'Latest News', 'جميع الأخبار ←', 'All News →'),
    panel('articles', articles, 'المقالات', 'Articles', 'جميع المقالات ←', 'All Articles →'),
    '</div></div></section>'
  ].join('');
}

const indexPath = path.join(dist, 'index.html');
let index = await readFile(indexPath, 'utf8');
index = withSocial(index, {
  title: 'المؤسسة الوطنية للكلى – اليمن | ' + String(site.hero_title_ar || 'معا في مواجهة الفشل الكلوي').trim(),
  description: short(site.hero_description_ar || 'مساندة مرضى الفشل الكلوي في اليمن وتحسين فرص العلاج والغسيل الكلوي وزراعة الكلى.'),
  image: previewImage, url: base + '/'
});
index = index.replace(/https:\/\/nkfyemen\.org/g, base);
const navLinks = '<a href="/news.html" data-i18n-ar="الأخبار" data-i18n-en="News">News</a>' +
  '<a href="/articles.html" data-i18n-ar="المقالات" data-i18n-en="Articles">Articles</a>';
const mobileLinks = '<a href="/news.html" onclick="closeMobileMenu()" data-i18n-ar="الأخبار" data-i18n-en="News">News</a>' +
  '<a href="/articles.html" onclick="closeMobileMenu()" data-i18n-ar="المقالات" data-i18n-en="Articles">Articles</a>';
if (!index.includes('<nav class="links" aria-label="Main Navigation">') ||
    !index.includes('<div class="mobile-menu" id="mobileMenu">') ||
    !index.includes('<section id="programs">')) {
  throw new Error('Homepage markup changed; featured content and menu were not inserted.');
}
index = index.replace('<nav class="links" aria-label="Main Navigation">',
  '<nav class="links" aria-label="Main Navigation">' + navLinks);
index = index.replace('<div class="mobile-menu" id="mobileMenu">',
  '<div class="mobile-menu" id="mobileMenu">' + mobileLinks);
index = index.replace('<section id="programs">', homepageBlock() + '\n<section id="programs">');
await writeFile(indexPath, index);

for (const [filename, title, description] of [
  ['news.html', 'الأخبار | المؤسسة الوطنية للكلى – اليمن', 'آخر أخبار الكلى والفشل الكلوي والأبحاث الطبية في المؤسسة الوطنية للكلى – اليمن.'],
  ['articles.html', 'المقالات | المؤسسة الوطنية للكلى – اليمن', 'مقالات علمية وتوعوية حول الفشل الكلوي والغسيل الكلوي وزراعة الكلى.'],
  ['gallery.html', 'الصور والفيديو | المؤسسة الوطنية للكلى – اليمن', 'مكتبة الصور والفيديو للمؤسسة الوطنية للكلى – اليمن.']
]) {
  const p = path.join(dist, filename);
  const html = await readFile(p, 'utf8');
  await writeFile(p, withSocial(html, {title, description, url: base + '/' + filename, image: previewImage}));
}

function bodyMarkup(markdown) {
  // Escaped static, readable text for crawlers and visitors without JavaScript.
  const blocks = String(markdown || '').trim().split(/\n\s*\n/);
  return blocks.filter(Boolean).map((block, i) => {
    const cleaned = block.replace(/^\s*#{1,6}\s+/, '').trim();
    // The entry title is already an H1.
    if (i === 0 && /^#\s/.test(block)) return '';
    if (/^#{1,6}\s/.test(block)) return '<h2>' + esc(cleaned) + '</h2>';
    return '<p>' + esc(cleaned).replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
}
const articleSchema = (kind, post, url, image) => ({
  '@context': 'https://schema.org',
  '@type': kind === 'news' ? 'NewsArticle' : 'Article',
  headline: post.title_ar || post.title_en || '',
  description: post.summary_ar || post.summary_en || '',
  datePublished: post.date || undefined,
  inLanguage: 'ar',
  image: [image],
  mainEntityOfPage: url,
  publisher: {
    '@type': 'Organization',
    name: 'المؤسسة الوطنية للكلى – اليمن',
    url: base + '/'
  }
});
const generated = [];
for (const [kind, posts, templateName] of [
  ['news', news, 'news-item.html'],
  ['articles', articles, 'article.html']
]) {
  const template = await readFile(path.join(dist, templateName), 'utf8');
  await mkdir(path.join(dist, kind), {recursive:true});
  for (const post of posts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) continue;
    const url = base + postUrl(kind, post);
    const image = cmsPreview(post);
    const title = post.title_ar || post.title_en || '';
    const desc = short(post.summary_ar || post.summary_en || '');
    let html = withSocial(template, {title, description: desc, url, image, type: 'article', date: post.date});
    html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + ' | المؤسسة الوطنية للكلى – اليمن</title>');
    html = html.replace(/<h1 id="page-title">[^<]*<\/h1>/, '<h1 id="page-title">' + esc(title) + '</h1>');
    const staticArticle = [
      '<article class="editorial-article"><h2>', esc(title), '</h2>',
      '<time datetime="', esc(post.date || ''), '">', esc(String(post.date || '').slice(0,10)), '</time>',
      post.image ? '<img src="' + esc(image) + '" alt="' + esc(title) + '" loading="eager">' : '',
      '<p class="editorial-lead">', esc(desc), '</p>',
      bodyMarkup(post.body_ar || post.body_en), '</article>'
    ].join('');
    const slot = /(<section id="items"[^>]*>)(<\/section>)/;
    if (!slot.test(html)) throw new Error('Article template missing #items');
    html = html.replace(slot, (full, open, close) => open + staticArticle + close);
    const schema = JSON.stringify(articleSchema(kind, post, url, image)).replace(/</g, '\\u003c');
    html = html.replace('</head>', '<script type="application/ld+json">' + schema + '</script></head>');
    await writeFile(path.join(dist, kind, post.slug + '.html'), html);
    generated.push(url);
  }
}

// Ensure new static shareable URLs are discoverable by crawlers and search engines.
const topLevel = (await readdir(dist)).filter(f => f.endsWith('.html') &&
  !['news-item.html', 'article.html', 'thanks.html'].includes(f));
const sitemapUrls = [...topLevel.map(f => base + '/' + (f === 'index.html' ? '' : f)), ...generated];
await writeFile(path.join(dist, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapUrls.map(url => '<url><loc>' + esc(url) + '</loc></url>').join('\n') +
  '\n</urlset>\n');
console.log('NKF featured news and social previews ready: ' + generated.length + ' static content pages.');
