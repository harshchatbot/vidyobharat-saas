import { CreateMLCEngine, type MLCEngine } from "@mlc-ai/web-llm";

const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
// This WebLLM model is a text-only instruction model. It never receives pixels.
export const BROWSER_AI_MODALITY = "text" as const;
export const BROWSER_AI_DOWNLOAD_NOTE = "About 900 MB download; stored locally by your browser. Requires a compatible WebGPU device.";

let engine: MLCEngine | null = null;
let loadingPromise: Promise<MLCEngine> | null = null;
export type BrowserAiProgress = {
  phase:
    | "checking"
    | "downloading"
    | "initializing"
    | "generating"
    | "validating";
  progress?: number;
  message: string;
};

function friendlyPreparationLabel(phase: BrowserAiProgress['phase']): string {
  if (phase === 'generating') return 'Planning your edit…';
  if (phase === 'validating') return 'Checking your edit plan…';
  if (phase === 'initializing') return 'Setting up your creative assistant…';
  return 'Preparing your AI workspace…';
}

export function isModelReady(): boolean {
  return engine !== null;
}

export async function loadModel(
  onProgress?: (progress: number, status: string) => void
): Promise<MLCEngine> {
  if (engine) return engine;

  if (!loadingPromise) {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      throw new Error("WebGPU is unavailable in this browser.");
    }

    loadingPromise = CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (event) => {
        onProgress?.(
          Math.round(event.progress * 100),
          'Preparing your AI workspace…'
        );
      },
    })
      .then((loaded) => {
        engine = loaded;
        return loaded;
      })
      .catch((error) => {
        loadingPromise = null;
        throw error;
      });
  }

  return loadingPromise;
}

export type BrowserChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const CHAT_SYSTEM_PROMPT = `
You are RangManch AI, a friendly and knowledgeable
AI video editing assistant.

You help users:
- Plan reels and short videos.
- Suggest titles, transitions, music, and pacing.
- Understand video editing concepts.
- Improve their existing video projects.

Respond naturally and concisely.
Ask clarifying questions when needed.

Never claim you edited a video unless the
editing engine has actually applied the changes.
`;

export async function generateChatResponse(
  messages: BrowserChatMessage[]
): Promise<string> {
  if (messages.length === 0) {
    throw new Error("Chat requires at least one message.");
  }

  const model = await loadModel();

  const response = await model.chat.completions.create({
    messages: [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      ...messages.slice(-10),
    ],
    temperature: 0.7,
    max_tokens: 250,
  });

  const answer = response.choices[0]?.message?.content?.trim();

  if (!answer) {
    throw new Error("RangManch AI returned an empty response.");
  }

  return answer;
}

const SYSTEM_PROMPT = `You are RangManch AI, a video editing command interpreter.

Convert the user's instruction into one compact JSON edit object.
Return ONLY valid JSON.

Use this exact intermediate shape: {"duration_seconds":number|null,"title":string|null,"title_position":"center"|null,"title_start":number|null,"title_duration":number|null,"title_animation":"fade-in"|null,"title_animation_duration":number|null}

Rules:
- Include only operations requested by the user.
- Preserve the exact text provided by the user.
- Never invent placeholder text.
- Use "all_images" when referring to all images.
- Preserve explicitly requested durations.
- title_duration is how long the title remains visible; title_animation_duration is only the fade-in length. Never copy one into the other.
- If the user does not specify title_duration, leave it null; the application may use the requested image duration as a display default.
- If the user explicitly specifies a fade-in duration, preserve that exact number in title_animation_duration.
- Emit each requested value once. Never return an array or duplicate fields.
- Use null only for values not requested.
- If unsupported, return all fields as null.`;

const INTERMEDIATE_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    duration_seconds: { type: ["number", "null"] },
    title: { type: ["string", "null"] },
    title_position: { type: ["string", "null"] },
    title_start: { type: ["number", "null"] },
    title_duration: { type: ["number", "null"] },
    title_animation: { type: ["string", "null"] },
    title_animation_duration: { type: ["number", "null"] },
  },
  required: [
    "duration_seconds",
    "title",
    "title_position",
    "title_start",
    "title_duration",
    "title_animation",
    "title_animation_duration",
  ],
  additionalProperties: false,
});

