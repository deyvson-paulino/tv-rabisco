
"use strict";

/* ============================================================
   TV RABISCO — APLICAÇÃO PRINCIPAL

   Funcionalidades:
   - Conexão com backend Node.js
   - Reprodução HLS e MP4
   - Favoritos com localStorage
   - Categorias
   - Busca
   - Canais recomendados
   - EPG
   - Relógio
   - Controles do player
   - Navegação por teclado
   ============================================================ */


/* ============================================================
   1. CONFIGURAÇÕES
   ============================================================ */

const BACKEND_URL = "https://nose-highways-agency-butler.trycloudflare.com";

const API_URL = `${BACKEND_URL}/api/canais`;

const FAVORITES_KEY = "tvRabiscoFavoritos";


/* ============================================================
   2. ELEMENTOS HTML
   ============================================================ */

const $ = (seletor) => document.querySelector(seletor);

const video = $("#video");
const lista = $("#channelGrid");
const titulo = $("#titulo");
const statusText = $("#status");
const busca = $("#busca");

const nav = $("#mainNav");
const gridTitle = $("#gridTitle");
const gridEmpty = $("#gridEmpty");

const recommendedRow = $("#recommendedRow");

const clockTime = $("#clockTime");
const clockDate = $("#clockDate");

const favoriteButton = $("#heroFavBtn");
const favoriteLabel = $("#heroFavLabel");

const liveBadge = $("#liveBadge");
const heroLiveTag = $("#heroLiveTag");
const heroDesc = $("#heroDesc");

const epgSection = $("#epgSection");
const epgChannelName = $("#epgChannelName");
const epgTimeline = $("#epgTimeline");

const stateNoUrl = $("#stateNoUrl");
const stateLoading = $("#stateLoading");
const stateNoSignal = $("#stateNoSignal");
const stateError = $("#stateError");
const errorMessage = $("#errorMessage");


/* ============================================================
   3. ESTADO DA APLICAÇÃO
   ============================================================ */

let canais = [];

let canalSelecionado = null;

let categoriaAtual = "inicio";

let termoBusca = "";

let hls = null;

let ultimoErro = "";

let favoritos = carregarFavoritos();


/* ============================================================
   4. FUNÇÕES AUXILIARES
   ============================================================ */

function normalizarTexto(valor) {
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}


function obterNome(canal) {
    return canal.name || canal.nome || "Canal sem nome";
}


function obterDescricao(canal) {
    return canal.desc || canal.descricao || "";
}


function obterCategoria(canal) {
    return normalizarTexto(
        canal.category || canal.categoria || "geral"
    );
}


function obterId(canal) {
    return String(canal.id);
}


function canalEstaAoVivo(canal) {
    return canal.isLive === true ||
        canal.aoVivo === true ||
        String(canal.isLive).toLowerCase() === "true" ||
        String(canal.aoVivo).toLowerCase() === "true";
}


function resolverUrl(url) {
    if (!url) return "";

    const valor = String(url).trim();

    if (/^https?:\/\//i.test(valor)) {
        return valor;
    }

    return `${BACKEND_URL}/${valor.replace(/^\/+/, "")}`;
}


function atualizarStatus(mensagem) {
    if (statusText) {
        statusText.textContent = mensagem;
    }
}


function mostrarEstado(estado) {

    const estados = [
        stateNoUrl,
        stateLoading,
        stateNoSignal,
        stateError
    ];

    estados.forEach(elemento => {
        if (elemento) elemento.hidden = true;
    });

    if (estado === "url" && stateNoUrl) {
        stateNoUrl.hidden = false;
    }

    if (estado === "loading" && stateLoading) {
        stateLoading.hidden = false;
    }

    if (estado === "signal" && stateNoSignal) {
        stateNoSignal.hidden = false;
    }

    if (estado === "error" && stateError) {
        stateError.hidden = false;
    }
}


/* ============================================================
   5. FAVORITOS
   ============================================================ */

function carregarFavoritos() {

    try {

        const dados = localStorage.getItem(FAVORITES_KEY);

        const resultado = dados ? JSON.parse(dados) : [];

        return new Set(
            Array.isArray(resultado)
                ? resultado.map(String)
                : []
        );

    } catch (erro) {

        console.warn("Não foi possível carregar favoritos:", erro);

        return new Set();

    }
}


