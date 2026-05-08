from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import Settings, get_settings
from app.models.entities import Video
from app.services.llm.hf_qwen_client import HFQwenChatClient
from app.services.llm.usage_estimator import (
    estimate_chat_input_tokens,
    estimate_chat_output_tokens,
    estimate_cost_usd,
)
from app.services.video_studio_ai_guard import is_studio_ai_question_relevant

logger = logging.getLogger(__name__)


class VideoStudioAIService:
    def __init__(self, settings: Settings | None = None, *, hf_client: HFQwenChatClient | None = None) -> None:
        self.settings = settings or get_settings()
        self.hf_client = hf_client
        if self.hf_client is None:
            try:
                self.hf_client = HFQwenChatClient(settings=self.settings)
            except Exception:
                logger.exception("video_studio_ai_hf_client_init_failed")
                self.hf_client = None

    def reply(
        self,
        *,
        video: Video,
        message: str,
        chat_history: list[dict[str, str]] | None = None,
    ) -> dict[str, str]:
        context = self._build_context(video)
        provider_name = self.hf_client.provider_name() if self.hf_client else "unavailable"
        model_name = self.hf_client.selected_model_name() if self.hf_client else "unavailable"

        logger.info(
            "video_studio_ai_request",
            extra={
                "render_id": str(video.id),
                "status": str(getattr(video.status, "value", video.status)),
                "selected_text_provider": provider_name,
                "model": model_name,
                "task_type": "studio_chat",
            },
        )

        direct_reply = self._direct_metadata_reply(context=context, user_message=message)
        if direct_reply:
            return {
                "reply": direct_reply,
                "provider": provider_name,
                "model": model_name,
            }

        # Cheap off-topic guard before model call
        if not is_studio_ai_question_relevant(message):
            blocked_reply = (
                "I’m focused on this video workspace. Ask me about this render’s status, "
                "recipe, assets, script, voice, music, captions, settings, enhancer output, "
                "or how to improve the video."
            )
            logger.info(
                "video_studio_ai_blocked_irrelevant",
                extra={
                    "render_id": str(video.id),
                    "selected_text_provider": provider_name,
                    "model": model_name,
                    "task_type": "studio_chat",
                    "user_message": str(message or "")[:300],
                },
            )
            return {
                "reply": blocked_reply,
                "provider": provider_name,
                "model": model_name,
            }

        system_prompt = (
            "You are Studio AI inside RangManch video workspace. "
            "You only help with the currently opened video/render and its related creation context. "
            "Help the user understand the active render, explain current configuration and status, "
            "surface recipe metadata and enhancer output when present, and suggest next edit steps grounded in the provided render context. "
            "You may answer questions about render status, progress, recipe, scenes, prompts, enhancer output, assets, voice, music, captions, narration, model/provider choice, quality settings, likely issues, fixes, and improvement suggestions for this render. "
            "If the user asks something unrelated to the current render/video context, do not answer the unrelated question. "
            "Instead briefly say that you are focused on this video workspace and invite them to ask about the render, assets, script, settings, or improvements. "
            "Be concise, helpful, and specific. "
            "If the user greets you, greet them briefly and mention the current render state. "
            "If they ask for edits, explain the most relevant edits available now such as retrying with a new script, voice, music, prompt, or recipe inputs. "
            "Do not claim actions were executed unless the context explicitly says so. "
            "If some field is missing, say it is not available rather than guessing. "
            "Do not mention provider internals unless relevant to the user question."
        )
        user_prompt = self._build_user_prompt(context=context, message=message, chat_history=chat_history or [])

        input_cost_per_1m = float(getattr(self.settings, "hf_qwen_input_cost_per_1m", 0.30))
        output_cost_per_1m = float(getattr(self.settings, "hf_qwen_output_cost_per_1m", 0.60))

        messages_for_estimation = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            if not self.hf_client:
                raise RuntimeError("HF Qwen client is unavailable")

            reply_text = self.hf_client.chat_completion(
                task_type="studio_chat",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.3,
                max_tokens=700,
            ).strip()

            approx_input_tokens = estimate_chat_input_tokens(messages_for_estimation)
            approx_output_tokens = estimate_chat_output_tokens(reply_text)
            approx_cost_usd = estimate_cost_usd(
                input_tokens=approx_input_tokens,
                output_tokens=approx_output_tokens,
                input_cost_per_1m=input_cost_per_1m,
                output_cost_per_1m=output_cost_per_1m,
            )

            logger.info(
                "video_studio_ai_usage_estimated",
                extra={
                    "render_id": str(video.id),
                    "selected_text_provider": provider_name,
                    "model": model_name,
                    "task_type": "studio_chat",
                    "approx_input_tokens": approx_input_tokens,
                    "approx_output_tokens": approx_output_tokens,
                    "approx_total_tokens": approx_input_tokens + approx_output_tokens,
                    "approx_cost_usd": approx_cost_usd,
                },
            )

        except Exception:
            logger.exception(
                "video_studio_ai_provider_failed",
                extra={
                    "render_id": str(video.id),
                    "selected_text_provider": provider_name,
                    "model": model_name,
                },
            )
            reply_text = self._fallback_reply(context=context, user_message=message)

        if not reply_text:
            reply_text = self._fallback_reply(context=context, user_message=message)

        return {
            "reply": reply_text,
            "provider": provider_name,
            "model": model_name,
        }

    def _direct_metadata_reply(self, *, context: dict[str, Any], user_message: str) -> str | None:
        message = str(user_message or "").strip().lower()
        if not message:
            return None

        if (
            ("model" in message or "which model" in message or "what model" in message)
            and any(token in message for token in {"video", "render", "used", "last"})
        ):
            provider = context.get("provider_name") or "the configured provider"
            return (
                f"For this currently opened video, the model was {context.get('selected_model') or 'not available'} "
                f"using {provider}."
            )

        if "duration" in message or "how long" in message:
            duration = context.get("duration_seconds")
            if duration:
                return f"This video is {duration} seconds long."
            return "The duration is not available for this render yet."

        if "resolution" in message or "quality" in message or "aspect ratio" in message or "format" in message:
            return (
                f"This render is {context.get('aspect_ratio') or 'n/a'} at {context.get('resolution') or 'n/a'}, "
                f"with quality set to {context.get('quality') or 'n/a'}."
            )

        if "voice" in message or "language" in message or "narration" in message:
            reply_parts: list[str] = []
            if context.get("language"):
                reply_parts.append(f"Language: {context['language']}")
            if context.get("voice"):
                reply_parts.append(f"Requested voice: {context['voice']}")
            if context.get("tts_resolved_voice"):
                reply_parts.append(f"Resolved TTS voice: {context['tts_resolved_voice']}")
            if context.get("script"):
                reply_parts.append(f"Narration script: {context['script']}")
            return " ".join(reply_parts) if reply_parts else "Voice and narration details are not available yet."

        if "script" in message and any(token in message for token in {"what", "which", "show", "used"}):
            script = str(context.get("script") or "").strip()
            if script:
                return f'The narration script used for this render was: "{script}"'
            return "This render does not have a narration script recorded."

        return None

    def _build_context(self, video: Video) -> dict[str, Any]:
        metadata = dict(getattr(video, "pipeline_metadata", {}) or {})
        events = list(metadata.get("events") or [])
        events = sorted(
            [
                {
                    "title": str(event.get("title") or "Step"),
                    "detail": str(event.get("detail") or ""),
                    "state": str(event.get("state") or ""),
                    "created_at": str(event.get("created_at") or ""),
                }
                for event in events
                if isinstance(event, dict)
            ],
            key=lambda item: item.get("created_at") or "",
        )
        stage = self._stage_for(video=video)
        reference_images = self._coerce_url_list(getattr(video, "reference_images", []) or [])
        image_urls = self._coerce_url_list(getattr(video, "image_urls", []) or [])
        scene_plan = list(metadata.get("deep_scene_plan") or [])
        if not scene_plan:
            scene_plan = list(metadata.get("ugc_scene_plan") or [])
        enhancer = metadata.get("enhancer") if isinstance(metadata.get("enhancer"), dict) else {}

        return {
            "video_id": str(video.id),
            "title": str(video.title or "Untitled Video"),
            "status": str(getattr(video.status, "value", video.status)),
            "progress": int(video.progress or 0),
            "stage_label": stage["label"],
            "stage_detail": stage["detail"],
            "summary": self._created_summary(video),
            "selected_model": str(video.selected_model or "selected model"),
            "provider_name": str(video.provider_name or "AI Video"),
            "recipe_id": str(
                getattr(video, "recipe_id", None)
                or metadata.get("recipe_id")
                or metadata.get("recipeId")
                or ""
            ),
            "pipeline_mode": str(
                getattr(video, "pipeline_mode", None)
                or metadata.get("pipeline_mode")
                or metadata.get("pipelineMode")
                or ""
            ),
            "aspect_ratio": str(video.aspect_ratio or "9:16"),
            "resolution": str(video.resolution or "720p"),
            "quality": str(
                getattr(video, "request_quality", None)
                or metadata.get("quality")
                or ("high" if str(video.resolution or "").lower() == "1080p" else "standard")
            ),
            "duration_seconds": int(video.duration_seconds or 0) if video.duration_seconds is not None else None,
            "narration_enabled": bool(getattr(video, "narration_enabled", True)),
            "captions_enabled": bool(video.captions_enabled),
            "caption_style": str(getattr(video, "caption_style", "") or ""),
            "voice": str(getattr(video, "voice", "") or ""),
            "language": str(getattr(video, "language", "") or ""),
            "tts_provider": str(getattr(video, "tts_provider", "") or ""),
            "tts_resolved_voice": str(getattr(video, "tts_resolved_voice", "") or ""),
            "tts_provider_message": str(getattr(video, "tts_provider_message", "") or ""),
            "music_mode": str(video.music_mode or "none"),
            "music_track_id": str(getattr(video, "music_track_id", "") or ""),
            "music_file_url": str(getattr(video, "music_file_url", "") or ""),
            "music_volume": int(getattr(video, "music_volume", 0) or 0),
            "reference_image_count": len(reference_images),
            "reference_images": reference_images[:4],
            "image_urls": image_urls[:4],
            "has_source_image": bool(getattr(video, "source_image_url", None)),
            "source_image_url": str(getattr(video, "source_image_url", "") or ""),
            "thumbnail_url": str(getattr(video, "thumbnail_url", "") or ""),
            "script": str(metadata.get("narration_script") or getattr(video, "script", "") or "").strip(),
            "narration_source_type": str(metadata.get("narration_source_type") or ""),
            "todos": self._todos_for(video),
            "events": events[-8:],
            "planner_watchouts": self._planner_watchouts(metadata),
            "scene_plan": self._scene_plan_summary(scene_plan),
            "selected_persona": self._selected_persona_summary(metadata),
            "enhancer": self._enhancer_summary(enhancer),
            "recipe_metadata": self._recipe_metadata_summary(metadata),
            "output_ready": bool(getattr(video, "output_url", None)),
            "output_url": str(getattr(video, "output_url", "") or ""),
            "error_message": str(getattr(video, "error_message", "") or ""),
        }

    def _build_user_prompt(self, *, context: dict[str, Any], message: str, chat_history: list[dict[str, str]]) -> str:
        history_lines = []
        for item in chat_history[-6:]:
            role = str(item.get("role") or "user").strip().lower()
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            history_lines.append(f"{role}: {text}")

        todo_lines = "\n".join(f"- {item}" for item in context["todos"])
        event_lines = "\n".join(
            f"- {event['title']}: {event['detail']}".strip()
            for event in context["events"]
            if event.get("title") or event.get("detail")
        ) or "- No pipeline events yet."
        planner_lines = "\n".join(f"- {flag}" for flag in context["planner_watchouts"]) or "- None"
        history_block = "\n".join(history_lines) if history_lines else "No previous chat turns."
        scene_plan_lines = "\n".join(
            f"- {item['stage_label']} ({item['render_lane']}): {item['visual_objective']}"
            for item in context["scene_plan"]
        ) or "- No scene plan summary available."

        enhancer = context["enhancer"]
        enhancer_lines = "\n".join(
            [
                f"status: {enhancer.get('status') or 'unavailable'}",
                f"hook_line: {enhancer.get('hook_line') or 'n/a'}",
                f"showcase_line: {enhancer.get('showcase_line') or 'n/a'}",
                f"cta_line: {enhancer.get('cta_line') or 'n/a'}",
                f"showcase_visual_prompt: {enhancer.get('showcase_visual_prompt') or 'n/a'}",
                f"voice_tone: {enhancer.get('voice_tone') or 'n/a'}",
                f"notes: {', '.join(enhancer.get('notes') or []) or 'n/a'}",
                f"error: {enhancer.get('error') or 'None'}",
            ]
        )

        recipe_lines = "\n".join(
            f"- {key}: {value}"
            for key, value in context["recipe_metadata"].items()
            if value not in ("", None, [], {})
        ) or "- No recipe metadata summary available."

        selected_persona = context["selected_persona"]
        persona_lines = "\n".join(
            f"- {key}: {value}"
            for key, value in selected_persona.items()
            if value not in ("", None, [], {})
        ) or "- No resolved persona metadata."

        return (
            f"Render title: {context['title']}\n"
            f"Render id: {context['video_id']}\n"
            f"Status: {context['status']}\n"
            f"Progress: {context['progress']}%\n"
            f"Current stage: {context['stage_label']}\n"
            f"Stage detail: {context['stage_detail']}\n"
            f"Summary: {context['summary']}\n"
            f"Model: {context['selected_model']}\n"
            f"Provider label: {context['provider_name']}\n"
            f"Recipe id: {context['recipe_id'] or 'n/a'}\n"
            f"Pipeline mode: {context['pipeline_mode'] or 'n/a'}\n"
            f"Format: {context['aspect_ratio']} at {context['resolution']}\n"
            f"Quality: {context['quality']}\n"
            f"Duration seconds: {context['duration_seconds']}\n"
            f"Narration enabled: {context['narration_enabled']}\n"
            f"Captions enabled: {context['captions_enabled']}\n"
            f"Caption style: {context['caption_style'] or 'n/a'}\n"
            f"Voice: {context['voice'] or 'n/a'}\n"
            f"Language: {context['language'] or 'n/a'}\n"
            f"TTS provider: {context['tts_provider'] or 'n/a'}\n"
            f"Resolved TTS voice: {context['tts_resolved_voice'] or 'n/a'}\n"
            f"Music mode: {context['music_mode']}\n"
            f"Music track id: {context['music_track_id'] or 'n/a'}\n"
            f"Music volume: {context['music_volume']}\n"
            f"Music file url: {context['music_file_url'] or 'n/a'}\n"
            f"Reference images: {context['reference_image_count']}\n"
            f"Reference image urls: {json.dumps(context['reference_images'])}\n"
            f"Additional image urls: {json.dumps(context['image_urls'])}\n"
            f"Source image attached: {context['has_source_image']}\n"
            f"Source image url: {context['source_image_url'] or 'n/a'}\n"
            f"Thumbnail url: {context['thumbnail_url'] or 'n/a'}\n"
            f"Output ready: {context['output_ready']}\n"
            f"Output url: {context['output_url'] or 'n/a'}\n"
            f"Error message: {context['error_message'] or 'None'}\n"
            f"Narration source type: {context['narration_source_type'] or 'n/a'}\n"
            f"Narration script:\n{context['script'] or 'None'}\n"
            f"Resolved persona:\n{persona_lines}\n"
            f"Enhancer summary:\n{enhancer_lines}\n"
            f"Recipe metadata summary:\n{recipe_lines}\n"
            f"Todos:\n{todo_lines}\n"
            f"Recent pipeline events:\n{event_lines}\n"
            f"Planner watchouts:\n{planner_lines}\n"
            f"Scene plan summary:\n{scene_plan_lines}\n"
            f"Conversation history:\n{history_block}\n"
            f"User message:\n{message.strip()}"
        )

    def _fallback_reply(self, *, context: dict[str, Any], user_message: str) -> str:
        message = user_message.strip().lower()

        if any(token in message for token in {"hi", "hello", "hey"}):
            return (
                f"Hi. This render is currently at \"{context['stage_label']}\". "
                f"{context['summary']} Ask me about the recipe, enhancer output, assets, or the next step and I’ll keep it grounded in this workspace."
            )

        if "enhancer" in message:
            enhancer = context["enhancer"]
            if enhancer.get("status") == "success":
                return (
                    f"The enhancer produced hook \"{enhancer.get('hook_line')}\" and CTA \"{enhancer.get('cta_line')}\". "
                    f"The showcase prompt is \"{enhancer.get('showcase_visual_prompt')}\"."
                )
            return "This render does not have successful enhancer output available yet."

        if "stuck" in message or "why" in message:
            return (
                f"This render is at \"{context['stage_label']}\" with status {context['status']} and progress {context['progress']}%. "
                f"The latest event is {context['events'][-1]['title'] if context['events'] else 'not available'}."
            )

        if "edit" in message or "change" in message:
            if context["status"] == "completed":
                return (
                    "You can edit this by rerendering with a new script, voice, language, music setting, or recipe input. "
                    f"Right now the strongest changes would be around {context['selected_model']}, narration {'on' if context['narration_enabled'] else 'off'}, "
                    f"and the {context['aspect_ratio']} export."
                )
            return (
                f"This render is still in \"{context['stage_label']}\". "
                "I would wait for this pass to finish before changing script, voice, or music, unless you want to restart with updated inputs immediately."
            )

        return (
            f"This render is currently at \"{context['stage_label']}\". "
            f"{context['summary']} The next likely focus is {context['todos'][-1] if context['todos'] else 'finishing the render'}."
        )

    def _stage_for(self, *, video: Video) -> dict[str, str]:
        status = str(getattr(video.status, "value", video.status))
        progress = int(video.progress or 0)
        if status == "draft":
            return {"label": "Queueing render", "detail": "Preparing recipe steps, assets, and render slots."}
        if progress < 35:
            return {"label": "Building scenes", "detail": "Arranging scenes, references, and the first clip plan."}
        if progress < 70:
            return {"label": "Generating visuals", "detail": "Rendering the main clips and aligning motion for the final edit."}
        return {"label": "Finishing audio and export", "detail": "Balancing music, finalizing captions, and encoding the final file."}

    def _todos_for(self, video: Video) -> list[str]:
        reference_images = self._coerce_url_list(getattr(video, "reference_images", []) or [])
        source_image_url = getattr(video, "source_image_url", None)
        visual_label = (
            "Generate video using the attached reference image"
            if reference_images or source_image_url
            else "Generate video scenes from the prompt and selected model"
        )
        bgm_label = (
            f"Prepare {'selected' if str(video.music_mode or 'none') == 'library' else str(video.music_mode or 'none')} music for the final mix"
            if str(video.music_mode or "none") != "none"
            else "Skip music layer for this render"
        )
        timeline_label = f"Assemble timeline at {video.aspect_ratio} · {video.resolution}"
        return [visual_label, bgm_label, timeline_label]

    def _created_summary(self, video: Video) -> str:
        reference_images = list(getattr(video, "reference_images", []) or [])
        status = str(getattr(video.status, "value", video.status))
        if status == "completed":
            music_clause = "an attached music layer" if str(video.music_mode or "none") != "none" else "no background music"
            return (
                f"Created a {self._format_duration(video.duration_seconds)} {video.aspect_ratio} video using "
                f"{video.selected_model or 'the selected model'} with {music_clause} and export-ready playback."
            )
        reference_clause = (
            f" with {len(reference_images)} visual reference{'s' if len(reference_images) != 1 else ''}"
            if reference_images
            else ""
        )
        return f"Preparing a {video.aspect_ratio} video using {video.selected_model or 'the selected model'}{reference_clause}."

    def _planner_watchouts(self, metadata: dict[str, Any]) -> list[str]:
        scene_plan = list(metadata.get("deep_scene_plan") or [])
        if not scene_plan:
            scene_plan = list(metadata.get("ugc_scene_plan") or [])
        flags: list[str] = []
        for scene in scene_plan:
            if not isinstance(scene, dict):
                continue
            qa_flags = scene.get("qa_flags") or []
            if not isinstance(qa_flags, list):
                continue
            for flag in qa_flags:
                if isinstance(flag, str) and flag.strip():
                    flags.append(flag.replace("_", " "))
        return flags[:8]

    def _scene_plan_summary(self, scene_plan: list[dict[str, Any]]) -> list[dict[str, str]]:
        summary: list[dict[str, str]] = []
        for scene in scene_plan[:6]:
            if not isinstance(scene, dict):
                continue
            summary.append(
                {
                    "scene_id": str(scene.get("scene_id") or ""),
                    "stage_label": str(scene.get("stage_label") or scene.get("stage_name") or "Scene"),
                    "render_lane": str(scene.get("render_lane") or "unknown"),
                    "visual_objective": str(scene.get("visual_objective") or scene.get("topic_focus") or "No visual objective available."),
                }
            )
        return summary

    def _selected_persona_summary(self, metadata: dict[str, Any]) -> dict[str, Any]:
        selected_persona = metadata.get("selected_persona")
        if isinstance(selected_persona, dict) and selected_persona:
            return {
                "persona_id": selected_persona.get("persona_id") or metadata.get("selected_persona_id"),
                "source": selected_persona.get("persona_source") or metadata.get("resolved_avatar_source"),
                "name": selected_persona.get("name") or metadata.get("resolved_avatar_name"),
                "image_url": selected_persona.get("image_url"),
                "default_voice_id": selected_persona.get("default_voice_id"),
                "language_preference": selected_persona.get("language_preference"),
            }
        return {
            "persona_id": metadata.get("selected_persona_id") or metadata.get("resolved_avatar_id"),
            "source": metadata.get("resolved_avatar_source"),
            "name": metadata.get("resolved_avatar_name"),
        }

    def _enhancer_summary(self, enhancer: dict[str, Any]) -> dict[str, Any]:
        return {
            "status": enhancer.get("status") if isinstance(enhancer, dict) else None,
            "hook_line": enhancer.get("hook_line") if isinstance(enhancer, dict) else None,
            "showcase_line": enhancer.get("showcase_line") if isinstance(enhancer, dict) else None,
            "cta_line": enhancer.get("cta_line") if isinstance(enhancer, dict) else None,
            "showcase_visual_prompt": enhancer.get("showcase_visual_prompt") if isinstance(enhancer, dict) else None,
            "voice_tone": enhancer.get("voice_tone") if isinstance(enhancer, dict) else None,
            "notes": list(enhancer.get("notes") or []) if isinstance(enhancer, dict) else [],
            "error": enhancer.get("error") if isinstance(enhancer, dict) else None,
            "model": enhancer.get("model") if isinstance(enhancer, dict) else None,
            "provider": enhancer.get("provider") if isinstance(enhancer, dict) else None,
        }

    def _recipe_metadata_summary(self, metadata: dict[str, Any]) -> dict[str, Any]:
        return {
            "ugc_ad_style": metadata.get("ugc_ad_style"),
            "ugc_ad_family": metadata.get("ugc_ad_family"),
            "ugc_ad_subtopic": metadata.get("ugc_ad_subtopic"),
            "ugc_ad_mode": metadata.get("ugc_ad_mode"),
            "avatar_product_brief": metadata.get("avatar_product_brief"),
            "avatar_product_workflow": metadata.get("avatar_product_workflow"),
            "avatar_product_script_summary": metadata.get("avatar_product_script_summary"),
            "advanced_controls_summary": metadata.get("advanced_controls_summary"),
            "ugc_client_brief": metadata.get("ugc_client_brief"),
            "resolved_talking_voice": metadata.get("resolved_talking_voice"),
            "resolved_talking_language": metadata.get("resolved_talking_language"),
        }

    def _format_duration(self, seconds: int | None) -> str:
        safe_seconds = max(0, float(seconds or 0))
        return f"{safe_seconds:.0f}s" if safe_seconds.is_integer() else f"{safe_seconds:.1f}s"

    def _coerce_url_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                return [text]
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        return []
