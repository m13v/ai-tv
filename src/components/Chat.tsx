"use client";

import { useEffect, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  messages: Message[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  suggestedReplies?: string[];
  onQuickReply?: (reply: string) => void;
}

export default function Chat({
  messages,
  input,
  onInputChange,
  onSubmit,
  loading,
  suggestedReplies,
  onQuickReply,
}: ChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refocus input after response completes
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  // Expose input ref for Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-white text-black rounded-br-md"
                  : "bg-neutral-800 text-white rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-800 text-white/80 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested replies */}
      {suggestedReplies && suggestedReplies.length > 0 && !loading && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestedReplies.map((reply, i) => (
            <button
              key={i}
              onClick={() => onQuickReply?.(reply)}
              className="bg-neutral-800 hover:bg-neutral-700 text-white text-sm px-3 py-1.5 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-neutral-800 px-4 py-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask something or describe what to watch next..."
              className="w-full bg-neutral-900 border border-neutral-700 rounded-full px-4 py-2.5 pr-16 text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-600 text-sm"
              disabled={loading}
              autoFocus
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
              <kbd className="text-[10px] text-white/50 bg-white/8 border border-white/10 rounded px-1 py-0.5 font-mono">
                &#8984;
              </kbd>
              <kbd className="text-[10px] text-white/50 bg-white/8 border border-white/10 rounded px-1 py-0.5 font-mono">
                K
              </kbd>
            </div>
          </div>
          <button
            onClick={onSubmit}
            disabled={loading || !input.trim()}
            className="bg-white text-black font-medium px-4 py-2.5 rounded-full hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