function salvarFavoritos() {

    try {

        localStorage.setItem(
            FAVORITES_KEY,
            JSON.stringify([...favoritos])
        );

    } catch (erro) {

        console.warn("Não foi possível salvar favoritos:", erro);

    }
}


function canalFavoritado(canal) {
    return favoritos.has(obterId(canal));
}


function atualizarBotaoFavorito() {

    if (!favoriteButton || !favoriteLabel) return;

    if (!canalSelecionado) {

        favoriteButton.disabled = true;
        favoriteButton.setAttribute("aria-pressed", "false");

        favoriteLabel.textContent = "Favoritar";

        return;
    }

    favoriteButton.disabled = false;

    const ativo = canalFavoritado(canalSelecionado);

    favoriteButton.setAttribute(
        "aria-pressed",
        String(ativo)
    );

    favoriteLabel.textContent = ativo
        ? "Remover dos favoritos"
        : "Favoritar";

    favoriteButton.title = ativo
        ? "Remover dos favoritos"
        : "Adicionar aos favoritos";
}


function alternarFavorito() {

    if (!canalSelecionado) return;

    const id = obterId(canalSelecionado);

    if (favoritos.has(id)) {

        favoritos.delete(id);

    } else {

        favoritos.add(id);

    }

    salvarFavoritos();

    atualizarBotaoFavorito();

    renderizarCanais();

    renderizarRecomendados();

}


/* ============================================================
   6. PROGRAMAÇÃO E EPG
   ============================================================ */


function obterEpg(canal) {

    if (!Array.isArray(canal.epg)) {
        return [];
    }

    return canal.epg
        .map(item => {

            // Formato: ["18:00", "Jornal"]
            if (Array.isArray(item) && item.length >= 2) {
                return {
                    hora: String(item[0]),
                    programa: String(item[1])
                };
            }

            // Formato: { hora: "18:00", programa: "Jornal" }
            if (item && typeof item === "object") {
                return {
                    hora: String(item.hora || item.inicio || ""),
                    programa: String(item.programa || item.nome || item.title || "")
                };
            }

            return null;

        })
        .filter(item =>
            item &&
            /^\d{2}:\d{2}$/.test(item.hora) &&
            item.programa
        )
        .sort((a, b) => a.hora.localeCompare(b.hora));
}



function obterProgramaAtual(canal) {

    const epg = obterEpg(canal);

    if (!epg.length) {
        return canal.programa || "Programação não informada";
    }

    const agora = new Date();

    const minutosAtuais =
        agora.getHours() * 60 + agora.getMinutes();

    let programaAtual = epg[0].programa;

    for (const item of epg) {

        const [hora, minuto] = item.hora.split(":").map(Number);

        const inicio = hora * 60 + minuto;

        if (inicio <= minutosAtuais) {
            programaAtual = item.programa;
        } else {
            break;
        }

    }

    return programaAtual;
}



function renderizarEpg(canal) {

    if (!epgSection || !epgTimeline) {
        console.error("Elementos EPG não encontrados no HTML.");
        return;
    }

    epgTimeline.innerHTML = "";

    const epg = obterEpg(canal);

    console.log("Canal selecionado:", obterNome(canal));
    console.log("Dados EPG recebidos:", canal.epg);
    console.log("Programação interpretada:", epg);

    epgSection.hidden = false;

    if (epgChannelName) {
        epgChannelName.textContent = obterNome(canal);
    }

    if (!epg.length) {

        epgTimeline.textContent =
            "Nenhuma programação cadastrada para este canal.";

        return;
    }

    epg.forEach(item => {

        const bloco = document.createElement("div");
        bloco.className = "epg__item";

        const horario = document.createElement("span");
        horario.className = "epg__time";
        horario.textContent = item.hora;

        const programa = document.createElement("span");
        programa.className = "epg__program";
        programa.textContent = item.programa;

        bloco.append(horario, programa);

        epgTimeline.appendChild(bloco);

    });

}



/* ============================================================
   7. CRIAÇÃO DOS CARDS
   ============================================================ */

