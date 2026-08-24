import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Globe,
  LayoutGrid,
  Layers,
  Search,
  X
} from 'lucide-react';
import './lens.css';

const FAVORITES_KEY = 'gpt-image-2-lens-favorites:v1';
const LANGUAGE_KEY = 'language';
const PAGE_SIZE = 48;

const copy = {
  en: {
    eyebrow: 'GPT-Image2 gallery',
    searchCases: 'Search titles, styles, or prompts',
    searchTemplates: 'Search templates',
    searchSaved: 'Search saved cases',
    all: 'All',
    featured: 'Featured',
    allCases: 'All cases',
    gallery: 'Gallery',
    templates: 'Templates',
    saved: 'Saved',
    copyPrompt: 'Copy prompt',
    copied: 'Copied',
    copyTemplate: 'Copy template',
    save: 'Save',
    savedOn: 'Saved',
    source: 'Source',
    openSource: 'Open source',
    loadMore: 'Load more',
    noCases: 'No matching cases',
    noTemplates: 'No matching templates',
    noSaved: 'Nothing saved yet',
    noSavedHint: 'Bookmark a case in the gallery. It stays on this phone.',
    retryHint: 'Try another category or keyword.',
    loading: 'Loading cases…',
    fullSite: 'Full gallery',
    cases: 'cases',
    templatesCount: 'templates',
    savedCount: 'saved',
    copiedToast: 'Prompt copied',
    templateToast: 'Template copied',
    savedToast: 'Saved to this phone',
    unsavedToast: 'Removed from saved'
  },
  zh: {
    eyebrow: 'GPT-Image 图鉴',
    searchCases: '查找标题、风格或提示词',
    searchTemplates: '查找模板',
    searchSaved: '查找收藏',
    all: '全部',
    featured: '精选',
    allCases: '全部案例',
    gallery: '图库',
    templates: '模板',
    saved: '收藏',
    copyPrompt: '复制提示词',
    copied: '已复制',
    copyTemplate: '复制模板',
    save: '收藏',
    savedOn: '已收藏',
    source: '来源',
    openSource: '查看来源',
    loadMore: '加载更多',
    noCases: '没有匹配的案例',
    noTemplates: '没有匹配的模板',
    noSaved: '还没有收藏',
    noSavedHint: '在图库里点书签，案例会留在这台手机上。',
    retryHint: '换个分类或关键词再找一次。',
    loading: '正在加载案例…',
    fullSite: '完整画廊',
    cases: '个案例',
    templatesCount: '套模板',
    savedCount: '条收藏',
    copiedToast: '已复制提示词',
    templateToast: '已复制模板要点',
    savedToast: '已收藏',
    unsavedToast: '已取消收藏'
  }
};

function textFor(value, language) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[language] || value.zh || value.en || '';
}

function listFor(value, language) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value[language] || value.zh || value.en || [];
}

function readLanguage() {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // ignore
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function readFavorites() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isFinite(id)) : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
}

function templatePrompt(template, language) {
  const title = textFor(template.title, language);
  const useWhen = textFor(template.useWhen, language);
  const guidance = listFor(template.guidance, language);
  const pitfalls = listFor(template.pitfalls, language);
  return [
    `【${title}】`,
    useWhen,
    '',
    language === 'zh' ? '要点：' : 'Guidance:',
    ...guidance.map((line) => `- ${line}`),
    '',
    language === 'zh' ? '避免：' : 'Pitfalls:',
    ...pitfalls.map((line) => `- ${line}`)
  ].join('\n');
}