export type BrowserEditCommand =
  | {
      op: "set_duration";
      target: "all_images";
      seconds: number;
    }
  | {
      op: "add_text";
      text: string;
      position: "center";
      start: number;
      duration: number;
      animation?: "fade-in";
      animationDuration?: number;
    };

export type BrowserEditResult = {
  commands: BrowserEditCommand[];
};

export type BrowserGenerationResult = BrowserEditResult & {
  rawJson: string;
  normalizedJson: string;
};

export class BrowserAiValidationError extends Error {
  readonly rawJson?: string;
  readonly normalizedJson?: string;
  readonly field?: string;

  constructor(
    message: string,
    options?: { rawJson?: string; normalizedJson?: string; field?: string }
  ) {
    super(message);
    this.name = "BrowserAiValidationError";
    this.rawJson = options?.rawJson;
    this.normalizedJson = options?.normalizedJson;
    this.field = options?.field;
  }
}

export function validateCommands(
  value: unknown,
  instruction = ""
): BrowserEditResult {
  if (
    typeof value !== "object" ||
    value === null ||
    !("commands" in value) ||
    !Array.isArray(value.commands)
  ) {
    throw new Error("Invalid AI response: missing commands array.");
  }

  if (value.commands.length > 20) {
    throw new Error("Too many editing commands.");
  }

  const validNumber = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n);

  const commands: BrowserEditCommand[] = [];
  let durationCommandSeen = false;

  for (const item of value.commands) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("Invalid editing command.");
    }

    const command = item as Record<string, unknown>;

    if (command.op === "set_duration") {
      if (durationCommandSeen)
        throw new Error("Duplicate image duration command.");
      durationCommandSeen = true;
      if (
        command.target !== "all_images" ||
        !validNumber(command.seconds) ||
        command.seconds <= 0 ||
        command.seconds > 3600 ||
        Object.keys(command).some(
          (key) => !["op", "target", "seconds"].includes(key)
        )
      ) {
        throw new Error(
          "Invalid image duration command: target must be all_images and seconds must be between 0 and 3600."
        );
      }

      commands.push({
        op: "set_duration",
        target: "all_images",
        seconds: command.seconds,
      });
    } else if (command.op === "add_text") {
      if (
        typeof command.text !== "string" ||
        !command.text.trim() ||
        command.text.length > 500 ||
        command.position !== "center" ||
        !validNumber(command.start) ||
        command.start < 0 ||
        !validNumber(command.duration) ||
        command.duration <= 0 ||
        command.duration > 3600 ||
        (command.animation !== undefined && command.animation !== "fade-in") ||
        (command.animationDuration !== undefined &&
          (!validNumber(command.animationDuration) ||
            command.animationDuration <= 0 ||
            command.animationDuration > command.duration)) ||
        Object.keys(command).some(
          (key) =>
            ![
              "op",
              "text",
              "position",
              "start",
              "duration",
              "animation",
              "animationDuration",
            ].includes(key)
        )
      ) {
        throw new Error(
          typeof command.text !== "string" ||
          !command.text.trim() ||
          command.text.length > 500
            ? "Invalid text command: text must be a non-empty string of at most 500 characters."
            : command.position !== "center"
            ? 'Invalid text command: position must be "center".'
            : !validNumber(command.start) || command.start < 0
            ? "Invalid text command: start must be a non-negative number."
            : !validNumber(command.duration) ||
              command.duration <= 0 ||
              command.duration > 3600
            ? "Invalid text command: duration must be greater than 0 and at most 3600."
            : command.animation !== undefined && command.animation !== "fade-in"
            ? 'Invalid text command: animation must be "fade-in".'
            : command.animationDuration !== undefined &&
              !validNumber(command.animationDuration)
            ? "Invalid text command: animationDuration must be a finite number."
            : command.animationDuration !== undefined &&
              command.animationDuration <= 0
            ? "Invalid text command: animationDuration must be greater than 0."
            : command.animationDuration !== undefined &&
              command.animationDuration > command.duration
            ? "Invalid text command: animationDuration cannot exceed duration."
            : `Invalid text command: unsupported field "${
                Object.keys(command).find(
                  (key) =>
                    ![
                      "op",
                      "text",
                      "position",
                      "start",
                      "duration",
                      "animation",
                      "animationDuration",
                    ].includes(key)
                ) ?? "unknown"
              }".`
        );
      }

      commands.push({
        op: "add_text",
        text: command.text,
        position: "center",
        start: command.start,
        duration: command.duration,
        ...(command.animation !== undefined && {
          animation: "fade-in" as const,
        }),
        ...(command.animationDuration !== undefined && {
          animationDuration: command.animationDuration as number,
        }),
      });
    } else {
      throw new Error("Unsupported editing operation.");
    }
  }

  validateRequestedIntent(commands, instruction);
  return { commands };
}

