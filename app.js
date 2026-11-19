
"use strict";

/* ============================================================
   TV RABISCO / NOVATV — APLICAÇÃO UNIFICADA

   Backend Node.js + channels.json
   Player HLS.js + MP4
   Busca + Categorias + Favoritos
   EPG + Histórico + Carrosséis
   Controles + Navegação por teclado

   Arquivo único: app.js
   ============================================================ */


/* ============================================================
   1. CONFIGURAÇÃO
   ============================================================ */

const CONFIG = {
    BACKEND_URL: "https://nose-highways-agency-butler.trycloudflare.com",
    API_URL: "/api/canais",
    FAVORITES_KEY: "novatv.favorites",
    MAX_WATCHING: 6
};

// Para desenvolvimento local, use:
// BACKEND_URL: "http://localhost:3000"


/* ============================================================
   2. ELEMENTOS E UTILITÁRIOS
   ============================================================ */

const $ = selector => document.querySelector(selector);

const video = $("#video");
const grid = $("#channelGrid");

const statusEl = $("#status");
const titulo = $("#titulo");

const heroTitle = $("#heroTitle");
const heroDesc = $("#heroDesc");
const heroLiveTag = $("#heroLiveTag");

const busca = $("#searchInput") || $("#busca");
const gridEmpty = $("#gridEmpty");

const API_URL = `${CONFIG.BACKEND_URL}${CONFIG.API_URL}`;

function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (text !== undefined && text !== null) {
        node.textContent = text;
    }

    return node;
}

function normalizeId(id) {
    return String(id ?? "").trim();
}

function resolveMediaUrl(path) {
    if (!path || typeof path !== "string") return "";

    const value = path.trim();

    try {
        if (/^https?:\/\//i.test(value)) {
            return new URL(value).href;
        }

        return new URL(
            value.replace(/^\/+/, ""),
            `${CONFIG.BACKEND_URL}/`
        ).href;

    } catch (error) {
        console.warn("URL inválida:", value, error);
        return "";
    }
}


/* ============================================================
   3. ESTADO DA APLICAÇÃO
   ============================================================ */

function loadFavorites() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(CONFIG.FAVORITES_KEY) || "[]"
        );

        return Array.isArray(saved)
            ? saved.map(normalizeId).filter(Boolean)
            : [];

    } catch (error) {
        console.warn("Erro ao carregar favoritos:", error);
        return [];
    }
}

const state = {
    channels: [],
    category: "inicio",
    search: "",
    selectedId: null,
    hls: null,
    favorites: new Set(loadFavorites()),
    watching: [],
    initialized: false
};

const CATEGORY_LABELS = {
    inicio: "Canais TV Rabisco",
    aovivo: "Canais ao vivo",
    filmes: "Canais de filmes",
    series: "Canais de séries",
    favoritos: "Seus favoritos"
};


/* ============================================================
   4. NORMALIZAÇÃO DOS CANAIS
   ============================================================ */

function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;

    if (typeof value === "string") {
        return [
            "true", "1", "sim", "yes", "ativo"
        ].includes(value.trim().toLowerCase());
    }

    return false;
}

function normalizeChannel(channel, index) {
    if (!channel || typeof channel !== "object") {
        return null;
    }

    const id = normalizeId(
        channel.id ?? channel._id ?? `canal-${index + 1}`
    );

    return {
        ...channel,
        id,
        name: String(
            channel.name || channel.nome || "Canal sem nome"
        ),
        category: String(
            channel.category || channel.categoria || "geral"
        ).toLowerCase(),
        isLive: normalizeBoolean(
            channel.isLive ?? channel.aoVivo
        ),
        url: String(
            channel.url || channel.stream || ""
        ).trim(),
        desc: String(
            channel.desc || channel.descricao || ""
        ),
        poster: String(
            channel.poster || channel.logo || channel.imagem || ""
        ).trim(),
        epg: Array.isArray(channel.epg) ? channel.epg : []
    };
}

function getChannel(id) {
    const normalizedId = normalizeId(id);

    return state.channels.find(
        channel => channel.id === normalizedId
    ) || null;
}

function getChannelName(channel) {
    return channel?.name || "Canal sem nome";
}

function getChannelDescription(channel) {
    return channel?.desc || "";
}

function getChannelCategory(channel) {
    return channel?.category || "geral";
}

