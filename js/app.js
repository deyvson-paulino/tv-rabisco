/* ============================================================
   TV Rabisco — lógica principal
   Player HLS (hls.js) + MP4 nativo, navegação por teclado/
   controle remoto, favoritos, EPG simples e busca.

   CANAIS DE DEMONSTRAÇÃO: todos os canais abaixo são EXEMPLOS.
   Substitua o campo `url` pela URL do SEU stream autorizado
   (.m3u8 ou .mp4) — veja o README.
   ============================================================ */


"use strict";

/* ============================================================
   NOVATV — APLICAÇÃO PRINCIPAL
   Frontend: GitHub Pages
   Backend: Node.js + API REST
   Player: HLS.js + HTML5 Video

   Recursos:
   - Carregamento dos canais pela API
   - Reprodução HLS (.m3u8)
   - Reprodução MP4
   - Busca e categorias
   - Favoritos
   - Histórico da sessão
   - EPG
   - Navegação por teclado
   - Reconexão automática
   - Timeout de carregamento
   - Diagnóstico de erros no Console
   ============================================================ */


/* ============================================================
   1. CONFIGURAÇÃO
   ============================================================ */

const API_BASE_URL =
    "https://nose-highways-agency-butler.trycloudflare.com";

const API_CHANNELS =
    `${API_BASE_URL.replace(/\/+$/, "")}/api/channels`;

const CONFIG = {
    apiTimeout: 15000,
    manifestTimeout: 25000,
    playbackTimeout: 30000,
    retryDelay: 4000,
    maxRetries: 3
};


/* ============================================================
   2. ESTADO
   ============================================================ */

let CHANNELS = [];

const state = {
    category: "inicio",
    search: "",
    selectedId: null,

    hls: null,

    favorites: new Set(loadFavorites()),
    watching: [],

    requestId: 0,

    retryCount: 0,
    retryTimer: null,
    startupTimer: null,

    mediaRecoveryAttempted: false,
    destroyed: false
};

const CATEGORY_LABELS = {
    inicio: "Canais disponíveis",
    aovivo: "Canais ao vivo",
    filmes: "Canais de filmes",
    series: "Canais de séries",
    favoritos: "Seus favoritos"
};


/* ============================================================
   3. UTILITÁRIOS
   ============================================================ */

const $ = selector =>
    document.querySelector(selector);

const $$ = selector =>
    [...document.querySelectorAll(selector)];


function log(...args) {
    console.log("[NOVATV]", ...args);
}


function warn(...args) {
    console.warn("[NOVATV]", ...args);
}


function errorLog(...args) {
    console.error("[NOVATV]", ...args);
}


function el(tag, className = "", text = null) {

    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    if (text !== null) {
        node.textContent = text;
    }

    return node;
}


function loadFavorites() {

    try {

        const data = JSON.parse(
            localStorage.getItem("novatv.favorites") || "[]"
        );

        return Array.isArray(data)
            ? data.map(String)
            : [];

    } catch (err) {

        warn("Não foi possível carregar favoritos:", err);

        return [];

    }

}


function saveFavorites() {

    try {

        localStorage.setItem(
            "novatv.favorites",
            JSON.stringify([...state.favorites])
        );

    } catch (err) {

        warn("Não foi possível salvar favoritos:", err);

    }

}


function getChannel(id) {

    return CHANNELS.find(
        channel => channel.id === String(id)
    ) || null;

}


function validarURL(value) {

    if (typeof value !== "string" || !value.trim()) {
        return "";
    }

    try {

        const url = new URL(value.trim());

        if (!["http:", "https:"].includes(url.protocol)) {
            return "";
        }

        return url.href;

    } catch {

        return "";

    }

}


function normalizarTexto(value) {

    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

}


function obterCampo(obj, campos) {

    for (const campo of campos) {

        const valor = obj?.[campo];

        if (
            valor !== undefined &&
            valor !== null &&
            String(valor).trim() !== ""
        ) {
            return valor;
        }

    }

    return "";

}


function limparTimers() {

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }

    if (state.startupTimer) {
        clearTimeout(state.startupTimer);
        state.startupTimer = null;
    }

}


function limitarTexto(value, max = 500) {

    return String(value || "").slice(0, max);

}


/* ============================================================
   4. PREPARAÇÃO DOS CANAIS
   ============================================================ */