function filterCases(cases, query, category) {
  const q = query.trim().toLowerCase();
  return cases.filter((item) => {
    if (category && item.category !== category) return false;
    if (!q) return true;
    const hay = [
      item.title,
      item.prompt,
      item.category,
      (item.styles || []).join(' '),
      (item.scenes || []).join(' '),
      item.sourceLabel
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function CasePhoto({ src, alt = '', className }) {
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />;
}

function LensApp() {
  const [language, setLanguage] = useState(readLanguage);
  const [tab, setTab] = useState('gallery');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [cases, setCases] = useState([]);
  const [library, setLibrary] = useState({ categories: [], templates: [] });
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [savedIds, setSavedIds] = useState(readFavorites);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);

  const t = copy[language];

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    try {
      window.localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // ignore
    }
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/cases.json').then((response) => response.json()),
      fetch('/style-library.json').then((response) => response.json())
    ])
      .then(([payload, styleLibrary]) => {
        if (cancelled) return;
        setCases(payload.cases || []);
        setLibrary(styleLibrary || { categories: [], templates: [] });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, category, tab]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 1400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(event) {
      if (event.key === 'Escape') setActive(null);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  const categories = library.categories || [];
  const categoryTitle = (value) => {
    const match = categories.find((item) => item.value === value);
    return match ? textFor(match.title, language) : value;
  };

  const galleryCases = useMemo(
    () => filterCases(cases, query, category),
    [cases, query, category]
  );
  const savedCases = useMemo(() => {
    const items = savedIds
      .map((id) => cases.find((item) => item.id === id))
      .filter(Boolean);
    return filterCases(items, query, category);
  }, [savedIds, cases, query, category]);
  const templates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (library.templates || []).filter((item) => {
      if (category && item.category !== category) return false;
      if (!q) return true;
      const hay = [
        textFor(item.title, language),
        textFor(item.description, language),
        textFor(item.useWhen, language),
        (item.tags || []).join(' ')
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [library.templates, query, category, language]);

  const featured = useMemo(
    () => cases.filter((item) => item.featured).slice(0, 12),
    [cases]
  );
  const list = tab === 'saved' ? savedCases : galleryCases;
  const visible = tab === 'templates' ? [] : list.slice(0, limit);
  const showFeatured = tab === 'gallery' && !query && !category;

  function toggleSave(id) {
    setSavedIds((current) => {
      const exists = current.includes(id);
      const next = exists ? current.filter((item) => item !== id) : [id, ...current];
      writeFavorites(next);
      setToast(exists ? t.unsavedToast : t.savedToast);
      return next;
    });
  }

  async function handleCopy(text, message) {
    const ok = await copyText(text);
    if (ok) setToast(message);
  }

  const countLabel =
    tab === 'templates'
      ? `${templates.length} ${t.templatesCount}`
      : tab === 'saved'
        ? `${savedCases.length} ${t.savedCount}`
        : `${galleryCases.length} ${t.cases}`;

  if (!ready) {
    return (
      <div className="loading">
        <span>{t.loading}</span>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="header">
        <div className="headerTop">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 className="title">Lens</h1>
          </div>
          <div className="headerActions">
            <p className="count">{countLabel}</p>
            <a className="iconBtn" href="/" aria-label={t.fullSite} title={t.fullSite}>
              <ExternalLink size={16} />
            </a>
            <button
              className="iconBtn"
              type="button"
              aria-label={language === 'zh' ? 'English' : '中文'}
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            >
              <Globe size={16} />
            </button>
          </div>
        </div>

        <div className="search">
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              tab === 'templates' ? t.searchTemplates : tab === 'saved' ? t.searchSaved : t.searchCases
            }
            aria-label={t.searchCases}
            autoComplete="off"
          />
          {query ? (
            <button className="searchClear" type="button" aria-label="Clear" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div className="chips">
          <button className={category === '' ? 'chip active' : 'chip'} type="button" onClick={() => setCategory('')}>
            {t.all}
          </button>
          {categories.map((item) => (
            <button
              key={item.id || item.value}
              className={category === item.value ? 'chip active' : 'chip'}
              type="button"
              onClick={() => setCategory(item.value)}
            >
              {textFor(item.title, language)}
            </button>
          ))}
        </div>
      </header>

      <main className="main">
        {tab === 'templates' ? (
          templates.length === 0 ? (
            <Empty title={t.noTemplates} body={t.retryHint} />
          ) : (
            <div className="templates">
              {templates.map((template, index) => (
                <article className="template" key={template.id} style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
                  {template.cover ? (
                    <CasePhoto src={template.cover} alt={textFor(template.title, language)} className="templateCover" />
                  ) : null}
                  <div className="templateBody">
                    <p className="eyebrow">{categoryTitle(template.category)}</p>
                    <h2>{textFor(template.title, language)}</h2>
                    <p>{textFor(template.description, language)}</p>
                    <p className="useWhen">{textFor(template.useWhen, language)}</p>
                    {listFor(template.guidance, language).length > 0 ? (
                      <ul>
                        {listFor(template.guidance, language)
                          .slice(0, 3)
                          .map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                      </ul>
                    ) : null}
                    {(template.exampleCases || []).length > 0 ? (
                      <div className="examples">
                        {template.exampleCases
                          .map((id) => cases.find((item) => item.id === id))
                          .filter(Boolean)
                          .slice(0, 4)
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setActive(item)}
                              aria-label={item.title}
                            >
                              <CasePhoto src={item.image} alt="" className="cardPhoto" />
                            </button>
                          ))}
                      </div>
                    ) : null}
                    <button
                      className="primary"
                      type="button"
                      onClick={() => handleCopy(templatePrompt(template, language), t.templateToast)}
                    >
                      <Copy size={16} />
                      {t.copyTemplate}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : list.length === 0 && !showFeatured ? (
          <Empty
            title={tab === 'saved' ? (query ? t.noCases : t.noSaved) : t.noCases}
            body={tab === 'saved' && !query ? t.noSavedHint : t.retryHint}
          />
        ) : (
          <>
            {showFeatured && featured.length > 0 ? (
              <section>
                <p className="sectionLabel">{t.featured}</p>
                <div className="featured">
                  {featured.map((item, index) => (
                    <CaseCard
                      key={`feat-${item.id}`}
                      item={item}
                      index={index}
                      compact
                      saved={savedIds.includes(item.id)}
                      categoryLabel={categoryTitle(item.category)}
                      onOpen={() => setActive(item)}
                      onToggle={() => toggleSave(item.id)}
                      onCopy={() => handleCopy(item.prompt, t.copiedToast)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {list.length === 0 ? (
              <Empty
                title={tab === 'saved' ? t.noSaved : t.noCases}
                body={tab === 'saved' ? t.noSavedHint : t.retryHint}
              />
            ) : (
              <>
                {showFeatured ? <p className="sectionLabel">{t.allCases}</p> : null}
                <div className="grid">
                  {visible.map((item, index) => (
                    <CaseCard
                      key={item.id}
                      item={item}
                      index={index}
                      saved={savedIds.includes(item.id)}
                      categoryLabel={categoryTitle(item.category)}
                      onOpen={() => setActive(item)}
                      onToggle={() => toggleSave(item.id)}
                      onCopy={() => handleCopy(item.prompt, t.copiedToast)}
                    />
                  ))}
                </div>
                {list.length > limit ? (
                  <button className="loadMore" type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                    {t.loadMore}
                  </button>
                ) : null}
              </>
            )}
          </>
        )}
      </main>

      <nav className="tabbar" aria-label="Lens">
        {[
          { id: 'gallery', label: t.gallery, icon: LayoutGrid },
          { id: 'templates', label: t.templates, icon: Layers },
          { id: 'saved', label: t.saved, icon: Bookmark }
        ].map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? 'tab active' : 'tab'}
            type="button"
            onClick={() => setTab(item.id)}
          >
            <item.icon size={20} className={item.id === 'saved' && tab === 'saved' ? 'fill' : undefined} />
            {item.label}
          </button>
        ))}
      </nav>

      {active ? (
        <div className="overlay" onClick={() => setActive(null)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lens-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grip" />
            <div className="sheetBody">
              <CasePhoto src={active.image} alt={active.title} className="sheetPhoto" />
              <p className="sheetKicker">
                #{active.id} · {categoryTitle(active.category)}
              </p>
              <h2 id="lens-sheet-title">{active.title}</h2>
              <div className="tags">
                {[...(active.styles || []), ...(active.scenes || [])].map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <pre className="prompt">{active.prompt}</pre>
              {active.sourceLabel ? (
                <p className="source">
                  {t.source} {active.sourceLabel}
                </p>
              ) : null}
            </div>
            <div className="sheetBar">
              <button
                className="iconBtn"
                type="button"
                aria-label={savedIds.includes(active.id) ? t.savedOn : t.save}
                aria-pressed={savedIds.includes(active.id)}
                onClick={() => toggleSave(active.id)}
              >
                <Bookmark size={18} className={savedIds.includes(active.id) ? 'fill' : undefined} />
              </button>
              <button
                className="primary"
                type="button"
                onClick={async () => {
                  const ok = await copyText(active.prompt);
                  if (!ok) return;
                  setCopied(true);
                  setToast(t.copiedToast);
                  window.setTimeout(() => setCopied(false), 1400);
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? t.copied : t.copyPrompt}
              </button>
              {active.sourceUrl ? (
                <a className="iconBtn" href={active.sourceUrl} target="_blank" rel="noreferrer" aria-label={t.openSource}>
                  <ExternalLink size={16} />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function CaseCard({ item, index, saved, compact, categoryLabel, onOpen, onToggle, onCopy }) {
  return (
    <article className="card" style={{ animationDelay: `${Math.min(index, 16) * 30}ms` }}>
      <button type="button" onClick={onOpen} className="ghost" style={{ width: '100%', height: 'auto', padding: 0 }}>
        <CasePhoto src={item.image} alt={item.imageAlt || item.title} className="cardPhoto" />
      </button>
      {compact ? null : (
        <div className="cardActions">
          <button className="fab" type="button" aria-label="Copy" onClick={onCopy}>
            <Copy size={14} />
          </button>
          <button
            className={saved ? 'fab active' : 'fab'}
            type="button"
            aria-label="Save"
            aria-pressed={saved}
            onClick={onToggle}
          >
            <Bookmark size={14} className={saved ? 'fill' : undefined} />
          </button>
        </div>
      )}
      <button type="button" className="cardBody" onClick={onOpen}>
        <p className="cardTitle">{item.title}</p>
        <p className="cardMeta">
          #{item.id} · {categoryLabel}
        </p>
      </button>
    </article>
  );
}

function Empty({ title, body }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

createRoot(document.getElementById('lens-root')).render(<LensApp />);
