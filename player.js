
/*
 * IMPORTANTE:
 * Durante o desenvolvimento, o backend é localhost.
 * Para o GitHub Pages, altere BACKEND_URL
 * para o endereço público do seu backend.
 */

const BACKEND_URL = "https://nose-highways-agency-butler.trycloudflare.com";
//"http://localhost:3000";

const video = document.getElementById("video");
const lista = document.getElementById("channelGrid");//lista
const titulo = document.getElementById("titulo");
const status = document.getElementById("status");
const busca = document.getElementById("busca");

let canais = [];

async function carregarCanais() {

    try {

        status.textContent = "Conectando a TV...";

        const resposta = await fetch(
            `${BACKEND_URL}/api/canais`
        );

        if (!resposta.ok) {
            throw new Error("Erro HTTP " + resposta.status);
        }

        canais = await resposta.json();

        renderizarCanais(canais);

        status.textContent = "A TV Rabisco está on-line";

    } catch (erro) {

        status.textContent = "TV Rabisco offline";

        console.error("Falha ao conectar:", erro);

        lista.innerHTML = `
            <p>
                Não foi possível acessar o backend.
                Verifique se o Node.js está rodando.
            </p>
        `;
    }
}

//função gpt nova - interação channels.json

function renderizarCanais(items) {

    lista.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
        lista.textContent = "Nenhum canal encontrado.";
        return;
    }

    items.forEach(canal => {

        // Aceita o formato novo e o antigo
        const nome = canal.name || canal.nome || "Canal sem nome";

        const descricao = canal.desc || canal.descricao || "";

        const aoVivo = canal.isLive ?? canal.aoVivo ?? false;

        const categoria = canal.category || canal.categoria || "Geral";

        const poster = canal.poster || "";

        // Obtém a programação
        let programa = canal.programa || "Programação não informada";

        if (Array.isArray(canal.epg) && canal.epg.length > 0) {

            const agora = new Date();

            const minutosAtuais =
                agora.getHours() * 60 + agora.getMinutes();

            const epg = canal.epg
                .filter(item =>
                    Array.isArray(item) &&
                    item.length >= 2 &&
                    /^\d{2}:\d{2}$/.test(item[0])
                )
                .sort((a, b) => {

                    const [h1, m1] = a[0].split(":").map(Number);
                    const [h2, m2] = b[0].split(":").map(Number);

                    return (h1 * 60 + m1) - (h2 * 60 + m2);

                });

            if (epg.length) {

                let atual = null;

                for (const item of epg) {

                    const [hora, minuto] = item[0].split(":").map(Number);

                    if ((hora * 60 + minuto) <= minutosAtuais) {
                        atual = item;
                    }

                }

                if (atual) {
                    programa = atual[1];
                } else {
                    programa = epg[0][1];
                }

            }

        }

        // Cria o card
        const elemento = document.createElement("button");

        elemento.className = "card";
        elemento.type = "button";
        elemento.dataset.id = canal.id || "";

        elemento.setAttribute("role", "listitem");

        elemento.setAttribute(
            "aria-label",
            `${nome} — ${descricao}`
        );

        // Miniatura
        const thumb = document.createElement("div");

        thumb.className = "card__thumb";

        if (poster) {

            const imagem = document.createElement("img");

            imagem.className = "card__poster";

            imagem.src = /^https?:\/\//i.test(poster)
                ? poster
                : `${BACKEND_URL}/${poster.replace(/^\/+/, "")}`;

            imagem.alt = nome;
            imagem.loading = "lazy";

            thumb.appendChild(imagem);

        } else {

            const letra = document.createElement("span");

            letra.className = "card__initial";
            letra.textContent = nome.charAt(0).toUpperCase();

            thumb.appendChild(letra);

        }

        // Selo ao vivo
        if (aoVivo) {

            const live = document.createElement("span");

            live.className = "card__live";
            live.textContent = "AO VIVO";

            thumb.appendChild(live);

        }

        // Informações
        const body = document.createElement("div");

        body.className = "card__body";

        const nomeCanal = document.createElement("h3");

        nomeCanal.className = "card__name";
        nomeCanal.textContent = nome;

        const meta = document.createElement("p");

        meta.className = "card__meta";

        const statusCanal = document.createElement("span");

        statusCanal.textContent = aoVivo ? "Ao vivo" : "Sob demanda";

        const ponto = document.createElement("span");

        ponto.className = "dot";

        const tipo = document.createElement("span");

        tipo.textContent = categoria;

        meta.append(statusCanal, ponto, tipo);

        const agoraPrograma = document.createElement("p");

        agoraPrograma.className = "card__now";
        agoraPrograma.textContent = `Agora: ${programa}`;

        body.append(nomeCanal, meta, agoraPrograma);

        elemento.append(thumb, body);

        // Reproduzir canal
        elemento.addEventListener("click", () => {
            reproduzir(canal);
        });

        lista.appendChild(elemento);

    });

}



function reproduzir(canal) {

    let url = canal.url;

    // URLs relativas são resolvidas usando o backend.
    if (!/^https?:\/\//i.test(url)) {
        url = `${BACKEND_URL}/${url.replace(/^\/+/, "")}`;
    }

    video.src = url;

    //titulo.textContent = canal.nome;
    titulo.textContent = canal.name || canal.nome || "TV Rabisco";

    video.load();

    video.play().catch(erro => {
        console.warn("Reprodução automática bloqueada:", erro);
    });
}

busca.addEventListener("input", () => {

    const termo = busca.value.toLowerCase();

    const filtrados = canais.filter(canal =>
        canal.nome.toLowerCase().includes(termo)
    );

    renderizarCanais(filtrados);
});

carregarCanais();
