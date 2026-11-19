

"use strict";

/* ============================================================
   TV RABISCO / NOVATV
   Backend Node.js + channels.json
   Player HLS + MP4
   Favoritos + EPG + Busca + Navegação
   ============================================================ */

/* ============================================================
   1. CONFIGURAÇÃO
   ============================================================ */

const BACKEND_URL = "https://nose-highways-agency-butler.trycloudflare.com";

// Para desenvolvimento local:
// const BACKEND_URL = "http://localhost:3000";

const API_URL = `${BACKEND_URL}/api/canais`;

/* ============================================================
   2. ELEMENTOS HTML
   ============================================================ */

const $ = (seletor) => document.querySelector(seletor);

const video = $("#video");
const grid = $("#channelGrid");

const statusEl = $("#status");
const titulo = $("#titulo");

const heroTitle = $("#heroTitle");
const heroDesc = $("#heroDesc");
const heroLiveTag = $("#heroLiveTag");

const busca = $("#searchInput") || $("#busca");

const gridEmpty = $("#gridEmpty");

/* ============================================================
   3. ESTADO DA APLICAÇÃO
   ============================================================ */

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

/* ============================================================
   4. FUNÇÕES AUXILIARES
   ============================================================ */

function el(tag, className, text) {

    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    if (text !== undefined && text !== null) {
        node.textContent = text;
    }

    return node;
}

function getChannel(id) {

    return state.channels.find(
        canal => String(canal.id) === String(id)
    ) || null;

}

function getChannelName(canal) {

    return canal.name || canal.nome || "Canal sem nome";

}

function getChannelDescription(canal) {

    return canal.desc || canal.descricao || "";

}

function getChannelCategory(canal) {

    return canal.category || canal.categoria || "geral";

}

function isChannelLive(canal) {

    return canal.isLive ?? canal.aoVivo ?? false;

}

function resolveUrl(url) {

    if (!url) return "";

    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    return `${BACKEND_URL}/${url.replace(/^\/+/, "")}`;

}

/* ============================================================
   5. FAVORITOS
   ============================================================ */

function loadFavorites() {

    try {

        const favoritos = JSON.parse(
            localStorage.getItem("novatv.favorites") || "[]"
        );

        return Array.isArray(favoritos) ? favoritos : [];

    } catch (erro) {

        console.warn("Erro ao carregar favoritos:", erro);

        return [];

    }

}

function saveFavorites() {

    try {

        localStorage.setItem(
            "novatv.favorites",
            JSON.stringify([...state.favorites])
        );

    } catch (erro) {

        console.warn("Não foi possível salvar favoritos:", erro);

    }

}

function updateFavButton(canal) {

    const botao = $("#heroFavBtn");
    const label = $("#heroFavLabel");

    if (!botao || !canal) return;

    const favorito = state.favorites.has(canal.id);

    botao.setAttribute("aria-pressed", String(favorito));

    if (label) {
        label.textContent = favorito
            ? "Nos favoritos"
            : "Favoritar";
    }

}

/* ============================================================
   6. CARREGAR CANAIS DO BACKEND
   ============================================================ */

async function carregarCanais() {

    try {

        if (statusEl) {
            statusEl.textContent = "Conectando à TV...";
        }

        const resposta = await fetch(API_URL, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            cache: "no-store"
        });

        if (!resposta.ok) {

            throw new Error(
                `Erro HTTP: ${resposta.status}`
            );

        }

        const dados = await resposta.json();

        // Aceita tanto um array quanto { channels: [...] }
        state.channels = Array.isArray(dados)
            ? dados
            : Array.isArray(dados.channels)
                ? dados.channels
                : [];

        if (!state.channels.length) {
            throw new Error("Nenhum canal encontrado no JSON.");
        }

        renderGrid();
        renderShelves();

        if (statusEl) {
            statusEl.textContent = "A TV Rabisco está on-line";
        }

        // Seleciona o primeiro canal ao vivo
        const primeiro = state.channels.find(
            canal => isChannelLive(canal)
        ) || state.channels[0];

        if (primeiro) {

            state.selectedId = primeiro.id;

            atualizarInformacoes(primeiro);

            renderEpg(primeiro);

            renderGrid();
            renderShelves();

            showPlayerState("noUrl");

        }

        console.log(
            `${state.channels.length} canais carregados com sucesso.`
        );

    } catch (erro) {

        console.error("Erro ao carregar canais:", erro);

        if (statusEl) {
            statusEl.textContent = "TV Rabisco offline";
        }

        if (grid) {

            grid.replaceChildren();

            const mensagem = el(
                "p",
                "lista-vazia",
                "Não foi possível carregar os canais. Verifique o backend."
            );

            grid.appendChild(mensagem);

        }

    }

}