function isChannelLive(channel) {
    return channel?.isLive === true;
}


/* ============================================================
   5. CARREGAR CANAIS DO BACKEND
   ============================================================ */

async function loadChannels() {
    if (statusEl) {
        statusEl.textContent = "Conectando à TV...";
    }

    if (gridEmpty) {
        gridEmpty.hidden = false;
        gridEmpty.textContent = "Carregando canais...";
    }

    try {
        const response = await fetch(API_URL, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const data = await response.json();

        let list;

        if (Array.isArray(data)) {
            list = data;
        } else if (Array.isArray(data.channels)) {
            list = data.channels;
        } else if (Array.isArray(data.canais)) {
            list = data.canais;
        } else {
            throw new Error(
                "A API não retornou uma lista de canais válida."
            );
        }

        state.channels = list
            .map(normalizeChannel)
            .filter(Boolean);

        if (!state.channels.length) {
            throw new Error("Nenhum canal encontrado.");
        }

        // Mantém apenas favoritos que ainda existem.
        const validIds = new Set(
            state.channels.map(channel => channel.id)
        );

        state.favorites = new Set(
            [...state.favorites].filter(id => validIds.has(id))
        );

        saveFavorites();

        if (statusEl) {
            statusEl.textContent = "A TV Rabisco está on-line";
        }

        console.info(
            `${state.channels.length} canais carregados.`
        );

        return true;

    } catch (error) {
        console.error("Erro ao carregar canais:", error);

        state.channels = [];

        if (statusEl) {
            statusEl.textContent = "TV Rabisco offline";
        }

        if (grid) {
            grid.replaceChildren();

            grid.appendChild(
                el(
                    "p",
                    "lista-vazia",
                    "Não foi possível carregar os canais. Verifique o backend."
                )
            );
        }

        if (gridEmpty) {
            gridEmpty.hidden = true;
        }

        showError(
            "Não foi possível conectar ao servidor de canais."
        );

        return false;
    }
}


/* ============================================================
   6. FAVORITOS
   ============================================================ */

function saveFavorites() {
    try {
        localStorage.setItem(
            CONFIG.FAVORITES_KEY,
            JSON.stringify([...state.favorites])
        );
    } catch (error) {
        console.warn("Erro ao salvar favoritos:", error);
    }
}

function updateFavButton(channel) {
    const button = $("#heroFavBtn");
    const label = $("#heroFavLabel");

    if (!button) return;

    if (!channel) {
        button.disabled = true;
        button.setAttribute("aria-pressed", "false");

        if (label) label.textContent = "Favoritar";

        return;
    }

    button.disabled = false;

    const favorite = state.favorites.has(channel.id);

    button.setAttribute(
        "aria-pressed",
        String(favorite)
    );

    if (label) {
        label.textContent = favorite
            ? "Nos favoritos"
            : "Favoritar";
    }
}

function toggleFavorite() {
    if (!state.selectedId) return;

    const id = normalizeId(state.selectedId);

    if (state.favorites.has(id)) {
        state.favorites.delete(id);
    } else {
        state.favorites.add(id);
    }

    saveFavorites();

    updateFavButton(getChannel(id));

    renderGrid();
    renderShelves();
}

function setupFavorites() {
    $("#heroFavBtn")?.addEventListener(
        "click",
        toggleFavorite
    );
}


/* ============================================================
   7. EPG — PROGRAMAÇÃO
   ============================================================ */

function parseStart(time) {
    if (typeof time !== "string") return null;

    const match = time.match(
        /^([01]\d|2[0-3]):([0-5]\d)$/
    );

    if (!match) return null;

    return Number(match[1]) * 60 + Number(match[2]);
}

function getSortedEpg(channel) {
    if (!Array.isArray(channel.epg)) return [];

    return channel.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            parseStart(item[0]) !== null
        )
        .map(item => [
            item[0],
            String(item[1])
        ])
        .sort((a, b) =>
            parseStart(a[0]) - parseStart(b[0])
        );
}

