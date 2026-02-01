const state = {
  countries: [],
  index: 0,
  autoplay: true,
  unlocked: false,
  voice: null,
  voicesReady: false,
  canSpeak: false,
  renderToken: 0,
  capitalRuByCode: {}
};

const el = {
  overlay: document.getElementById("overlay"),
  startBtn: document.getElementById("startBtn"),
  flag: document.getElementById("flag"),
  country: document.getElementById("country"),
  capital: document.getElementById("capital"),
  progress: document.getElementById("progress"),
  status: document.getElementById("status"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  randomBtn: document.getElementById("randomBtn")
};

function init() {
  bindEvents();
  initVoices();
  loadCountries();
}

function bindEvents() {
  el.startBtn.addEventListener("click", () => {
    state.unlocked = true;
    el.overlay.classList.add("hidden");
    render({ speak: true });
  });

  el.prevBtn.addEventListener("click", prev);
  el.nextBtn.addEventListener("click", next);
  el.randomBtn.addEventListener("click", random);

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
    if (e.key.toLowerCase() === "r") random();
  });
}

async function loadCountries() {
  setStatus("");
  try {
    const url = "https://restcountries.com/v3.1/all?fields=name,translations,capital,flags,cca2";
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    state.capitalRuByCode = await loadCapitalsRu();
    state.countries = data
      .map(c => normalizeCountry(c, state.capitalRuByCode))
      .filter(c => c.nameEn || c.nameRu);
    state.countries.sort((a, b) => (a.nameRu || a.nameEn).localeCompare(b.nameRu || b.nameEn, "ru"));
    state.index = 0;
    render({ speak: false });
  } catch (err) {
    setStatus("Нет сети или сервис недоступен. Проверьте подключение.");
  }
}

function normalizeCountry(c, capitalRuByCode) {
  const nameEn = (c.name && c.name.common) ? c.name.common : "";
  const nameRu = (c.translations && c.translations.rus && c.translations.rus.common)
    ? c.translations.rus.common
    : "";
  const capital = (c.capital && c.capital[0]) ? c.capital[0] : "";
  const code = (c.cca2 || "").toUpperCase();
  const capitalRuFromCode = capitalRuByCode && code ? capitalRuByCode[code] : "";
  return {
    code,
    nameRu,
    nameEn,
    capital,
    capitalRu: capitalRuFromCode || "",
    flagSvg: (c.flags && c.flags.svg) ? c.flags.svg : "",
    flagPng: (c.flags && c.flags.png) ? c.flags.png : ""
  };
}

function render(options = {}) {
  if (!state.countries.length) return;
  const speak = options.speak !== false;
  const c = state.countries[state.index];
  const title = c.nameRu || c.nameEn || "—";
  const capitalText = c.capitalRu ? c.capitalRu : "Столица неизвестна";

  el.country.textContent = title;
  el.capital.textContent = capitalText;
  el.progress.textContent = `${state.index + 1} / ${state.countries.length}`;

  if (c.flagSvg || c.flagPng) {
    const token = ++state.renderToken;
    const bust = c.code ? `?v=${encodeURIComponent(c.code)}&t=${token}` : `?t=${token}`;
    const srcSvg = c.flagSvg ? (c.flagSvg + bust) : "";
    const srcPng = c.flagPng ? (c.flagPng + bust) : "";
    el.flag.onload = () => {
      if (token !== state.renderToken) return;
    };
    el.flag.onerror = () => {
      if (token !== state.renderToken) return;
      if (srcSvg && srcPng && el.flag.src !== srcPng) {
        el.flag.src = srcPng;
      } else {
        el.flag.removeAttribute("src");
      }
    };
    el.flag.src = srcSvg || srcPng;
    el.flag.alt = `Флаг ${title}`;
  } else {
    el.flag.removeAttribute("src");
    el.flag.alt = "Флаг";
  }

  if (speak && state.autoplay && state.unlocked) {
    speakCurrent();
  }

}