function prepararCanais(canais) {

    if (!Array.isArray(canais)) {
        return [];
    }

    const ids = new Set();

    return canais.map((canal, index) => {

        if (!canal || typeof canal !== "object") {
            return null;
        }

        const grupo = normalizarTexto(
            obterCampo(canal, [
                "group",
                "groupTitle",
                "group-title",
                "category"
            ])
        );

        let categoria = "aovivo";

        if (
            grupo.includes("filme") ||
            grupo.includes("cinema")
        ) {

            categoria = "filmes";

        } else if (
            grupo.includes("serie") ||
            grupo.includes("seriado")
        ) {

            categoria = "series";

        }

        let id = String(
            obterCampo(canal, [
                "id",
                "tvg-id"
            ]) || `canal-${index + 1}`
        );

        if (ids.has(id)) {
            id = `${id}-${index + 1}`;
        }

        ids.add(id);

        const nome = String(
            obterCampo(canal, [
                "name",
                "title",
                "tvg-name"
            ]) || `Canal ${index + 1}`
        );

        const url = validarURL(
            obterCampo(canal, [
                "url",
                "src",
                "stream",
                "file"
            ])
        );

        const logo = validarURL(
            obterCampo(canal, [
                "logo",
                "image",
                "tvg-logo"
            ])
        );

        return {
            id,
            name: limitarTexto(nome, 150),
            category: categoria,
            isLive: categoria === "aovivo",
            url,
            logo,
            desc: limitarTexto(
                obterCampo(canal, [
                    "desc",
                    "description"
                ]) || `Transmissão do canal ${nome}.`,
                500
            ),
            epg: Array.isArray(canal.epg)
                ? canal.epg
                : []
        };

    }).filter(Boolean);

}


/* ============================================================
   5. BACKEND — CARREGAMENTO DA API
   ============================================================ */

async function carregarCanaisAPI() {

    log("Conectando ao backend:", API_BASE_URL);

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.apiTimeout
    );

    try {

        const resposta = await fetch(API_CHANNELS, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store",
            signal: controller.signal
        });

        log("Resposta da API:", resposta.status);

        if (!resposta.ok) {
            throw new Error(`HTTP ${resposta.status}`);
        }

        const dados = await resposta.json();

        let lista = [];

        if (Array.isArray(dados)) {

            lista = dados;

        } else if (Array.isArray(dados?.channels)) {

            lista = dados.channels;

        } else if (Array.isArray(dados?.data)) {

            lista = dados.data;

        } else if (Array.isArray(dados?.items)) {

            lista = dados.items;

        } else {

            throw new Error(
                "Formato da API não reconhecido. Esperado um array de canais."
            );

        }

        CHANNELS = prepararCanais(lista);

        log("Canais recebidos:", lista.length);
        log("Canais válidos:", CHANNELS.length);

        if (CHANNELS.length !== lista.length) {
            warn("Alguns registros foram ignorados durante a preparação.");
        }

        atualizarHeroStatus(
            "NovaTV",
            `${CHANNELS.length} canais disponíveis.`
        );

        return CHANNELS.length > 0;

    } catch (err) {

        if (err.name === "AbortError") {

            errorLog(
                "Tempo limite ao conectar com a API."
            );

        } else {

            errorLog(
                "Falha ao carregar a API:",
                err
            );

        }

        CHANNELS = [];

        atualizarHeroStatus(
            "Backend indisponível",
            "Não foi possível carregar os canais. Verifique o Node.js, o endereço do Tunnel e a API."
        );

        return false;

    } finally {

        clearTimeout(timeout);

    }

}


function atualizarHeroStatus(titulo, descricao) {

    const title = $("#heroTitle");
    const desc = $("#heroDesc");

    if (title) title.textContent = titulo;
    if (desc) desc.textContent = descricao;

}


/* ============================================================
   6. RELÓGIO
   ============================================================ */

