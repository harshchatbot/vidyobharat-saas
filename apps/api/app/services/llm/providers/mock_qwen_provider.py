from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from pydantic import BaseModel

from app.core.config import Settings
from app.services.llm.base import CaptionPack, EditIntent, HookVariants, LLMProvider, SceneItem, ScriptPlan

logger = logging.getLogger(__name__)


class MockQwenProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def provider_name(self) -> str:
        return 'mock_qwen'

    def healthcheck(self) -> dict[str, Any]:
        return {'provider': self.provider_name(), 'ok': True, 'mock_mode': True, 'profile': self.settings.qwen_mock_profile}

    def complete_text(self, *, task_type: str, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        self._sleep_if_needed()
        self._maybe_raise()
        prompt = user_prompt.strip()
        if task_type == 'translate':
            return self._mock_translation(prompt)
        if task_type == 'script_generate':
            return self._mock_script(prompt, enhanced=False)
        if task_type == 'script_enhance':
            return self._mock_script(prompt, enhanced=True)
        if task_type == 'studio_chat':
            return self._mock_studio_chat(prompt)
        return f'Mock response for {task_type}: {prompt[:180]}'.strip()

    def complete_structured(
        self,
        *,
        task_type: str,
        schema_model: type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> BaseModel:
        self._sleep_if_needed()
        self._maybe_raise()
        payload = self._mock_structured_payload(task_type=task_type, user_prompt=user_prompt)
        if self.settings.qwen_mock_malformed_json:
            raise RuntimeError('Mock Qwen malformed JSON mode is enabled')
        return schema_model.model_validate(payload)

    def _sleep_if_needed(self) -> None:
        latency_ms = max(0, int(self.settings.qwen_mock_latency_ms or 0))
        if latency_ms:
            time.sleep(latency_ms / 1000)

    def _maybe_raise(self) -> None:
        if self.settings.qwen_mock_force_error:
            raise RuntimeError('Mock Qwen forced error is enabled')

    def _mock_translation(self, prompt: str) -> str:
        text = prompt.split('Text:\n', 1)[-1].strip() if 'Text:\n' in prompt else prompt
        return f'[Translated] {text[:500]}'.strip()

    def _mock_script(self, prompt: str, *, enhanced: bool) -> str:
        header = '[Opening shot: Warm cinematic opener with clear subject focus]'
        narrator_tone = 'Narrator (tone): "Confident, clear, and naturally conversational."'
        opening_cue = 'Opening cue: Slow controlled reveal with no abrupt movement.'
        body = [
            '[Scene 1: Introduce the setup with one strong idea]',
            'Narrator: "Start with the key point in a way that feels immediate and easy to follow."',
            'Visual cue: Keep framing simple, premium, and uncluttered.',
            'Camera cue: Gentle push-in with stable composition.',
            'Mood cue: Intentional, polished, and human.',
            '',
            '[Scene 2: Build understanding with a concrete example]',
            'Narrator: "Show one believable example so the viewer quickly understands why it matters."',
            'Visual cue: Demonstrate the concept with one clear visual anchor.',
            'Camera cue: Smooth lateral motion with controlled pacing.',
            'Mood cue: Trust-building and informative.',
            '',
            '[Scene 3: Close with implication and CTA]',
            f'Narrator: "{ "Refine" if enhanced else "Wrap up" } the story with one strong takeaway and a clear next step."',
            'Visual cue: Resolve on a stable final frame with room for overlays.',
            'Camera cue: Hold or gentle ease-out, never abrupt.',
            'Mood cue: Resolved and persuasive.',
            '',
            '[Closing shot: Stable branded closing frame]',
            'Narrator: "If this fits what you need, take the next step now."',
            'Ending cue: Hold final frame cleanly for export and CTA readability.',
        ]
        return '\n'.join([header, narrator_tone, opening_cue, '', *body])

    def _mock_studio_chat(self, prompt: str) -> str:
        user_message = self._extract_block(prompt, 'User message:')
        stage = self._extract_inline(prompt, 'Current stage:')
        summary = self._extract_inline(prompt, 'Summary:')
        status = self._extract_inline(prompt, 'Status:')
        normalized = user_message.lower()
        if any(token in normalized for token in {'hi', 'hello', 'hey'}):
            return f'Hi. This render is currently at "{stage or "processing"}". {summary or "I have the workspace context loaded and can help with edits, assets, or export notes."}'
        if 'edit' in normalized or 'change' in normalized:
            if status == 'completed':
                return 'This render is complete, so the cleanest next edit is a rerender with updated script, voice, music, or prompt direction. I would keep the same format and adjust only one variable first so the next pass is easy to evaluate.'
            return f'This render is still in "{stage or "processing"}". I would wait for this pass to finish before changing the prompt, unless you want to restart immediately with a clearer hook or different visual direction.'
        if any(token in normalized for token in {'asset', 'reference', 'image'}):
            return f'I can see the current asset context for this render. {summary or "The workspace is already grounded in the current prompt and references."}'
        if any(token in normalized for token in {'music', 'bgm', 'audio'}):
            return 'The current audio layer is visible in the workspace context. If you want, the next safe edit is to swap music, lower the music bed, or rerender narration with a new voice.'
        return f'I can help with this render. Right now the studio is at "{stage or "processing"}" and the current summary is: {summary or "The video workspace is loaded and ready for the next step."}'

    def _mock_structured_payload(self, *, task_type: str, user_prompt: str) -> dict[str, Any]:
        compact_prompt = ' '.join(user_prompt.split())[:120]
        if task_type == 'reel_script':
            return {
                'hook': 'Stop scrolling, this changes how you see it.',
                'body_lines': [
                    'Start with the core idea fast.',
                    'Show one concrete moment clearly.',
                    'Land the takeaway with confidence.',
                ],
                'cta': 'Follow for more creator-ready ideas.',
                'caption': 'A crisp reel concept with a clear creator hook.',
                'hashtags': ['#rangmanch', '#creatorworkflow', '#videomarketing'],
            }
        if task_type in {'explainer_narration', 'ugc_narration'}:
            return ScriptPlan(
                title='Mock script plan',
                narration_script='This is a clean mock narration script designed to sound natural and easy to follow.',
                scene_items=[
                    SceneItem(scene_id='scene_1', title='Hook', visual_goal='Introduce the topic quickly', duration_seconds=8),
                    SceneItem(scene_id='scene_2', title='Core', visual_goal='Show the key mechanism or proof', duration_seconds=8),
                    SceneItem(scene_id='scene_3', title='Close', visual_goal='Resolve the story with a CTA', duration_seconds=8),
                ],
                overlay_text=['Quick hook', 'Core proof', 'Clear CTA'],
            ).model_dump()
        if task_type == 'hook_variants':
            return HookVariants(hooks=['Here is the fastest way to get it.', 'Most people miss this simple shift.', 'This is where the story changes.']).model_dump()
        if task_type == 'caption_pack':
            return CaptionPack(language='en-IN', captions=['Opening caption', 'Middle caption', 'Closing caption']).model_dump()
        if task_type == 'edit_intent':
            return EditIntent(intent='tighten_pacing', rationale=f'Mock intent based on: {compact_prompt}', actions=['trim opening', 'merge repeated ideas']).model_dump()
        logger.info('mock_qwen_unknown_task_type', extra={'task_type': task_type})
        return {'text': json.dumps({'task_type': task_type, 'prompt': compact_prompt})}

    def _extract_inline(self, prompt: str, label: str) -> str:
        match = re.search(rf'^{re.escape(label)}\s*(.+)$', prompt, flags=re.MULTILINE)
        return match.group(1).strip() if match else ''

    def _extract_block(self, prompt: str, label: str) -> str:
        if label not in prompt:
            return ''
        tail = prompt.split(label, 1)[-1]
        return tail.strip().splitlines()[0].strip() if tail.strip() else ''
