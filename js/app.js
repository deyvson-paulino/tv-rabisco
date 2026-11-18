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


