/* ============================================================
   TV Rabisco — lógica principal
   Player HLS (hls.js) + MP4 nativo, navegação por teclado/
   controle remoto, favoritos, EPG simples e busca.

   CANAIS DE DEMONSTRAÇÃO: todos os canais abaixo são EXEMPLOS.
   Substitua o campo `url` pela URL do SEU stream autorizado
   (.m3u8 ou .mp4) — veja o README.
   ============================================================ */


/* ============================================================
   NovaTV — aplicação principal
   Backend Node.js + channels.json
   Player HLS (hls.js) + MP4 nativo
   Categorias, favoritos, EPG e navegação por teclado.

   A busca de canais foi removida.
   Os canais são carregados de /api/canais.
============================================================ */

"use strict";

/* ============================================================
   1. CONFIGURAÇÃO E FONTE DE DADOS
============================================================ */

let CHANNELS = [];

const BACKEND_URL =
    "https://nose-highways-agency-butler.trycloudflare.com";

/* ============================================================
   2. CARREGAR CANAIS DO BACKEND
============================================================ */

async function loadChannels() {

    const empty = $("#gridEmpty");

    try {

        if (empty) {
            empty.hidden = false;
            empty.textContent = "Carregando canais...";
        }

        const response = await fetch(
            `${BACKEND_URL}/api/canais`,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error(
                "A API não retornou uma lista válida de canais."
            );
        }

        // Normaliza os dados recebidos do channels.json
        CHANNELS = data.map((channel, index) => ({

            id: String(channel.id || `canal-${index + 1}`),

            name: String(
                channel.name ||
                channel.nome ||
                "Canal sem nome"
            ),

            category: String(
                channel.category ||
                channel.categoria ||
                "aovivo"
            ).toLowerCase(),

            isLive: Boolean(
                channel.isLive ??
                channel.aoVivo ??
                false
            ),

            url: String(channel.url || "").trim(),

            desc: String(
                channel.desc ||
                channel.descricao ||
                ""
            ),

            poster: String(channel.poster || "").trim(),

            epg: Array.isArray(channel.epg)
                ? channel.epg
                : []

        }));

        console.info(
            `NovaTV: ${CHANNELS.length} canal(is) carregado(s).`
        );

        return true;

    } catch (error) {

        console.error(
            "Falha ao carregar channels.json:",
            error
        );

        CHANNELS = [];

        if (empty) {
            empty.hidden = false;
            empty.textContent =
                "Não foi possível carregar os canais. Verifique o backend.";
        }

        return false;
    }
}

/* ============================================================
   3. ESTADO DA APLICAÇÃO
============================================================ */

const state = {

    category: "inicio",

    selectedId: null,

    hls: null,

    favorites: new Set(loadFavorites()),

    watching: []

};

const CATEGORY_LABELS = {

    inicio: "Canais ao vivo",

    aovivo: "Canais ao vivo",

    filmes: "Canais de filmes",

    series: "Canais de séries",

    favoritos: "Seus favoritos"

};

/* ============================================================
   4. UTILITÁRIOS
============================================================ */

const $ = (selector) =>
    document.querySelector(selector);


function el(tag, className, text) {

    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    if (text != null) {
        node.textContent = text;
    }

    return node;
}


/* ============================================================
   5. FAVORITOS — ARMAZENAMENTO
============================================================ */

function loadFavorites() {

    try {

        return JSON.parse(
            localStorage.getItem("novatv.favorites") || "[]"
        );

    } catch {

        return [];

    }
}


function saveFavorites() {

    try {

        localStorage.setItem(
            "novatv.favorites",
            JSON.stringify([...state.favorites])
        );

    } catch {

        // Continua funcionando sem armazenamento local.

    }

}


function getChannel(id) {

    return CHANNELS.find(
        channel => channel.id === id
    ) || null;

}


/* ============================================================
   6. RESOLVER URLS DE VÍDEOS E IMAGENS
============================================================ */

function resolveMediaUrl(path) {

    if (!path) return "";

    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    return `${BACKEND_URL}/${String(path).replace(/^\/+/, "")}`;

}