function startClock() {

    const time = $("#clockTime");
    const date = $("#clockDate");

    if (!time || !date) return;

    const formatDate = new Intl.DateTimeFormat(
        "pt-BR",
        {
            weekday: "long",
            day: "numeric",
            month: "short"
        }
    );

    function tick() {

        const now = new Date();

        time.textContent = now.toLocaleTimeString(
            "pt-BR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

        date.textContent = formatDate.format(now);

    }

    tick();

    setInterval(tick, 30000);

}


/* ============================================================
   7. FILTROS
   ============================================================ */

function matchesFilters(channel) {

    let categoryOK = true;

    if (state.category === "favoritos") {

        categoryOK = state.favorites.has(channel.id);

    } else if (state.category !== "inicio") {

        categoryOK =
            channel.category === state.category;

    }

    const query = normalizarTexto(state.search);

    const searchOK =
        !query ||
        normalizarTexto(channel.name).includes(query) ||
        normalizarTexto(channel.desc).includes(query) ||
        normalizarTexto(channel.category).includes(query);

    return categoryOK && searchOK;

}


/* ============================================================
   8. CARTÕES
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

    const thumb = el("div", "card__thumb");

    if (channel.logo) {

        const logo = el("img", "card__logo");

        logo.src = channel.logo;
        logo.alt = channel.name;
        logo.loading = "lazy";

        logo.onerror = () => logo.remove();

        thumb.appendChild(logo);

    } else {

        thumb.appendChild(
            el(
                "span",
                "card__initial",
                channel.name.charAt(0).toUpperCase()
            )
        );

    }

    if (channel.isLive) {
        thumb.appendChild(
            el("span", "card__live", "AO VIVO")
        );
    }

    if (state.favorites.has(channel.id)) {
        thumb.appendChild(
            el("span", "card__fav", "♥")
        );
    }

    if (state.selectedId === channel.id) {
        thumb.appendChild(
            el("span", "card__playing", "▶")
        );
    }

    card.appendChild(thumb);

    const body = el("div", "card__body");

    body.appendChild(
        el("h3", "card__name", channel.name)
    );

    const labels = {
        aovivo: "Ao vivo",
        filmes: "Filmes",
        series: "Séries"
    };

    const meta = el("p", "card__meta");

    meta.appendChild(
        el(
            "span",
            "",
            labels[channel.category] || "Canal"
        )
    );

    meta.appendChild(el("span", "dot"));

    meta.appendChild(
        el(
            "span",
            "",
            channel.isLive ? "Em transmissão" : "Programado"
        )
    );

    body.appendChild(meta);

    const current = currentProgram(channel);

    if (current) {
        body.appendChild(
            el("p", "card__now", `Agora: ${current}`)
        );
    }

    card.appendChild(body);

    card.addEventListener("click", () => {
        selectChannel(channel.id);
    });

    return card;

}


/* ============================================================
   9. RENDERIZAÇÃO
   ============================================================ */

function renderGrid() {

    const grid = $("#channelGrid");
    const empty = $("#gridEmpty");

    if (!grid || !empty) return;

    grid.replaceChildren();

    const list = CHANNELS.filter(matchesFilters);

    list.forEach(channel => {
        grid.appendChild(channelCard(channel));
    });

    empty.hidden = list.length > 0;

    const title = $("#gridTitle");

    if (title) {
        title.textContent =
            CATEGORY_LABELS[state.category] || "Canais";
    }

}


function renderShelves() {

    const watching = $("#watchingSection");
    const watchingRow = $("#watchingRow");
    const recommendedRow = $("#recommendedRow");

    if (watching && watchingRow) {

        const list = state.watching
            .map(getChannel)
            .filter(Boolean);

        watching.hidden = list.length === 0;

        watchingRow.replaceChildren(
            ...list.map(channelCard)
        );

    }

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
   10. EPG
   ============================================================ */

function parseStart(time) {

    if (typeof time !== "string") return null;

    const match = time.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    return hours * 60 + minutes;

}


function currentProgram(channel) {

    if (!Array.isArray(channel.epg)) return null;

    const programs = channel.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            parseStart(item[0]) !== null
        )
        .sort((a, b) =>
            parseStart(a[0]) - parseStart(b[0])
        );

    if (!programs.length) return null;

    const now = new Date();

    const currentMinutes =
        now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < programs.length; i++) {

        const start = parseStart(programs[i][0]);

        const end = i + 1 < programs.length
            ? parseStart(programs[i + 1][0])
            : 1440;

        if (
            currentMinutes >= start &&
            currentMinutes < end
        ) {
            return String(programs[i][1]);
        }

    }

    return null;

}


