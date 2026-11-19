/* ============================================================
   NovaTV — lógica principal
   Player HLS (hls.js) + MP4 nativo, navegação por teclado/
   controle remoto, favoritos, EPG simples e busca.

   CANAIS DE DEMONSTRAÇÃO: todos os canais abaixo são EXEMPLOS.
   Substitua o campo `url` pela URL do SEU stream autorizado
   (.m3u8 ou .mp4) — veja o README.
   ============================================================ */

"use strict";

/* ------------------------------------------------------------
   1. CANAIS DE DEMONSTRAÇÃO (edite livremente)
   url: ""  -> mostra aviso "nenhuma transmissão configurada"
   url: "COLE_A_URL_DO_SEU_STREAM_AQUI" -> exemplo de HLS
   categoria: "aovivo" | "filmes" | "series"
   epg: programação fictícia [hora, nome]
   ------------------------------------------------------------ */
const CHANNELS = [
  {
    id: "nova-1",
    name: "Nova Notícias",
    category: "aovivo",
    isLive: true,
    url: "",
    desc: "Jornalismo 24 horas com cobertura dos principais acontecimentos.",
    epg: [
      ["06:00", "Manhã Nova"],
      ["09:00", "Jornal das Dez"],
      ["12:00", "Nova Notícias ao Meio-dia"],
      ["13:00", "Economia em Dia"],
      ["18:00", "Plantão Nova"],
      ["21:00", "Grandes Reportagens"],
    ],
  },
  {
    id: "nova-2",
    name: "Nova Esportes",
    category: "aovivo",
    isLive: true,
    url: "",
    desc: "Transmissões esportivas, mesa-redonda e resumos da rodada.",
    epg: [
      ["07:00", "Bem-vindo ao Clan"],
      ["10:00", "Café com Bola"],
      ["14:00", "Volta Rápida"],
      ["17:00", "Mesa Redonda Nova"],
      ["20:00", "Jogo da Noite"],
    ],
  },
  {
    id: "nova-3",
    name: "Nova Documenta",
    category: "aovivo",
    isLive: true,
    url: "",
    desc: "Documentários sobre natureza, ciência e culturas do mundo.",
    epg: [
      ["08:00", "Planeta Extremo"],
      ["11:00", "Mundos Pequenos"],
      ["15:00", "Rotas do Oceano"],
      ["19:00", "Origens"],
      ["22:00", "Universo Sem Fim"],
    ],
  },
  {
    id: "nova-4",
    name: "Nova Culinária",
    category: "aovivo",
    isLive: true,
    url: "",
    desc: "Programas de gastronomia com chefs convidados.",
    epg: [
      ["09:00", "Café & Panela"],
      ["12:30", "Almoço Rápido"],
      ["16:00", "Doces & Segredos"],
      ["20:30", "Cozinha de Autor"],
    ],
  },
  {
    id: "filme-1",
    name: "Sala Nova — Aventura",
    category: "filmes",
    isLive: false,
    url: "",
    desc: "Maratona de filmes de aventura em exibição contínua.",
    epg: [
      ["10:00", "Trilhas do Horizonte"],
      ["12:00", "Vento Sul"],
      ["14:30", "O Último Farol"],
      ["17:00", "Rota Selvagem"],
      ["20:00", "Alto Mar"],
    ],
  },
  {
    id: "filme-2",
    name: "Sala Nova — Clássicos",
    category: "filmes",
    isLive: false,
    url: "",
    desc: "Grandes clássicos do cinema restaurados em alta definição.",
    epg: [
      ["11:00", "Cidade Antiga"],
      ["13:30", "A Sétima Carta"],
      ["16:00", "Noite de Gala"],
      ["19:30", "Estrela de Prata"],
    ],
  },
  {
    id: "serie-1",
    name: "Nova Séries — Drama",
    category: "series",
    isLive: false,
    url: "",
    desc: "Maratona da série dramática 'Fronteiras'.",
    epg: [
      ["09:00", "Fronteiras T1E1"],
      ["10:00", "Fronteiras T1E2"],
      ["11:00", "Fronteiras T1E3"],
      ["12:00", "Fronteiras T1E4"],
      ["13:00", "Fronteiras T1E5"],
    ],
  },
  {
    id: "serie-2",
    name: "Nova Séries — Comédia",
    category: "series",
    isLive: false,
    url: "",
    desc: "Sitcoms e comédias de terror leve para todas as idades.",
    epg: [
      ["08:00", "Vizinhança Feliz E1"],
      ["08:30", "Vizinhança Feliz E2"],
      ["09:00", "Papo de Elevador E1"],
      ["09:30", "Papo de Elevador E2"],
    ],
  },
];

