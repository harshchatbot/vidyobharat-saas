import type {
  GuestMedia,
  TimelineProject,
  VideoTimelineItem,
} from "../../app/editor/timeline/types.ts";

export type BrowserIntent =
  | {
      op: "add_media";
      mediaReference: "second_image" | "first_image";
      start?: number;
      duration?: number;
    }
  | {
      op: "add_text";
      text: string;
      clipReferences: Array<"clip_1" | "clip_2">;
      start?: number;
      duration?: number;
      position: "center";
      animation?: "fade-in";
      animationDuration?: number;
    }
  | {
      op: "add_audio";
      mediaReference: "music";
      volume: number;
      muted?: boolean;
      start?: number;
    }
  | {
      op: "add_effect";
      preset: "fade-in" | "fade-out" | "zoom-in" | "zoom-out";
      target: "video" | "text";
      start?: number;
      duration?: number;
    }
  | {
      op: "update_item";
      itemReference: "clip_1" | "clip_2" | "music";
      changes: Record<string, number | string | boolean>;
    }
  | {
      op: "set_duration";
      target: "all_images";
      seconds: number;
    };

export type ResolvedBrowserIntent = BrowserIntent & {
  resolvedItemIds?: string[];
  resolvedMediaId?: string;
};

export type BrowserRequestRoute =
  | {
      kind: "CREATE_REEL";
      duration?: number;
      style: "elegant" | "energetic" | "cinematic";
      title?: string;
      musicVolume?: number;
      transition?: "crossfade" | "slide-left" | "slide-right";
    }
  | { kind: "EDIT_TIMELINE" }
  | { kind: "CLARIFICATION"; message: string };

export type BrowserConversationResponse = {
  kind: "chat" | "advice";
  message: string;
};

// Detect requests for guidance rather than editor execution.
function isGuidanceRequest(text: string): boolean {
  const lower = text.trim().toLowerCase();

  if (
    /^(hi|hello|hey|namaste|नमस्ते)\b/.test(lower) &&
    /\b(can you|could you|help me|how|what|suggest)\b/.test(lower)
  ) {
    return true;
  }

  if (/^(how|what|why|which|where|explain|suggest|recommend)\b/.test(lower)) {
    return true;
  }

  if (
    /\b(can you|could you|would you)\s+(help|guide|explain|suggest|recommend|teach|advise)\b/.test(
      lower
    )
  ) {
    return true;
  }

  if (
    /\b(help me|guide me|teach me)\s+(to|with|understand|create|make|edit|plan)\b/.test(
      lower
    )
  ) {
    return true;
  }

  if (
    /\b(ideas|tips|suggestions|recommendations|best practices)\b/.test(lower) &&
    !/\b(add|apply|insert|trim|remove|delete|replace)\b/.test(lower)
  ) {
    return true;
  }

  return false;
}

// Explicit action requests should still reach the editor.
function isExplicitEditingRequest(text: string): boolean {
  const lower = text.trim().toLowerCase();

  return (
    /\b(trim|cut|split|crop|rotate|resize|remove|delete|insert|apply|replace|mute|export|render)\b/.test(
      lower
    ) ||
    /\b(add|put|place|show)\b.{0,60}\b(text|title|caption|subtitle|music|audio|transition|effect|clip|image)\b/.test(
      lower
    ) ||
    /\b(create|make|generate|produce)\b.{0,60}\b(reel|video|montage|slideshow)\b/.test(
      lower
    )
  );
}

export function classifyBrowserConversation(
  instruction: string,
  project: TimelineProject,
  media: GuestMedia[]
): BrowserConversationResponse | null {
  const text = instruction.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return {
      kind: "chat",
      message: "What would you like to create or edit?",
    };
  }

  if (/^(hi|hello|hey|namaste|नमस्ते)[!.\s]*$/i.test(text)) {
    return {
      kind: "chat",
      message:
        "Hey! I'm your AI video editing assistant. What would you like to create today?",
    };
  }

  // Guidance takes priority over create-reel routing.
  if (isGuidanceRequest(text)) {
    return { kind: "chat", message: "" };
  }

  // General questions should not execute editing tools.
  if (/\?$/.test(text) && !isExplicitEditingRequest(text)) {
    return { kind: "chat", message: "" };
  }

  const asksForTitle = /\b(add|create|show)\b[^.]{0,80}\btitle\b/i.test(text);

  const hasExactTitle =
    /\btitle\b[^"']*["'][^"']+["']/i.test(text) ||
    /\btitle\s*:\s*\S+/i.test(text);

  if (
    asksForTitle &&
    !hasExactTitle &&
    !/\b(reel|video|slideshow|montage)\b/i.test(text)
  ) {
    return {
      kind: "chat",
      message:
        "What should the title say? Put the exact text in quotation marks so I can propose it safely.",
    };
  }

  // Requests for general editing advice, not actions.
  if (
    /\b(advice|suggestions|ideas|pacing|storytelling)\b/.test(lower) &&
    !isExplicitEditingRequest(text)
  ) {
    const visualCount =
      project.tracks.find((track) => track.id === "video")?.items.length ?? 0;

    const availableImages = media.filter(
      (item) =>
        item.media_type === "image" && item.availability !== "unavailable"
    ).length;

    const message =
      visualCount > 0
        ? `Your timeline has ${visualCount} visual ${
            visualCount === 1 ? "clip" : "clips"
          }. Try a strong opening, clear pacing, and consistent transitions.`
        : availableImages > 0
        ? `You have ${availableImages} uploaded ${
            availableImages === 1 ? "image" : "images"
          }. I can help you plan a reel using them.`
        : "I can help you plan your reel before uploading any media. Tell me your topic, audience, and preferred duration.";

    return { kind: "advice", message };
  }

  return null;
}

