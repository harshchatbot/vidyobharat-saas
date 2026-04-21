from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class SceneItem(BaseModel):
    scene_id: str
    title: str | None = None
    narration: str | None = None
    visual_goal: str | None = None
    duration_seconds: int | None = None


class ScriptPlan(BaseModel):
    title: str | None = None
    narration_script: str = ''
    scene_items: list[SceneItem] = Field(default_factory=list)
    overlay_text: list[str] = Field(default_factory=list)


class HookVariants(BaseModel):
    hooks: list[str] = Field(default_factory=list)


class CaptionPack(BaseModel):
    language: str = 'en-IN'
    captions: list[str] = Field(default_factory=list)


class EditIntent(BaseModel):
    intent: str
    rationale: str | None = None
    actions: list[str] = Field(default_factory=list)


class LLMProvider(ABC):
    @abstractmethod
    def provider_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def healthcheck(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def complete_text(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    def complete_structured(
        self,
        *,
        task_type: str,
        schema_model: type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> BaseModel:
        raise NotImplementedError