/* Stream de teste público (Big Buck Bunny / Mux) — troque pelos seus.
   Fonte de teste usada para validar o player; não é conteúdo próprio. */
const DEMO_TEST_STREAM = "https://amendments-entrance-dual-might.trycloudflare.com/hls/stream.m3u8";

/* ------------------------------------------------------------
   2. ESTADO
   ------------------------------------------------------------ */
const state = {
  category: "inicio",
  search: "",
  selectedId: null,
  hls: null,
  favorites: new Set(loadFavorites()),
  watching: [], // ids de canais assistidos nesta sessão
};

const CATEGORY_LABELS = {
  inicio: "Canais ao vivo",
  aovivo: "Canais ao vivo",
  filmes: "Canais de filmes",
  series: "Canais de séries",
  favoritos: "Seus favoritos",
};

/* ------------------------------------------------------------
   3. UTILITÁRIOS
   ------------------------------------------------------------ */
const $ = (sel) => document.querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem("novatv.favorites") || "[]");
  } catch {
    return [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem("novatv.favorites", JSON.stringify([...state.favorites]));
  } catch {
    /* localStorage indisponível — segue sem persistir */
  }
}

function getChannel(id) {
  return CHANNELS.find((c) => c.id === id) || null;
}

/* ------------------------------------------------------------
   4. RELÓGIO DO CABEÇALHO
   ------------------------------------------------------------ */
function startClock() {
  const time = $("#clockTime");
  const date = $("#clockDate");
  const fmtDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short" });
  const tick = () => {
    const now = new Date();
    time.textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    date.textContent = fmtDate.format(now);
  };
  tick();
  setInterval(tick, 30_000);
}

/* ------------------------------------------------------------
   5. RENDERIZAÇÃO DA GRADE E CARROSSEIS
   ------------------------------------------------------------ */
function matchesFilters(channel) {
  const cat = state.category;
  const okCat =
    cat === "inicio" ||
    (cat === "favoritos"
      ? state.favorites.has(channel.id)
      : channel.category === cat);
  const q = state.search.trim().toLowerCase();
  const okSearch = !q || channel.name.toLowerCase().includes(q) || channel.desc.toLowerCase().includes(q);
  return okCat && okSearch;
}

function channelCard(channel) {
  const card = el("button", "card");
  card.type = "button";
  card.dataset.id = channel.id;
  card.setAttribute("role", "listitem");
  card.setAttribute("aria-label", `${channel.name} — ${channel.desc}`);

  if (state.selectedId === channel.id) card.classList.add("is-selected");

  const thumb = el("div", "card__thumb");
  const initial = el("span", "card__initial", channel.name.charAt(0));
  thumb.appendChild(initial);

  if (channel.isLive) thumb.appendChild(el("span", "card__live", "AO VIVO"));
  if (state.favorites.has(channel.id)) thumb.appendChild(el("span", "card__fav", "♥"));
  if (state.selectedId === channel.id) {
    thumb.appendChild(el("span", "card__playing", "▶"));
  }
  card.appendChild(thumb);

  const body = el("div", "card__body");
  body.appendChild(el("h3", "card__name", channel.name));

  const catLabel = { aovivo: "Ao vivo", filmes: "Filmes", series: "Séries" }[channel.category] || "Canal";
  const meta = el("p", "card__meta");
  meta.appendChild(el("span", null, catLabel));
  meta.appendChild(el("span", "dot"));
  meta.appendChild(el("span", null, channel.isLive ? "Em transmissão" : "Programado"));
  body.appendChild(meta);

  const current = currentProgram(channel);
  if (current) body.appendChild(el("p", "card__now", `Agora: ${current}`));

  card.appendChild(body);

  card.addEventListener("click", () => selectChannel(channel.id));
  return card;
}

