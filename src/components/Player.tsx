"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PlayerProps {
  videoIds: string[];
  query: string;
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
  const [muted, setMuted] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiReadyRef = useRef(false);

  const loadVideo = useCallback(
    (index: number) => {
      if (playerRef.current && videoIds[index]) {
        playerRef.current.loadVideoById(videoIds[index]);
        setCurrentIndex(index);
      }
    },
    [videoIds]
  );

  const onPlayerStateChange = useCallback(
    (event: YTEvent) => {
      if (event.data === window.YT.PlayerState.ENDED) {
        // Auto-advance to next video
        const nextIndex = (currentIndex + 1) % videoIds.length;
        loadVideo(nextIndex);
      }
    },
    [currentIndex, videoIds.length, loadVideo]
  );

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
        },
        events: {
          onStateChange: onPlayerStateChange,
        },
      });
      setCurrentIndex(0);
    };

    if (apiReadyRef.current && window.YT) {
      initPlayer();
    } else {
      // Load YouTube IFrame API
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
      // Don't destroy on cleanup to avoid flicker during re-renders
    };
  }, [videoIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update event handler when currentIndex changes
  useEffect(() => {
    if (playerRef.current) {
      // YouTube API doesn't support updating event handlers directly,
      // so we track currentIndex via ref
    }
  }, [currentIndex, onPlayerStateChange]);

  // Use a ref to always have the latest currentIndex for the event handler
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // Re-register event handler approach: use a stable callback
  useEffect(() => {
    if (!videoIds.length) return;

    const handler = (event: YTEvent) => {
      if (event.data === window.YT?.PlayerState?.ENDED) {
        const nextIndex = (currentIndexRef.current + 1) % videoIds.length;
        if (playerRef.current && videoIds[nextIndex]) {
          playerRef.current.loadVideoById(videoIds[nextIndex]);
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
        }
      }
    };

    // Small delay to ensure player is ready
    const timer = setTimeout(() => {
      if (playerRef.current) {
        // Override by re-creating - the YT API uses addEventListener internally
        // We'll use the container's postMessage approach instead
      }
    }, 1000);

    // Store handler for cleanup
    const win = window as Window & { _ytHandler?: typeof handler };
    win._ytHandler = handler;

    return () => clearTimeout(timer);
  }, [videoIds]);

  const toggleMute = () => {
    if (playerRef.current) {
      if (muted) {
        playerRef.current.unMute();
        playerRef.current.setVolume(100);
      } else {
        playerRef.current.mute();
      }
      setMuted(!muted);
    }
  };

  const next = () => {
    const nextIndex = (currentIndex + 1) % videoIds.length;
    loadVideo(nextIndex);
  };

  const prev = () => {
    const prevIndex =
      (currentIndex - 1 + videoIds.length) % videoIds.length;
    loadVideo(prevIndex);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto">
      <div className="text-sm text-neutral-400 mb-1">
        Playing &ldquo;{query}&rdquo; &middot; {currentIndex + 1}/
        {videoIds.length}
      </div>

      <div
        ref={containerRef}
        className="relative w-full bg-neutral-900 rounded-2xl overflow-hidden"
        style={{ aspectRatio: "9/16" }}
      >
        <div id="yt-player" className="w-full h-full" />
      </div>

      <div className="flex items-center gap-6">
        <button
          onClick={prev}
          className="text-neutral-400 hover:text-white transition-colors text-2xl"
          title="Previous"
        >
          &#9664;
        </button>
        <button
          onClick={toggleMute}
          className="text-neutral-400 hover:text-white transition-colors text-lg px-3 py-1 rounded-lg border border-neutral-700 hover:border-neutral-500"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          onClick={next}
          className="text-neutral-400 hover:text-white transition-colors text-2xl"
          title="Next"
        >
          &#9654;
        </button>
      </div>
    </div>
  );
}
