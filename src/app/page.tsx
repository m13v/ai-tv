"use client";

import { useState, FormEvent, useCallback } from "react";
import Player from "@/components/Player";

export default function Home() {
  const [query, setQuery] = useState("");
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [activeQuery, setActiveQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!query.trim()) return;

      setLoading(true);
      setVideoIds([]);

      try {
        const optimizeRes = await fetch("/api/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() }),
        });
        const { searchQuery } = await optimizeRes.json();

        const searchRes = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery }),
        });
        const { videoIds: ids } = await searchRes.json();

        if (ids?.length > 0) {
          setVideoIds(ids);
          setActiveQuery(searchQuery);
          setHasSearched(true);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  // Initial landing — just a centered search bar
  if (!hasSearched) {
    return (
      <main className="h-screen w-screen flex flex-col items-center justify-center bg-black px-4">
        <form onSubmit={handleSubmit} className="w-full max-w-lg">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you want to watch?"
              className="flex-1 bg-neutral-900/80 backdrop-blur border border-neutral-700 rounded-full px-6 py-4 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 text-lg"
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-white text-black font-semibold px-6 py-4 rounded-full hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg"
            >
              {loading ? "..." : "Watch"}
            </button>
          </div>
        </form>
      </main>
    );
  }

  // Playing — fullscreen video with overlay search
  return (
    <main className="h-screen w-screen bg-black overflow-hidden relative">
      <Player
        videoIds={videoIds}
        query={activeQuery}
        onNewSearch={(q) => {
          setQuery(q);
        }}
      />

      {/* Overlay search bar at bottom */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 z-20">
        <form onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search something else..."
              className="flex-1 bg-black/50 backdrop-blur-md border border-white/20 rounded-full px-5 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/40 text-base"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-white/20 backdrop-blur-md text-white font-medium px-5 py-3 rounded-full hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base border border-white/20"
            >
              {loading ? "..." : "Go"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
