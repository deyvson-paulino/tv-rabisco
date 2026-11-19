"use strict";

/* ============================================================
   TV RABISCO / NOVATV
   Backend Node.js + channels.json
   Player HLS + MP4
   Favoritos + EPG + Busca + Navegação
   ============================================================ */

/* 1. CONFIGURAÇÃO */

const BACKEND_URL = "https://nose-highways-agency-butler.trycloudflare.com";
const API_URL = `${BACKEND_URL}/api/canais`;
const FAVORITES_KEY = "novatv.favorites";

/* 2. ELEMENTOS HTML */

const $ = (selector) => document.querySelector(selector);

const video = $("#video");
const grid = $("#channelGrid");
const statusEl = $("#status");
const titulo = $("#titulo");

const heroTitle = $("#heroTitle");
const heroDesc = $("#heroDesc");
const heroLiveTag = $("#heroLiveTag");

const busca = $("#searchInput") || $("#busca");
const gridEmpty = $("#gridEmpty");

/* 3. ESTADO */

function loadFavorites() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(FAVORITES_KEY) || "[]"
        );

        return Array.isArray(saved)
            ? saved.map(String)
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
    watching: []
};

const CATEGORY_LABELS = {
    inicio: "Canais TV Rabisco",
    aovivo: "Canais ao vivo",
    filmes: "Canais de filmes",
    series: "Canais de séries",
    favoritos: "Seus favoritos"
};

/* 4. FUNÇÕES AUXILIARES */

function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (text !== undefined && text !== null) {
        node.textContent = text;
    }

    return node;
}

function normalizeChannel(canal) {
    if (!canal || typeof canal !== "object") return null;

    const id = canal.id ?? canal._id;

    if (id === undefined || id === null || String(id).trim() === "") {
        return null;
    }

    return {
        ...canal,
        id: String(id),
        name: canal.name || canal.nome || "Canal sem nome",
        desc: canal.desc || canal.descricao || "",
        category: String(
            canal.category || canal.categoria || "geral"
        ).toLowerCase(),
        url: canal.url || canal.stream || "",
        poster: canal.poster || canal.logo || canal.imagem || "",
        epg: Array.isArray(canal.epg) ? canal.epg : [],
        isLive: normalizeBoolean(canal.isLive ?? canal.aoVivo)
    };
}

function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;

    if (typeof value === "string") {
        return ["true", "1", "sim", "yes", "ativo"].includes(
            value.trim().toLowerCase()
        );
    }

    return false;
}

function getChannel(id) {
    return state.channels.find(
        canal => canal.id === String(id)
    ) || null;
}

function getChannelName(canal) {
    return canal?.name || "Canal sem nome";
}

function getChannelDescription(canal) {
    return canal?.desc || "";
}

function getChannelCategory(canal) {
    return canal?.category || "geral";
}

function isChannelLive(canal) {
    return canal?.isLive === true;
}

function resolveUrl(url) {
    if (!url || typeof url !== "string") return "";

    const value = url.trim();

    if (!value) return "";

    try {
        // URL absoluta: HTTP ou HTTPS.
        if (/^https?:\/\//i.test(value)) {
            return new URL(value).href;
        }

        // URL relativa: arquivo servido pelo backend.
        return new URL(
            value.replace(/^\/+/, ""),
            `${BACKEND_URL}/`
        ).href;

    } catch (error) {
        console.warn("URL inválida:", value, error);
        return "";
    }
}

function saveFavorites() {
    try {
        localStorage.setItem(
            FAVORITES_KEY,
            JSON.stringify([...state.favorites])
        );
    } catch (error) {
        console.warn("Não foi possível salvar favoritos:", error);
    }
}

/* 5. FAVORITOS */

function updateFavButton(canal) {
    const button = $("#heroFavBtn");
    const label = $("#heroFavLabel");

    if (!button) return;

    if (!canal) {
        button.disabled = true;
        button.setAttribute("aria-pressed", "false");
        if (label) label.textContent = "Favoritar";
        return;
    }

    button.disabled = false;

    const favorite = state.favorites.has(String(canal.id));

    button.setAttribute("aria-pressed", String(favorite));

    if (label) {
        label.textContent = favorite
            ? "Nos favoritos"
            : "Favoritar";
    }
}

function toggleFavorite() {
    if (!state.selectedId) return;

    const id = String(state.selectedId);

    if (state.favorites.has(id)) {
        state.favorites.delete(id);
    } else {
        state.favorites.add(id);
    }

    saveFavorites();

    const canal = getChannel(id);

    updateFavButton(canal);
    renderGrid();
    renderShelves();
}