function renderEpg(channel) {

    const section = $("#epgSection");
    const timeline = $("#epgTimeline");
    const channelName = $("#epgChannelName");

    if (!section || !timeline) return;

    if (!channel.epg || !channel.epg.length) {
        section.hidden = true;
        return;
    }

    if (channelName) {
        channelName.textContent = channel.name;
    }

    timeline.replaceChildren();

    const now = new Date();

    const currentMinutes =
        now.getHours() * 60 + now.getMinutes();

    const programs = channel.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            parseStart(item[0]) !== null
        )
        .sort((a, b) =>
            parseStart(a[0]) - parseStart(b[0])
        );

    const currentIndex = programs.findIndex(
        (program, index) => {

            const start = parseStart(program[0]);

            const end = index + 1 < programs.length
                ? parseStart(programs[index + 1][0])
                : 1440;

            return (
                currentMinutes >= start &&
                currentMinutes < end
            );

        }
    );

    programs.forEach(([time, name], index) => {

        const item = el("div", "epg__item");

        if (index === currentIndex) {
            item.classList.add("epg__item--current");
        } else if (index === currentIndex + 1) {
            item.classList.add("epg__item--next");
        }

        item.appendChild(
            el("span", "epg__time", time)
        );

        item.appendChild(
            el("p", "epg__name", String(name))
        );

        if (index === currentIndex) {
            item.appendChild(
                el("span", "epg__badge", "NO AR AGORA")
            );
        }

        timeline.appendChild(item);

    });

    section.hidden = programs.length === 0;

}


/* ============================================================
   11. PLAYER — ESTADOS
   ============================================================ */

function getVideo() {
    return $("#video");
}


function showPlayerState(which) {

    const states = {
        noUrl: $("#stateNoUrl"),
        loading: $("#stateLoading"),
        noSignal: $("#stateNoSignal"),
        error: $("#stateError")
    };

    Object.entries(states).forEach(([key, node]) => {

        if (node) {
            node.hidden = key !== which;
        }

    });

}


function clearPlayerTimers() {

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }

    if (state.startupTimer) {
        clearTimeout(state.startupTimer);
        state.startupTimer = null;
    }

}


function destroyHls() {

    if (!state.hls) return;

    try {
        state.hls.destroy();
    } catch (err) {
        warn("Erro ao encerrar HLS:", err);
    }

    state.hls = null;

}


function stopCurrentPlayback() {

    clearPlayerTimers();

    destroyHls();

    const video = getVideo();

    if (video) {

        video.pause();

        video.removeAttribute("src");

        video.load();

    }

}


function isHlsSource(url) {

    try {

        const pathname = new URL(url).pathname.toLowerCase();

        return pathname.endsWith(".m3u8");

    } catch {

        return false;

    }

}


function showError(message) {

    clearPlayerTimers();

    destroyHls();

    errorLog(message);

    const errorMessage = $("#errorMessage");

    if (errorMessage) {
        errorMessage.textContent = message;
    }

    showPlayerState("error");

}


function updatePlayPauseIcon() {

    const video = getVideo();

    if (!video) return;

    const playIcon = $(".pbtn__icon--play");
    const pauseIcon = $(".pbtn__icon--pause");

    if (playIcon) {
        playIcon.style.display =
            video.paused ? "" : "none";
    }

    if (pauseIcon) {
        pauseIcon.style.display =
            video.paused ? "none" : "";
    }

}


/* ============================================================
   12. RECONEXÃO AUTOMÁTICA
   ============================================================ */

function recoverStream(message) {

    const video = getVideo();

    if (!video || !state.selectedId) return;

    if (state.retryTimer) return;

    if (state.retryCount >= CONFIG.maxRetries) {

        showError(
            message ||
            "Não foi possível recuperar a transmissão."
        );

        return;

    }

    state.retryCount++;

    warn(
        `Reconexão ${state.retryCount}/${CONFIG.maxRetries}:`,
        message
    );

    showPlayerState("loading");

    clearTimeout(state.startupTimer);
    state.startupTimer = null;

    state.retryTimer = setTimeout(() => {

        state.retryTimer = null;

        const channel = getChannel(state.selectedId);

        if (!channel) return;

        iniciarReproducao(channel, true);

    }, CONFIG.retryDelay);

}


/* ============================================================
   13. WATCHDOG DO PLAYER
   ============================================================ */