function renderGrid() {
  const grid = $("#channelGrid");
  const empty = $("#gridEmpty");
  grid.replaceChildren();

  const list = CHANNELS.filter(matchesFilters);
  for (const channel of list) grid.appendChild(channelCard(channel));
  empty.hidden = list.length > 0;

  $("#gridTitle").textContent = CATEGORY_LABELS[state.category] || "Canais";
}

function renderShelves() {
  // "Assistindo agora": últimos canais selecionados nesta sessão
  const watching = $("#watchingSection");
  const watchingRow = $("#watchingRow");
  const watchList = state.watching.map(getChannel).filter(Boolean);

  watching.hidden = watchList.length === 0;
  watchingRow.replaceChildren(...watchList.map(channelCard));

  // "Recomendados": primeiros canais ao vivo não selecionados
  const recs = CHANNELS.filter((c) => c.isLive && c.id !== state.selectedId).slice(0, 6);
  $("#recommendedRow").replaceChildren(...recs.map(channelCard));
}

/* ------------------------------------------------------------
   6. EPG SIMPLES (programa atual + próximo)
   ------------------------------------------------------------ */
function currentProgram(channel) {
  if (!channel.epg || channel.epg.length === 0) return null;
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < channel.epg.length; i++) {
    const [startStr, name] = channel.epg[i];
    const [h, m] = startStr.split(":").map(Number);
    const start = h * 60 + m;
    const end = i + 1 < channel.epg.length ? parseStart(channel.epg[i + 1][0]) : 24 * 60;
    if (minutesNow >= start && minutesNow < end) return name;
  }
  // Antes da primeira entrada do dia
  return channel.epg[0][1];
}

function parseStart(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

function renderEpg(channel) {
  const section = $("#epgSection");
  const timeline = $("#epgTimeline");
  if (!channel.epg || channel.epg.length === 0) {
    section.hidden = true;
    return;
  }

  $("#epgChannelName").textContent = channel.name;
  timeline.replaceChildren();

  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const currentName = currentProgram(channel);
  const currentIndex = channel.epg.findIndex(([, name]) => name === currentName);

  channel.epg.forEach(([time, name], i) => {
    const item = el("div", "epg__item");
    const start = parseStart(time);
    if (i === currentIndex && minutesNow >= start) item.classList.add("epg__item--current");
    else if (i === currentIndex + 1) item.classList.add("epg__item--next");

    item.appendChild(el("span", "epg__time", time));
    item.appendChild(el("p", "epg__name", name));
    if (i === currentIndex && minutesNow >= start) item.appendChild(el("span", "epg__badge", "NO AR AGORA"));
    timeline.appendChild(item);
  });

  section.hidden = false;
}

/* ------------------------------------------------------------
   7. PLAYER (HLS via hls.js ou nativo / MP4)
   ------------------------------------------------------------ */
const video = $("#video");

function showPlayerState(which) {
  const states = {
    none: null,
    noUrl: $("#stateNoUrl"),
    loading: $("#stateLoading"),
    noSignal: $("#stateNoSignal"),
    error: $("#stateError"),
  };
  for (const [key, node] of Object.entries(states)) {
    if (node) node.hidden = key !== which;
  }
}

function destroyHls() {
  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }
}

function updatePlayPauseIcon() {
  const playing = video.paused;
  $(".pbtn__icon--play").style.display = playing ? "" : "none";
  $(".pbtn__icon--pause").style.display = playing ? "none" : "";
}

function isHlsSource(url) {
  return url.toLowerCase().includes(".m3u8");
}