/* 6. CARREGAR CANAIS DO BACKEND */

async function carregarCanais() {
    if (statusEl) {
        statusEl.textContent = "Conectando à TV...";
    }

    try {
        const resposta = await fetch(API_URL, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store"
        });

        if (!resposta.ok) {
            throw new Error(`Erro HTTP ${resposta.status}`);
        }

        const dados = await resposta.json();

        let lista;

        if (Array.isArray(dados)) {
            lista = dados;
        } else if (Array.isArray(dados.channels)) {
            lista = dados.channels;
        } else if (Array.isArray(dados.canais)) {
            lista = dados.canais;
        } else {
            throw new Error(
                "A API não retornou uma lista de canais válida."
            );
        }

        state.channels = lista
            .map(normalizeChannel)
            .filter(Boolean);

        if (!state.channels.length) {
            throw new Error("Nenhum canal válido foi encontrado.");
        }

        // Remove favoritos que não existem mais na lista.
        const idsExistentes = new Set(
            state.channels.map(canal => canal.id)
        );

        state.favorites = new Set(
            [...state.favorites].filter(id => idsExistentes.has(id))
        );

        saveFavorites();

        if (statusEl) {
            statusEl.textContent = "A TV Rabisco está on-line";
        }

        const primeiro =
            state.channels.find(isChannelLive) ||
            state.channels[0];

        state.selectedId = primeiro.id;

        atualizarInformacoes(primeiro);
        renderEpg(primeiro);
        renderGrid();
        renderShelves();
        updateFavButton(primeiro);

        // Não inicia automaticamente o vídeo.
        // O usuário pode selecionar o canal para reproduzir.
        showPlayerState(primeiro.url ? "noUrl" : "noUrl");

        console.log(
            `${state.channels.length} canais carregados.`
        );

    } catch (error) {
        console.error("Erro ao carregar canais:", error);

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

        updateFavButton(null);
        showPlayerState("error");

        const errorMessage = $("#errorMessage");

        if (errorMessage) {
            errorMessage.textContent =
                "Não foi possível conectar ao servidor de canais.";
        }
    }
}

/* 7. EPG */

function parseStart(horario) {
    if (typeof horario !== "string") return null;

    const match = horario.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

    if (!match) return null;

    return Number(match[1]) * 60 + Number(match[2]);
}

function getSortedEpg(canal) {
    if (!Array.isArray(canal.epg)) return [];

    return canal.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            parseStart(item[0]) !== null
        )
        .map(item => [item[0], String(item[1])])
        .sort((a, b) => parseStart(a[0]) - parseStart(b[0]));
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
            // Programa atravessa a meia-noite.
            if (nowMinutes >= start || nowMinutes < end) {
                return i;
            }
        }
    }

    return -1;
}

function currentProgram(canal) {
    const epg = getSortedEpg(canal);

    if (!epg.length) {
        return "Programação não informada";
    }

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    const index = getCurrentEpgIndex(epg, minutes);

    return index >= 0
        ? epg[index][1]
        : "Programação não informada";
}

function renderEpg(canal) {
    const section = $("#epgSection");
    const timeline = $("#epgTimeline");

    if (!section || !timeline) return;

    const epg = getSortedEpg(canal);

    timeline.replaceChildren();

    if (!epg.length) {
        section.hidden = true;
        return;
    }

    const channelName = $("#epgChannelName");

    if (channelName) {
        channelName.textContent = getChannelName(canal);
    }

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    const currentIndex = getCurrentEpgIndex(epg, minutes);
    const nextIndex = currentIndex >= 0
        ? (currentIndex + 1) % epg.length
        : -1;

    epg.forEach((item, index) => {
        const [horario, programa] = item;
        const bloco = el("div", "epg__item");

        if (index === currentIndex) {
            bloco.classList.add("epg__item--current");
        } else if (index === nextIndex) {
            bloco.classList.add("epg__item--next");
        }

        bloco.appendChild(
            el("span", "epg__time", horario)
        );

        bloco.appendChild(
            el("p", "epg__name", programa)
        );

        if (index === currentIndex) {
            bloco.appendChild(
                el("span", "epg__badge", "NO AR AGORA")
            );
        }

        timeline.appendChild(bloco);
    });

    section.hidden = false;
}

/* 8. BUSCA E CATEGORIAS */

