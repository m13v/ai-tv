"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import posthog from "posthog-js";
import Player from "@/components/Player";
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
  const [isMobile, setIsMobile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLElement>(null);

  // Track mobile breakpoint
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  // Landing page
  if (!hasStarted) {
    return (
      <main className="h-screen w-screen flex flex-col items-center justify-center bg-black px-4">
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
                  className="w-full bg-neutral-900/80 backdrop-blur border border-neutral-700 rounded-full px-6 py-4 pr-20 text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-500 text-lg"
                  autoFocus
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
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

  // Chat + Video: side by side (desktop) / stacked (mobile)
  // Mobile: video top (splitPercent%), chat bottom
  // Desktop: chat left (splitPercent%), video right
  return (
    <main ref={containerRef} className="h-screen w-screen bg-black flex flex-col md:flex-row select-none">
      {/* Video — top on mobile, right on desktop */}
      <div
        className="shrink-0 overflow-hidden order-1 md:order-2"
        style={isMobile
          ? { height: `calc(${splitPercent}% - 2px)`, width: '100%' }
          : { width: `calc(${100 - splitPercent}% - 2px)`, height: '100%' }
        }
      >
        {videoIds.length > 0 ? (
          <Player videoIds={videoIds} onVideoChange={handleVideoChange} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400">
            Loading video...
          </div>
        )}
      </div>

      {/* Drag handle */}
      <div
        className={`group shrink-0 flex items-center justify-center order-2 md:order-2 touch-none transition-all duration-150
          cursor-row-resize md:cursor-col-resize
          ${isDragging
            ? "h-5 md:h-full md:w-5 bg-white/15"
            : "h-3 md:h-full md:w-3 hover:h-5 md:hover:h-full md:hover:w-5 hover:bg-white/10"
          }`}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      >
        <div className={`rounded-full transition-all duration-150
          ${isDragging
            ? "bg-white h-2 w-32 md:w-2 md:h-32 shadow-[0_0_20px_rgba(255,255,255,0.6),0_0_6px_rgba(255,255,255,0.8)]"
            : "bg-neutral-600 h-1 w-10 md:w-1 md:h-10 group-hover:bg-white group-hover:h-1.5 group-hover:w-20 md:group-hover:w-1.5 md:group-hover:h-20 group-hover:shadow-[0_0_12px_rgba(255,255,255,0.4)]"
          }`}
        />
      </div>

      {/* Chat — bottom on mobile, left on desktop */}
      <div
        className="shrink-0 overflow-hidden flex flex-col order-3 md:order-1"
        style={isMobile
          ? { height: `calc(${100 - splitPercent}% - 2px)`, width: '100%' }
          : { width: `calc(${splitPercent}% - 2px)`, height: '100%' }
        }
      >
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
