from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator


COPILOT_SCHEMA_VERSION = '1.0'
COPILOT_EFFECTS = (
    'fade-in', 'fade-out', 'zoom-in', 'grayscale', 'blur', 'brightness',
    'contrast', 'vibrance', 'vignette', 'saturation', 'sepia', 'hue-rotate',
    'invert', 'warm', 'cool',
)
COPILOT_FONTS = (
    'Inter', 'Lato', 'Roboto', 'Noto Sans', 'Noto Serif',
    'Noto Sans Devanagari', 'Noto Sans Bengali', 'Noto Sans Tamil',
    'Noto Sans Telugu', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi',
    'Noto Sans Kannada', 'Noto Sans Malayalam',
)

FiniteTime = Annotated[float, Field(ge=0, le=60, allow_inf_nan=False, strict=True)]
PositiveDuration = Annotated[float, Field(gt=0, le=60, allow_inf_nan=False, strict=True)]
UnitValue = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False, strict=True)]
ItemId = Annotated[str, Field(min_length=1, max_length=128)]
HexColor = Annotated[str, Field(pattern=r'^#[0-9a-fA-F]{6}$')]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', populate_by_name=True)


class CopilotExportSettings(StrictModel):
    filename: Annotated[str, Field(min_length=1, max_length=80)]
    resolution: Literal['720p', '1080p']
    fps: Literal[24, 30, 60]
    quality: Literal['standard', 'high']


class CopilotItemBase(StrictModel):
    id: ItemId
    kind: str
    trackId: str
    startTime: FiniteTime
    duration: PositiveDuration
    label: Annotated[str, Field(min_length=1, max_length=200)]


class CopilotVideoItem(CopilotItemBase):
    kind: Literal['video']
    trackId: Literal['video']
    mediaId: Annotated[str, Field(pattern=r'^[a-f0-9]{32}$')]
    contentType: Annotated[str, Field(min_length=1, max_length=100)]
    sourceStart: FiniteTime
    cropMode: Literal['cover', 'contain']
    muted: bool
    volume: UnitValue


class CopilotAudioItem(CopilotItemBase):
    kind: Literal['audio']
    trackId: Literal['music', 'sfx', 'voice']
    mediaId: Annotated[str, Field(pattern=r'^[a-f0-9]{32}$')]
    contentType: Annotated[str, Field(min_length=1, max_length=100)]
    sourceStart: FiniteTime
    muted: bool
    volume: UnitValue


class CopilotTextItem(CopilotItemBase):
    kind: Literal['text']
    trackId: Literal['text']
    text: Annotated[str, Field(min_length=1, max_length=500)]
    fontFamily: Literal[*COPILOT_FONTS]
    fontSize: Annotated[float, Field(ge=12, le=120, allow_inf_nan=False, strict=True)]
    color: HexColor
    bold: bool
    x: Annotated[float, Field(ge=0.02, le=0.98, allow_inf_nan=False, strict=True)]
    y: Annotated[float, Field(ge=0.02, le=0.98, allow_inf_nan=False, strict=True)]
    width: Annotated[float, Field(ge=0.1, le=0.96, allow_inf_nan=False, strict=True)]
    rotation: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False, strict=True)]
    alignment: Literal['left', 'center', 'right']
    outlineColor: HexColor
    outlineWidth: Annotated[float, Field(ge=0, le=12, allow_inf_nan=False, strict=True)]
    shadow: bool
    backgroundColor: HexColor
    backgroundOpacity: UnitValue
    inAnimation: Literal['none', 'fade-in', 'slide-up', 'pop-in']
    outAnimation: Literal['none', 'fade-out', 'slide-down']
    loopAnimation: Literal['none', 'pulse', 'float']
    inAnimationDuration: Annotated[float, Field(ge=0.1, le=3, allow_inf_nan=False, strict=True)]
    outAnimationDuration: Annotated[float, Field(ge=0.1, le=3, allow_inf_nan=False, strict=True)]


class CopilotEffectItem(CopilotItemBase):
    kind: Literal['effect']
    trackId: Literal['effects']
    preset: Literal[*COPILOT_EFFECTS]
    amount: Annotated[float, Field(ge=0, le=2, allow_inf_nan=False, strict=True)]