function startPlaybackWatchdog(requestId, channel) {

    clearTimeout(state.startupTimer);

    state.startupTimer = setTimeout(() => {

        if (requestId !== state.requestId) return;

        const video = getVideo();

        if (!video) return;

        if (
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            !video.paused
        ) {
            return;
        }

        warn(
            "Tempo limite de inicialização excedido:",
            channel.name
        );

        recoverStream(
            "A transmissão demorou muito para iniciar. Verifique o manifesto e os segmentos do vídeo."
        );

    }, CONFIG.playbackTimeout);

}


/* ============================================================
   14. REPRODUÇÃO
   ============================================================ */

function attachSource(channel) {

    const video = getVideo();

    if (!video) {
        errorLog("Elemento #video não encontrado no HTML.");
        return false;
    }

    stopCurrentPlayback();

    const requestId = ++state.requestId;

    state.mediaRecoveryAttempted = false;

    const url = validarURL(channel.url);

    if (!url) {

        showPlayerState("noUrl");

        errorLog(
            "Canal sem endereço válido:",
            channel.name
        );

        return false;

    }

    log("Carregando canal:", channel.name);
    log("Tipo de transmissão:", isHlsSource(url) ? "HLS" : "MP4 / nativo");

    showPlayerState("loading");

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    startPlaybackWatchdog(requestId, channel);


    function requestPlayback() {

        if (requestId !== state.requestId) return;

        video.play()
            .then(() => {

                if (requestId !== state.requestId) return;

                log("Solicitação de reprodução aceita:", channel.name);

            })
            .catch(err => {

                if (requestId !== state.requestId) return;

                warn("Falha ao iniciar reprodução:", err);

                if (err.name === "NotAllowedError") {

                    showPlayerState("none");

                    warn(
                        "Reprodução automática bloqueada. Pressione o botão Play."
                    );

                } else {

                    recoverStream(
                        "O navegador não conseguiu iniciar a reprodução."
                    );

                }

            });

    }


    function onReady() {

        if (requestId !== state.requestId) return;

        requestPlayback();

    }


    /* --------------------------------------------------------
       HLS
       -------------------------------------------------------- */

    if (isHlsSource(url)) {

        // Reprodução HLS nativa, quando disponível.
        const nativeHls = video.canPlayType(
            "application/vnd.apple.mpegurl"
        );

        if (nativeHls) {

            log("Utilizando suporte HLS nativo.");

            video.addEventListener(
                "loadedmetadata",
                onReady,
                { once: true }
            );

            video.addEventListener(
                "error",
                () => {

                    if (requestId !== state.requestId) return;

                    const code = video.error?.code;

                    errorLog(
                        "Erro HLS nativo:",
                        code,
                        video.error?.message
                    );

                    recoverStream(
                        "Falha ao carregar a transmissão HLS nativa."
                    );

                },
                { once: true }
            );

            video.src = url;
            video.load();

            return true;

        }


        // Reprodução usando HLS.js.
        if (
            window.Hls &&
            window.Hls.isSupported()
        ) {

            log("Utilizando HLS.js.");

            const hls = new window.Hls({

                enableWorker: true,

                lowLatencyMode: false,

                backBufferLength: 30,

                maxBufferLength: 30,

                maxBufferSize: 60 * 1000 * 1000,

                manifestLoadingTimeOut: 20000,

                manifestLoadingMaxRetry: 2,

                manifestLoadingRetryDelay: 1000,

                levelLoadingTimeOut: 20000,

                levelLoadingMaxRetry: 2,

                fragLoadingTimeOut: 20000,

                fragLoadingMaxRetry: 3,

                startFragPrefetch: true

            });

            state.hls = hls;


            hls.on(
                window.Hls.Events.ERROR,
                (_event, data) => {

                    if (requestId !== state.requestId) return;

                    errorLog("Erro HLS:", {
                        type: data.type,
                        details: data.details,
                        fatal: data.fatal,
                        url: data.url,
                        response: data.response
                    });

                    if (!data.fatal) return;


                    if (
                        data.type ===
                        window.Hls.ErrorTypes.NETWORK_ERROR
                    ) {

                        recoverStream(
                            `Falha de rede HLS: ${data.details}`
                        );

                        return;

                    }


                    if (
                        data.type ===
                        window.Hls.ErrorTypes.MEDIA_ERROR
                    ) {

                        if (!state.mediaRecoveryAttempted) {

                            state.mediaRecoveryAttempted = true;

                            warn("Tentando recuperar erro de mídia.");

                            try {

                                hls.recoverMediaError();

                            } catch (err) {

                                errorLog(
                                    "Falha ao recuperar mídia:",
                                    err
                                );

                                recoverStream(
                                    "Não foi possível recuperar a mídia."
                                );

                            }

                        } else {

                            recoverStream(
                                "O erro de mídia persistiu após a recuperação."
                            );

                        }

                        return;

                    }


                    showError(
                        `Erro fatal no HLS: ${data.details || data.type}`
                    );

                }
            );


            hls.on(
                window.Hls.Events.MEDIA_ATTACHED,
                () => {

                    if (requestId !== state.requestId) return;

                    log("Mídia conectada ao HLS.js.");

                    hls.loadSource(url);

                }
            );


            hls.on(
                window.Hls.Events.MANIFEST_LOADING,
                () => {

                    if (requestId !== state.requestId) return;

                    log("Carregando manifesto:", url);

                    showPlayerState("loading");

                }
            );


            hls.on(
                window.Hls.Events.MANIFEST_PARSED,
                (_event, data) => {

                    if (requestId !== state.requestId) return;

                    log(
                        "Manifesto carregado.",
                        "Qualidades:",
                        data.levels?.length || 0
                    );

                    requestPlayback();

                }
            );


            hls.on(
                window.Hls.Events.FRAG_LOADED,
                () => {

                    if (requestId !== state.requestId) return;

                    log("Segmento de vídeo recebido.");

                }
            );


            // Primeiro conecta o vídeo.
            hls.attachMedia(video);

            return true;

        }


        showError(
            "Este navegador não oferece suporte ao HLS.js e não possui reprodução HLS nativa."
        );

        return false;

    }


    /* --------------------------------------------------------
       MP4 E OUTROS FORMATOS NATIVOS
       -------------------------------------------------------- */

    log("Carregando mídia nativa.");

    video.addEventListener(
        "loadedmetadata",
        onReady,
        { once: true }
    );

    video.addEventListener(
        "error",
        () => {

            if (requestId !== state.requestId) return;

            const mediaError = video.error;

            errorLog(
                "Erro de mídia:",
                mediaError?.code,
                mediaError?.message
            );

            recoverStream(
                "O arquivo de vídeo não pôde ser carregado."
            );

        },
        { once: true }
    );

    video.src = url;
    video.load();

    return true;

}