/* ============================================================
   7. PROGRAMAÇÃO EPG
   ============================================================ */

function parseStart(horario) {

    const [h, m] = horario.split(":").map(Number);

    return h * 60 + m;

}

function getSortedEpg(canal) {

    if (!Array.isArray(canal.epg)) {
        return [];
    }

    return canal.epg
        .filter(item =>
            Array.isArray(item) &&
            item.length >= 2 &&
            /^\d{2}:\d{2}$/.test(item[0])
        )
        .slice()
        .sort((a, b) =>
            parseStart(a[0]) - parseStart(b[0])
        );

}

function currentProgram(canal) {

    const epg = getSortedEpg(canal);

    if (!epg.length) {
        return "Programação não informada";
    }

    const agora = new Date();

    const minutosAtuais =
        agora.getHours() * 60 + agora.getMinutes();

    let programaAtual = null;

    for (let i = 0; i < epg.length; i++) {

        const inicio = parseStart(epg[i][0]);

        const fim = i + 1 < epg.length
            ? parseStart(epg[i + 1][0])
            : 24 * 60;

        if (
            minutosAtuais >= inicio &&
            minutosAtuais < fim
        ) {

            programaAtual = epg[i][1];

            break;

        }

    }

    // Se ainda não começou o primeiro programa do dia
    return programaAtual || epg[0][1];

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

    const nome = $("#epgChannelName");

    if (nome) {
        nome.textContent = getChannelName(canal);
    }

    const programaAtual = currentProgram(canal);

    const indiceAtual = epg.findIndex(
        item => item[1] === programaAtual
    );

    const minutosAtuais =
        new Date().getHours() * 60 +
        new Date().getMinutes();

    epg.forEach((item, indice) => {

        const [horario, programa] = item;

        const bloco = el("div", "epg__item");

        const inicio = parseStart(horario);

        if (
            indice === indiceAtual &&
            minutosAtuais >= inicio
        ) {

            bloco.classList.add("epg__item--current");

        } else if (indice === indiceAtual + 1) {

            bloco.classList.add("epg__item--next");

        }

        bloco.appendChild(
            el("span", "epg__time", horario)
        );

        bloco.appendChild(
            el("p", "epg__name", programa)
        );

        if (
            indice === indiceAtual &&
            minutosAtuais >= inicio
        ) {

            bloco.appendChild(
                el("span", "epg__badge", "NO AR AGORA")
            );

        }

        timeline.appendChild(bloco);

    });

    section.hidden = false;

}

/* ============================================================
   8. FILTROS DE CATEGORIA E BUSCA
   ============================================================ */

function matchesFilters(canal) {

    const categoria = state.category;

    const categoriaCanal = getChannelCategory(canal);

    let categoriaValida =
        categoria === "inicio" ||
        categoria === categoriaCanal;

    if (categoria === "favoritos") {

        categoriaValida = state.favorites.has(canal.id);

    }

    const termo = state.search
        .trim()
        .toLowerCase();

    const nome = getChannelName(canal).toLowerCase();

    const descricao = getChannelDescription(canal).toLowerCase();

    const buscaValida =
        !termo ||
        nome.includes(termo) ||
        descricao.includes(termo);

    return categoriaValida && buscaValida;

}

/* ============================================================
   9. CRIAR CARDS DOS CANAIS
   ============================================================ */