function getCurrentEpgIndex(epg, nowMinutes) {
    if (!epg.length) return -1;

    for (let i = 0; i < epg.length; i++) {
        const start = parseStart(epg[i][0]);

        const nextIndex = (i + 1) % epg.length;
        const end = parseStart(epg[nextIndex][0]);

        if (end > start) {
            if (nowMinutes >= start && nowMinutes < end) {
                return i;
            }
        } else {
            // Horário que atravessa a meia-noite.
            if (nowMinutes >= start || nowMinutes < end) {
                return i;
            }
        }
    }

    return -1;
}

function currentProgram(channel) {
    const epg = getSortedEpg(channel);

    if (!epg.length) {
        return channel.programa || "Programação não informada";
    }

    const now = new Date();

    const minutes =
        now.getHours() * 60 + now.getMinutes();

    const index = getCurrentEpgIndex(epg, minutes);

    return index >= 0
        ? epg[index][1]
        : "Programação não informada";
}

function renderEpg(channel) {
    const section = $("#epgSection");
    const timeline = $("#epgTimeline");

    if (!section || !timeline) return;

    const epg = getSortedEpg(channel);

    timeline.replaceChildren();

    if (!epg.length) {
        section.hidden = true;
        return;
    }

    const channelName = $("#epgChannelName");

    if (channelName) {
        channelName.textContent = getChannelName(channel);
    }

    const now = new Date();

    const minutes =
        now.getHours() * 60 + now.getMinutes();

    const currentIndex = getCurrentEpgIndex(epg, minutes);

    const nextIndex = currentIndex >= 0
        ? (currentIndex + 1) % epg.length
        : -1;

    epg.forEach((item, index) => {
        const [time, name] = item;

        const block = el("div", "epg__item");

        if (index === currentIndex) {
            block.classList.add("epg__item--current");
        } else if (index === nextIndex) {
            block.classList.add("epg__item--next");
        }

        block.appendChild(
            el("span", "epg__time", time)
        );

        block.appendChild(
            el("p", "epg__name", name)
        );

        if (index === currentIndex) {
            block.appendChild(
                el("span", "epg__badge", "NO AR AGORA")
            );
        }

        timeline.appendChild(block);
    });

    section.hidden = false;
}


/* ============================================================
   8. BUSCA E FILTROS
   ============================================================ */

function matchesFilters(channel) {
    const category = state.category;
    const channelCategory = getChannelCategory(channel);

    let categoryValid =
        category === "inicio" ||
        category === channelCategory;

    if (category === "favoritos") {
        categoryValid = state.favorites.has(channel.id);
    }

    const term = state.search.trim().toLowerCase();

    const name = getChannelName(channel).toLowerCase();

    const description =
        getChannelDescription(channel).toLowerCase();

    const searchValid =
        !term ||
        name.includes(term) ||
        description.includes(term) ||
        channelCategory.includes(term);

    return categoryValid && searchValid;
}


/* ============================================================
   9. CRIAR CARD
   ============================================================ */