function matchesFilters(canal) {
    const category = state.category;
    const channelCategory = getChannelCategory(canal);

    let categoryValid =
        category === "inicio" ||
        category === channelCategory;

    if (category === "favoritos") {
        categoryValid = state.favorites.has(String(canal.id));
    }

    const term = state.search.trim().toLowerCase();

    const name = getChannelName(canal).toLowerCase();
    const description = getChannelDescription(canal).toLowerCase();

    const searchValid =
        !term ||
        name.includes(term) ||
        description.toLowerCase().includes(term);

    return categoryValid && searchValid;
}

/* 9. CARDS */

function channelCard(canal) {
    const id = String(canal.id);
    const nome = getChannelName(canal);
    const descricao = getChannelDescription(canal);
    const categoria = getChannelCategory(canal);
    const aoVivo = isChannelLive(canal);

    const card = el("button", "card");

    card.type = "button";
    card.dataset.id = id;
    card.setAttribute("aria-label", `${nome} — ${descricao}`);

    if (state.selectedId === id) {
        card.classList.add("is-selected");
    }

    const thumb = el("div", "card__thumb");
    const poster = resolveUrl(canal.poster);

    if (poster) {
        const imagem = el("img", "card__poster");

        imagem.src = poster;
        imagem.alt = nome;
        imagem.loading = "lazy";

        imagem.onerror = () => {
            imagem.remove();

            if (!thumb.querySelector(".card__initial")) {
                thumb.prepend(
                    el(
                        "span",
                        "card__initial",
                        nome.charAt(0).toUpperCase()
                    )
                );
            }
        };

        thumb.appendChild(imagem);
    } else {
        thumb.appendChild(
            el(
                "span",
                "card__initial",
                nome.charAt(0).toUpperCase()
            )
        );
    }

    if (aoVivo) {
        thumb.appendChild(
            el("span", "card__live", "AO VIVO")
        );
    }

    if (state.favorites.has(id)) {
        thumb.appendChild(
            el("span", "card__fav", "♥")
        );
    }

    if (state.selectedId === id) {
        thumb.appendChild(
            el("span", "card__playing", "▶")
        );
    }

    card.appendChild(thumb);

    const body = el("div", "card__body");

    body.appendChild(
        el("h3", "card__name", nome)
    );

    const categories = {
        aovivo: "Ao vivo",
        filmes: "Filmes",
        series: "Séries"
    };

    const meta = el("p", "card__meta");

    meta.appendChild(
        el("span", null, aoVivo ? "Ao vivo" : "Sob demanda")
    );

    meta.appendChild(el("span", "dot"));

    meta.appendChild(
        el("span", null, categories[categoria] || categoria)
    );

    body.appendChild(meta);

    body.appendChild(
        el("p", "card__now", `Agora: ${currentProgram(canal)}`)
    );

    card.appendChild(body);

    card.addEventListener("click", () => {
        selectChannel(id);
    });

    return card;
}

/* 10. RENDERIZAR GRADE */

function renderGrid() {
    if (!grid) return;

    grid.replaceChildren();

    const lista = state.channels.filter(matchesFilters);

    lista.forEach(canal => {
        grid.appendChild(channelCard(canal));
    });

    if (gridEmpty) {
        gridEmpty.hidden = lista.length > 0;
    }

    const gridTitle = $("#gridTitle");

    if (gridTitle) {
        gridTitle.textContent =
            CATEGORY_LABELS[state.category] || "Canais";
    }
}

/* 11. CARROSSEIS */

function renderShelves() {
    const watching = $("#watchingSection");
    const watchingRow = $("#watchingRow");

    if (watching && watchingRow) {
        const list = state.watching
            .map(getChannel)
            .filter(Boolean);

        watching.hidden = list.length === 0;
        watchingRow.replaceChildren(...list.map(channelCard));
    }

    const recommended = $("#recommendedRow");

    if (recommended) {
        const list = state.channels
            .filter(canal =>
                isChannelLive(canal) &&
                canal.id !== state.selectedId
            )
            .slice(0, 6);

        recommended.replaceChildren(...list.map(channelCard));
    }
}

/* 12. PLAYER HLS + MP4 */

function destroyHls() {
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }
}