function attachSource(channel) {
  destroyHls();
  const url = channel.url;

  // Sem URL configurada (placeholder vazio ou não preenchido)
  if (!url || url.includes("COLE_A_URL_DO_SEU_STREAM_AQUI")) {
    showPlayerState("noUrl");
    return false;
  }

  showPlayerState("loading");

  if (isHlsSource(url)) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari / iOS: HLS nativo
      video.src = url;
      return true;
    }
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ autoStartLoad: true });
      state.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          showError("Falha de rede ao acessar a transmissão. Verifique a URL e o CORS do servidor de streaming.");
        } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          showError("Erro de mídia no stream. O servidor pode estar fora do ar ou o formato é incompatível.");
        } else {
          showError("Não foi possível iniciar a transmissão HLS.");
        }
      });
      return true;
    }
    showError("Este navegador não suporta reprodução HLS. Use um navegador moderno ou um stream MP4.");
    return false;
  }

  // MP4 e demais formatos nativos
  video.src = url;
  return true;
}

function showError(message) {
  destroyHls();
  $("#errorMessage").textContent = message;
  showPlayerState("error");
}

function selectChannel(id) {
  const channel = getChannel(id);
  if (!channel) return;

  state.selectedId = id;
  if (!state.watching.includes(id)) state.watching.unshift(id);
  state.watching = state.watching.slice(0, 6);

  // Textos do hero
  $("#heroTitle").textContent = channel.name;
  $("#heroDesc").textContent = channel.desc;
  $("#heroLiveTag").hidden = !channel.isLive;
  updateFavButton(channel);

  renderEpg(channel);
  renderGrid();
  renderShelves();

  const ok = attachSource(channel);
  if (ok) {
    // Autoplay silenciado respeita as políticas do navegador;
    // o usuário pode dar play manual nos controles.
    video.muted = true;
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.then(() => {
        video.muted = false; // se o autoplay passou, libera o áudio
      }).catch(() => {
        video.muted = false;
        video.pause(); // navegador bloqueou: aguarda interação do usuário
        updatePlayPauseIcon();
      });
    }
    $("#liveBadge").hidden = !channel.isLive;
  } else {
    video.removeAttribute("src");
    $("#liveBadge").hidden = true;
  }
}

/* ------------------------------------------------------------
   8. CONTROLES DO PLAYER
   ------------------------------------------------------------ */
function setupPlayerControls() {
  const playPause = $("#playPauseBtn");
  const mute = $("#muteBtn");
  const volume = $("#volumeSlider");
  const fullscreen = $("#fullscreenBtn");
  const speed = $("#speedSelect");

  const togglePlay = () => {
    if (!video.currentSrc && !video.src) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  playPause.addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);
  video.addEventListener("play", updatePlayPauseIcon);
  video.addEventListener("pause", updatePlayPauseIcon);

  video.addEventListener("playing", () => showPlayerState("none"));
  video.addEventListener("waiting", () => {
    if (video.currentSrc || video.src) showPlayerState("loading");
  });

  video.addEventListener("error", () => {
    if (!video.currentSrc && !video.src) return;
    showError("O stream não pôde ser carregado. Verifique se a URL está correta, se o servidor está ativo e se ele permite acesso pelo navegador (CORS).");
  });

  video.addEventListener("timeupdate", () => {
    if (video.duration && isFinite(video.duration)) {
      const total = video.duration;
      const cur = video.currentTime;
      const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      };
      $("#timeLabel").textContent = `${fmt(cur)} / ${fmt(total)}`;
    } else {
      $("#timeLabel").textContent = "AO VIVO";
    }
  });

  video.addEventListener("stalled", () => {
    if (state.selectedId && (video.currentSrc || video.src)) showPlayerState("loading");
  });

  mute.addEventListener("click", () => {
    video.muted = !video.muted;
    mute.style.opacity = video.muted ? "0.5" : "1";
  });

  volume.addEventListener("input", () => {
    video.volume = volume.value / 100;
    video.muted = volume.value === "0";
  });

  fullscreen.addEventListener("click", () => {
    const shell = $("#playerShell");
    if (document.fullscreenElement) document.exitFullscreen();
    else shell.requestFullscreen?.();
  });

  speed.addEventListener("change", () => {
    video.playbackRate = Number(speed.value) || 1;
  });

  const retry = () => {
    if (state.selectedId) selectChannel(state.selectedId);
  };
  $("#retryBtn").addEventListener("click", retry);
  $("#errorRetryBtn").addEventListener("click", retry);

  updatePlayPauseIcon();
}