function criarCard(canal) {

    const elemento = document.createElement("button");

    elemento.className = "card";
    elemento.type = "button";
    elemento.dataset.id = obterId(canal);
    elemento.setAttribute("role", "listitem");

    if (
        canalSelecionado &&
        obterId(canalSelecionado) === obterId(canal)
    ) {
        elemento.classList.add("is-selected");
    }

    elemento.setAttribute(
        "aria-label",
        `${obterNome(canal)} — ${obterDescricao(canal)}`
    );


    /* MINIATURA */

    const thumb = document.createElement("div");

    thumb.className = "card__thumb";

    const poster = canal.poster || "";

    if (poster) {

        const imagem = document.createElement("img");

        imagem.className = "card__poster";

        imagem.src = resolverUrl(poster);

        imagem.alt = obterNome(canal);

        imagem.loading = "lazy";

        imagem.onerror = () => {
            imagem.remove();
        };

        thumb.appendChild(imagem);

    } else {

        const letra = document.createElement("span");

        letra.className = "card__initial";

        letra.textContent = obterNome(canal)
            .charAt(0)
            .toUpperCase();

        thumb.appendChild(letra);

    }


    /* INDICADOR AO VIVO */

    if (canalEstaAoVivo(canal)) {

        const live = document.createElement("span");

        live.className = "card__live";

        live.textContent = "AO VIVO";

        thumb.appendChild(live);

    }


    /* INDICADOR DE FAVORITO */

    if (canalFavoritado(canal)) {

        const favorito = document.createElement("span");

        favorito.className = "card__favorite";

        favorito.textContent = "♥";

        favorito.setAttribute("aria-label", "Favorito");

        thumb.appendChild(favorito);

    }


    /* INFORMAÇÕES */

    const body = document.createElement("div");

    body.className = "card__body";

    const nome = document.createElement("h3");

    nome.className = "card__name";

    nome.textContent = obterNome(canal);

    const meta = document.createElement("p");

    meta.className = "card__meta";

    const tipo = document.createElement("span");

    tipo.textContent = canalEstaAoVivo(canal)
        ? "Ao vivo"
        : "Sob demanda";

    const ponto = document.createElement("span");

    ponto.className = "dot";

    const categoria = document.createElement("span");

    categoria.textContent =
        canal.category || canal.categoria || "Geral";

    meta.append(tipo, ponto, categoria);

    const programa = document.createElement("p");

    programa.className = "card__now";

    programa.textContent = `Agora: ${obterProgramaAtual(canal)}`;

    body.append(nome, meta, programa);

    elemento.append(thumb, body);


    /* EVENTO DE SELEÇÃO */

    elemento.addEventListener("click", () => {
        reproduzir(canal);
    });

    return elemento;

}


/* ============================================================
   8. FILTROS E CATEGORIAS
   ============================================================ */

function correspondeCategoria(canal) {

    const categoria = obterCategoria(canal);

    switch (categoriaAtual) {

        case "inicio":
            return true;

        case "aovivo":
            return canalEstaAoVivo(canal) ||
                categoria === "aovivo" ||
                categoria === "ao vivo";

        case "filmes":
            return categoria.includes("filme");

        case "series":
            return categoria.includes("serie");

        case "favoritos":
            return canalFavoritado(canal);

        default:
            return true;

    }

}


function correspondeBusca(canal) {

    if (!termoBusca) return true;

    const nome = normalizarTexto(obterNome(canal));

    const descricao = normalizarTexto(obterDescricao(canal));

    const categoria = normalizarTexto(
        canal.category || canal.categoria || ""
    );

    return nome.includes(termoBusca) ||
        descricao.includes(termoBusca) ||
        categoria.includes(termoBusca);

}


function obterCanaisFiltrados() {

    return canais.filter(canal =>
        correspondeCategoria(canal) &&
        correspondeBusca(canal)
    );

}


function atualizarTituloGrade() {

    if (!gridTitle) return;

    const titulos = {
        inicio: "Canais TV Rabisco",
        aovivo: "Canais ao vivo",
        filmes: "Filmes",
        series: "Séries",
        favoritos: "Meus favoritos"
    };

    gridTitle.textContent =
        titulos[categoriaAtual] || "Canais TV Rabisco";

}


function atualizarMenu() {

    if (!nav) return;

    nav.querySelectorAll("[data-category]").forEach(botao => {

        const ativo =
            botao.dataset.category === categoriaAtual;

        botao.classList.toggle("is-active", ativo);

        if (ativo) {
            botao.setAttribute("aria-current", "page");
        } else {
            botao.removeAttribute("aria-current");
        }

    });

}


function renderizarCanais() {

    if (!lista) return;

    lista.innerHTML = "";

    const filtrados = obterCanaisFiltrados();

    atualizarTituloGrade();

    atualizarMenu();

    if (gridEmpty) {
        gridEmpty.hidden = filtrados.length > 0;
    }

    filtrados.forEach(canal => {

        lista.appendChild(criarCard(canal));

    });

}


