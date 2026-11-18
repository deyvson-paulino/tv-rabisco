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
   TV Rabisco — APLICAÇÃO PRINCIPAL
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