function showPlayerState(which) {
    const ids = {
        noUrl: "#stateNoUrl",
        loading: "#stateLoading",
        noSignal: "#stateNoSignal",
        error: "#stateError"
    };

    Object.entries(ids).forEach(([key, selector]) => {
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

function isHlsSource(url) {
    try {
        const parsed = new URL(url);
        return /\.m3u8$/i.test(parsed.pathname);
    } catch {
        return /\.m3u8(?:$|[?#])/i.test(url);
    }
}

function attachSource(canal) {
    if (!video) {
        console.error("Elemento #video não encontrado no HTML.");
        return false;
    }

    destroyHls();

    const url = resolveUrl(canal.url);

    video.pause();
    video.removeAttribute("src");
    video.load();

    if (!url) {
        showPlayerState("noUrl");
        return false;
    }

    showPlayerState("loading");

    if (isHlsSource(url)) {
        // HLS nativo, quando disponível.
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
            video.load();
            return true;
        }

        // HLS.js para navegadores compatíveis.
        if (window.Hls && window.Hls.isSupported()) {
            const hls = new window.Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30
            });

            state.hls = hls;

            hls.on(window.Hls.Events.ERROR, (_event, data) => {
                if (!data.fatal) return;

                console.error("Erro fatal HLS:", data);

                if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                    showError(
                        "Falha de rede ao carregar o canal. Verifique a transmissão e o CORS."
                    );
                } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                    showError(
                        "Erro de mídia na transmissão HLS."
                    );
                } else {
                    showError(
                        "Não foi possível iniciar esta transmissão HLS."
                    );
                }
            });

            hls.on(
                window.Hls.Events.MANIFEST_PARSED,
                () => {
                    if (state.selectedId !== canal.id) return;

                    video.play().catch(error => {
                        console.warn("Reprodução automática bloqueada:", error);
                    });
                }
            );

            hls.loadSource(url);
            hls.attachMedia(video);

            return true;
        }

        showError(
            "HLS.js não está disponível ou este navegador não suporta HLS."
        );

        return false;
    }

    // MP4 ou outro formato compatível com o navegador.
    video.src = url;
    video.load();

    return true;
}

/* 13. INFORMAÇÕES DO CANAL */

function atualizarInformacoes(canal) {
    const nome = getChannelName(canal);
    const descricao = getChannelDescription(canal);
    const aoVivo = isChannelLive(canal);

    if (titulo) titulo.textContent = nome;
    if (heroTitle) heroTitle.textContent = nome;
    if (heroDesc) heroDesc.textContent = descricao;
    if (heroLiveTag) heroLiveTag.hidden = !aoVivo;

    const liveBadge = $("#liveBadge");

    if (liveBadge) {
        liveBadge.hidden = !aoVivo;
    }

    updateFavButton(canal);
}

/* 14. SELECIONAR CANAL */

function selectChannel(id) {
    const canal = getChannel(id);

    if (!canal) return;

    state.selectedId = canal.id;

    state.watching = [
        canal.id,
        ...state.watching.filter(item => item !== canal.id)
    ].slice(0, 6);

    atualizarInformacoes(canal);
    renderEpg(canal);
    renderGrid();
    renderShelves();

    const ok = attachSource(canal);

    if (ok && video && !isHlsSource(resolveUrl(canal.url))) {
        video.play().catch(error => {
            console.warn("O navegador bloqueou a reprodução:", error);
            updatePlayPauseIcon();
        });
    }
}

/* 15. CONTROLES DO PLAYER */

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
                console.warn("Não foi possível reproduzir:", error);
            });
        } else {
            video.pause();
        }
    }

    playPause?.addEventListener("click", togglePlay);

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
            "Não foi possível carregar o vídeo. Verifique a URL, o servidor e o CORS."
        );
    });

    video.addEventListener("click", togglePlay);

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
            console.warn("Erro ao alternar tela cheia:", error);
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

/* 16. CONFIGURAR FAVORITOS */

function setupFavorites() {
    $("#heroFavBtn")?.addEventListener("click", toggleFavorite);
}

/* 17. NAVEGAÇÃO E BUSCA */

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

/* 18. RELÓGIO */

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

/* 19. NAVEGAÇÃO PELO TECLADO */

function gridColumns() {
    if (!grid || !grid.children.length) return 1;

    const first = grid.children[0].getBoundingClientRect();
    const second = grid.children[1]?.getBoundingClientRect();

    if (!second || first.width <= 0) return 1;

    return Math.max(
        1,
        Math.round((second.left - first.left) / first.width)
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

/* 20. INICIALIZAÇÃO */

let initialized = false;

async function init() {
    if (initialized) return;

    initialized = true;

    startClock();
    setupPlayerControls();
    setupFavorites();
    setupNav();
    setupKeyboard();

    await carregarCanais();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}
