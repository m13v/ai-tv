"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PlayerProps {
  videoIds: string[];
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

export default function Player({ videoIds }: PlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentIndexRef = useRef(0);
  const videoIdsRef = useRef(videoIds);
  const apiReadyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Touch/swipe tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Wheel debounce
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastWheelNavRef = useRef(0);

  videoIdsRef.current = videoIds;

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= videoIdsRef.current.length) return;
      if (index === currentIndexRef.current) return;
      playerRef.current?.loadVideoById(videoIdsRef.current[index]);
      currentIndexRef.current = index;
      setCurrentIndex(index);
    },
    []
  );

  const next = useCallback(() => {
    goTo(currentIndexRef.current + 1);
  }, [goTo]);

  const prev = useCallback(() => {
    goTo(currentIndexRef.current - 1);
  }, [goTo]);

  // Keyboard: arrow keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev]);

  // Touch: swipe up/down and left/right (mobile)
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
      // Prevent page scroll while swiping on the player
      e.preventDefault();
    };

    const onTouchEnd = () => {
      const { x, y } = touchDeltaRef.current;
      const absX = Math.abs(x);
      const absY = Math.abs(y);
      const threshold = 50;

      if (absX > threshold || absY > threshold) {
        if (absY >= absX) {
          // Vertical swipe — up = next, down = prev (like Instagram)
          if (y < -threshold) next();
          else if (y > threshold) prev();
        } else {
          // Horizontal swipe — left = next, right = prev
          if (x < -threshold) next();
          else if (x > threshold) prev();
        }
      }

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
      // Debounce: at least 400ms between navigations
      if (now - lastWheelNavRef.current < 400) return;

      // Threshold to avoid accidental triggers
      const threshold = 30;
      if (Math.abs(e.deltaY) > threshold) {
        lastWheelNavRef.current = now;
        if (e.deltaY > 0) next();
        else prev();
      } else if (Math.abs(e.deltaX) > threshold) {
        lastWheelNavRef.current = now;
        if (e.deltaX > 0) next();
        else prev();
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [next, prev]);

  // YouTube player state change
  const onPlayerStateChange = (event: YTEvent) => {
    if (event.data === window.YT.PlayerState.ENDED) {
      next();
    }
  };

  // Init/update player
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

    return () => {
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, [videoIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < videoIds.length - 1;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none"
      tabIndex={0}
    >
      {/* Video */}
      <div id="yt-player" className="w-full h-full" />

      {/* Click zones — left/right halves */}
      {hasPrev && (
        <button
          onClick={prev}
          className="absolute left-0 top-0 w-16 h-full z-10 cursor-pointer group"
          aria-label="Previous video"
        >
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/40 transition-all text-white/0 group-hover:text-white/80 text-lg">
            &#9664;
          </div>
        </button>
      )}
      {hasNext && (
        <button
          onClick={next}
          className="absolute right-0 top-0 w-16 h-full z-10 cursor-pointer group"
          aria-label="Next video"
        >
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/40 transition-all text-white/0 group-hover:text-white/80 text-lg">
            &#9654;
          </div>
        </button>
      )}

      {/* Counter */}
      {videoIds.length > 1 && (
        <div className="absolute top-3 right-3 text-white/40 text-xs bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full z-10">
          {currentIndex + 1}/{videoIds.length}
        </div>
      )}

      {/* Navigation hint — bottom center, fades out */}
      <NavigationHint />
    </div>
  );
}

function NavigationHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-white/30 text-xs bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-3 transition-opacity duration-1000 animate-fade-out">
      <span>&#8592; &#8594; arrows</span>
      <span className="text-white/15">|</span>
      <span>scroll</span>
      <span className="text-white/15">|</span>
      <span>swipe</span>
    </div>
  );
}
