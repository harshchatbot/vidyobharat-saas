from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.schemas.editor_copilot import CopilotHistoryMessage


T = TypeVar('T', bound=BaseModel)


@dataclass(frozen=True)
class CopilotProviderResult:
    value: BaseModel
    input_tokens: int | None
    output_tokens: int | None
    request_accepted: bool = True


class CopilotProviderError(RuntimeError):
    def __init__(self, message: str, *, accepted: bool = False) -> None:
        super().__init__(message)
        self.accepted = accepted


class CopilotProviderTimeout(CopilotProviderError):
    pass


class CopilotProviderMalformedOutput(CopilotProviderError):
    pass


class EditingCopilotProvider(Protocol):
    @property
    def provider_name(self) -> str: ...

    @property
    def model_name(self) -> str: ...

    async def create_plan(
        self,
        *,
        system_prompt: str,
        project_context: dict[str, object],
        user_prompt: str,
        history: list[CopilotHistoryMessage],
        response_model: type[T],
        timeout_seconds: float,
        max_output_tokens: int,
    ) -> CopilotProviderResult: ...


class DisabledEditingCopilotProvider:
    @property
    def provider_name(self) -> str:
        return 'disabled'

    @property
    def model_name(self) -> str:
        return 'disabled'

    async def create_plan(self, **kwargs) -> CopilotProviderResult:
        raise CopilotProviderError('Copilot is disabled.')