/* ============================================================
   7. RELÓGIO DO CABEÇALHO
============================================================ */

function startClock() {

    const time = $("#clockTime");

    const date = $("#clockDate");

    const fmtDate = new Intl.DateTimeFormat(
        "pt-BR",
        {
            weekday: "long",
            day: "numeric",
            month: "short"
        }
    );

    const tick = () => {

        const now = new Date();

        if (time) {
            time.textContent = now.toLocaleTimeString(
                "pt-BR",
                {
                    hour: "2-digit",
                    minute: "2-digit"
                }
            );
        }

        if (date) {
            date.textContent = fmtDate.format(now);
        }

    };

    tick();

    setInterval(tick, 30000);

}


/* ============================================================
   8. FILTRAGEM POR CATEGORIA
   Não possui busca de canais.
============================================================ */

function matchesFilters(channel) {

    const category = state.category;

    if (category === "inicio") {
        return true;
    }

    if (category === "favoritos") {
        return state.favorites.has(channel.id);
    }

    return channel.category === category;

}


/* ============================================================
   9. CRIAR CARD DO CANAL
============================================================ */

function channelCard(channel) {

    const card = el("button", "card");

    card.type = "button";

    card.dataset.id = channel.id;

    card.setAttribute("role", "listitem");

    card.setAttribute(
        "aria-label",
        `${channel.name} — ${channel.desc}`
    );

    if (state.selectedId === channel.id) {
        card.classList.add("is-selected");
    }

    // Miniatura
    const thumb = el("div", "card__thumb");

    if (channel.poster) {

        const image = el("img", "card__poster");

        image.src = resolveMediaUrl(channel.poster);

        image.alt = channel.name;

        image.loading = "lazy";

        image.onerror = () => {

            image.remove();

            thumb.prepend(
                el(
                    "span",
                    "card__initial",
                    channel.name.charAt(0).toUpperCase()
                )
            );

        };

        thumb.appendChild(image);

    } else {

        thumb.appendChild(
            el(
                "span",
                "card__initial",
                channel.name.charAt(0).toUpperCase()
            )
        );

    }

    // Indicador ao vivo
    if (channel.isLive) {

        thumb.appendChild(
            el("span", "card__live", "AO VIVO")
        );

    }

    // Favorito
    if (state.favorites.has(channel.id)) {

        thumb.appendChild(
            el("span", "card__fav", "♥")
        );

    }

    // Canal selecionado
    if (state.selectedId === channel.id) {

        thumb.appendChild(
            el("span", "card__playing", "▶")
        );

    }

    card.appendChild(thumb);

    // Corpo do card
    const body = el("div", "card__body");

    body.appendChild(
        el("h3", "card__name", channel.name)
    );

    const categoryLabels = {

        aovivo: "Ao vivo",

        filmes: "Filmes",

        series: "Séries"

    };

    const categoryLabel =
        categoryLabels[channel.category] || "Canal";

    const meta = el("p", "card__meta");

    meta.appendChild(
        el("span", null, categoryLabel)
    );

    meta.appendChild(
        el("span", "dot")
    );

    meta.appendChild(
        el(
            "span",
            null,
            channel.isLive
                ? "Em transmissão"
                : "Programado"
        )
    );

    body.appendChild(meta);

    // Programa atual
    const current = currentProgram(channel);

    if (current) {

        body.appendChild(
            el("p", "card__now", `Agora: ${current}`)
        );

    }

    card.appendChild(body);

    // Evento de clique
    card.addEventListener("click", () => {

        selectChannel(channel.id);

    });

    return card;

}


/* ============================================================
   10. RENDERIZAR GRADE PRINCIPAL
============================================================ */

function renderGrid() {

    const grid = $("#channelGrid");

    const empty = $("#gridEmpty");

    if (!grid || !empty) return;

    grid.replaceChildren();

    const list = CHANNELS.filter(matchesFilters);

    for (const channel of list) {

        grid.appendChild(
            channelCard(channel)
        );

    }

    empty.hidden = list.length > 0;

    $("#gridTitle").textContent =
        CATEGORY_LABELS[state.category] || "Canais";

}