function validateRequestedIntent(
  commands: BrowserEditCommand[],
  instruction: string
): void {
  const text = instruction.toLowerCase();
  const durationMatch = text.match(
    /(?:images?|pictures?).{0,24}\b(\d+(?:\.\d+)?)\s*seconds?/i
  );
  if (durationMatch) {
    const requested = Number(durationMatch[1]);
    const command = commands.find((item) => item.op === "set_duration");
    if (!command || command.seconds !== requested)
      throw new Error(
        "The requested image duration command is missing or incorrect."
      );
  }
  const titleMatch = instruction.match(/title\s+['\"]([^'\"]+)['\"]/i);
  if (titleMatch) {
    const command = commands.find((item) => item.op === "add_text");
    if (!command || command.text !== titleMatch[1])
      throw new Error("The requested title command is missing or incorrect.");
    if (/\bcenter(?:ed)?\b/i.test(instruction) && command.position !== "center")
      throw new Error("The requested centered title is missing.");
    if (/fade[- ]in/i.test(instruction) && command.animation !== "fade-in")
      throw new Error("The requested fade-in animation is missing.");
    const fadeMatch = instruction.match(
      /(\d+(?:\.\d+)?)\s*[- ]?second\s*fade[- ]in/i
    );
    if (fadeMatch && command.animationDuration !== Number(fadeMatch[1]))
      throw new Error(
        "The requested fade-in duration is missing or incorrect."
      );
  }
}

export async function generateCommands(
  instruction: string
): Promise<BrowserEditResult> {
  const result = await generateCommandsWithDiagnostics(instruction);
  return result;
}

export async function generateCommandsWithDiagnostics(
  instruction: string,
  onProgress?: (progress: BrowserAiProgress) => void
): Promise<BrowserGenerationResult> {
  if (!instruction.trim()) {
    throw new Error("Please enter an editing instruction.");
  }

  onProgress?.({ phase: "checking", message: friendlyPreparationLabel('checking') });
  const model = await loadModel((progress, message) => {
    const phase = progress < 100 ? 'downloading' : 'initializing';
    onProgress?.({ phase, ...(phase === 'downloading' && { progress }), message: friendlyPreparationLabel(phase) });
  });
  onProgress?.({
    phase: "generating",
    message: friendlyPreparationLabel('generating'),
  });

  const response = await model.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: instruction.trim() },
    ],
    temperature: 0,
    max_tokens: 600,
    response_format: {
      type: "json_object",
      schema: INTERMEDIATE_SCHEMA,
    },
  });

  const content = response.choices[0]?.message.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The model returned an empty response.");
  }

  onProgress?.({
    phase: "validating",
    message: friendlyPreparationLabel('validating'),
  });
  return parseAndValidateModelJson(content, instruction);
}

export type AutoEditAiDirection = {
  transition: 'crossfade' | 'slide-left' | 'slide-right';
  effectPattern: Array<'zoom-in' | 'zoom-out' | 'none'>;
};