function next() {
  if (!state.countries.length) return;
  state.index = (state.index + 1) % state.countries.length;
  render({ speak: true });
}

function prev() {
  if (!state.countries.length) return;
  state.index = (state.index - 1 + state.countries.length) % state.countries.length;
  render({ speak: true });
}

function random() {
  if (!state.countries.length) return;
  let nextIndex = state.index;
  if (state.countries.length > 1) {
    while (nextIndex === state.index) {
      nextIndex = Math.floor(Math.random() * state.countries.length);
    }
  }
  state.index = nextIndex;
  render({ speak: true });
}

function initVoices() {
  const synth = window.speechSynthesis;
  if (!synth) {
    setStatus("Озвучка недоступна: браузер не поддерживает TTS.");
    return;
  }

  const tryLoad = () => {
    const voices = synth.getVoices();
    if (voices && voices.length) {
      state.voicesReady = true;
      state.voice = pickVoice(voices);
      state.canSpeak = !!state.voice;
      if (!state.voice) setStatus("Озвучка недоступна: нет русских голосов в системе.");
      // speak is handled by render()
      return true;
    }
    return false;
  };

  if (!tryLoad()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (tryLoad() || attempts > 20) clearInterval(timer);
      if (attempts > 20) {
        setStatus("Озвучка недоступна: нет русских голосов в системе.");
      }
    }, 250);

    synth.onvoiceschanged = () => {
      tryLoad();
    };
  }
}

function pickVoice(voices) {
  if (!voices || !voices.length) return null;
  const ruVoices = voices.filter(v => (v.lang || "").toLowerCase().startsWith("ru"));
  if (!ruVoices.length) return null;
  const scored = ruVoices.map(v => [v, scoreVoice(v)]);
  scored.sort((a, b) => b[1] - a[1]);
  return scored[0] ? scored[0][0] : null;
}

function scoreVoice(v) {
  const name = (v.name || "").toLowerCase();
  const lang = (v.lang || "").toLowerCase();
  let score = 0;

  if (lang.startsWith("ru")) score += 100;
  if (lang === "ru-ru") score += 15;
  if (v.localService) score += 6;
  if (v.default) score += 5;

  if (
    name.includes("google") ||
    name.includes("yandex") ||
    name.includes("microsoft") ||
    name.includes("apple") ||
    name.includes("sber") ||
    name.includes("acapela") ||
    name.includes("neural") ||
    name.includes("premium")
  ) {
    score += 20;
  }

  if (
    name.includes("female") ||
    name.includes("anna") ||
    name.includes("alena") ||
    name.includes("elena") ||
    name.includes("irina") ||
    name.includes("katya") ||
    name.includes("tatyana")
  ) {
    score += 2;
  }

  return score;
}

function speak(text) {
  if (!state.unlocked) return;
  if (!state.canSpeak) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(normalizeTtsText(text));
  if (state.voice) utter.voice = state.voice;
  utter.lang = (state.voice && state.voice.lang) ? state.voice.lang : "ru-RU";
  utter.rate = 0.95;
  utter.pitch = 0.98;
  utter.volume = 1;
  synth.speak(utter);
}

function speakCurrent() {
  if (!state.countries.length) return;
  const c = state.countries[state.index];
  const title = c.nameRu || c.nameEn || "";
  const capitalText = c.capitalRu
    ? `столица ${c.capitalRu}.`
    : "столица неизвестна.";
  const phrase = `${title} — ${capitalText}`;
  speak(phrase);
}

function setStatus(msg) {
  el.status.textContent = msg;
}

async function loadCapitalsRu() {
  try {
    const res = await fetch("./capitals-ru.json", { cache: "no-store" });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function normalizeTtsText(text) {
  if (!text) return "";
  return text
    .replace(/[–—]/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .trim();
}

init();