function iniciarReproducao(channel, reconexao = false) {

    if (!channel) return;

    log(
        reconexao ? "Reconectando:" : "Iniciando:",
        channel.name
    );

    attachSource(channel);

}


/* ============================================================
   15. SELEÇÃO DE CANAIS
   ============================================================ */

function selectChannel(id) {

    const channel = getChannel(id);

    if (!channel) return;

    state.selectedId = id;

    state.retryCount = 0;

    clearPlayerTimers();

    if (!state.watching.includes(id)) {

        state.watching.unshift(id);

    } else {

        state.watching = state.watching.filter(
            item => item !== id
        );

        state.watching.unshift(id);

    }

    state.watching = state.watching.slice(0, 6);

    atualizarHeroStatus(
        channel.name,
        channel.desc
    );

    const heroLiveTag = $("#heroLiveTag");
    const liveBadge = $("#liveBadge");

    if (heroLiveTag) {
        heroLiveTag.hidden = !channel.isLive;
    }

    if (liveBadge) {
        liveBadge.hidden = !channel.isLive;
    }

    updateFavButton(channel);

    renderEpg(channel);

    renderGrid();

    renderShelves();

    iniciarReproducao(channel);

}


/* ============================================================
   16. CONTROLES DO PLAYER
   ============================================================ */