function channelCard(canal) {

    const nome = getChannelName(canal);

    const descricao = getChannelDescription(canal);

    const categoria = getChannelCategory(canal);

    const aoVivo = isChannelLive(canal);

    const poster = canal.poster || "";

    const card = el("button", "card");

    card.type = "button";

    card.dataset.id = canal.id;

    card.setAttribute("role", "listitem");

    card.setAttribute(
        "aria-label",
        `${nome} — ${descricao}`
    );

    if (state.selectedId === canal.id) {
        card.classList.add("is-selected");
    }

    // Miniatura
    const thumb = el("div", "card__thumb");

    if (poster) {

        const imagem = el("img", "card__poster");

        imagem.src = resolveUrl(poster);

        imagem.alt = nome;

        imagem.loading = "lazy";

        imagem.onerror = () => {

            imagem.remove();

            const inicial = el(
                "span",
                "card__initial",
                nome.charAt(0).toUpperCase()
            );

            thumb.prepend(inicial);

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

    // Selo AO VIVO
    if (aoVivo) {

        thumb.appendChild(
            el("span", "card__live", "AO VIVO")
        );

    }

    // Favorito
    if (state.favorites.has(canal.id)) {

        thumb.appendChild(
            el("span", "card__fav", "♥")
        );

    }

    // Canal selecionado
    if (state.selectedId === canal.id) {

        thumb.appendChild(
            el("span", "card__playing", "▶")
        );

    }

    card.appendChild(thumb);

    // Informações
    const body = el("div", "card__body");

    body.appendChild(
        el("h3", "card__name", nome)
    );

    const categorias = {
        aovivo: "Ao vivo",
        filmes: "Filmes",
        series: "Séries"
    };

    const meta = el("p", "card__meta");

    meta.appendChild(
        el(
            "span",
            null,
            aoVivo ? "Ao vivo" : "Sob demanda"
        )
    );

    meta.appendChild(
        el("span", "dot")
    );

    meta.appendChild(
        el(
            "span",
            null,
            categorias[categoria] || categoria
        )
    );

    body.appendChild(meta);

    // Programa atual
    body.appendChild(
        el(
            "p",
            "card__now",
            `Agora: ${currentProgram(canal)}`
        )
    );

    card.appendChild(body);

    card.addEventListener("click", () => {

        selectChannel(canal.id);

    });

    return card;

}

/* ============================================================
   10. RENDERIZAR GRADE
   ============================================================ */

function renderGrid() {

    if (!grid) return;

    grid.replaceChildren();

    const lista = state.channels.filter(
        matchesFilters
    );

    lista.forEach(canal => {

        grid.appendChild(
            channelCard(canal)
        );

    });

    if (gridEmpty) {
        gridEmpty.hidden = lista.length > 0;
    }

    const tituloGrade = $("#gridTitle");

    if (tituloGrade) {

        tituloGrade.textContent =
            CATEGORY_LABELS[state.category] || "Canais";

    }

}

/* ============================================================
   11. CARROSSEIS
   ============================================================ */

function renderShelves() {

    const watching = $("#watchingSection");
    const watchingRow = $("#watchingRow");

    if (watching && watchingRow) {

        const lista = state.watching
            .map(getChannel)
            .filter(Boolean);

        watching.hidden = lista.length === 0;

        watchingRow.replaceChildren(
            ...lista.map(channelCard)
        );

    }

    const recommended = $("#recommendedRow");

    if (recommended) {

        const lista = state.channels
            .filter(canal =>
                isChannelLive(canal) &&
                canal.id !== state.selectedId
            )
            .slice(0, 6);

        recommended.replaceChildren(
            ...lista.map(channelCard)
        );

    }

}

/* ============================================================
   12. PLAYER HLS + MP4
   ============================================================ */

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

function showError(mensagem) {

    destroyHls();

    const texto = $("#errorMessage");

    if (texto) {
        texto.textContent = mensagem;
    }

    showPlayerState("error");

}

function isHlsSource(url) {

    return /\.m3u8($|\?)/i.test(url);

}

function attachSource(canal) {

    destroyHls();

    if (!video) return false;

    const url = resolveUrl(canal.url);

    if (
        !url ||
        url.includes("COLE_A_URL_DO_SEU_STREAM_AQUI")
    ) {

        video.pause();

        video.removeAttribute("src");

        video.load();

        showPlayerState("noUrl");

        return false;

    }

    showPlayerState("loading");

    video.pause();

    video.removeAttribute("src");

    video.load();

    if (isHlsSource(url)) {

        // HLS nativo
        if (
            video.canPlayType(
                "application/vnd.apple.mpegurl"
            )
        ) {

            video.src = url;

            video.load();

            return true;

        }

        // HLS com hls.js
        if (
            window.Hls &&
            window.Hls.isSupported()
        ) {

            const hls = new window.Hls({
                enableWorker: true,
                lowLatencyMode: true
            });

            state.hls = hls;

            hls.loadSource(url);

            hls.attachMedia(video);

            hls.on(
                window.Hls.Events.MANIFEST_PARSED,
                () => {

                    video.play().catch(() => {});

                }
            );

            hls.on(
                window.Hls.Events.ERROR,
                (_evento, dados) => {

                    if (!dados.fatal) return;

                    if (
                        dados.type ===
                        window.Hls.ErrorTypes.NETWORK_ERROR
                    ) {

                        showError(
                            "Falha de rede. Verifique o servidor e o CORS."
                        );

                    } else if (
                        dados.type ===
                        window.Hls.ErrorTypes.MEDIA_ERROR
                    ) {

                        showError(
                            "Erro de mídia na transmissão HLS."
                        );

                    } else {

                        showError(
                            "Não foi possível iniciar o HLS."
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

    // MP4 nativo
    video.src = url;

    video.load();

    return true;

}

/* ============================================================
   13. INFORMAÇÕES DO CANAL
   ============================================================ */

function atualizarInformacoes(canal) {

    const nome = getChannelName(canal);

    const descricao = getChannelDescription(canal);

    const aoVivo = isChannelLive(canal);

    if (titulo) {
        titulo.textContent = nome;
    }

    if (heroTitle) {
        heroTitle.textContent = nome;
    }

    if (heroDesc) {
        heroDesc.textContent = descricao;
    }

    if (heroLiveTag) {
        heroLiveTag.hidden = !aoVivo;
    }

    const liveBadge = $("#liveBadge");

    if (liveBadge) {
        liveBadge.hidden = !aoVivo;
    }

    updateFavButton(canal);

}

/* ============================================================
   14. SELECIONAR E REPRODUZIR CANAL
   ============================================================ */

function selectChannel(id) {

    const canal = getChannel(id);

    if (!canal) return;

    state.selectedId = canal.id;

    // Histórico da sessão
    state.watching = [
        canal.id,
        ...state.watching.filter(
            item => item !== canal.id
        )
    ].slice(0, 6);

    atualizarInformacoes(canal);

    renderEpg(canal);

    renderGrid();

    renderShelves();

    const ok = attachSource(canal);

    if (ok && video) {

        video.muted = true;

        const tentativa = video.play();

        if (tentativa && typeof tentativa.then === "function") {

            tentativa
                .then(() => {

                    video.muted = false;

                })
                .catch(() => {

                    video.muted = false;

                    updatePlayPauseIcon();

                });

        }

    }

}

/* ============================================================
   15. CONTROLES DO PLAYER
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

            video.play().catch(() => {});

        } else {

            video.pause();

        }

    }

    playPause?.addEventListener("click", togglePlay);

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
            "Não foi possível carregar o vídeo. Verifique a URL, o servidor e o CORS."
        );

    });

    video.addEventListener("click", togglePlay);

    video.addEventListener("timeupdate", () => {

        const label = $("#timeLabel");

        if (!label) return;

        if (
            video.duration &&
            Number.isFinite(video.duration)
        ) {

            const formatar = segundos => {

                const minutos = Math.floor(segundos / 60);

                const segundosRestantes = Math.floor(
                    segundos % 60
                );

                return (
                    String(minutos).padStart(2, "0") +
                    ":" +
                    String(segundosRestantes).padStart(2, "0")
                );

            };

            label.textContent =
                `${formatar(video.currentTime)} / ${formatar(video.duration)}`;

        } else {

            label.textContent = "AO VIVO";

        }

    });

    mute?.addEventListener("click", () => {

        video.muted = !video.muted;

        mute.style.opacity = video.muted ? "0.5" : "1";

    });

    volume?.addEventListener("input", () => {

        video.volume = Number(volume.value) / 100;

        video.muted = video.volume === 0;

    });

    fullscreen?.addEventListener("click", () => {

        const shell = $("#playerShell");

        if (!shell) return;

        if (document.fullscreenElement) {

            document.exitFullscreen?.();

        } else {

            shell.requestFullscreen?.();

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
   16. CONFIGURAÇÃO DOS FAVORITOS
   ============================================================ */

function setupFavorites() {

    $("#heroFavBtn")?.addEventListener("click", () => {

        if (!state.selectedId) return;

        const id = state.selectedId;

        if (state.favorites.has(id)) {

            state.favorites.delete(id);

        } else {

            state.favorites.add(id);

        }

        saveFavorites();

        const canal = getChannel(id);

        if (canal) {
            updateFavButton(canal);
        }

        renderGrid();

        renderShelves();

    });

}

/* ============================================================
   17. NAVEGAÇÃO E BUSCA
   ============================================================ */

function setupNav() {

    $("#mainNav")?.addEventListener("click", evento => {

        const botao = evento.target.closest(
            ".topnav__item"
        );

        if (!botao) return;

        state.category = botao.dataset.category || "inicio";

        document.querySelectorAll(
            ".topnav__item"
        ).forEach(item => {

            const ativo = item === botao;

            item.classList.toggle(
                "is-active",
                ativo
            );

            if (ativo) {

                item.setAttribute(
                    "aria-current",
                    "page"
                );

            } else {

                item.removeAttribute("aria-current");

            }

        });

        renderGrid();

    });

    busca?.addEventListener("input", evento => {

        state.search = evento.target.value || "";

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

    const formatoData = new Intl.DateTimeFormat(
        "pt-BR",
        {
            weekday: "long",
            day: "numeric",
            month: "short"
        }
    );

    function atualizarRelogio() {

        const agora = new Date();

        if (time) {

            time.textContent =
                agora.toLocaleTimeString(
                    "pt-BR",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                );

        }

        if (date) {

            date.textContent = formatoData.format(agora);

        }

    }

    atualizarRelogio();

    setInterval(atualizarRelogio, 30000);

}

/* ============================================================
   19. NAVEGAÇÃO PELO TECLADO
   ============================================================ */

function gridColumns() {

    if (!grid || !grid.children.length) return 1;

    const primeiro = grid.children[0]
        .getBoundingClientRect();

    const segundo = grid.children[1]
        ?.getBoundingClientRect();

    if (!segundo || primeiro.width <= 0) return 1;

    return Math.max(
        1,
        Math.round(
            (segundo.left - primeiro.left) / primeiro.width
        )
    );

}

function setupKeyboard() {

    document.addEventListener("keydown", evento => {

        const ativo = document.activeElement;

        const digitando = [
            "INPUT",
            "TEXTAREA",
            "SELECT"
        ].includes(ativo?.tagName);

        if (digitando) return;

        if (evento.key === " ") {

            if (ativo?.classList.contains("card")) return;

            evento.preventDefault();

            $("#playPauseBtn")?.click();

            return;

        }

        switch (evento.key) {

            case "ArrowRight":
            case "ArrowLeft":
            case "ArrowUp":
            case "ArrowDown": {

                const cards = [
                    ...document.querySelectorAll(
                        "#channelGrid .card"
                    )
                ];

                if (!cards.length) return;

                evento.preventDefault();

                const indice = cards.indexOf(ativo);

                const colunas = gridColumns();

                let proximo = indice;

                if (indice === -1) {

                    proximo = 0;

                } else if (evento.key === "ArrowRight") {

                    proximo = Math.min(
                        indice + 1,
                        cards.length - 1
                    );

                } else if (evento.key === "ArrowLeft") {

                    proximo = Math.max(indice - 1, 0);

                } else if (evento.key === "ArrowDown") {

                    proximo = Math.min(
                        indice + colunas,
                        cards.length - 1
                    );

                } else if (evento.key === "ArrowUp") {

                    proximo = Math.max(
                        indice - colunas,
                        0
                    );

                }

                cards[proximo].focus();

                cards[proximo].scrollIntoView({
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

    startClock();

    setupPlayerControls();

    setupFavorites();

    setupNav();

    setupKeyboard();

    // Carrega os canais do channels.json pelo backend
    await carregarCanais();

}

// Inicialização segura
if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        init,
        { once: true }
    );

} else {

    init();

}
