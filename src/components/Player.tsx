"use client";

import { useEffect, useRef, useState } from "react";

interface PlayerProps {
  videoIds: string[];
  query: string;
  onNewSearch?: (query: string) => void;
}

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          height: string | number;
          width: string | number;
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: Record<string, (event: YTEvent) => void>;
        }
      ) => YTPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTEvent {
  data: number;
  target: YTPlayer;
}

interface YTPlayer {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (vol: number) => void;
  destroy: () => void;
}

export default function Player({ videoIds, query }: PlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentIndexRef = useRef(0);
  const videoIdsRef = useRef(videoIds);
  const apiReadyRef = useRef(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  videoIdsRef.current = videoIds;

  // Auto-hide controls after 3s of no interaction
  const resetHideTimer = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const onPlayerStateChange = (event: YTEvent) => {
    if (event.data === window.YT.PlayerState.ENDED) {
      const nextIndex = currentIndexRef.current + 1;
      if (nextIndex < videoIdsRef.current.length) {
        playerRef.current?.loadVideoById(videoIdsRef.current[nextIndex]);
        currentIndexRef.current = nextIndex;
        setCurrentIndex(nextIndex);
      }
    }
  };

  useEffect(() => {
    if (!videoIds.length) return;

    const initPlayer = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }

      playerRef.current = new window.YT.Player("yt-player", {
        height: "100%",
        width: "100%",
        videoId: videoIds[0],
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          loop: 0,
          showinfo: 0,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onStateChange: onPlayerStateChange,
        },
      });
      currentIndexRef.current = 0;
      setCurrentIndex(0);
    };

    if (apiReadyRef.current && window.YT) {
      initPlayer();
    } else {
      const existingScript = document.getElementById("yt-iframe-api");
      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "yt-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }

      window.onYouTubeIframeAPIReady = () => {
        apiReadyRef.current = true;
        initPlayer();
      };
    }
  }, [videoIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex < videoIdsRef.current.length) {
      playerRef.current?.loadVideoById(videoIdsRef.current[nextIndex]);
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
    }
    resetHideTimer();
  };

  const prev = () => {
    const prevIndex = currentIndexRef.current - 1;
    if (prevIndex >= 0) {
      playerRef.current?.loadVideoById(videoIdsRef.current[prevIndex]);
      currentIndexRef.current = prevIndex;
      setCurrentIndex(prevIndex);
    }
    resetHideTimer();
  };

  return (
    <div
      className="absolute inset-0 bg-black"
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
    >
      {/* Full-screen video */}
      <div id="yt-player" className="w-full h-full" />

      {/* Overlay controls — nav arrows on sides */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Left arrow */}
        {currentIndex > 0 && (
          <button
            onClick={prev}
            className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-all text-xl"
          >
            &#9664;
          </button>
        )}

        {/* Right arrow */}
        {currentIndex < videoIds.length - 1 && (
          <button
            onClick={next}
            className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-all text-xl"
          >
            &#9654;
          </button>
        )}

        {/* Video counter — top right */}
        <div className="pointer-events-none absolute top-4 right-4 text-white/60 text-sm bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full">
          {currentIndex + 1} / {videoIds.length}
        </div>

        {/* Query label — top left */}
        <div className="pointer-events-none absolute top-4 left-4 text-white/60 text-sm bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full max-w-xs truncate">
          {query}
        </div>
      </div>
    </div>
  );
}