function setupPlayerControls() {

    const video = getVideo();

    if (!video) {
        warn("Elemento #video não encontrado.");
        return;
    }

    const playPause = $("#playPauseBtn");
    const mute = $("#muteBtn");
    const volume = $("#volumeSlider");
    const fullscreen = $("#fullscreenBtn");
    const speed = $("#speedSelect");


    function togglePlay() {

        if (!video.currentSrc && !video.src) return;

        if (video.paused) {

            video.play().catch(err => {
                warn("Falha ao reproduzir:", err);
            });

        } else {

            video.pause();

        }

    }


    playPause?.addEventListener(
        "click",
        togglePlay
    );


    video.addEventListener(
        "play",
        updatePlayPauseIcon
    );

    video.addEventListener(
        "pause",
        updatePlayPauseIcon
    );


    video.addEventListener(
        "playing",
        () => {

            log("Vídeo em reprodução.");

            clearTimeout(state.startupTimer);
            state.startupTimer = null;

            clearTimeout(state.retryTimer);
            state.retryTimer = null;

            state.retryCount = 0;

            showPlayerState("none");

            updatePlayPauseIcon();

        }
    );


    video.addEventListener(
        "waiting",
        () => {

            if (video.currentSrc || video.src) {

                log("Aguardando dados de vídeo.");

                showPlayerState("loading");

            }

        }
    );


    video.addEventListener(
        "stalled",
        () => {

            if (video.currentSrc || video.src) {

                warn("A transmissão parou de receber dados.");

                showPlayerState("loading");

            }

        }
    );


    video.addEventListener(
        "ended",
        () => {

            if (state.selectedId) {
                showPlayerState("noSignal");
            }

        }
    );


    video.addEventListener(
        "timeupdate",
        () => {

            const timeLabel = $("#timeLabel");

            if (!timeLabel) return;

            if (
                Number.isFinite(video.duration) &&
                video.duration > 0
            ) {

                const format = seconds => {

                    const minutes = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);

                    return (
                        String(minutes).padStart(2, "0") +
                        ":" +
                        String(secs).padStart(2, "0")
                    );

                };

                timeLabel.textContent =
                    `${format(video.currentTime)} / ${format(video.duration)}`;

            } else {

                timeLabel.textContent = "AO VIVO";

            }

        }
    );


    mute?.addEventListener(
        "click",
        () => {

            video.muted = !video.muted;

            mute.style.opacity =
                video.muted ? "0.5" : "1";

        }
    );


    volume?.addEventListener(
        "input",
        () => {

            const value = Math.min(
                100,
                Math.max(0, Number(volume.value) || 0)
            );

            video.volume = value / 100;

            video.muted = value === 0;

            if (mute) {
                mute.style.opacity =
                    video.muted ? "0.5" : "1";
            }

        }
    );


    fullscreen?.addEventListener(
        "click",
        async () => {

            const shell = $("#playerShell");

            if (!shell) return;

            try {

                if (document.fullscreenElement) {

                    await document.exitFullscreen();

                } else if (shell.requestFullscreen) {

                    await shell.requestFullscreen();

                }

            } catch (err) {

                warn("Erro na tela cheia:", err);

            }

        }
    );


    speed?.addEventListener(
        "change",
        () => {

            video.playbackRate =
                Number(speed.value) || 1;

        }
    );


    function retry() {

        if (!state.selectedId) return;

        const channel = getChannel(state.selectedId);

        if (!channel) return;

        state.retryCount = 0;

        clearPlayerTimers();

        iniciarReproducao(channel);

    }


    $("#retryBtn")?.addEventListener(
        "click",
        retry
    );

    $("#errorRetryBtn")?.addEventListener(
        "click",
        retry
    );


    video.addEventListener(
        "volumechange",
        () => {

            if (mute) {
                mute.style.opacity =
                    video.muted ? "0.5" : "1";
            }

        }
    );


    updatePlayPauseIcon();

}


/* ============================================================
   17. FAVORITOS
   ============================================================ */

function updateFavButton(channel) {

    const button = $("#heroFavBtn");
    const label = $("#heroFavLabel");

    if (!button || !label) return;

    const favorite =
        state.favorites.has(channel.id);

    button.setAttribute(
        "aria-pressed",
        String(favorite)
    );

    label.textContent = favorite
        ? "Nos favoritos"
        : "Favoritar";

}


function setupFavorites() {

    const button = $("#heroFavBtn");

    if (!button) return;

    button.addEventListener(
        "click",
        () => {

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

        }
    );

}


/* ============================================================
   18. NAVEGAÇÃO E BUSCA
   ============================================================ */