export function routeBrowserRequest(instruction: string): BrowserRequestRoute {
  const text = instruction.trim();
  const lower = text.toLowerCase();

  // Safety net: conversational prompts must never start Auto Edit.
  if (isGuidanceRequest(text)) {
    return {
      kind: "CLARIFICATION",
      message:
        "I can help you plan the reel. Tell me the topic, audience, and style you have in mind.",
    };
  }

  const create =
    /\b(create|make|generate|produce|build)\b/.test(lower) &&
    /\b(reel|video|montage|slideshow|promotional)\b/.test(lower);

  if (!create) {
    return { kind: "EDIT_TIMELINE" };
  }

  const durationMatch = lower.match(/(\d+(?:\.\d+)?)\s*[- ]?seconds?\b/);

  const quotedTitle = text.match(
    /\btitle\s*(?::|as|saying)?\s*["'“‘]([^"'”’]+)["'”’]/i
  );

  const unquotedTitle = text.match(
    /\b(?:the\s+)?title\s*(?::|as|saying)?\s+([^.!,;]+?)(?=\s*(?:[.!?,;]|$))/i
  );

  const title = (quotedTitle?.[1] ?? unquotedTitle?.[1])?.trim();

  const style: "elegant" | "energetic" | "cinematic" =
    /\b(energetic|dynamic|fast-paced)\b/.test(lower)
      ? "energetic"
      : /\b(cinematic|film|movie-like)\b/.test(lower)
      ? "cinematic"
      : "elegant";

  const transition: "crossfade" | "slide-left" | "slide-right" | undefined =
    /\bslide\s+right\b/.test(lower)
      ? "slide-right"
      : /\bslide\b/.test(lower)
      ? "slide-left"
      : /\b(smooth|blend|crossfade)\b/.test(lower)
      ? "crossfade"
      : undefined;

  const musicVolume = /\b(soft|gentle|quiet)\b/.test(lower)
    ? 0.3
    : /\bmusic\b/.test(lower)
    ? 0.5
    : undefined;

  if (
    /\bmusic\b/.test(lower) &&
    /\b(multiple|different|several)\b/.test(lower)
  ) {
    return {
      kind: "CLARIFICATION",
      message: "Please choose one uploaded music track for this reel.",
    };
  }

  return {
    kind: "CREATE_REEL",
    duration: durationMatch ? Number(durationMatch[1]) : undefined,
    style,
    title,
    musicVolume,
    transition,
  };
}