CopilotTimelineItem = Annotated[
    CopilotVideoItem | CopilotAudioItem | CopilotTextItem | CopilotEffectItem,
    Field(discriminator='kind'),
]


class CopilotTrack(StrictModel):
    id: Literal['video', 'text', 'effects', 'music', 'sfx', 'voice']
    type: Literal['video', 'text', 'effects', 'music', 'sfx', 'voice']
    name: Annotated[str, Field(min_length=1, max_length=40)]
    items: Annotated[list[CopilotTimelineItem], Field(max_length=100)]

    @model_validator(mode='after')
    def validate_items(self) -> 'CopilotTrack':
        if self.id != self.type:
            raise ValueError('Track id and type must match.')
        if any(item.trackId != self.id for item in self.items):
            raise ValueError('Timeline item is assigned to the wrong track.')
        return self


class CopilotProjectContext(StrictModel):
    id: Annotated[str, Field(min_length=1, max_length=128)]
    duration: FiniteTime
    extensionExplicit: bool
    aspectRatio: Literal['9:16', '16:9', '1:1', '4:5']
    exportSettings: CopilotExportSettings
    tracks: Annotated[list[CopilotTrack], Field(min_length=1, max_length=6)]

    @model_validator(mode='after')
    def validate_project(self) -> 'CopilotProjectContext':
        track_ids = [track.id for track in self.tracks]
        if set(track_ids) != {'video', 'text', 'effects', 'music', 'sfx', 'voice'}:
            raise ValueError('Project must contain the canonical editor tracks.')
        if len(track_ids) != len(set(track_ids)):
            raise ValueError('Track IDs must be unique.')
        items = [item for track in self.tracks for item in track.items]
        item_ids = [item.id for item in items]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError('Timeline item IDs must be unique.')
        for item in items:
            if item.startTime + item.duration > 60 + 1e-6:
                raise ValueError('Timeline item exceeds the editor limit.')
        visuals = sorted(
            (item for item in items if isinstance(item, CopilotVideoItem)),
            key=lambda item: item.startTime,
        )
        for previous, current in zip(visuals, visuals[1:]):
            if current.startTime < previous.startTime + previous.duration - 1e-6:
                raise ValueError('Visual clips cannot overlap.')
        return self


class CopilotHistoryMessage(StrictModel):
    role: Literal['user', 'assistant']
    content: Annotated[str, Field(min_length=1, max_length=500)]


class CopilotPlanRequest(StrictModel):
    schemaVersion: Literal['1.0']
    projectRevision: Annotated[str, Field(pattern=r'^sha256:[a-f0-9]{64}$')]
    prompt: Annotated[str, Field(min_length=1, max_length=2000)]
    project: CopilotProjectContext
    history: Annotated[list[CopilotHistoryMessage], Field(max_length=6)] = Field(default_factory=list)


class ReorderVisualsOperation(StrictModel):
    op: Literal['reorder_visuals']
    orderedItemIds: Annotated[list[ItemId], Field(min_length=1, max_length=50)]


class AddTextOperation(StrictModel):
    op: Literal['add_text']
    item: CopilotTextItem


class AddEffectOperation(StrictModel):
    op: Literal['add_effect']
    item: CopilotEffectItem


