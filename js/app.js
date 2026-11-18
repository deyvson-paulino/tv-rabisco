
/* ------------------------------------------------------------
   4. RELÓGIO DO CABEÇALHO
   ------------------------------------------------------------ */
function startClock() {
  const time = $("#clockTime");
  const date = $("#clockDate");
  const fmtDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short" });
  const tick = () => {
    const now = new Date();
    time.textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    date.textContent = fmtDate.format(now);
  };
  tick();
  setInterval(tick, 30_000);
}

/* ------------------------------------------------------------
   8. CONTROLES DO PLAYER
   ------------------------------------------------------------ */
function setupPlayerControls() {
  const playPause = $("#playPauseBtn");
  const mute = $("#muteBtn");
  const volume = $("#volumeSlider");
  const fullscreen = $("#fullscreenBtn");
  const speed = $("#speedSelect");

  const togglePlay = () => {
    if (!video.currentSrc && !video.src) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  playPause.addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);
  video.addEventListener("play", updatePlayPauseIcon);
  video.addEventListener("pause", updatePlayPauseIcon);

  video.addEventListener("playing", () => showPlayerState("none"));
  video.addEventListener("waiting", () => {
    if (video.currentSrc || video.src) showPlayerState("loading");
  });

  video.addEventListener("error", () => {
    if (!video.currentSrc && !video.src) return;
    showError("O stream não pôde ser carregado. Verifique se a URL está correta, se o servidor está ativo e se ele permite acesso pelo navegador (CORS).");
  });

  video.addEventListener("timeupdate", () => {
    if (video.duration && isFinite(video.duration)) {
      const total = video.duration;
      const cur = video.currentTime;
      const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      };
      $("#timeLabel").textContent = `${fmt(cur)} / ${fmt(total)}`;
    } else {
      $("#timeLabel").textContent = "AO VIVO";
    }
  });

  video.addEventListener("stalled", () => {
    if (state.selectedId && (video.currentSrc || video.src)) showPlayerState("loading");
  });

  mute.addEventListener("click", () => {
    video.muted = !video.muted;
    mute.style.opacity = video.muted ? "0.5" : "1";
  });

  volume.addEventListener("input", () => {
    video.volume = volume.value / 100;
    video.muted = volume.value === "0";
  });

  fullscreen.addEventListener("click", () => {
    const shell = $("#playerShell");
    if (document.fullscreenElement) document.exitFullscreen();
    else shell.requestFullscreen?.();
  });

  speed.addEventListener("change", () => {
    video.playbackRate = Number(speed.value) || 1;
  });

  const retry = () => {
    if (state.selectedId) selectChannel(state.selectedId);
  };
  $("#retryBtn").addEventListener("click", retry);
  $("#errorRetryBtn").addEventListener("click", retry);

  updatePlayPauseIcon();
}

/* ------------------------------------------------------------
   9. FAVORITOS
   ------------------------------------------------------------ */
function updateFavButton(channel) {
  const isFav = state.favorites.has(channel.id);
  $("#heroFavBtn").setAttribute("aria-pressed", String(isFav));
  $("#heroFavLabel").textContent = isFav ? "Nos favoritos" : "Favoritar";
}

function setupFavorites() {
  $("#heroFavBtn").addEventListener("click", () => {
    if (!state.selectedId) return;
    const id = state.selectedId;
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    saveFavorites();

    const channel = getChannel(id);
    if (channel) updateFavButton(channel);
    renderGrid();
    renderShelves();
  });
}

/* ------------------------------------------------------------
   10. NAVEGAÇÃO (categorias, busca, teclado / controle remoto)
   ------------------------------------------------------------ */
function setupNav() {
  $("#mainNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".topnav__item");
    if (!btn) return;
    state.category = btn.dataset.category;
    document.querySelectorAll(".topnav__item").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    renderGrid();
  });

  $("#searchInput").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderGrid();
  });

  $("#profileBtn").addEventListener("click", () => {
    const profile = state.favorites.size;
    alert(`Perfil "N" — ${profile} canal(is) favorito(s).`); // placeholder simples
  });
}

function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);

    // Espaço / Enter fora de inputs: play-pause global
    if (!typing && (e.key === " " || e.key === "Enter") && document.activeElement?.id !== "searchInput") {
      if (document.activeElement?.classList.contains("card")) {
        return; // deixa o Enter clicar o card focado
      }
      if (e.key === " ") {
        e.preventDefault();
        $("#playPauseBtn").click();
        return;
      }
    }

    if (typing) return;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowLeft":
      case "ArrowUp":
      case "ArrowDown": {
        // Navegação espacial pelos cards da grade
        const cards = [...document.querySelectorAll("#channelGrid .card")];
        if (cards.length === 0) return;
        e.preventDefault();
        const idx = cards.indexOf(document.activeElement);
        const cols = Math.max(1, Math.round(gridColumns()));
        let next = idx;
        if (idx === -1) next = 0;
        else if (e.key === "ArrowRight") next = Math.min(idx + 1, cards.length - 1);
        else if (e.key === "ArrowLeft") next = Math.max(idx - 1, 0);
        else if (e.key === "ArrowDown") next = Math.min(idx + cols, cards.length - 1);
        else if (e.key === "ArrowUp") next = Math.max(idx - cols, 0);
        cards[next].focus();
        cards[next].scrollIntoView({ block: "nearest", behavior: "smooth" });
        break;
      }
      case "Escape":
        if (document.fullscreenElement) document.exitFullscreen();
        $("#searchInput").blur();
        break;
      case "f":
      case "F":
        $("#fullscreenBtn").click();
        break;
      case "m":
      case "M":
        $("#muteBtn").click();
        break;
    }
  });
}

function gridColumns() {
  const grid = $("#channelGrid");
  if (!grid.children.length) return 4;
  const first = grid.children[0].getBoundingClientRect();
  const second = grid.children[1]?.getBoundingClientRect();
  if (!second) return 1;
  return first.width > 0 ? Math.max(1, Math.round(second.left - first.left) / first.width) || 1 : 1;
}


