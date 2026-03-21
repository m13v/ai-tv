"use client";

import { useState, useCallback } from "react";
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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setHasStarted(true);

    try {
      // Step 1: Chat with Gemini — get response + search query
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });
      const { message, searchQuery } = await chatRes.json();

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
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Try again?" },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading]);

  // Landing page
  if (!hasStarted) {
    return (
      <main className="h-screen w-screen flex flex-col items-center justify-center bg-black px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="w-full max-w-lg"
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What do you want to watch?"
                className="w-full bg-neutral-900/80 backdrop-blur border border-neutral-700 rounded-full px-6 py-4 pr-20 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 text-lg"
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
                <kbd className="text-xs text-white/30 bg-white/10 border border-white/15 rounded px-1.5 py-0.5 font-mono">
                  &#8984;
                </kbd>
                <kbd className="text-xs text-white/30 bg-white/10 border border-white/15 rounded px-1.5 py-0.5 font-mono">
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
      </main>
    );
  }

  // Chat + Video side by side
  return (
    <main className="h-screen w-screen bg-black flex">
      {/* Left: Chat — 50% */}
      <div className="w-1/2 h-full border-r border-neutral-800 flex flex-col">
        <Chat
          messages={messages}
          input={input}
          onInputChange={setInput}
          onSubmit={sendMessage}
          loading={loading}
        />
      </div>

      {/* Right: Video — 50% */}
      <div className="w-1/2 h-full">
        {videoIds.length > 0 ? (
          <Player videoIds={videoIds} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600">
            Loading video...
          </div>
        )}
      </div>
    </main>
  );
}