/* ============================================================
   9. CANAIS RECOMENDADOS
   ============================================================ */

function renderizarRecomendados() {

    if (!recommendedRow) return;

    recommendedRow.innerHTML = "";

    if (!canais.length) return;

    const recomendados = canais
        .filter(canal =>
            canal.url &&
            (!canalSelecionado ||
                obterId(canal) !== obterId(canalSelecionado))
        )
        .sort((a, b) =>
            Number(canalEstaAoVivo(b)) -
            Number(canalEstaAoVivo(a))
        )
        .slice(0, 8);

    recomendados.forEach(canal => {

        recommendedRow.appendChild(criarCard(canal));

    });

}


/* ============================================================
   10. PLAYER HLS E MP4
   ============================================================ */

function destruirHls() {

    if (hls) {

        hls.destroy();

        hls = null;

    }

}


function reproduzirVideo() {

    if (!video) return;

    const promessa = video.play();

    if (promessa && typeof promessa.catch === "function") {

        promessa.catch(erro => {

            console.warn("Reprodução aguardando interação:", erro);

        });

    }

}


function conectarVideo(canal) {

    destruirHls();

    video.pause();

    video.removeAttribute("src");

    video.load();

    const url = resolverUrl(canal.url);

    if (!url) {

        mostrarEstado("url");

        atualizarStatus("Canal sem endereço de transmissão");

        return;

    }

    mostrarEstado("loading");

    ultimoErro = "";


    const ehHls = /\.m3u8($|\?)/i.test(url);


    /* HLS NATIVO */

    if (
        ehHls &&
        video.canPlayType("application/vnd.apple.mpegurl")
    ) {

        video.src = url;

        video.load();

        reproduzirVideo();

        return;

    }


    /* HLS.JS */

    if (ehHls && window.Hls && Hls.isSupported()) {

        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30
        });

        hls.loadSource(url);

        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {

            mostrarEstado(null);

            reproduzirVideo();

        });

        hls.on(Hls.Events.ERROR, (event, data) => {

            console.error("Erro HLS:", data);

            if (data.fatal) {

                ultimoErro = "Falha na transmissão HLS.";

                mostrarErro(ultimoErro);

            }

        });

        return;

    }


    /* MP4 OU OUTROS FORMATOS NATIVOS */

    if (!ehHls) {

        video.src = url;

        video.load();

        reproduzirVideo();

        return;

    }


    mostrarErro(
        "Este navegador não oferece suporte à reprodução HLS."
    );

}


function mostrarErro(mensagem) {

    ultimoErro = mensagem;

    if (errorMessage) {
        errorMessage.textContent = mensagem;
    }

    mostrarEstado("error");

    atualizarStatus("Erro na transmissão");

}


/* ============================================================
   11. SELECIONAR E REPRODUZIR CANAL
   ============================================================ */

function reproduzir(canal) {

    if (!canal || !video) return;

    canalSelecionado = canal;

    if (titulo) {
        titulo.textContent = obterNome(canal);
    }

    if (heroDesc) {
        heroDesc.textContent = obterDescricao(canal);
    }

    if (liveBadge) {
        liveBadge.hidden = !canalEstaAoVivo(canal);
    }

    if (heroLiveTag) {
        heroLiveTag.hidden = !canalEstaAoVivo(canal);
    }

    atualizarBotaoFavorito();

    renderizarEpg(canal);

    renderizarCanais();

    renderizarRecomendados();

    atualizarStatus(`Reproduzindo: ${obterNome(canal)}`);

    conectarVideo(canal);

}


/* ============================================================
   12. RELÓGIO
   ============================================================ */

function atualizarRelogio() {

    const agora = new Date();

    if (clockTime) {

        clockTime.textContent = agora.toLocaleTimeString(
            "pt-BR",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );

    }

    if (clockDate) {

        clockDate.textContent = agora.toLocaleDateString(
            "pt-BR",
            {
                weekday: "short",
                day: "2-digit",
                month: "short"
            }
        );

    }

}


/* ============================================================
   13. CONTROLES DO PLAYER
   ============================================================ */

