"use client";

import { useEffect, useRef, useCallback } from "react";
import { useVoiceInput } from "@/hooks/useVoiceInput";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type GeminiModel = "gemini-flash-latest" | "gemini-pro-latest";

interface ChatProps {
  messages: Message[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  suggestedReplies?: string[];
  onQuickReply?: (reply: string) => void;
  model: GeminiModel;
  onModelChange: (model: GeminiModel) => void;
  watchingVideo?: boolean;
  overlay?: boolean;
}

export default function Chat({
  messages,
  input,
  onInputChange,
  onSubmit,
  loading,
  suggestedReplies,
  onQuickReply,
  model,
  onModelChange,
  watchingVideo,
  overlay,
}: ChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Voice input — push-to-talk
  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      onInputChange(input ? `${input} ${transcript}` : transcript);
      // Only focus input on desktop — avoid keyboard popup on mobile
      if (window.matchMedia("(min-width: 768px)").matches) {
        inputRef.current?.focus();
      }
    },
    [input, onInputChange]
  );
  const { recording, transcribing, toggleRecording } = useVoiceInput(handleVoiceTranscript);

  // In overlay mode: allow scrolling via swipe, pass taps through to iframe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // If it was a tap (minimal movement, short duration), pass through to element below
    if (dx < 10 && dy < 10 && dt < 300) {
      const el = messagesContainerRef.current;
      if (el) {
        el.style.pointerEvents = "none";
        const below = document.elementFromPoint(touch.clientX, touch.clientY);
        el.style.pointerEvents = "";
        if (below && below !== el) {
          (below as HTMLElement).click();
        }
      }
    }
  }, []);

  // Auto-scroll to bottom on new messages or watching state
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, watchingVideo]);

  // Refocus input after response completes (desktop only — avoids keyboard popping up on mobile)
  useEffect(() => {
    if (!loading && !overlay && window.matchMedia("(min-width: 768px)").matches) {
      inputRef.current?.focus();
    }
  }, [loading, overlay]);

  // Auto-resize textarea to fit content (up to max-height)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

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

  // Auto-focus input on mount — desktop only to avoid mobile keyboard
  useEffect(() => {
    if (!overlay && window.matchMedia("(min-width: 768px)").matches) {
      inputRef.current?.focus();
    }
  }, [overlay]);

  return (
    <div className={`flex flex-col h-full ${overlay ? "pointer-events-none" : ""}`}>
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto px-4 py-4 space-y-4 ${overlay ? "pointer-events-auto touch-action-pan-y" : ""}`}
        onTouchStart={overlay ? handleTouchStart : undefined}
        onTouchEnd={overlay ? handleTouchEnd : undefined}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? overlay
                    ? "text-white/90 text-shadow-sm"
                    : "bg-white text-black rounded-br-md"
                  : overlay
                    ? "text-white/80 text-shadow-sm"
                    : "bg-neutral-800 text-white rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className={`rounded-2xl rounded-bl-md px-4 py-2.5 text-sm ${
              overlay
                ? "text-white/60"
                : "bg-neutral-800 text-white/80"
            }`}>
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </div>
          </div>
        )}
        {watchingVideo && !loading && (
          <div className="flex justify-start">
            <div className={`rounded-2xl rounded-bl-md px-4 py-2.5 text-sm italic ${
              overlay
                ? "text-white/50"
                : "bg-neutral-800 text-white/60"
            }`}>
              Watching video
              <span className="inline-flex gap-0.5 ml-0.5">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom: suggested replies + input — pushed up on mobile overlay to clear YouTube timeline */}
      <div className={overlay ? "pb-28" : ""}>
        {/* Suggested replies */}
        {suggestedReplies && suggestedReplies.length > 0 && !loading && (
          <div className={`px-4 pb-2 flex gap-2 overflow-x-auto md:flex-wrap md:overflow-x-visible scrollbar-none ${overlay ? "pointer-events-auto" : ""}`}>
            {suggestedReplies.map((reply, i) => (
              <button
                key={i}
                onClick={() => onQuickReply?.(reply)}
                className={`text-white text-sm px-3 py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 ${
                  overlay
                    ? "bg-black/50 backdrop-blur-md border border-white/20 hover:bg-black/70"
                    : "bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-500"
                }`}
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {/* Model toggle + Input */}
        <div className={`px-4 py-3 ${overlay ? "pointer-events-auto border-t border-transparent" : "border-t border-neutral-800"}`}>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[10px] text-neutral-500 mr-1">Model:</span>
            {(["gemini-flash-latest", "gemini-pro-latest"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModelChange(m)}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                  model === m
                    ? "bg-white/15 text-white border border-white/20"
                    : "text-neutral-500 hover:text-neutral-300 border border-transparent"
                }`}
              >
                {m === "gemini-flash-latest" ? "Flash" : "Pro"}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="flex gap-2 items-end"
          >
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder="Ask something or describe what to watch next..."
                rows={1}
                className={`w-full rounded-2xl px-4 py-2 md:pr-16 text-white placeholder-neutral-400 focus:outline-none text-xs resize-none leading-6 ${
                  overlay
                    ? "bg-black/50 backdrop-blur-md border border-white/20 focus:border-white/40"
                    : "bg-neutral-900 border border-neutral-700 focus:border-neutral-600"
                }`}
                style={{ maxHeight: "calc(15 * 1.5rem + 1rem)", overflowY: "auto" }}
                disabled={loading}
                autoFocus={false}
              />
              <div className="absolute right-3 top-2.5 items-center gap-0.5 pointer-events-none hidden md:flex">
                <kbd className="text-[10px] text-white/50 bg-white/8 border border-white/10 rounded px-1 py-0.5 font-mono">
                  &#8984;
                </kbd>
                <kbd className="text-[10px] text-white/50 bg-white/8 border border-white/10 rounded px-1 py-0.5 font-mono">
                  K
                </kbd>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={loading || transcribing}
              className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors shrink-0 ${
                recording
                  ? "bg-red-500 text-white animate-pulse"
                  : transcribing
                    ? "bg-neutral-700 text-white/50 cursor-wait"
                    : overlay
                      ? "bg-black/50 backdrop-blur-md border border-white/20 text-white hover:bg-black/70"
                      : "bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700"
              }`}
              aria-label={recording ? "Stop recording" : "Start voice input"}
            >
              {transcribing ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  {recording ? (
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  ) : (
                    <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm-1 18.93A7.01 7.01 0 0 1 5 13h2a5 5 0 0 0 10 0h2a7.01 7.01 0 0 1-6 6.93V22h3v2H8v-2h3v-2.07z" />
                  )}
                </svg>
              )}
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-white text-black font-medium px-4 py-2.5 rounded-full hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
