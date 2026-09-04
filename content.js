(() => {
  const STORAGE_KEY = "cryingJimmyDismissedUntil";
  const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
  const BANNER_ID = "crying-jimmy-banner";
  const ASK_ATTR = "data-cj-ask";

  const FUNDRAISING_SELECTORS = [
    "#centralNotice",
    ".frb",
    ".frb-main",
    ".cn-fundraising",
    ".mw-frb",
    "[data-fundraising-banner]",
    ".wp-frb",
    "#siteNotice .frb",
    "#mw-content-text .frb",
  ];

  const FUNDRAISING_TEXT =
    /wikipedia still can.?t be sold|we.?re sorry we.?ve made several attempts|if everyone reading this gave|most readers don.?t donate|personal appeal from|please donat|help keep wikipedia|we need your help|give €|give \$|donate now|fundraising/i;

  // Money phrases as Wikipedia prints them: €2,75 / $2.75 / £3 / 2,75 € / etc.
  const MONEY_RE =
    /(?:[$€£¥₹]\s?\d{1,3}(?:[.,]\d{1,2})?|\d{1,3}(?:[.,]\d{1,2})?\s?(?:[$€£¥₹]|USD|EUR|GBP|CHF|CAD|AUD|JPY|SEK|NOK|DKK|PLN|CZK|INR|BRL|MXN|KRW|CHF))/gi;

  function getJimmyUrl() {
    try {
      return chrome.runtime.getURL("images/jimmy.jpg");
    } catch {
      return "images/jimmy.jpg";
    }
  }

  function getDonateUrl() {
    const lang = (location.hostname.split(".")[0] || "en").replace(/wiki$/, "") || "en";
    const wiki = lang.includes("-") ? "en" : lang;
    return `https://donate.wikimedia.org/?wmf_source=cryingjimmy&wmf_medium=sidebar&wmf_campaign=cryingjimmy&uselang=${encodeURIComponent(wiki)}`;
  }

  function normalizeMoney(raw) {
    return raw.replace(/\s+/g, " ").trim();
  }

  function moneySortKey(raw) {
    const digits = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    const n = Number.parseFloat(digits);
    return Number.isFinite(n) ? n : Infinity;
  }

  /** Pull the ask amount exactly as shown in Wikipedia's own banner. */
  function extractAskFromBannerText(text) {
    if (!text) return null;
    const matches = [...text.matchAll(MONEY_RE)]
      .map((m) => normalizeMoney(m[0]))
      .filter((m) => m.length > 0 && m.length < 20);

    if (matches.length === 0) return null;

    // Prefer the small repeated ask (e.g. €2,75) over larger examples (€25)
    const counts = new Map();
    for (const m of matches) {
      counts.set(m, (counts.get(m) || 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return moneySortKey(a[0]) - moneySortKey(b[0]);
      })[0][0];
  }

  function extractAskFromNodes(nodes) {
    for (const node of nodes) {
      const ask = extractAskFromBannerText(node.textContent || "");
      if (ask) return ask;
    }
    return null;
  }

  function isDismissed() {
    try {
      const until = Number(localStorage.getItem(STORAGE_KEY) || 0);
      return Date.now() < until;
    } catch {
      return false;
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + DISMISS_MS));
    } catch {
      /* ignore */
    }
    removeBanner();
    document.documentElement.classList.remove("crying-jimmy-active");
  }

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  function findFundraisingNodes() {
    const found = new Set();

    for (const sel of FUNDRAISING_SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.id === BANNER_ID) return;
        if (el.closest(`#${BANNER_ID}`)) return;
        found.add(el);
      });
    }

    const candidates = document.querySelectorAll(
      "#siteNotice, #centralNotice, .mw-dismissable-notice, [role='banner'] > div, body > div"
    );
    for (const el of candidates) {
      if (el.id === BANNER_ID || el.closest(`#${BANNER_ID}`)) continue;
      const text = (el.textContent || "").trim();
      if (text.length < 40 || text.length > 4000) continue;
      if (FUNDRAISING_TEXT.test(text)) found.add(el);
    }

    return [...found].filter((el) => {
      return ![...found].some((other) => other !== el && other.contains(el));
    });
  }

  function bodyCopy(today, ask) {
    if (ask) {
      return `Dear Wikipedia readers: It is ${today}, and Wikipedia still needs you.
            We are a small non-profit — not a giant corporation, not owned by a billionaire —
            and we depend on donations to keep Wikipedia free and free of advertising.
            Most people donate nothing. If Wikipedia has given you ${ask} worth of knowledge,
            please give ${ask}. If it has given you more, please give more.
            Thank you.`;
    }

    return `Dear Wikipedia readers: It is ${today}, and Wikipedia still needs you.
            We are a small non-profit — not a giant corporation, not owned by a billionaire —
            and we depend on donations to keep Wikipedia free and free of advertising.
            Most people donate nothing. If Wikipedia has given you something of value,
            please give what you can.
            Thank you.`;
  }

  function buildBanner(ask) {
    const root = document.createElement("div");
    root.id = BANNER_ID;
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "A personal appeal from Wikipedia founder Jimmy Wales");
    if (ask) root.setAttribute(ASK_ATTR, ask);

    const today = new Date().toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
    });

    root.innerHTML = `
      <div class="cj-inner">
        <img
          class="cj-photo"
          src="${getJimmyUrl()}"
          width="88"
          height="112"
          alt="Jimmy Wales"
        />
        <div class="cj-copy">
          <p class="cj-headline">Please read: A personal appeal from Wikipedia founder Jimmy Wales</p>
          <p class="cj-body">${bodyCopy(today, ask)}</p>
          <p class="cj-signoff">— <strong>Jimmy Wales</strong>, Wikipedia Founder</p>
          <div class="cj-actions">
            <a class="cj-donate" href="${getDonateUrl()}" target="_blank" rel="noopener noreferrer">Donate now</a>
            <button type="button" class="cj-later">Maybe later</button>
          </div>
        </div>
      </div>
      <button type="button" class="cj-close" aria-label="Close">×</button>
    `;

    root.querySelector(".cj-close")?.addEventListener("click", dismiss);
    root.querySelector(".cj-later")?.addEventListener("click", dismiss);
    return root;
  }

  function insertBanner(ask) {
    const existing = document.getElementById(BANNER_ID);
    if (existing) {
      // Upgrade copy once we manage to scrape the original ask amount
      if (ask && existing.getAttribute(ASK_ATTR) !== ask) {
        existing.replaceWith(buildBanner(ask));
      }
      return;
    }

    const banner = buildBanner(ask);
    const host =
      document.getElementById("mw-mf-viewport") ||
      document.getElementById("content") ||
      document.getElementById("mw-page-base")?.parentElement ||
      document.body;

    const siteNotice = document.getElementById("siteNotice");
    if (siteNotice?.parentNode) {
      siteNotice.parentNode.insertBefore(banner, siteNotice);
    } else if (host.firstChild) {
      host.insertBefore(banner, host.firstChild);
    } else {
      host.appendChild(banner);
    }
  }

  function replaceBanners() {
    if (isDismissed()) {
      document.documentElement.classList.remove("crying-jimmy-active");
      removeBanner();
      return false;
    }

    const nodes = findFundraisingNodes();
    if (nodes.length === 0) return false;

    const ask = extractAskFromNodes(nodes);
    document.documentElement.classList.add("crying-jimmy-active");
    insertBanner(ask);
    return true;
  }

  function start() {
    replaceBanners();

    const observer = new MutationObserver(() => {
      replaceBanners();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => observer.disconnect(), 60_000);

    [500, 1500, 4000, 8000].forEach((ms) => {
      setTimeout(replaceBanners, ms);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