/* ============================================================
   11. CARROSSEIS
============================================================ */

function renderShelves() {

    // Assistindo agora
    const watching = $("#watchingSection");

    const watchingRow = $("#watchingRow");

    const watchList = state.watching
        .map(getChannel)
        .filter(Boolean);

    if (watching && watchingRow) {

        watching.hidden = watchList.length === 0;

        watchingRow.replaceChildren(
            ...watchList.map(channelCard)
        );

    }

    // Recomendados
    const recommendedRow = $("#recommendedRow");

    if (recommendedRow) {

        const recommendations = CHANNELS
            .filter(channel =>
                channel.isLive &&
                channel.id !== state.selectedId
            )
            .slice(0, 6);

        recommendedRow.replaceChildren(
            ...recommendations.map(channelCard)
        );

    }

}


/* ============================================================
   12. EPG — PROGRAMA ATUAL
============================================================ */

function currentProgram(channel) {

    if (!Array.isArray(channel.epg) || channel.epg.length === 0) {
        return null;
    }

    const now = new Date();

    const minutesNow =
        now.getHours() * 60 + now.getMinutes();

    const schedule = channel.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            /^\d{2}:\d{2}$/.test(item[0])
        )
        .sort((a, b) =>
            parseStart(a[0]) - parseStart(b[0])
        );

    if (schedule.length === 0) {
        return null;
    }

    for (let i = 0; i < schedule.length; i++) {

        const start = parseStart(schedule[i][0]);

        const end = i + 1 < schedule.length
            ? parseStart(schedule[i + 1][0])
            : 24 * 60;

        if (minutesNow >= start && minutesNow < end) {

            return schedule[i][1];

        }

    }

    // Antes do primeiro programa
    return schedule[0][1];

}


function parseStart(str) {

    const [hour, minute] = str.split(":").map(Number);

    return hour * 60 + minute;

}


/* ============================================================
   13. RENDERIZAR GUIA DE PROGRAMAÇÃO
============================================================ */

function renderEpg(channel) {

    const section = $("#epgSection");

    const timeline = $("#epgTimeline");

    if (!section || !timeline) return;

    if (!Array.isArray(channel.epg) || channel.epg.length === 0) {

        section.hidden = true;

        return;

    }

    const schedule = channel.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            /^\d{2}:\d{2}$/.test(item[0])
        )
        .sort((a, b) =>
            parseStart(a[0]) - parseStart(b[0])
        );

    if (schedule.length === 0) {

        section.hidden = true;

        return;

    }

    $("#epgChannelName").textContent = channel.name;

    timeline.replaceChildren();

    const now = new Date();

    const minutesNow =
        now.getHours() * 60 + now.getMinutes();

    const currentName = currentProgram(channel);

    const currentIndex = schedule.findIndex(
        ([, name]) => name === currentName
    );

    schedule.forEach(([time, name], i) => {

        const item = el("div", "epg__item");

        const start = parseStart(time);

        if (i === currentIndex && minutesNow >= start) {

            item.classList.add("epg__item--current");

        } else if (i === currentIndex + 1) {

            item.classList.add("epg__item--next");

        }

        item.appendChild(
            el("span", "epg__time", time)
        );

        item.appendChild(
            el("p", "epg__name", name)
        );

        if (i === currentIndex && minutesNow >= start) {

            item.appendChild(
                el("span", "epg__badge", "NO AR AGORA")
            );

        }

        timeline.appendChild(item);

    });

    section.hidden = false;

}


/* ============================================================
   14. PLAYER HLS / MP4
============================================================ */

const video = $("#video");


function showPlayerState(which) {

    const states = {

        none: null,

        noUrl: $("#stateNoUrl"),

        loading: $("#stateLoading"),

        noSignal: $("#stateNoSignal"),

        error: $("#stateError")

    };

    for (const [key, node] of Object.entries(states)) {

        if (node) {
            node.hidden = key !== which;
        }

    }

}


function destroyHls() {

    if (state.hls) {

        state.hls.destroy();

        state.hls = null;

    }

}