function channelCard(channel) {
    const card = el("button", "card");

    card.type = "button";
    card.dataset.id = channel.id;

    card.setAttribute(
        "aria-label",
        `${channel.name} — ${channel.desc}`
    );

    if (state.selectedId === channel.id) {
        card.classList.add("is-selected");
    }

    const thumb = el("div", "card__thumb");

    const poster = resolveMediaUrl(channel.poster);

    if (poster) {
        const image = el("img", "card__poster");

        image.src = poster;
        image.alt = channel.name;
        image.loading = "lazy";

        image.onerror = () => {
            image.remove();

            if (!thumb.querySelector(".card__initial")) {
                thumb.prepend(
                    el(
                        "span",
                        "card__initial",
                        channel.name.charAt(0).toUpperCase()
                    )
                );
            }
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

    const categoryLabels = {
        aovivo: "Ao vivo",
        filmes: "Filmes",
        series: "Séries"
    };

    const meta = el("p", "card__meta");

    meta.appendChild(
        el(
            "span",
            null,
            channel.isLive ? "Ao vivo" : "Sob demanda"
        )
    );

    meta.appendChild(el("span", "dot"));

    meta.appendChild(
        el(
            "span",
            null,
            categoryLabels[channel.category] || channel.category
        )
    );

    body.appendChild(meta);

    body.appendChild(
        el(
            "p",
            "card__now",
            `Agora: ${currentProgram(channel)}`
        )
    );

    card.appendChild(body);

    card.addEventListener("click", () => {
        selectChannel(channel.id);
    });

    return card;
}


/* ============================================================
   10. RENDERIZAR GRADE
   ============================================================ */

function renderGrid() {
    if (!grid) return;

    grid.replaceChildren();

    const list = state.channels.filter(matchesFilters);

    list.forEach(channel => {
        grid.appendChild(channelCard(channel));
    });

    if (gridEmpty) {
        gridEmpty.hidden = list.length > 0;
    }

    const gridTitle = $("#gridTitle");

    if (gridTitle) {
        gridTitle.textContent =
            CATEGORY_LABELS[state.category] || "Canais";
    }
}


/* ============================================================
   11. CARROSSEIS E HISTÓRICO
   ============================================================ */

function renderShelves() {
    const watchingSection = $("#watchingSection");
    const watchingRow = $("#watchingRow");

    if (watchingSection && watchingRow) {
        const list = state.watching
            .map(getChannel)
            .filter(Boolean);

        watchingSection.hidden = list.length === 0;

        watchingRow.replaceChildren(
            ...list.map(channelCard)
        );
    }

    const recommendedRow = $("#recommendedRow");

    if (recommendedRow) {
        const recommendations = state.channels
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
   12. ESTADOS DO PLAYER
   ============================================================ */

function showPlayerState(which) {
    const states = {
        noUrl: "#stateNoUrl",
        loading: "#stateLoading",
        noSignal: "#stateNoSignal",
        error: "#stateError"
    };

    Object.entries(states).forEach(([key, selector]) => {
        const node = $(selector);

        if (node) {
            node.hidden = key !== which;
        }
    });
}

function showError(message) {
    destroyHls();

    const errorMessage = $("#errorMessage");

    if (errorMessage) {
        errorMessage.textContent = message;
    }

    showPlayerState("error");
}


/* ============================================================
   13. PLAYER HLS + MP4
   ============================================================ */

function destroyHls() {
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }
}

function isHlsSource(url) {
    try {
        return /\.m3u8$/i.test(new URL(url).pathname);
    } catch {
        return /\.m3u8(?:$|[?#])/i.test(url);
    }
}

function attachSource(channel) {
    if (!video) {
        console.error("Elemento #video não encontrado.");
        return false;
    }

    destroyHls();

    const url = resolveMediaUrl(channel.url);

    video.pause();
    video.removeAttribute("src");
    video.load();

    if (!url) {
        showPlayerState("noUrl");
        return false;
    }

    showPlayerState("loading");

    if (isHlsSource(url)) {
        // HLS nativo.
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
            video.load();
            return "native-hls";
        }

        // HLS.js.
        if (window.Hls && window.Hls.isSupported()) {
            const hls = new window.Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30
            });

            state.hls = hls;

            hls.on(
                window.Hls.Events.MANIFEST_PARSED,
                () => {
                    if (state.selectedId !== channel.id) return;

                    video.play().catch(error => {
                        console.warn(
                            "Reprodução HLS bloqueada:",
                            error
                        );
                    });
                }
            );

            hls.on(
                window.Hls.Events.ERROR,
                (_event, data) => {
                    if (!data.fatal) return;

                    console.error("Erro fatal HLS:", data);

                    if (
                        data.type ===
                        window.Hls.ErrorTypes.NETWORK_ERROR
                    ) {
                        showError(
                            "Falha de rede. Verifique a transmissão e o CORS."
                        );
                    } else if (
                        data.type ===
                        window.Hls.ErrorTypes.MEDIA_ERROR
                    ) {
                        showError(
                            "Erro de mídia na transmissão HLS."
                        );
                    } else {
                        showError(
                            "Não foi possível iniciar a transmissão HLS."
                        );
                    }
                }
            );

            hls.loadSource(url);
            hls.attachMedia(video);

            return "hlsjs";
        }

        showError(
            "HLS.js não está disponível ou o navegador não suporta HLS."
        );

        return false;
    }

    // MP4 e outros formatos suportados pelo navegador.
    video.src = url;
    video.load();

    return "file";
}


/* ============================================================
   14. INFORMAÇÕES DO CANAL
   ============================================================ */

function atualizarInformacoes(channel) {
    if (!channel) return;

    if (titulo) {
        titulo.textContent = channel.name;
    }

    if (heroTitle) {
        heroTitle.textContent = channel.name;
    }

    if (heroDesc) {
        heroDesc.textContent = channel.desc;
    }

    if (heroLiveTag) {
        heroLiveTag.hidden = !channel.isLive;
    }

    const liveBadge = $("#liveBadge");

    if (liveBadge) {
        liveBadge.hidden = !channel.isLive;
    }

    updateFavButton(channel);
}


/* ============================================================
   15. SELECIONAR E REPRODUZIR CANAL
   ============================================================ */

function selectChannel(id) {
    const channel = getChannel(id);

    if (!channel) return;

    state.selectedId = channel.id;

    state.watching = [
        channel.id,
        ...state.watching.filter(
            item => item !== channel.id
        )
    ].slice(0, CONFIG.MAX_WATCHING);

    atualizarInformacoes(channel);
    renderEpg(channel);
    renderGrid();
    renderShelves();

    if (channel.poster && video) {
        video.poster = resolveMediaUrl(channel.poster);
    } else if (video) {
        video.removeAttribute("poster");
    }

    const result = attachSource(channel);

    if (!result || !video) return;

    // O HLS.js inicia quando o manifesto estiver pronto.
    if (result === "hlsjs") return;

    // HLS nativo e MP4.
    video.muted = true;

    video.play()
        .then(() => {
            video.muted = false;
        })
        .catch(error => {
            console.warn("Reprodução bloqueada:", error);
            updatePlayPauseIcon();
        });
}


/* ============================================================
   16. CONTROLES DO PLAYER
   ============================================================ */

function updatePlayPauseIcon() {
    if (!video) return;

    const play = $(".pbtn__icon--play");
    const pause = $(".pbtn__icon--pause");

    if (play) {
        play.style.display = video.paused ? "" : "none";
    }

    if (pause) {
        pause.style.display = video.paused ? "none" : "";
    }
}

function setupPlayerControls() {
    if (!video) return;

    const playPause = $("#playPauseBtn");
    const mute = $("#muteBtn");
    const volume = $("#volumeSlider");
    const fullscreen = $("#fullscreenBtn");
    const speed = $("#speedSelect");

    function togglePlay() {
        if (!video.currentSrc && !video.src) return;

        if (video.paused) {
            video.play().catch(error => {
                console.warn("Erro ao reproduzir:", error);
            });
        } else {
            video.pause();
        }
    }

    playPause?.addEventListener("click", togglePlay);

    video.addEventListener("click", togglePlay);

    video.addEventListener("play", updatePlayPauseIcon);
    video.addEventListener("pause", updatePlayPauseIcon);

    video.addEventListener("playing", () => {
        showPlayerState(null);
    });

    video.addEventListener("waiting", () => {
        if (video.currentSrc || video.src) {
            showPlayerState("loading");
        }
    });

    video.addEventListener("error", () => {
        if (!video.currentSrc && !video.src) return;

        showError(
            "Não foi possível carregar o vídeo. Verifique URL, servidor e CORS."
        );
    });

    video.addEventListener("timeupdate", () => {
        const label = $("#timeLabel");

        if (!label) return;

        if (video.duration && Number.isFinite(video.duration)) {
            const format = seconds => {
                const minutes = Math.floor(seconds / 60);
                const remaining = Math.floor(seconds % 60);

                return (
                    String(minutes).padStart(2, "0") +
                    ":" +
                    String(remaining).padStart(2, "0")
                );
            };

            label.textContent =
                `${format(video.currentTime)} / ${format(video.duration)}`;
        } else {
            label.textContent = "AO VIVO";
        }
    });

    mute?.addEventListener("click", () => {
        video.muted = !video.muted;

        mute.style.opacity = video.muted ? "0.5" : "1";
    });

    volume?.addEventListener("input", () => {
        video.volume = Math.max(
            0,
            Math.min(1, Number(volume.value) / 100)
        );

        video.muted = video.volume === 0;

        if (mute) {
            mute.style.opacity = video.muted ? "0.5" : "1";
        }
    });

    fullscreen?.addEventListener("click", async () => {
        const shell = $("#playerShell");

        if (!shell) return;

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (shell.requestFullscreen) {
                await shell.requestFullscreen();
            }
        } catch (error) {
            console.warn("Erro na tela cheia:", error);
        }
    });

    speed?.addEventListener("change", () => {
        video.playbackRate = Number(speed.value) || 1;
    });

    const retry = () => {
        if (state.selectedId) {
            selectChannel(state.selectedId);
        }
    };

    $("#retryBtn")?.addEventListener("click", retry);
    $("#errorRetryBtn")?.addEventListener("click", retry);

    updatePlayPauseIcon();
}


/* ============================================================
   17. BUSCA E NAVEGAÇÃO
   ============================================================ */

function setupNav() {
    $("#mainNav")?.addEventListener("click", event => {
        const button = event.target.closest(".topnav__item");

        if (!button) return;

        state.category = button.dataset.category || "inicio";

        document.querySelectorAll(".topnav__item").forEach(item => {
            const active = item === button;

            item.classList.toggle("is-active", active);

            if (active) {
                item.setAttribute("aria-current", "page");
            } else {
                item.removeAttribute("aria-current");
            }
        });

        renderGrid();
    });

    busca?.addEventListener("input", event => {
        state.search = event.target.value || "";
        renderGrid();
    });

    $("#profileBtn")?.addEventListener("click", () => {
        alert(
            `Perfil N — ${state.favorites.size} canal(is) favorito(s).`
        );
    });
}


/* ============================================================
   18. RELÓGIO
   ============================================================ */

function startClock() {
    const time = $("#clockTime");
    const date = $("#clockDate");

    if (!time && !date) return;

    const dateFormat = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "short"
    });

    function updateClock() {
        const now = new Date();

        if (time) {
            time.textContent = now.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit"
            });
        }

        if (date) {
            date.textContent = dateFormat.format(now);
        }
    }

    updateClock();
    setInterval(updateClock, 30000);
}