class CopilotItemChanges(StrictModel):
    label: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    startTime: FiniteTime | None = None
    duration: PositiveDuration | None = None
    sourceStart: FiniteTime | None = None
    cropMode: Literal['cover', 'contain'] | None = None
    muted: bool | None = None
    volume: UnitValue | None = None
    text: Annotated[str | None, Field(min_length=1, max_length=500)] = None
    fontFamily: Literal[*COPILOT_FONTS] | None = None
    fontSize: Annotated[float | None, Field(ge=12, le=120, allow_inf_nan=False, strict=True)] = None
    color: HexColor | None = None
    bold: bool | None = None
    x: Annotated[float | None, Field(ge=0.02, le=0.98, allow_inf_nan=False, strict=True)] = None
    y: Annotated[float | None, Field(ge=0.02, le=0.98, allow_inf_nan=False, strict=True)] = None
    width: Annotated[float | None, Field(ge=0.1, le=0.96, allow_inf_nan=False, strict=True)] = None
    rotation: Annotated[float | None, Field(ge=-180, le=180, allow_inf_nan=False, strict=True)] = None
    alignment: Literal['left', 'center', 'right'] | None = None
    outlineColor: HexColor | None = None
    outlineWidth: Annotated[float | None, Field(ge=0, le=12, allow_inf_nan=False, strict=True)] = None
    shadow: bool | None = None
    backgroundColor: HexColor | None = None
    backgroundOpacity: UnitValue | None = None
    inAnimation: Literal['none', 'fade-in', 'slide-up', 'pop-in'] | None = None
    outAnimation: Literal['none', 'fade-out', 'slide-down'] | None = None
    loopAnimation: Literal['none', 'pulse', 'float'] | None = None
    inAnimationDuration: Annotated[float | None, Field(ge=0.1, le=3, allow_inf_nan=False, strict=True)] = None
    outAnimationDuration: Annotated[float | None, Field(ge=0.1, le=3, allow_inf_nan=False, strict=True)] = None
    preset: Literal[*COPILOT_EFFECTS] | None = None
    amount: Annotated[float | None, Field(ge=0, le=2, allow_inf_nan=False, strict=True)] = None

    @model_validator(mode='after')
    def require_change(self) -> 'CopilotItemChanges':
        if not self.model_fields_set:
            raise ValueError('Item changes cannot be empty.')
        return self


class UpdateItemOperation(StrictModel):
    op: Literal['update_item']
    itemId: ItemId
    changes: CopilotItemChanges

    @field_serializer('changes', when_used='json')
    def serialize_changes(self, changes: CopilotItemChanges) -> dict[str, object]:
        # Strict provider schemas require nullable placeholders for unused fields.
        # They are not edits and must not reach the timeline update validator.
        return changes.model_dump(mode='json', exclude_none=True, exclude_unset=True)


class MoveItemOperation(StrictModel):
    op: Literal['move_item']
    itemId: ItemId
    startTime: FiniteTime


class ResizeItemOperation(StrictModel):
    op: Literal['resize_item']
    itemId: ItemId
    edge: Literal['left', 'right']
    time: FiniteTime


class SplitItemOperation(StrictModel):
    op: Literal['split_item']
    itemId: ItemId
    time: FiniteTime
    newItemId: ItemId


class RemoveItemOperation(StrictModel):
    op: Literal['remove_item']
    itemId: ItemId


class SetAspectRatioOperation(StrictModel):
    op: Literal['set_aspect_ratio']
    aspectRatio: Literal['9:16', '16:9', '1:1', '4:5']


CopilotEditOperation = Annotated[
    ReorderVisualsOperation | AddTextOperation | AddEffectOperation |
    UpdateItemOperation | MoveItemOperation | ResizeItemOperation |
    SplitItemOperation | RemoveItemOperation | SetAspectRatioOperation,
    Field(discriminator='op'),
]


class CopilotGeneratedPlan(StrictModel):
    schemaVersion: Literal['1.0']
    requestId: ItemId
    projectRevision: Annotated[str, Field(pattern=r'^sha256:[a-f0-9]{64}$')]
    summary: Annotated[str, Field(min_length=1, max_length=500)]
    warnings: Annotated[list[Annotated[str, Field(min_length=1, max_length=500)]], Field(max_length=20)] = Field(default_factory=list)
    operations: Annotated[list[CopilotEditOperation], Field(min_length=1, max_length=20)]


class CopilotModelPlan(StrictModel):
    summary: Annotated[str, Field(min_length=1, max_length=500)]
    warnings: Annotated[list[Annotated[str, Field(min_length=1, max_length=500)]], Field(max_length=20)] = Field(default_factory=list)
    operations: Annotated[list[CopilotEditOperation], Field(min_length=1, max_length=20)]


class CopilotUsage(StrictModel):
    inputTokens: Annotated[int, Field(ge=0)]
    outputTokens: Annotated[int, Field(ge=0)]
    estimatedCostUsd: Annotated[float, Field(ge=0)]


class CopilotPlanResponse(StrictModel):
    plan: CopilotGeneratedPlan
    usage: CopilotUsage