function updatePlayPauseIcon() {

    if (!video) return;

    const playing = video.paused;

    const playIcon = $(".pbtn__icon--play");

    const pauseIcon = $(".pbtn__icon--pause");

    if (playIcon) {
        playIcon.style.display = playing ? "" : "none";
    }

    if (pauseIcon) {
        pauseIcon.style.display = playing ? "none" : "";
    }

}


function isHlsSource(url) {

    return url.toLowerCase().includes(".m3u8");

}


/* ============================================================
   15. CONECTAR FONTE AO PLAYER
============================================================ */

function attachSource(channel) {

    destroyHls();

    const url = resolveMediaUrl(channel.url);

    if (
        !url ||
        url.includes("COLE_A_URL_DO_SEU_STREAM_AQUI")
    ) {

        showPlayerState("noUrl");

        return false;

    }

    showPlayerState("loading");

    if (isHlsSource(url)) {

        // HLS nativo
        if (
            video.canPlayType(
                "application/vnd.apple.mpegurl"
            )
        ) {

            video.src = url;

            return true;

        }

        // HLS usando hls.js
        if (
            window.Hls &&
            window.Hls.isSupported()
        ) {

            const hls = new window.Hls({
                autoStartLoad: true
            });

            state.hls = hls;

            hls.loadSource(url);

            hls.attachMedia(video);

            hls.on(
                window.Hls.Events.ERROR,
                (_event, data) => {

                    if (!data.fatal) return;

                    if (
                        data.type ===
                        window.Hls.ErrorTypes.NETWORK_ERROR
                    ) {

                        showError(
                            "Falha de rede ao acessar a transmissão. Verifique a URL e o CORS."
                        );

                    } else if (
                        data.type ===
                        window.Hls.ErrorTypes.MEDIA_ERROR
                    ) {

                        showError(
                            "Erro de mídia no stream. Verifique o servidor e o formato."
                        );

                    } else {

                        showError(
                            "Não foi possível iniciar a transmissão HLS."
                        );

                    }

                }
            );

            return true;

        }

        showError(
            "Este navegador não suporta reprodução HLS."
        );

        return false;

    }

    // MP4 e outros formatos nativos
    video.src = url;

    return true;

}


/* ============================================================
   16. ERROS DO PLAYER
============================================================ */

function showError(message) {

    destroyHls();

    const errorMessage = $("#errorMessage");

    if (errorMessage) {
        errorMessage.textContent = message;
    }

    showPlayerState("error");

}


/* ============================================================
   17. SELECIONAR E REPRODUZIR CANAL
============================================================ */

function selectChannel(id) {

    const channel = getChannel(id);

    if (!channel) return;

    state.selectedId = id;

    if (!state.watching.includes(id)) {

        state.watching.unshift(id);

    }

    state.watching = state.watching.slice(0, 6);

    // Informações principais
    $("#heroTitle").textContent =
        channel.name || "NovaTV";

    $("#heroDesc").textContent =
        channel.desc || "";

    // Poster do player
    if (channel.poster) {

        video.poster = resolveMediaUrl(channel.poster);

    } else {

        video.removeAttribute("poster");

    }

    $("#heroLiveTag").hidden = !channel.isLive;

    updateFavButton(channel);

    // Programação
    renderEpg(channel);

    // Atualiza interface
    renderGrid();

    renderShelves();

    // Carrega transmissão
    const ok = attachSource(channel);

    if (ok) {

        video.muted = true;

        const promise = video.play();

        if (
            promise &&
            typeof promise.catch === "function"
        ) {

            promise.then(() => {

                video.muted = false;

            }).catch(() => {

                video.muted = false;

                video.pause();

                updatePlayPauseIcon();

            });

        }

        $("#liveBadge").hidden = !channel.isLive;

    } else {

        video.removeAttribute("src");

        video.load();

        $("#liveBadge").hidden = true;

    }

}


/* ============================================================
   18. CONTROLES DO PLAYER
============================================================ */