export function parseBrowserIntent(instruction: string): BrowserIntent[] {
  const intents: BrowserIntent[] = [];
  const lower = instruction.toLowerCase();

  if (
    /\b(add|include|insert|also)\b/.test(lower) &&
    /\bsecond image\b/.test(lower)
  ) {
    intents.push({
      op: "add_media",
      mediaReference: "second_image",
    });
  }

  const title =
    instruction.match(
      /(?:text|title)\s*(?::|as|saying)?\s*["']([^"']+)["']/i
    ) ??
    instruction.match(
      /(?:show|add)\s+([A-Za-z][A-Za-z ]{1,120}?)(?:\s+across\s+both\s+clips|\s+on\s+clip\s*\d)/i
    );

  if (title) {
    intents.push({
      op: "add_text",
      text: title[1].trim(),
      clipReferences:
        /clip\s*1[^.]{0,80}clip\s*2/i.test(instruction) ||
        /both\s+clips/i.test(instruction)
          ? ["clip_1", "clip_2"]
          : ["clip_1"],
      position: "center",
    });
  }

  const requestsMusic =
    /\b(add|insert|include|use|put|play)\b.{0,50}\b(music|audio|soundtrack)\b/.test(
      lower
    ) ||
    /\b(mute|unmute|lower|reduce|increase|change|adjust)\b.{0,50}\b(music|audio|volume)\b/.test(
      lower
    );

  if (requestsMusic) {
    const volume = instruction.match(/(\d+(?:\.\d+)?)\s*%\s*(?:volume)?/i);

    const muted = /\b(mute|muted)\b/.test(lower) && !/\bunmute\b/.test(lower);

    intents.push({
      op: "add_audio",
      mediaReference: "music",
      volume: volume
        ? Number(volume[1]) / 100
        : /\b(quieter|lower|soft|quiet)\b/.test(lower)
        ? 0.5
        : 1,
      muted,
    });
  }

  if (/\b(blend|crossfade)\b/.test(lower)) {
    throw new Error(
      "Crossfade requires overlapping visual clips and is not supported without changing clip timing."
    );
  }

  if (/\b(fade[- ]in|start smoothly|starting smoothly)\b/.test(lower)) {
    intents.push({
      op: "add_effect",
      preset: "fade-in",
      target: /\btext\b/.test(lower) ? "text" : "video",
      start: 0,
      duration: 1,
    });
  }

  if (/\b(fade[- ]out|end smoothly)\b/.test(lower)) {
    intents.push({
      op: "add_effect",
      preset: "fade-out",
      target: "video",
      duration: 1,
    });
  }

  if (/\bzoom\s+out\b/.test(lower)) {
    intents.push({
      op: "add_effect",
      preset: "zoom-out",
      target: "video",
      duration: 3,
    });
  } else if (/\bzoom(?:\s+in)?\b/.test(lower)) {
    intents.push({
      op: "add_effect",
      preset: "zoom-in",
      target: "video",
      duration: 3,
    });
  }

  return intents;
}

export function resolveBrowserIntent(
  intents: BrowserIntent[],
  project: TimelineProject,
  media: GuestMedia[]
): ResolvedBrowserIntent[] {
  const images = media.filter(
    (item) => item.media_type === "image" && item.availability !== "unavailable"
  );

  const audio = media.filter(
    (item) => item.media_type === "audio" && item.availability !== "unavailable"
  );

  const visuals = (
    project.tracks.find((track) => track.id === "video")?.items ?? []
  )
    .filter((item): item is VideoTimelineItem => item.kind === "video")
    .sort((a, b) => a.startTime - b.startTime);

  return intents.map((intent) => {
    if (intent.op === "add_media") {
      const candidate =
        intent.mediaReference === "second_image" ? images[1] : images[0];

      if (!candidate) {
        throw new Error(
          `Missing uploaded media reference: ${intent.mediaReference}.`
        );
      }

      return {
        ...intent,
        resolvedMediaId: candidate.media_id,
      };
    }

    if (intent.op === "add_audio") {
      if (
        !Number.isFinite(intent.volume) ||
        intent.volume < 0 ||
        intent.volume > 1
      ) {
        throw new Error("Music volume must be between 0 and 100 percent.");
      }

      if (audio.length !== 1) {
        throw new Error(
          audio.length === 0
            ? "Missing uploaded music reference."
            : "Ambiguous music reference: choose exactly one audio asset."
        );
      }

      return {
        ...intent,
        resolvedMediaId: audio[0].media_id,
      };
    }

    if (intent.op === "add_text") {
      const selected = intent.clipReferences.map(
        (reference) => visuals[reference === "clip_1" ? 0 : 1]
      );

      if (selected.some((item) => !item)) {
        throw new Error("The requested text clip reference does not exist.");
      }

      const start = selected[0].startTime;
      const end =
        selected[selected.length - 1].startTime +
        selected[selected.length - 1].duration;

      if (
        intent.duration !== undefined &&
        (!Number.isFinite(intent.duration) || intent.duration <= 0)
      ) {
        throw new Error("Text duration must be greater than zero.");
      }

      return {
        ...intent,
        start: intent.start ?? start,
        duration: intent.duration ?? end - start,
      };
    }

    if (intent.op === "add_effect") {
      if (visuals.length === 0) {
        throw new Error("The requested video effect has no visual target.");
      }

      const lastVisual = visuals[visuals.length - 1];

      const start =
        intent.preset === "fade-out"
          ? Math.max(
              0,
              lastVisual.startTime +
                lastVisual.duration -
                (intent.duration ?? 1)
            )
          : intent.start ?? visuals[0].startTime;

      return {
        ...intent,
        start,
        duration: intent.duration ?? 1,
      };
    }

    return intent;
  });
}
