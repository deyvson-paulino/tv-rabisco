
/*
 * IMPORTANTE:
 * Durante o desenvolvimento, o backend é localhost.
 * Para o GitHub Pages, altere BACKEND_URL
 * para o endereço público do seu backend.
 */

const BACKEND_URL = "https://nose-highways-agency-butler.trycloudflare.com";
//"http://localhost:3000";

const video = document.getElementById("video");
const lista = document.getElementById("lista");
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

/*function renderizarCanais(items) {

    lista.innerHTML = "";

    items.forEach(canal => {

        const elemento = document.createElement("div");

        elemento.className = "canal";

        elemento.textContent = canal.nome;

        elemento.addEventListener("click", () => {
            reproduzir(canal);
        });

        lista.appendChild(elemento);
    });
}*/


function renderizarCanais(items) {

    lista.innerHTML = "";

    if (!items || items.length === 0) {
        lista.innerHTML = `
            <p class="lista-vazia">
                Nenhum canal encontrado.
            </p>
        `;
        return;
    }

    items.forEach(canal => {

        // Dados do canal
        const nome = canal.nome || "Canal sem nome";
        const inicial = nome.charAt(0).toUpperCase();

        const descricao = canal.descricao ||
            "Jornalismo e entretenimento.";

        const programa = canal.programa ||
            "Programação não informada";

        const aoVivo = canal.aoVivo !== false;

        // Criação do botão
        const elemento = document.createElement("button");

        elemento.className = "card";
        elemento.type = "button";

        elemento.dataset.id = canal.id || "";

        elemento.setAttribute("role", "listitem");

        elemento.setAttribute(
            "aria-label",
            `${nome} — ${descricao}`
        );

        // Estrutura visual do card
        const thumb = document.createElement("div");
        thumb.className = "card__thumb";

        const letra = document.createElement("span");
        letra.className = "card__initial";
        letra.textContent = inicial;

        thumb.appendChild(letra);

        if (aoVivo) {
            const live = document.createElement("span");
            live.className = "card__live";
            live.textContent = "AO VIVO";

            thumb.appendChild(live);
        }

        const body = document.createElement("div");
        body.className = "card__body";

        const nomeCanal = document.createElement("h3");
        nomeCanal.className = "card__name";
        nomeCanal.textContent = nome;

        const meta = document.createElement("p");
        meta.className = "card__meta";

        const statusCanal = document.createElement("span");
        statusCanal.textContent = aoVivo ? "Ao vivo" : "Offline";

        const ponto = document.createElement("span");
        ponto.className = "dot";

        const transmissao = document.createElement("span");
        transmissao.textContent = aoVivo
            ? "Em transmissão"
            : "Indisponível";

        meta.append(statusCanal, ponto, transmissao);

        const agora = document.createElement("p");
        agora.className = "card__now";
        agora.textContent = `Agora: ${programa}`;

        // Montagem dos elementos
        body.append(nomeCanal, meta, agora);

        elemento.append(thumb, body);

        // Evento de reprodução
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

    titulo.textContent = canal.nome;

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