function configurarControles() {

    if (!video) return;

    const playPause = $("#playPauseBtn");
    const muteButton = $("#muteBtn");
    const volumeSlider = $("#volumeSlider");
    const fullscreenButton = $("#fullscreenBtn");
    const speedSelect = $("#speedSelect");
    const timeLabel = $("#timeLabel");

    const retryButton = $("#retryBtn");
    const errorRetryButton = $("#errorRetryBtn");


    /* PLAY / PAUSE */

    if (playPause) {

        playPause.addEventListener("click", () => {

            if (video.paused) {
                reproduzirVideo();
            } else {
                video.pause();
            }

        });

    }


    /* ATUALIZA ÍCONE PLAY/PAUSE */

    video.addEventListener("play", () => {

        mostrarEstado(null);

        const playIcon = $(".pbtn__icon--play");
        const pauseIcon = $(".pbtn__icon--pause");

        if (playIcon) playIcon.style.display = "none";

        if (pauseIcon) pauseIcon.style.display = "block";

    });


    video.addEventListener("pause", () => {

        const playIcon = $(".pbtn__icon--play");
        const pauseIcon = $(".pbtn__icon--pause");

        if (playIcon) playIcon.style.display = "block";

        if (pauseIcon) pauseIcon.style.display = "none";

    });


    /* VOLUME INICIAL */

    if (volumeSlider) {

        video.volume = Number(volumeSlider.value) / 100;

        volumeSlider.addEventListener("input", () => {

            video.volume = Number(volumeSlider.value) / 100;

            video.muted = video.volume === 0;

            atualizarBotaoMute();

        });

    }


    /* SILENCIAR */

    if (muteButton) {

        muteButton.addEventListener("click", () => {

            video.muted = !video.muted;

            atualizarBotaoMute();

        });

    }


    function atualizarBotaoMute() {

        if (!muteButton) return;

        muteButton.setAttribute(
            "aria-label",
            video.muted ? "Ativar som" : "Silenciar"
        );

        muteButton.title = video.muted
            ? "Ativar som (M)"
            : "Silenciar (M)";

    }


    /* VELOCIDADE */

    if (speedSelect) {

        speedSelect.addEventListener("change", () => {

            video.playbackRate = Number(speedSelect.value);

        });

    }


    /* TELA CHEIA */

    if (fullscreenButton) {

        fullscreenButton.addEventListener("click", alternarTelaCheia);

    }


    async function alternarTelaCheia() {

        const player = $("#playerShell");

        if (!player) return;

        try {

            if (!document.fullscreenElement) {

                await player.requestFullscreen();

            } else {

                await document.exitFullscreen();

            }

        } catch (erro) {

            console.warn("Tela cheia indisponível:", erro);

        }

    }


    /* TEMPO DO VÍDEO */

    video.addEventListener("timeupdate", atualizarTempo);

    video.addEventListener("loadedmetadata", atualizarTempo);


    function formatarTempo(segundos) {

        if (!Number.isFinite(segundos)) return "--:--";

        const minutos = Math.floor(segundos / 60);

        const segundosRestantes = Math.floor(segundos % 60);

        return `${String(minutos).padStart(2, "0")}:${String(segundosRestantes).padStart(2, "0")}`;

    }


    function atualizarTempo() {

        if (!timeLabel) return;

        if (canalSelecionado && canalEstaAoVivo(canalSelecionado)) {

            timeLabel.textContent = "AO VIVO";

            return;

        }

        timeLabel.textContent =
            `${formatarTempo(video.currentTime)} / ${formatarTempo(video.duration)}`;

    }


    /* ESTADOS DE CARREGAMENTO */

    video.addEventListener("waiting", () => {
        mostrarEstado("loading");
    });

    video.addEventListener("playing", () => {
        mostrarEstado(null);
    });

    video.addEventListener("error", () => {

        if (canalSelecionado) {

            mostrarErro(
                "Não foi possível carregar o vídeo. Verifique a transmissão."
            );

        }

    });


    /* TENTAR NOVAMENTE */

    function tentarNovamente() {

        if (!canalSelecionado) return;

        conectarVideo(canalSelecionado);

    }

    if (retryButton) {
        retryButton.addEventListener("click", tentarNovamente);
    }

    if (errorRetryButton) {
        errorRetryButton.addEventListener("click", tentarNovamente);
    }

}


/* ============================================================
   14. EVENTOS DE BUSCA
   ============================================================ */

function configurarBusca() {

    if (!busca) return;

    busca.addEventListener("input", () => {

        termoBusca = normalizarTexto(busca.value);

        renderizarCanais();

    });

}


/* ============================================================
   15. EVENTOS DO MENU
   ============================================================ */