/* ============================================================
   19. NAVEGAÇÃO POR TECLADO
   ============================================================ */

function gridColumns() {
    if (!grid || !grid.children.length) return 1;

    const first = grid.children[0].getBoundingClientRect();
    const second = grid.children[1]?.getBoundingClientRect();

    if (!second || first.width <= 0) return 1;

    const distance = second.left - first.left;

    return Math.max(
        1,
        Math.round(distance / first.width)
    );
}

function setupKeyboard() {
    document.addEventListener("keydown", event => {
        const active = document.activeElement;

        const typing = [
            "INPUT",
            "TEXTAREA",
            "SELECT"
        ].includes(active?.tagName);

        if (typing) return;

        if (event.key === " ") {
            if (active?.classList.contains("card")) return;

            event.preventDefault();
            $("#playPauseBtn")?.click();
            return;
        }

        switch (event.key) {
            case "ArrowRight":
            case "ArrowLeft":
            case "ArrowUp":
            case "ArrowDown": {
                const cards = [
                    ...document.querySelectorAll("#channelGrid .card")
                ];

                if (!cards.length) return;

                event.preventDefault();

                const index = cards.indexOf(active);
                const columns = gridColumns();

                let next = index;

                if (index === -1) {
                    next = 0;
                } else if (event.key === "ArrowRight") {
                    next = Math.min(index + 1, cards.length - 1);
                } else if (event.key === "ArrowLeft") {
                    next = Math.max(index - 1, 0);
                } else if (event.key === "ArrowDown") {
                    next = Math.min(index + columns, cards.length - 1);
                } else if (event.key === "ArrowUp") {
                    next = Math.max(index - columns, 0);
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
                    document.exitFullscreen?.();
                }

                busca?.blur();
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
    });
}


/* ============================================================
   20. INICIALIZAÇÃO
   ============================================================ */

async function init() {
    if (state.initialized) return;

    state.initialized = true;

    startClock();
    setupPlayerControls();
    setupFavorites();
    setupNav();
    setupKeyboard();

    const loaded = await loadChannels();

    if (!loaded) {
        showPlayerState("error");
        return;
    }

    // Seleciona o primeiro canal ao vivo, sem iniciar automaticamente.
    const first =
        state.channels.find(isChannelLive) ||
        state.channels[0];

    if (first) {
        state.selectedId = first.id;

        atualizarInformacoes(first);
        renderEpg(first);
    }

    renderGrid();
    renderShelves();

    if (first) {
        showPlayerState("noUrl");
    }

    console.info("NovaTV inicializada.");
}


/* ============================================================
   21. INICIAR QUANDO O HTML ESTIVER PRONTO
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
