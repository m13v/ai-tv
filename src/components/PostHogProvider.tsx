"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        maskAllInputs: false,
        maskInputFn: (text, element) => {
          // Don't mask the search/chat input — we want to see queries
          if (element?.getAttribute("placeholder")?.includes("watch") ||
              element?.getAttribute("placeholder")?.includes("Ask")) {
            return text;
          }
          return text;
        },
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