function setupPlayerControls() {

    const playPause = $("#playPauseBtn");

    const mute = $("#muteBtn");

    const volume = $("#volumeSlider");

    const fullscreen = $("#fullscreenBtn");

    const speed = $("#speedSelect");

    const togglePlay = () => {

        if (!video.currentSrc && !video.src) return;

        if (video.paused) {

            video.play().catch(() => {});

        } else {

            video.pause();

        }

    };

    playPause.addEventListener("click", togglePlay);

    video.addEventListener("click", togglePlay);

    video.addEventListener("play", updatePlayPauseIcon);

    video.addEventListener("pause", updatePlayPauseIcon);

    video.addEventListener("playing", () => {

        showPlayerState("none");

    });

    video.addEventListener("waiting", () => {

        if (video.currentSrc || video.src) {

            showPlayerState("loading");

        }

    });

    video.addEventListener("error", () => {

        if (!video.currentSrc && !video.src) return;

        showError(
            "O stream não pôde ser carregado. Verifique a URL, o servidor e o CORS."
        );

    });

    video.addEventListener("timeupdate", () => {

        const timeLabel = $("#timeLabel");

        if (!timeLabel) return;

        if (
            video.duration &&
            Number.isFinite(video.duration)
        ) {

            const total = video.duration;

            const current = video.currentTime;

            const format = (seconds) => {

                const minutes = Math.floor(seconds / 60);

                const sec = Math.floor(seconds % 60);

                return (
                    `${String(minutes).padStart(2, "0")}:` +
                    `${String(sec).padStart(2, "0")}`
                );

            };

            timeLabel.textContent =
                `${format(current)} / ${format(total)}`;

        } else {

            timeLabel.textContent = "AO VIVO";

        }

    });

    video.addEventListener("stalled", () => {

        if (
            state.selectedId &&
            (video.currentSrc || video.src)
        ) {

            showPlayerState("loading");

        }

    });

    mute.addEventListener("click", () => {

        video.muted = !video.muted;

        mute.style.opacity =
            video.muted ? "0.5" : "1";

    });

    volume.addEventListener("input", () => {

        video.volume = volume.value / 100;

        video.muted = volume.value === "0";

    });

    fullscreen.addEventListener("click", () => {

        const shell = $("#playerShell");

        if (document.fullscreenElement) {

            document.exitFullscreen();

        } else {

            shell.requestFullscreen?.();

        }

    });

    speed.addEventListener("change", () => {

        video.playbackRate =
            Number(speed.value) || 1;

    });

    const retry = () => {

        if (state.selectedId) {

            selectChannel(state.selectedId);

        }

    };

    $("#retryBtn").addEventListener("click", retry);

    $("#errorRetryBtn").addEventListener("click", retry);

    updatePlayPauseIcon();

}


/* ============================================================
   19. FAVORITOS
============================================================ */

function updateFavButton(channel) {

    const isFavorite =
        state.favorites.has(channel.id);

    $("#heroFavBtn").setAttribute(
        "aria-pressed",
        String(isFavorite)
    );

    $("#heroFavLabel").textContent =
        isFavorite ? "Nos favoritos" : "Favoritar";

}


function setupFavorites() {

    $("#heroFavBtn").addEventListener("click", () => {

        if (!state.selectedId) return;

        const id = state.selectedId;

        if (state.favorites.has(id)) {

            state.favorites.delete(id);

        } else {

            state.favorites.add(id);

        }

        saveFavorites();

        const channel = getChannel(id);

        if (channel) {

            updateFavButton(channel);

        }

        renderGrid();

        renderShelves();

    });

}


/* ============================================================
   20. NAVEGAÇÃO POR CATEGORIAS
   Busca de canais removida.
============================================================ */

function setupNav() {

    $("#mainNav").addEventListener("click", (event) => {

        const button = event.target.closest(".topnav__item");

        if (!button) return;

        state.category = button.dataset.category;

        document.querySelectorAll(".topnav__item").forEach(btn => {

            const active = btn === button;

            btn.classList.toggle("is-active", active);

            if (active) {

                btn.setAttribute("aria-current", "page");

            } else {

                btn.removeAttribute("aria-current");

            }

        });

        renderGrid();

    });

    $("#profileBtn").addEventListener("click", () => {

        const totalFavorites = state.favorites.size;

        alert(
            `Perfil "N" — ${totalFavorites} canal(is) favorito(s).`
        );

    });

}