/* ------------------------------------------------------------
   9. FAVORITOS
   ------------------------------------------------------------ */
function updateFavButton(channel) {
  const isFav = state.favorites.has(channel.id);
  $("#heroFavBtn").setAttribute("aria-pressed", String(isFav));
  $("#heroFavLabel").textContent = isFav ? "Nos favoritos" : "Favoritar";
}

function setupFavorites() {
  $("#heroFavBtn").addEventListener("click", () => {
    if (!state.selectedId) return;
    const id = state.selectedId;
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    saveFavorites();

    const channel = getChannel(id);
    if (channel) updateFavButton(channel);
    renderGrid();
    renderShelves();
  });
}

/* ------------------------------------------------------------
   10. NAVEGAÇÃO (categorias, busca, teclado / controle remoto)
   ------------------------------------------------------------ */
function setupNav() {
  $("#mainNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".topnav__item");
    if (!btn) return;
    state.category = btn.dataset.category;
    document.querySelectorAll(".topnav__item").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    renderGrid();
  });

  $("#searchInput").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderGrid();
  });

  $("#profileBtn").addEventListener("click", () => {
    const profile = state.favorites.size;
    alert(`Perfil "N" — ${profile} canal(is) favorito(s).`); // placeholder simples
  });
}

function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);

    // Espaço / Enter fora de inputs: play-pause global
    if (!typing && (e.key === " " || e.key === "Enter") && document.activeElement?.id !== "searchInput") {
      if (document.activeElement?.classList.contains("card")) {
        return; // deixa o Enter clicar o card focado
      }
      if (e.key === " ") {
        e.preventDefault();
        $("#playPauseBtn").click();
        return;
      }
    }

    if (typing) return;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowLeft":
      case "ArrowUp":
      case "ArrowDown": {
        // Navegação espacial pelos cards da grade
        const cards = [...document.querySelectorAll("#channelGrid .card")];
        if (cards.length === 0) return;
        e.preventDefault();
        const idx = cards.indexOf(document.activeElement);
        const cols = Math.max(1, Math.round(gridColumns()));
        let next = idx;
        if (idx === -1) next = 0;
        else if (e.key === "ArrowRight") next = Math.min(idx + 1, cards.length - 1);
        else if (e.key === "ArrowLeft") next = Math.max(idx - 1, 0);
        else if (e.key === "ArrowDown") next = Math.min(idx + cols, cards.length - 1);
        else if (e.key === "ArrowUp") next = Math.max(idx - cols, 0);
        cards[next].focus();
        cards[next].scrollIntoView({ block: "nearest", behavior: "smooth" });
        break;
      }
      case "Escape":
        if (document.fullscreenElement) document.exitFullscreen();
        $("#searchInput").blur();
        break;
      case "f":
      case "F":
        $("#fullscreenBtn").click();
        break;
      case "m":
      case "M":
        $("#muteBtn").click();
        break;
    }
  });
}

function gridColumns() {
  const grid = $("#channelGrid");
  if (!grid.children.length) return 4;
  const first = grid.children[0].getBoundingClientRect();
  const second = grid.children[1]?.getBoundingClientRect();
  if (!second) return 1;
  return first.width > 0 ? Math.max(1, Math.round(second.left - first.left) / first.width) || 1 : 1;
}

/* ------------------------------------------------------------
   11. INICIALIZAÇÃO
   ------------------------------------------------------------ */
function init() {
  startClock();
  setupPlayerControls();
  setupFavorites();
  setupNav();
  setupKeyboard();
  renderGrid();
  renderShelves();

  // Canal inicial: primeiro ao vivo, sem iniciar a transmissão
  const first = CHANNELS.find((c) => c.isLive) || CHANNELS[0];
  if (first) {
    $("#heroTitle").textContent = first.name;
    $("#heroDesc").textContent = first.desc;
    $("#heroLiveTag").hidden = !first.isLive;
    updateFavButton(first);
    renderEpg(first);
    state.selectedId = first.id;
    renderGrid();
    renderShelves();
    showPlayerState("noUrl");
  }
}

document.addEventListener("DOMContentLoaded", init);
