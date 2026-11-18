
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

function renderizarCanais(items) {

    lista.innerHTML = `
    <p>
        Deyvson teste...............................
    </p>
    <button class="card" type="button" data-id="nova-1" role="listitem" aria-label="Nova Notícias — Jornalismo 24 horas com cobertura dos principais acontecimentos.">
            <div class="card__thumb">
                <span class="card__initial">N</span>
                <span class="card__live">AO VIVO</span>
            </div>
            <div class="card__body">
                <h3 class="card__name">Nova Notícias</h3>
                <p class="card__meta"><span>Ao vivo</span>
                    <span class="dot"></span><span>Em transmissão</span>
                </p>
                <p class="card__now">Agora: Economia em Dia</p>
             </div>
        </button>
        
`;//"";

    items.forEach(canal => {

        const elemento = document.createElement("div");

        elemento.className = "canal";

        elemento.textContent = canal.nome;

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
