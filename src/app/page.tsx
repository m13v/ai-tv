"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import posthog from "posthog-js";
import Player, { type PlayerHandle } from "@/components/Player";
import Chat from "@/components/Chat";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [watchingVideo, setWatchingVideo] = useState(false);
  const [model, setModel] = useState<"gemini-flash-latest" | "gemini-pro-latest">("gemini-flash-latest");
  const [mobileOverlay, setMobileOverlay] = useState(true);
  const lastSearchQueryRef = useRef<string>("");
  const videoIdSetRef = useRef<Set<string>>(new Set());
  const [showControls, setShowControls] = useState(true);
  const [muted, setMuted] = useState(true);
  const playerRef = useRef<PlayerHandle | null>(null);

  // Load mobile layout preference
  useEffect(() => {
    const saved = localStorage.getItem("mobileOverlay");
    if (saved !== null) setMobileOverlay(saved === "true");
  }, []);

  const sendMessage = useCallback(async (overrideInput?: string) => {
    const raw = overrideInput ?? input;
    if (!raw.trim() || loading) return;

    const userQuery = raw.trim();
    const userMessage: Message = { role: "user", content: userQuery };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    const isFirstQuery = !hasStarted;
    setHasStarted(true);
    setSuggestedReplies([]);

    // Track user query
    posthog.capture("user_query", {
      query: userQuery,
      is_first_query: isFirstQuery,
      message_count: updatedMessages.length,
    });

    try {
      // Step 1: Chat with Gemini — get response + search query
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages, model }),
      });
      const { message, searchQuery } = await chatRes.json();

      // Track AI search query
      if (searchQuery) {
        posthog.capture("ai_search_query", {
          user_query: userQuery,
          search_query: searchQuery,
          ai_response: message,
        });
      }

      if (message) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: message },
        ]);
      }

      // Step 2: Search YouTube with the query
      if (searchQuery) {
        const searchRes = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery }),
        });
        const { videoIds: ids } = await searchRes.json();

        if (ids?.length > 0) {
          lastSearchQueryRef.current = searchQuery;
          videoIdSetRef.current = new Set(ids);
          setVideoIds(ids);
          posthog.capture("videos_loaded", {
            search_query: searchQuery,
            video_count: ids.length,
          });

          // Step 3: Have Gemini watch the video and react
          setLoading(false); // Let user type while Gemini watches
          setWatchingVideo(true);
          const currentVideoId = ids[0];
          const messagesWithAI = [
            ...updatedMessages,
            ...(message
              ? [{ role: "assistant" as const, content: message }]
              : []),
          ];

          try {
            const reactRes = await fetch("/api/react", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: messagesWithAI,
                videoId: currentVideoId,
              }),
            });
            const {
              reaction,
              matchQuality,
              followUpQuery,
              suggestedReplies: suggestions,
            } = await reactRes.json();

            if (reaction) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: reaction },
              ]);
              if (suggestions?.length > 0) {
                setSuggestedReplies(suggestions);
              }
              posthog.capture("video_reaction", {
                video_id: currentVideoId,
                match_quality: matchQuality,
                search_query: searchQuery,
              });
            }

            // If it was a miss, auto-search with the better query
            if (matchQuality === "miss" && followUpQuery) {
              const retryRes = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: followUpQuery }),
              });
              const { videoIds: retryIds } = await retryRes.json();
              if (retryIds?.length > 0) {
                lastSearchQueryRef.current = followUpQuery;
                videoIdSetRef.current = new Set(retryIds);
                setVideoIds(retryIds);
                posthog.capture("video_retry", {
                  original_query: searchQuery,
                  retry_query: followUpQuery,
                  video_count: retryIds.length,
                });
              }
            }
          } catch {
            // Video reaction is non-critical, don't block the experience
            console.error("Video reaction failed");
          } finally {
            setWatchingVideo(false);
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Try again?" },
      ]);
      posthog.capture("query_error", { query: userQuery });
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, hasStarted, model]);

  const handleVideoChange = useCallback(async (videoId: string) => {
    if (watchingVideo) return; // Don't stack reactions
    setWatchingVideo(true);
    setSuggestedReplies([]);

    try {
      const reactRes = await fetch("/api/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          videoId,
        }),
      });
      const {
        reaction,
        matchQuality,
        suggestedReplies: suggestions,
      } = await reactRes.json();

      if (reaction) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: reaction },
        ]);
        if (suggestions?.length > 0) {
          setSuggestedReplies(suggestions);
        }
        posthog.capture("video_reaction", {
          video_id: videoId,
          match_quality: matchQuality,
          trigger: "video_change",
        });
      }
    } catch {
      console.error("Video reaction failed on video change");
    } finally {
      setWatchingVideo(false);
    }
  }, [messages, watchingVideo]);

  const handleQuickReply = useCallback(
    (reply: string) => {
      setInput(reply);
      sendMessage(reply);
    },
    [sendMessage]
  );

  // Draggable split
  const [splitPercent, setSplitPercent] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onMove = (clientX: number, clientY: number) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let pct: number;
      if (window.innerWidth < 768) {
        pct = ((clientY - rect.top) / rect.height) * 100;
      } else {
        pct = ((clientX - rect.left) / rect.width) * 100;
      }
      setSplitPercent(Math.min(80, Math.max(20, pct)));
    };

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onEnd = () => { draggingRef.current = false; setIsDragging(false); };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);
  }, []);

  const quickQueries = [
    "How robots learn to walk",
    "Space footage from James Webb telescope",
    "Satisfying food preparation",
    "Craziest animal encounters",
    "Optical illusions that break your brain",
    "Underground street performances",
    "Tiny homes and creative spaces",
    "Extreme weather caught on camera",
    "Life hacks that actually work",
    "Behind the scenes of movie stunts",
  ];

  const handleQuickQuery = (query: string) => {
    setInput(query);
    // Trigger send on next tick after state update
    setTimeout(() => {
      const form = document.querySelector("form");
      form?.requestSubmit();
    }, 0);
  };

  const toggleMobileLayout = useCallback(() => {
    setMobileOverlay((prev) => {
      const next = !prev;
      localStorage.setItem("mobileOverlay", String(next));
      return next;
    });
  }, []);

  // Landing page
  if (!hasStarted) {
    return (
      <main className="h-dvh w-screen flex flex-col items-center justify-center bg-black px-4">
        <div className="w-full max-w-lg flex flex-col items-center gap-6">
          <div className="text-center mb-2">
            <h1 className="text-5xl font-bold text-white tracking-tight">
              AI Media
            </h1>
            <p className="text-neutral-400 text-lg mt-2">
              AI finds it. You watch it.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="w-full"
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="What do you want to watch?"
                  className="w-full bg-neutral-900/80 backdrop-blur border border-neutral-700 rounded-full px-6 py-4 md:pr-20 text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-500 text-lg"
                  autoFocus
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 pointer-events-none hidden md:flex">
                  <kbd className="text-xs text-white/50 bg-white/10 border border-white/15 rounded px-1.5 py-0.5 font-mono">
                    &#8984;
                  </kbd>
                  <kbd className="text-xs text-white/50 bg-white/10 border border-white/15 rounded px-1.5 py-0.5 font-mono">
                    K
                  </kbd>
                </div>
              </div>
              <button
                type="submit"
                disabled={!input.trim()}
                className="bg-white text-black font-semibold px-6 py-4 rounded-full hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg"
              >
                Watch
              </button>
            </div>
          </form>

          <div className="flex flex-wrap justify-center gap-2">
            {quickQueries.map((query) => (
              <button
                key={query}
                onClick={() => handleQuickQuery(query)}
                className="bg-neutral-900/80 backdrop-blur border border-neutral-700 text-neutral-300 text-sm px-4 py-2 rounded-full hover:bg-neutral-800 hover:text-white hover:border-neutral-600 transition-colors cursor-pointer"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // Desktop: always split. Mobile: toggle between split and overlay.
  return (
    <main
      ref={containerRef}
      className={`h-dvh w-screen bg-black select-none overflow-hidden relative md:flex md:flex-row ${
        !mobileOverlay ? "flex flex-col" : ""
      }`}
      style={{ "--split": `${splitPercent}%` } as React.CSSProperties}
    >
      {/* Mobile: eye button — always visible in overlay mode, toggles entire overlay */}
      {mobileOverlay && (
        <button
          onClick={() => setShowControls((v) => !v)}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-3 z-30 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/60 transition-all cursor-pointer md:hidden"
          aria-label={showControls ? "Hide overlay" : "Show overlay"}
        >
          {showControls ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      )}
      {/* Mobile: layout toggle — only visible when overlay is showing */}
      {mobileOverlay && showControls && (
        <button
          onClick={toggleMobileLayout}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-14 z-30 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/60 transition-all cursor-pointer md:hidden"
          aria-label={mobileOverlay ? "Switch to split view" : "Switch to overlay view"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        </button>
      )}
      {/* Mobile: mute button — in line with top-left buttons */}
      {mobileOverlay && showControls && (
        <button
          onClick={() => playerRef.current?.toggleMute()}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-[6.25rem] z-30 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/60 transition-all cursor-pointer md:hidden"
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
      {/* Mobile: new session button — in line with top-left buttons (overlay mode) */}
      {mobileOverlay && showControls && (
        <button
          onClick={() => {
            setHasStarted(false);
            setMessages([]);
            setVideoIds([]);
            setInput("");
            setSuggestedReplies([]);
            setWatchingVideo(false);
          }}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-[9rem] z-30 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/60 transition-all cursor-pointer md:hidden"
          aria-label="New session"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
      {/* Mobile: layout toggle in split mode */}
      {!mobileOverlay && (
        <button
          onClick={toggleMobileLayout}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-3 z-30 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/60 transition-all cursor-pointer md:hidden"
          aria-label="Switch to overlay view"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect x="8" y="8" width="13" height="13" rx="1" />
          </svg>
        </button>
      )}
      {/* Mobile: new session button in split mode */}
      {!mobileOverlay && (
        <button
          onClick={() => {
            setHasStarted(false);
            setMessages([]);
            setVideoIds([]);
            setInput("");
            setSuggestedReplies([]);
            setWatchingVideo(false);
          }}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-14 z-30 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/60 transition-all cursor-pointer md:hidden"
          aria-label="New session"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* Video */}
      <div className={`md:relative md:overflow-hidden md:order-2 md:min-h-0 md:min-w-0 split-video-desktop ${
        mobileOverlay
          ? "absolute inset-0"
          : "overflow-hidden order-1 min-h-0 min-w-0 split-video-mobile"
      }`}>
        {videoIds.length > 0 ? (
          <Player ref={playerRef} videoIds={videoIds} onVideoChange={handleVideoChange} hideControls={mobileOverlay && !showControls} onMuteChange={setMuted} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400">
            Loading video...
          </div>
        )}
      </div>

      {/* Drag handle — desktop always, mobile only in split mode */}
      <div
        className={`group items-center justify-center touch-none transition-all duration-100
          md:flex md:order-2 md:h-full md:cursor-col-resize md:w-6 shrink-0
          ${mobileOverlay ? "hidden" : "flex order-2 w-full cursor-row-resize h-6"}
          ${isDragging ? "bg-blue-500/30" : "hover:bg-white/20"}`}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      >
        <div className={`rounded-full transition-all duration-100
          ${isDragging
            ? "bg-blue-400 h-1.5 w-16 md:w-1.5 md:h-16"
            : "bg-neutral-500 h-1 w-10 md:w-1 md:h-10 group-hover:bg-white group-hover:h-1.5 group-hover:w-14 md:group-hover:w-1.5 md:group-hover:h-14"
          }`}
        />
      </div>

      {/* Mobile overlay chat — full height, transparent, video behind */}
      {mobileOverlay && showControls && (
        <div className="absolute inset-0 z-20 md:hidden pointer-events-none">
          <Chat
            messages={messages}
            input={input}
            onInputChange={setInput}
            onSubmit={sendMessage}
            loading={loading}
            suggestedReplies={suggestedReplies}
            onQuickReply={handleQuickReply}
            model={model}
            onModelChange={setModel}
            watchingVideo={watchingVideo}
            overlay
          />
        </div>
      )}

      {/* Mobile split chat */}
      {!mobileOverlay && (
        <div className="overflow-hidden flex flex-col order-3 min-h-0 min-w-0 split-chat-mobile md:hidden">
          <Chat
            messages={messages}
            input={input}
            onInputChange={setInput}
            onSubmit={sendMessage}
            loading={loading}
            suggestedReplies={suggestedReplies}
            onQuickReply={handleQuickReply}
            model={model}
            onModelChange={setModel}
            watchingVideo={watchingVideo}
          />
        </div>
      )}

      {/* Desktop: chat split panel (always) */}
      <div className="hidden md:flex overflow-hidden flex-col md:order-1 min-h-0 min-w-0 split-chat">
        <Chat
          messages={messages}
          input={input}
          onInputChange={setInput}
          onSubmit={sendMessage}
          loading={loading}
          suggestedReplies={suggestedReplies}
          onQuickReply={handleQuickReply}
          model={model}
          onModelChange={setModel}
          watchingVideo={watchingVideo}
        />
      </div>
    </main>
  );
}
