from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import Settings, get_settings
from app.models.entities import Video
from app.services.llm.qwen_service import QwenService

logger = logging.getLogger(__name__)


class VideoStudioAIService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.qwen = QwenService(self.settings)

    def reply(
        self,
        *,
        video: Video,
        message: str,
        chat_history: list[dict[str, str]] | None = None,
    ) -> dict[str, str]:
        context = self._build_context(video)
        system_prompt = (
            'You are Studio AI inside RangManch video workspace. '
            'Help the user understand the current render, suggest next edit steps, explain what can be changed, '
            'and stay grounded in the provided render context. '
            'Be concise, helpful, and specific. '
            'If the user greets you, greet them briefly and mention the current render state. '
            'If they ask for edits, explain the most relevant edits available now such as retrying with a new script, voice, music, or prompt. '
            'Do not claim actions were executed unless the context explicitly says so. '
            'Do not mention provider internals unless relevant to the user question.'
        )
        user_prompt = self._build_user_prompt(context=context, message=message, chat_history=chat_history or [])
        logger.info(
            'video_studio_ai_request',
            extra={
                'render_id': str(video.id),
                'status': str(getattr(video.status, 'value', video.status)),
                'selected_text_provider': self.qwen.provider_name(),
                'task_type': 'studio_chat',
            },
        )
        try:
            reply_text = self.qwen.complete_text(
                task_type='studio_chat',
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.3,
            ).strip()
        except Exception:
            logger.exception(
                'video_studio_ai_provider_failed',
                extra={'render_id': str(video.id), 'selected_text_provider': self.qwen.provider_name()},
            )
            reply_text = self._fallback_reply(context=context, user_message=message)

        if not reply_text:
            reply_text = self._fallback_reply(context=context, user_message=message)
        return {
            'reply': reply_text,
            'provider': self.qwen.provider_name(),
            'model': self._selected_model_name(),
        }

    def _build_context(self, video: Video) -> dict[str, Any]:
        metadata = dict(getattr(video, 'pipeline_metadata', {}) or {})
        events = list(metadata.get('events') or [])
        events = sorted(
            [
                {
                    'title': str(event.get('title') or 'Step'),
                    'detail': str(event.get('detail') or ''),
                    'state': str(event.get('state') or ''),
                    'created_at': str(event.get('created_at') or ''),
                }
                for event in events
                if isinstance(event, dict)
            ],
            key=lambda item: item.get('created_at') or '',
        )
        stage = self._stage_for(video=video)
        return {
            'video_id': str(video.id),
            'title': str(video.title or 'Untitled Video'),
            'status': str(getattr(video.status, 'value', video.status)),
            'progress': int(video.progress or 0),
            'stage_label': stage['label'],
            'stage_detail': stage['detail'],
            'summary': self._created_summary(video),
            'selected_model': str(video.selected_model or 'selected model'),
            'provider_name': str(video.provider_name or 'AI Video'),
            'aspect_ratio': str(video.aspect_ratio or '9:16'),
            'resolution': str(video.resolution or '720p'),
            'duration_seconds': int(video.duration_seconds or 0) if video.duration_seconds is not None else None,
            'narration_enabled': bool(getattr(video, 'narration_enabled', True)),
            'captions_enabled': bool(video.captions_enabled),
            'music_mode': str(video.music_mode or 'none'),
            'reference_image_count': len(self._coerce_url_list(getattr(video, 'reference_images', []) or [])),
            'has_source_image': bool(getattr(video, 'source_image_url', None)),
            'todos': self._todos_for(video),
            'events': events[-6:],
            'planner_watchouts': self._planner_watchouts(metadata),
            'output_ready': bool(getattr(video, 'output_url', None)),
            'error_message': str(getattr(video, 'error_message', '') or ''),
        }

    def _build_user_prompt(self, *, context: dict[str, Any], message: str, chat_history: list[dict[str, str]]) -> str:
        history_lines = []
        for item in chat_history[-6:]:
            role = str(item.get('role') or 'user').strip().lower()
            text = str(item.get('text') or '').strip()
            if not text:
                continue
            history_lines.append(f'{role}: {text}')
        todo_lines = '\n'.join(f'- {item}' for item in context['todos'])
        event_lines = '\n'.join(
            f"- {event['title']}: {event['detail']}".strip()
            for event in context['events']
            if event.get('title') or event.get('detail')
        ) or '- No pipeline events yet.'
        planner_lines = '\n'.join(f'- {flag}' for flag in context['planner_watchouts']) or '- None'
        history_block = '\n'.join(history_lines) if history_lines else 'No previous chat turns.'
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
            f"Format: {context['aspect_ratio']} at {context['resolution']}\n"
            f"Duration seconds: {context['duration_seconds']}\n"
            f"Narration enabled: {context['narration_enabled']}\n"
            f"Captions enabled: {context['captions_enabled']}\n"
            f"Music mode: {context['music_mode']}\n"
            f"Reference images: {context['reference_image_count']}\n"
            f"Source image attached: {context['has_source_image']}\n"
            f"Output ready: {context['output_ready']}\n"
            f"Error message: {context['error_message'] or 'None'}\n"
            f"Todos:\n{todo_lines}\n"
            f"Recent pipeline events:\n{event_lines}\n"
            f"Planner watchouts:\n{planner_lines}\n"
            f"Conversation history:\n{history_block}\n"
            f"User message:\n{message.strip()}"
        )

    def _fallback_reply(self, *, context: dict[str, Any], user_message: str) -> str:
        message = user_message.strip().lower()
        if any(token in message for token in {'hi', 'hello', 'hey'}):
            return (
                f"Hi. This render is currently at \"{context['stage_label']}\". "
                f"{context['summary']} Ask me about edits, assets, or the next step and I’ll keep it grounded in this workspace."
            )
        if 'edit' in message or 'change' in message:
            if context['status'] == 'completed':
                return (
                    'You can edit this by rerendering with a new script, voice, language, or music setting. '
                    f"Right now the strongest changes would be around {context['selected_model']}, narration {'on' if context['narration_enabled'] else 'off'}, "
                    f"and the {context['aspect_ratio']} timeline."
                )
            return (
                f"This render is still in \"{context['stage_label']}\". "
                'I would wait for this pass to finish before changing script, voice, or music, unless you want to restart the render with a new prompt immediately.'
            )
        return (
            f"This render is currently at \"{context['stage_label']}\". "
            f"{context['summary']} The next likely focus is {context['todos'][-1] if context['todos'] else 'finishing the render'}."
        )

    def _stage_for(self, *, video: Video) -> dict[str, str]:
        status = str(getattr(video.status, 'value', video.status))
        progress = int(video.progress or 0)
        if status == 'draft':
            return {'label': 'Queueing render', 'detail': 'Preparing recipe steps, assets, and render slots.'}
        if progress < 35:
            return {'label': 'Building scenes', 'detail': 'Arranging scenes, references, and the first clip plan.'}
        if progress < 70:
            return {'label': 'Generating visuals', 'detail': 'Rendering the main clips and aligning motion for the final edit.'}
        return {'label': 'Finishing audio and export', 'detail': 'Balancing music, finalizing captions, and encoding the final file.'}

    def _todos_for(self, video: Video) -> list[str]:
        reference_images = self._coerce_url_list(getattr(video, 'reference_images', []) or [])
        source_image_url = getattr(video, 'source_image_url', None)
        visual_label = (
            'Generate video using the attached reference image'
            if reference_images or source_image_url
            else 'Generate video scenes from the prompt and selected model'
        )
        bgm_label = (
            f"Prepare {'selected' if str(video.music_mode or 'none') == 'library' else str(video.music_mode or 'none')} music for the final mix"
            if str(video.music_mode or 'none') != 'none'
            else 'Skip music layer for this render'
        )
        timeline_label = f'Assemble timeline at {video.aspect_ratio} · {video.resolution}'
        return [visual_label, bgm_label, timeline_label]

    def _created_summary(self, video: Video) -> str:
        reference_images = list(getattr(video, 'reference_images', []) or [])
        status = str(getattr(video.status, 'value', video.status))
        if status == 'completed':
            music_clause = 'an attached music layer' if str(video.music_mode or 'none') != 'none' else 'no background music'
            return (
                f"Created a {self._format_duration(video.duration_seconds)} {video.aspect_ratio} video using "
                f"{video.selected_model or 'the selected model'} with {music_clause} and export-ready playback."
            )
        reference_clause = (
            f" with {len(reference_images)} visual reference{'s' if len(reference_images) != 1 else ''}"
            if reference_images
            else ''
        )
        return f"Preparing a {video.aspect_ratio} video using {video.selected_model or 'the selected model'}{reference_clause}."

    def _planner_watchouts(self, metadata: dict[str, Any]) -> list[str]:
        scene_plan = list(metadata.get('deep_scene_plan') or [])
        if not scene_plan:
            scene_plan = list(metadata.get('ugc_scene_plan') or [])
        flags: list[str] = []
        for scene in scene_plan:
            if not isinstance(scene, dict):
                continue
            qa_flags = scene.get('qa_flags') or []
            if not isinstance(qa_flags, list):
                continue
            for flag in qa_flags:
                if isinstance(flag, str) and flag.strip():
                    flags.append(flag.replace('_', ' '))
        return flags[:6]

    def _selected_model_name(self) -> str:
        provider = self.qwen.provider_name()
        if provider == 'hf_qwen':
            return str(self.settings.hf_qwen_model)
        if provider == 'self_hosted_qwen':
            return str(self.settings.qwen_self_hosted_model or 'self_hosted_qwen')
        return f'mock:{self.settings.qwen_mock_profile}'

    def _format_duration(self, seconds: int | None) -> str:
        safe_seconds = max(0, float(seconds or 0))
        return f'{safe_seconds:.0f}s' if safe_seconds.is_integer() else f'{safe_seconds:.1f}s'

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