export function parseAutoEditDirection(value: unknown, clipCount: number): AutoEditAiDirection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The local model returned an invalid AI edit direction.');
  const record = value as Record<string, unknown>;
  if (!['crossfade', 'slide-left', 'slide-right'].includes(String(record.transition)) || !Array.isArray(record.effectPattern) || record.effectPattern.length !== clipCount || record.effectPattern.some((effect) => !['zoom-in', 'zoom-out', 'none'].includes(String(effect)))) throw new Error('The local model proposed unsupported edit decisions.');
  return { transition: record.transition as AutoEditAiDirection['transition'], effectPattern: record.effectPattern as AutoEditAiDirection['effectPattern'] };
}

/**
 * Uses the already-cached text model to choose among supported edit primitives.
 * No image pixels or media bytes are sent to the model; beat timestamps are facts
 * supplied by the application and remain the only source for beat-aligned cuts.
 */
export async function generateAutoEditDirection(input: {
  instruction: string;
  style: string;
  clipCount: number;
  beatTimes: number[];
  onProgress?: (progress: BrowserAiProgress) => void;
}): Promise<AutoEditAiDirection> {
  const clipCount = Math.max(1, Math.min(12, Math.floor(input.clipCount)));
  input.onProgress?.({ phase: 'checking', message: friendlyPreparationLabel('checking') });
  const model = await loadModel((progress) => {
    const phase = progress < 100 ? 'downloading' : 'initializing';
    input.onProgress?.({ phase, ...(phase === 'downloading' && { progress }), message: friendlyPreparationLabel(phase) });
  });
  input.onProgress?.({ phase: 'generating', message: friendlyPreparationLabel('generating') });
  const response = await model.chat.completions.create({
    messages: [{ role: 'system', content: `Return only JSON: {"transition":"crossfade"|"slide-left"|"slide-right","effectPattern":["zoom-in"|"zoom-out"|"none"]}. Choose a coherent, non-repetitive pattern with exactly ${clipCount} entries. You are text-only: use only these facts, never claim visual understanding. Style: ${input.style}. User direction: ${input.instruction.slice(0, 500) || 'none'}. Beat timestamps (may be empty; do not invent beats): ${JSON.stringify(input.beatTimes.slice(0, 24))}.` }],
    temperature: 0.2, max_tokens: 160, response_format: { type: 'json_object' },
  });
  input.onProgress?.({ phase: 'validating', message: friendlyPreparationLabel('validating') });
  const raw = response.choices[0]?.message.content;
  if (typeof raw !== 'string') throw new Error('The local model returned no AI edit direction.');
  return parseAutoEditDirection(JSON.parse(raw), clipCount);
}

export function parseAndValidateModelJson(
  rawJson: string,
  instruction: string
): BrowserGenerationResult {
  let normalizedJson = "";
  try {
    const rawValue = JSON.parse(rawJson);
    const intermediate = normalizeIntermediateTiming(
      validateIntermediate(rawValue),
      instruction
    );
    normalizedJson = JSON.stringify(intermediate, null, 2);
    const commands: unknown[] = [];
    if (intermediate.duration_seconds !== null)
      commands.push({
        op: "set_duration",
        target: "all_images",
        seconds: intermediate.duration_seconds,
      });
    if (intermediate.title !== null)
      commands.push({
        op: "add_text",
        text: intermediate.title,
        position: intermediate.title_position,
        start: intermediate.title_start,
        duration: intermediate.title_duration,
        ...(intermediate.title_animation !== null && {
          animation: intermediate.title_animation,
        }),
        ...(intermediate.title_animation_duration !== null && {
          animationDuration: intermediate.title_animation_duration,
        }),
      });
    return {
      ...validateCommands({ commands }, instruction),
      rawJson,
      normalizedJson,
    };
  } catch (cause) {
    if (cause instanceof BrowserAiValidationError) {
      throw new BrowserAiValidationError(cause.message, {
        rawJson,
        normalizedJson,
        field: cause.field,
      });
    }
    throw new BrowserAiValidationError(
      cause instanceof Error ? cause.message : "Invalid model output.",
      { rawJson, normalizedJson }
    );
  }
}

type TimingIntent = {
  imageDuration: number | null;
  titleDuration: number | null;
  fadeDuration: number | null;
};

