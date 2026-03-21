"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PlayerProps {
  videoIds: string[];
  onVideoChange?: (videoId: string, index: number) => void;
  hideControls?: boolean;
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

export default function Player({ videoIds, onVideoChange, hideControls }: PlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const mutedRef = useRef(true);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentIndexRef = useRef(0);
  const videoIdsRef = useRef(videoIds);
  const apiReadyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Touch/swipe tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Wheel debounce
  const lastWheelNavRef = useRef(0);

  videoIdsRef.current = videoIds;

  const onVideoChangeRef = useRef(onVideoChange);
  onVideoChangeRef.current = onVideoChange;

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= videoIdsRef.current.length) return;
    if (index === currentIndexRef.current) return;
    playerRef.current?.loadVideoById(videoIdsRef.current[index]);
    currentIndexRef.current = index;
    setCurrentIndex(index);
    onVideoChangeRef.current?.(videoIdsRef.current[index], index);
  }, []);

  const next = useCallback(() => {
    goTo(currentIndexRef.current + 1);
  }, [goTo]);

  const prev = useCallback(() => {
    goTo(currentIndexRef.current - 1);
  }, [goTo]);

  const toggleMute = useCallback(() => {
    if (playerRef.current) {
      if (muted) {
        playerRef.current.unMute();
        playerRef.current.setVolume(100);
      } else {
        playerRef.current.mute();
      }
      const newMuted = !muted;
      setMuted(newMuted);
      mutedRef.current = newMuted;
    }
  }, [muted]);

  // Keyboard: up/down arrows only (left/right reserved for YouTube seek)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev]);

  // Touch: swipe up/down (Instagram-style) — only works outside iframe
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      touchDeltaRef.current = { x: 0, y: 0 };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      touchDeltaRef.current = {
        x: touch.clientX - touchStartRef.current.x,
        y: touch.clientY - touchStartRef.current.y,
      };
      e.preventDefault();
    };

    const onTouchEnd = () => {
      const { y } = touchDeltaRef.current;
      const threshold = 50;
      if (y < -threshold) next();
      else if (y > threshold) prev();
      touchStartRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [next, prev]);

  // Trackpad/mouse wheel: scroll up/down to navigate
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelNavRef.current < 400) return;
      const threshold = 30;
      if (Math.abs(e.deltaY) > threshold) {
        lastWheelNavRef.current = now;
        if (e.deltaY > 0) next();
        else prev();
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [next, prev]);

  // YouTube player
  const onPlayerStateChange = (event: YTEvent) => {
    if (event.data === window.YT.PlayerState.ENDED) {
      next();
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
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          loop: 0,
          fs: 0,
          iv_load_policy: 3,
          mute: mutedRef.current ? 1 : 0,
        },
        events: {
          onStateChange: onPlayerStateChange,
          onReady: () => {
            if (!mutedRef.current && playerRef.current) {
              playerRef.current.unMute();
              playerRef.current.setVolume(100);
            }
          },
        },
      });
      currentIndexRef.current = 0;
      setCurrentIndex(0);
      setMuted(mutedRef.current);
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

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none"
      tabIndex={0}
    >
      {/* Video */}
      <div id="yt-player" className="w-full h-full" />


      {/* Mute/Unmute toggle — above chat controls on mobile, bottom-right on desktop */}
      {!hideControls && (
        <button
          onClick={toggleMute}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 md:bottom-3 md:top-auto z-30 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/60 hover:text-white/90 hover:bg-black/60 transition-all cursor-pointer"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
      )}

      {/* Counter — top right */}
      {!hideControls && videoIds.length > 1 && (
        <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 text-white/70 text-xs bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full z-30">
          {currentIndex + 1}/{videoIds.length}
        </div>
      )}

      {/* Up/Down navigation buttons — right side */}
      {!hideControls && videoIds.length > 1 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
          <button
            onClick={prev}
            disabled={currentIndex === 0}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/15 text-white/85 hover:text-white hover:bg-black/70 disabled:opacity-20 disabled:cursor-default transition-all"
            aria-label="Previous video"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            onClick={next}
            disabled={currentIndex === videoIds.length - 1}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/15 text-white/85 hover:text-white hover:bg-black/70 disabled:opacity-20 disabled:cursor-default transition-all"
            aria-label="Next video"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}

      {/* Keyboard hint — bottom center, hidden on mobile */}
      {!hideControls && videoIds.length > 1 && (
        <div className="hidden md:flex absolute bottom-3 left-1/2 -translate-x-1/2 z-10 items-center gap-2 text-white/60 text-[11px] bg-black/50 backdrop-blur-sm px-3.5 py-2 rounded-full">
          <div className="flex flex-col gap-0.5">
            <kbd className="bg-white/15 border border-white/20 rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] text-white/80 text-center leading-none shadow-[0_2px_0_0_rgba(255,255,255,0.1),inset_0_1px_0_0_rgba(255,255,255,0.1)]">&#8593;</kbd>
            <kbd className="bg-white/15 border border-white/20 rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] text-white/80 text-center leading-none shadow-[0_2px_0_0_rgba(255,255,255,0.1),inset_0_1px_0_0_rgba(255,255,255,0.1)]">&#8595;</kbd>
          </div>
          <div className="flex flex-col">
            <span>prev / next</span>
            <span className="text-[9px]">use keyboard</span>
          </div>
        </div>
      )}
    </div>
  );
}