function configurarMenu() {

    if (!nav) return;

    nav.addEventListener("click", evento => {

        const botao = evento.target.closest("[data-category]");

        if (!botao || !nav.contains(botao)) return;

        const categoria = botao.dataset.category;

        const permitidas = [
            "inicio",
            "aovivo",
            "filmes",
            "series",
            "favoritos"
        ];

        if (!permitidas.includes(categoria)) return;

        categoriaAtual = categoria;

        renderizarCanais();

    });

}


/* ============================================================
   16. EVENTOS DOS FAVORITOS
   ============================================================ */

function configurarFavoritos() {

    if (!favoriteButton) return;

    favoriteButton.addEventListener("click", alternarFavorito);

}


/* ============================================================
   17. NAVEGAÇÃO POR TECLADO
   ============================================================ */

function configurarTeclado() {

    document.addEventListener("keydown", evento => {

        const elemento = document.activeElement;

        const digitando =
            elemento &&
            (
                elemento.tagName === "INPUT" ||
                elemento.tagName === "TEXTAREA" ||
                elemento.tagName === "SELECT" ||
                elemento.isContentEditable
            );

        if (digitando) return;

        if (!video) return;


        /* ESPAÇO: PLAY / PAUSE */

        if (evento.code === "Space") {

            evento.preventDefault();

            if (video.paused) {
                reproduzirVideo();
            } else {
                video.pause();
            }

        }


        /* M: MUDO */

        if (evento.key.toLowerCase() === "m") {

            video.muted = !video.muted;

        }


        /* F: TELA CHEIA */

        if (evento.key.toLowerCase() === "f") {

            const player = $("#playerShell");

            if (player && !document.fullscreenElement) {
                player.requestFullscreen().catch(() => {});
            } else if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }

        }

    });

}


/* ============================================================
   18. CARREGAMENTO DOS CANAIS
   ============================================================ */

async function carregarCanais() {

    atualizarStatus("Conectando à TV Rabisco...");

    try {

        const resposta = await fetch(API_URL, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            cache: "no-store"
        });

        if (!resposta.ok) {

            throw new Error(`Erro HTTP ${resposta.status}`);

        }

        const dados = await resposta.json();

        const listaRecebida = Array.isArray(dados)
            ? dados
            : dados.channels || dados.canais || [];

        if (!Array.isArray(listaRecebida)) {

            throw new Error("Formato inválido da resposta do backend.");

        }

        canais = listaRecebida
            .filter(canal => canal && typeof canal === "object")
            .map((canal, indice) => ({
                ...canal,
                id: String(canal.id ?? `canal-${indice + 1}`)
            }));

        atualizarStatus(
            `TV Rabisco on-line — ${canais.length} canais`
        );

        renderizarCanais();

        renderizarRecomendados();


        /* SELECIONA O PRIMEIRO CANAL */

        if (canais.length > 0) {

            const primeiroCanal =
                canais.find(canal => canal.url) || canais[0];

            reproduzir(primeiroCanal);

        } else {

            if (titulo) {
                titulo.textContent = "Nenhum canal disponível";
            }

            mostrarEstado("url");

        }

    } catch (erro) {

        console.error("Falha ao carregar canais:", erro);

        atualizarStatus("TV Rabisco offline");

        if (lista) {

            lista.innerHTML = "";

            const mensagem = document.createElement("p");

            mensagem.textContent =
                "Não foi possível carregar os canais do servidor.";

            lista.appendChild(mensagem);

        }

        if (gridEmpty) {
            gridEmpty.hidden = true;
        }

        mostrarErro(
            "Não foi possível conectar ao backend ou carregar os canais."
        );

    }

}


/* ============================================================
   19. PERFIL
   ============================================================ */

function configurarPerfil() {

    const profileButton = $("#profileBtn");

    if (!profileButton) return;

    profileButton.addEventListener("click", () => {

        atualizarStatus("Perfil de usuário não configurado.");

    });

}


/* ============================================================
   20. INICIALIZAÇÃO
   ============================================================ */

function iniciarAplicacao() {

    configurarControles();

    configurarBusca();

    configurarMenu();

    configurarFavoritos();

    configurarTeclado();

    configurarPerfil();

    atualizarRelogio();

    setInterval(atualizarRelogio, 1000);

    carregarCanais();

}


if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", iniciarAplicacao);

} else {

    iniciarAplicacao();

}
