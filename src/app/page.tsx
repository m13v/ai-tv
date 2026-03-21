"use client";

import { useState, FormEvent } from "react";
import Player from "@/components/Player";

export default function Home() {
  const [query, setQuery] = useState("");
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [activeQuery, setActiveQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setVideoIds([]);

    try {
      // Step 1: Optimize query with Gemini
      const optimizeRes = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const { searchQuery } = await optimizeRes.json();

      // Step 2: Search YouTube for Shorts
      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const { videoIds: ids } = await searchRes.json();

      if (!ids || ids.length === 0) {
        setError("No Shorts found. Try a different search.");
        setLoading(false);
        return;
      }

      setVideoIds(ids);
      setActiveQuery(searchQuery);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-2">AI TV</h1>
        <p className="text-neutral-500 text-lg">
          Describe what you want to watch
        </p>
      </div>

      {/* Search */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg mb-8"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. funny cats, cooking hacks, skateboard tricks..."
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-5 py-3.5 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 text-lg"
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-white text-black font-semibold px-6 py-3.5 rounded-xl hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg"
          >
            {loading ? "..." : "Watch"}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <p className="text-red-400 mb-4 text-center">{error}</p>
      )}

      {/* Player */}
      {videoIds.length > 0 && (
        <Player videoIds={videoIds} query={activeQuery} />
      )}

      {/* Empty state */}
      {!videoIds.length && !loading && !error && (
        <div className="text-neutral-600 text-center mt-8">
          <p className="text-6xl mb-4">&#128250;</p>
          <p>Enter a prompt to start watching</p>
        </div>
      )}
    </main>
  );
}
