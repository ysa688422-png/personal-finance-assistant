(() => {
  "use strict";

  const script = document.currentScript;
  const pageKey = script?.dataset.page || "home";
  const TRACKS = {
    spiral: { title: "spiral", artist: "LONGMAN", youtube: "fE9trKOuT3Q", note: "异世界启程" },
    otonoke: { title: "オトノケ", artist: "Creepy Nuts", youtube: "tRwHpyOq4P4", note: "灵动节拍" },
    kickback: { title: "KICK BACK", artist: "米津玄師", youtube: "M2cckDmNLMI", note: "投资推进" },
    chu: { title: "ちゅ、多様性。", artist: "ano", youtube: "-lec--FlSJ4", note: "消费心情" },
    iinazukkyun: { title: "許婚っきゅん", artist: "ano", youtube: "kcdSjvUBrDA", note: "今日好心情" },
    frontline: { title: "馬と鹿", artist: "米津玄師", youtube: "ptnYBctoexk", note: "前线作战" },
    paradoxes: { title: "準透明少年", artist: "ヨルシカ", youtube: "9ypEFXTakV8", note: "理性与星光" },
    globe: { title: "地球儀", artist: "米津玄師", youtube: "VUsURj_OYdA", note: "长期规划" },
    suzume: { title: "すずめ feat.十明", artist: "RADWIMPS / 十明", youtube: "Xs0Lxif1u9E", note: "穿越与远行" },
    seasons: { title: "春が来てぼくら", artist: "UNISON SQUARE GARDEN", youtube: "vrd95QQe6Gc", note: "流水与时间" },
    light: { title: "カタオモイ", artist: "Aimer", youtube: "kxs9Su_mbpU", note: "安静陪伴" },
    finalone: { title: "月を見ていた", artist: "米津玄師", youtube: "1kUZ0LoUELI", note: "决策时刻" },
    solitude: { title: "orion", artist: "米津玄師", youtube: "lzAyrgSqeeE", note: "沉静复盘" },
    season8: { title: "Pale Blue", artist: "米津玄師", youtube: "7WZ1Kt3zraY", note: "周期观察" },
    yakimochi: { title: "灰色と青", artist: "米津玄師 + 菅田将暉", youtube: "gJX2iy6nhHc", note: "轻松日常" }
  };

  const PARTNER_BY_DAY = ["樱露", "金璃", "紫铃", "樱露", "桃绘", "星澄", "紫铃"];
  const PAGE_ORDER = ["home", "flow", "finance", "assistant", "toolbox", "options", "rewards", "ipo", "stocks"];
  const PLAYLISTS = {
    "樱露": ["spiral", "seasons", "globe", "light", "frontline", "finalone", "suzume", "season8", "solitude"],
    "金璃": ["kickback", "seasons", "globe", "light", "finalone", "otonoke", "iinazukkyun", "frontline", "paradoxes"],
    "紫铃": ["otonoke", "yakimochi", "light", "chu", "kickback", "finalone", "iinazukkyun", "suzume", "paradoxes"],
    "桃绘": ["iinazukkyun", "chu", "light", "yakimochi", "otonoke", "kickback", "finalone", "suzume", "paradoxes"],
    "星澄": ["paradoxes", "solitude", "globe", "light", "suzume", "finalone", "season8", "frontline", "kickback"]
  };

  const partner = PARTNER_BY_DAY[new Date().getDay()];
  const pageIndex = Math.max(0, PAGE_ORDER.indexOf(pageKey));
  const trackKey = PLAYLISTS[partner][pageIndex];
  const primaryTrack = TRACKS[trackKey];
  if (!primaryTrack) return;
  const fallbackTracks = [TRACKS.kickback, TRACKS.globe, TRACKS.suzume]
    .filter((item) => item.youtube !== primaryTrack.youtube);
  const playbackQueue = [primaryTrack, ...fallbackTracks];
  let activeTrackIndex = 0;
  let activeTrack = playbackQueue[activeTrackIndex];

  ["https://www.youtube.com", "https://i.ytimg.com"].forEach((href) => {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  });

  const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2c0 .8.9 1.3 1.6.9l10.3-6.6c.7-.4.7-1.4 0-1.8L9.6 4.5C8.9 4.1 8 4.6 8 5.4Z"/></svg>';
  const musicIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3v11.2a3.7 3.7 0 1 1-2-3.3V6.6l-8 1.7v8a3.7 3.7 0 1 1-2-3.3V6.7L19 4.1V3Z"/></svg>';

  const player = document.createElement("aside");
  player.className = "sayi-music-player";
  player.dataset.state = "idle";
  player.setAttribute("aria-label", `${partner}值班配乐`);
  const streamId = `sayi-music-stream-${Date.now()}`;
  player.innerHTML = `
    <div class="sayi-music-stream" id="${streamId}"></div>
    <button class="sayi-music-play" type="button" title="播放这首歌" aria-label="播放 ${activeTrack.title}">${playIcon}</button>
    <div class="sayi-music-copy">
      <div class="sayi-music-kicker">${partner}值班 · ${activeTrack.note}</div>
      <div class="sayi-music-title">${activeTrack.title}</div>
      <div class="sayi-music-artist">${activeTrack.artist}</div>
    </div>
    <button class="sayi-music-open" type="button" title="在 YouTube 打开官方音乐" aria-label="在 YouTube 打开官方音乐">${musicIcon}</button>`;
  document.body.appendChild(player);

  const playButton = player.querySelector(".sayi-music-play");
  const openButton = player.querySelector(".sayi-music-open");
  const kicker = player.querySelector(".sayi-music-kicker");
  const title = player.querySelector(".sayi-music-title");
  const artist = player.querySelector(".sayi-music-artist");
  let isPlaying = false;
  let playerReady = false;
  let pendingPlay = true;
  let autoplayTimer = 0;
  let youtubePlayer = null;

  function updateTrackDisplay(prefix = "") {
    title.textContent = activeTrack.title;
    artist.textContent = activeTrack.artist;
    kicker.textContent = prefix || `${partner}值班 · ${activeTrack.note}`;
    playButton.setAttribute("aria-label", `播放 ${activeTrack.title}`);
  }

  function startPlayback() {
    pendingPlay = true;
    if (!playerReady || !youtubePlayer) return;
    youtubePlayer.setPlaybackQuality("small");
    youtubePlayer.setVolume(65);
    youtubePlayer.unMute();
    youtubePlayer.playVideo();
  }

  function showPlaying() {
    window.clearTimeout(autoplayTimer);
    isPlaying = true;
    pendingPlay = false;
    player.dataset.state = "playing";
    kicker.textContent = `${partner}值班 · ${activeTrack.note}`;
    playButton.title = "暂停音乐";
    playButton.setAttribute("aria-label", `暂停 ${activeTrack.title}`);
  }

  function showPaused() {
    isPlaying = false;
    player.dataset.state = "idle";
    kicker.textContent = `${partner}值班 · 已暂停`;
    playButton.title = "继续播放";
    playButton.setAttribute("aria-label", `继续播放 ${activeTrack.title}`);
  }

  function switchToFallback() {
    activeTrackIndex += 1;
    if (activeTrackIndex >= playbackQueue.length) {
      pendingPlay = false;
      player.dataset.state = "error";
      kicker.textContent = `${partner}值班 · 音乐源暂不可用`;
      return;
    }
    activeTrack = playbackQueue[activeTrackIndex];
    isPlaying = false;
    pendingPlay = true;
    player.dataset.state = "loading";
    updateTrackDisplay(`${partner}值班 · 正在自动切换备用曲目`);
    youtubePlayer?.loadVideoById(activeTrack.youtube);
  }

  function initializeYouTubePlayer() {
    if (youtubePlayer || !window.YT?.Player) return;
    youtubePlayer = new window.YT.Player(streamId, {
      width: "200",
      height: "200",
      videoId: activeTrack.youtube,
      playerVars: {
        autoplay: 1,
        playsinline: 1,
        controls: 0,
        disablekb: 1,
        rel: 0,
        iv_load_policy: 3,
        fs: 0,
        origin: location.origin
      },
      events: {
        onReady(event) {
          playerReady = true;
          event.target.setPlaybackQuality("small");
          if (pendingPlay) startPlayback();
        },
        onStateChange(event) {
          if (event.data === window.YT.PlayerState.PLAYING) showPlaying();
          if (event.data === window.YT.PlayerState.PAUSED) showPaused();
          if (event.data === window.YT.PlayerState.ENDED) startPlayback();
        },
        onError() {
          switchToFallback();
        }
      }
    });
  }

  playButton.addEventListener("click", () => {
    if (isPlaying) {
      youtubePlayer?.pauseVideo();
      showPaused();
    } else {
      player.dataset.state = "loading";
      kicker.textContent = `${partner}值班 · 正在播放`;
      startPlayback();
    }
  });
  openButton.addEventListener("click", () => {
    window.open(`https://www.youtube.com/watch?v=${activeTrack.youtube}`, "_blank", "noopener");
  });

  player.dataset.state = "loading";
  kicker.textContent = `${partner}值班 · 正在自动播放`;

  const previousApiReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (typeof previousApiReady === "function") previousApiReady();
    initializeYouTubePlayer();
  };
  if (window.YT?.Player) {
    initializeYouTubePlayer();
  } else if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
    const apiScript = document.createElement("script");
    apiScript.src = "https://www.youtube.com/iframe_api";
    apiScript.async = true;
    apiScript.onerror = () => {
      player.dataset.state = "error";
      kicker.textContent = `${partner}值班 · 音乐服务连接失败`;
    };
    document.head.appendChild(apiScript);
  }

  autoplayTimer = window.setTimeout(() => {
    if (!isPlaying) {
      kicker.textContent = `${partner}值班 · 点击一次即可播放`;
      player.dataset.state = "idle";
      playButton.title = "播放音乐";
    }
  }, 8000);
})();