/* ============================================================
   21. NAVEGAÇÃO POR TECLADO / CONTROLE REMOTO
============================================================ */

function setupKeyboard() {

    document.addEventListener("keydown", (event) => {

        const typing = [
            "INPUT",
            "SELECT",
            "TEXTAREA"
        ].includes(document.activeElement?.tagName);

        // Espaço: reproduzir ou pausar
        if (
            !typing &&
            (event.key === " " || event.key === "Enter")
        ) {

            if (
                document.activeElement?.classList.contains("card")
            ) {

                return;

            }

            if (event.key === " ") {

                event.preventDefault();

                $("#playPauseBtn").click();

                return;

            }

        }

        if (typing) return;

        switch (event.key) {

            case "ArrowRight":

            case "ArrowLeft":

            case "ArrowUp":

            case "ArrowDown": {

                const cards = [
                    ...document.querySelectorAll(
                        "#channelGrid .card"
                    )
                ];

                if (cards.length === 0) return;

                event.preventDefault();

                const index = cards.indexOf(
                    document.activeElement
                );

                const columns = Math.max(
                    1,
                    Math.round(gridColumns())
                );

                let next = index;

                if (index === -1) {

                    next = 0;

                } else if (event.key === "ArrowRight") {

                    next = Math.min(
                        index + 1,
                        cards.length - 1
                    );

                } else if (event.key === "ArrowLeft") {

                    next = Math.max(index - 1, 0);

                } else if (event.key === "ArrowDown") {

                    next = Math.min(
                        index + columns,
                        cards.length - 1
                    );

                } else if (event.key === "ArrowUp") {

                    next = Math.max(
                        index - columns,
                        0
                    );

                }

                cards[next].focus();

                cards[next].scrollIntoView({
                    block: "nearest",
                    behavior: "smooth"
                });

                break;

            }

            case "Escape":

                if (document.fullscreenElement) {

                    document.exitFullscreen();

                }

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


/* ============================================================
   22. CALCULAR COLUNAS DA GRADE
============================================================ */

function gridColumns() {

    const grid = $("#channelGrid");

    if (!grid.children.length) return 4;

    const first = grid.children[0].getBoundingClientRect();

    const second =
        grid.children[1]?.getBoundingClientRect();

    if (!second) return 1;

    return first.width > 0
        ? Math.max(
            1,
            Math.round(second.left - first.left) / first.width
        ) || 1
        : 1;

}


/* ============================================================
   23. INICIALIZAÇÃO DA NOVATV
============================================================ */

async function init() {

    // Inicializa relógio
    startClock();

    // Inicializa controles
    setupPlayerControls();

    // Inicializa favoritos
    setupFavorites();

    // Inicializa navegação
    setupNav();

    // Inicializa teclado
    setupKeyboard();

    // Carrega canais do backend
    const loaded = await loadChannels();

    // Renderiza interface
    renderGrid();

    renderShelves();

    // Verifica conexão
    if (!loaded || CHANNELS.length === 0) {

        showPlayerState("noUrl");

        return;

    }

    // Seleciona primeiro canal ao vivo
    const first =
        CHANNELS.find(channel => channel.isLive) ||
        CHANNELS[0];

    if (first) {

        $("#heroTitle").textContent =
            first.name || "NovaTV";

        $("#heroDesc").textContent =
            first.desc || "";

        $("#heroLiveTag").hidden =
            !first.isLive;

        // Poster inicial
        if (first.poster) {

            video.poster = resolveMediaUrl(first.poster);

        } else {

            video.removeAttribute("poster");

        }

        updateFavButton(first);

        renderEpg(first);

        state.selectedId = first.id;

        renderGrid();

        renderShelves();

        // Não inicia transmissão automaticamente
        showPlayerState("noUrl");

    }

}


/* ============================================================
   24. INICIAR APLICAÇÃO
============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    init
);
