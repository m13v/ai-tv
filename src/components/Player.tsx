"use client";

import { useEffect, useRef, useState } from "react";

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

  videoIdsRef.current = videoIds;

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
  }, [videoIds]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-full bg-black">
      <div id="yt-player" className="w-full h-full" />
      {videoIds.length > 1 && (
        <div className="absolute bottom-3 right-3 text-white/40 text-xs bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
          {currentIndex + 1}/{videoIds.length}
        </div>
      )}
    </div>
  );
}