function setupNav() {

    const mainNav = $("#mainNav");
    const searchInput = $("#searchInput");
    const profileBtn = $("#profileBtn");


    mainNav?.addEventListener(
        "click",
        event => {

            const button = event.target.closest(
                ".topnav__item"
            );

            if (!button || !mainNav.contains(button)) {
                return;
            }

            const category = button.dataset.category;

            if (!CATEGORY_LABELS[category]) return;

            state.category = category;

            $$(".topnav__item").forEach(item => {

                const active = item === button;

                item.classList.toggle(
                    "is-active",
                    active
                );

                if (active) {
                    item.setAttribute("aria-current", "page");
                } else {
                    item.removeAttribute("aria-current");
                }

            });

            renderGrid();

        }
    );


    searchInput?.addEventListener(
        "input",
        event => {

            state.search = event.target.value || "";

            renderGrid();

        }
    );


    profileBtn?.addEventListener(
        "click",
        () => {

            alert(
                `Perfil NovaTV — ${state.favorites.size} canal(is) favorito(s).`
            );

        }
    );

}


/* ============================================================
   19. NAVEGAÇÃO POR TECLADO
   ============================================================ */

function gridColumns() {

    const grid = $("#channelGrid");

    if (!grid || !grid.children.length) return 1;

    const first = grid.children[0]
        .getBoundingClientRect();

    const second = grid.children[1]
        ?.getBoundingClientRect();

    if (!second || first.width <= 0) return 1;

    const gap = second.left - first.left;

    return Math.max(
        1,
        Math.round(gap / first.width)
    );

}


function setupKeyboard() {

    document.addEventListener(
        "keydown",
        event => {

            const active = document.activeElement;

            const typing = [
                "INPUT",
                "SELECT",
                "TEXTAREA"
            ].includes(active?.tagName);

            if (typing) {

                if (event.key === "Escape") {
                    active.blur();
                } else {
                    return;
                }

            }


            switch (event.key) {

                case " ":

                    if (
                        active?.tagName !== "BUTTON" &&
                        active?.tagName !== "A"
                    ) {

                        event.preventDefault();

                        $("#playPauseBtn")?.click();

                    }

                    break;


                case "ArrowRight":
                case "ArrowLeft":
                case "ArrowUp":
                case "ArrowDown": {

                    const cards = [
                        ...$$("#channelGrid .card")
                    ];

                    if (!cards.length) return;

                    event.preventDefault();

                    const index = cards.indexOf(active);

                    const columns = gridColumns();

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

                        document.exitFullscreen().catch(() => {});

                    }

                    break;


                case "f":
                case "F":

                    $("#fullscreenBtn")?.click();

                    break;


                case "m":
                case "M":

                    $("#muteBtn")?.click();

                    break;

            }

        }
    );

}


/* ============================================================
   20. INICIALIZAÇÃO
   ============================================================ */

async function init() {

    if (state.destroyed) return;

    log("Inicializando NovaTV...");

    startClock();

    setupPlayerControls();

    setupFavorites();

    setupNav();

    setupKeyboard();

    showPlayerState("loading");

    const conectado = await carregarCanaisAPI();

    if (state.destroyed) return;

    if (!conectado || CHANNELS.length === 0) {

        renderGrid();

        renderShelves();

        showPlayerState("noUrl");

        warn(
            "Nenhum canal disponível. Verifique a API."
        );

        return;

    }

    renderGrid();

    renderShelves();

    const primeiroCanal = CHANNELS[0];

    if (primeiroCanal) {

        state.selectedId = primeiroCanal.id;

        atualizarHeroStatus(
            primeiroCanal.name,
            primeiroCanal.desc
        );

        const heroLiveTag = $("#heroLiveTag");
        const liveBadge = $("#liveBadge");

        if (heroLiveTag) {
            heroLiveTag.hidden = !primeiroCanal.isLive;
        }

        if (liveBadge) {
            liveBadge.hidden = !primeiroCanal.isLive;
        }

        updateFavButton(primeiroCanal);

        renderEpg(primeiroCanal);

        renderGrid();

        renderShelves();

        showPlayerState("noUrl");

    }

    log("NovaTV inicializada com sucesso.");

}


/* ============================================================
   21. INICIALIZAÇÃO DO DOCUMENTO
   ============================================================ */

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        init,
        { once: true }
    );

} else {

    init();

}


/* ============================================================
   22. ENCERRAMENTO DA PÁGINA
   ============================================================ */

window.addEventListener(
    "beforeunload",
    () => {

        state.destroyed = true;

        clearPlayerTimers();

        destroyHls();

    }
);