function extractTimingIntent(instruction: string): TimingIntent {
  const imageMatches = [
    ...instruction.matchAll(
      /(?:all\s+)?(?:images?|pictures?)\s+(?:to\s+|for\s+)?(\d+(?:\.\d+)?)\s*seconds?/gi
    ),
    ...instruction.matchAll(
      /(?:saari|sabhi|sab)\s+images?\s+ko\s+(\d+(?:\.\d+)?)\s*seconds?\s+ka/gi
    ),
  ].map((m) => Number(m[1]));
  const fadeMatches = [
    ...instruction.matchAll(
      /(\d+(?:\.\d+)?)\s*[- ]?second(?:s)?\s+fade[- ]?in/gi
    ),
    ...instruction.matchAll(/(\d+(?:\.\d+)?)\s*seconds?\s+ka\s+fade[- ]?in/gi),
  ].map((m) => Number(m[1]));
  const titleMatches = [
    ...instruction.matchAll(
      /title[^.]{0,80}?\bfor\s+(\d+(?:\.\d+)?)\s*seconds?\b(?!\s*[- ]?fade)/gi
    ),
  ].map((m) => Number(m[1]));
  const unique = (values: number[], label: string): number | null => {
    const distinct = [...new Set(values)];
    if (distinct.length > 1)
      throw new Error(`Ambiguous ${label} duration in instruction.`);
    return distinct[0] ?? null;
  };
  return {
    imageDuration: unique(imageMatches, "image"),
    titleDuration: unique(titleMatches, "title"),
    fadeDuration: unique(fadeMatches, "fade-in"),
  };
}

function normalizeIntermediateTiming(
  intermediate: ReturnType<typeof validateIntermediate>,
  instruction: string
): ReturnType<typeof validateIntermediate> {
  const intent = extractTimingIntent(instruction);
  const normalized = { ...intermediate };
  if (intent.imageDuration !== null)
    normalized.duration_seconds = intent.imageDuration;
  if (normalized.title !== null) {
    if (intent.titleDuration !== null)
      normalized.title_duration = intent.titleDuration;
    else if (intent.imageDuration !== null)
      normalized.title_duration = intent.imageDuration;
    if (intent.fadeDuration !== null)
      normalized.title_animation_duration = intent.fadeDuration;
  }
  return normalized;
}

function validateIntermediate(value: unknown): {
  duration_seconds: number | null;
  title: string | null;
  title_position: string | null;
  title_start: number | null;
  title_duration: number | null;
  title_animation: string | null;
  title_animation_duration: number | null;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid AI response: expected one JSON object.");
  const record = value as Record<string, unknown>;
  const keys = [
    "duration_seconds",
    "title",
    "title_position",
    "title_start",
    "title_duration",
    "title_animation",
    "title_animation_duration",
  ];
  const unknownKey = Object.keys(record).find((key) => !keys.includes(key));
  if (unknownKey)
    throw new BrowserAiValidationError(
      `Invalid AI response: unsupported field "${unknownKey}".`,
      { field: unknownKey }
    );
  const missingKey = keys.find((key) => !(key in record));
  if (missingKey)
    throw new BrowserAiValidationError(
      `Invalid AI response: missing field "${missingKey}".`,
      { field: missingKey }
    );
  const numberOrNull = (v: unknown): v is number | null =>
    v === null || (typeof v === "number" && Number.isFinite(v));
  const numericKey = [
    "duration_seconds",
    "title_start",
    "title_duration",
    "title_animation_duration",
  ].find((key) => !numberOrNull(record[key]));
  if (numericKey)
    throw new BrowserAiValidationError(
      `Invalid AI response: numeric field "${numericKey}" is invalid.`,
      { field: numericKey }
    );
  const textKey = ["title", "title_position", "title_animation"].find(
    (key) => record[key] !== null && typeof record[key] !== "string"
  );
  if (textKey)
    throw new BrowserAiValidationError(
      `Invalid AI response: text field "${textKey}" is invalid.`,
      { field: textKey }
    );
  return record as ReturnType<typeof validateIntermediate>;
}
