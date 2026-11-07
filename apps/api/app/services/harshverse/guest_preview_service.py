"""Register a preview render through the existing private guest-media upload flow.

This is an internal, synchronous service intended to be called in a bounded
worker/thread after authenticated server-side creative planning. Do NOT expose
client-supplied HarshVerseDraft or AnimationPlate as trusted request data.

No publication, timeline mutation or final export happens here. The returned
media_id can later be proposed to the editor's normal review/apply workflow.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
import re
import tempfile
from typing import TYPE_CHECKING, Callable

from fastapi import UploadFile
from starlette.datastructures import Headers

from .composition_adapter import AnimationPlate, HarshVerseDraft
from .render_adapter import render as render_harshverse

if TYPE_CHECKING:
    from app.services.guest_media_service import GuestMediaService


_MEDIA_ID = re.compile(r'^[a-f0-9]{32}$')
_SHA256 = re.compile(r'^[a-f0-9]{64}$')


@dataclass(frozen=True)
class GuestPreviewResult:
    media_id: str
    reused_original: bool
    deferred_beat_ids: tuple[str, ...]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _require_video(record: dict, expected_media_id: str, guest_id: str, max_bytes: int) -> None:
    expected_path = f'guest-editor/{guest_id}/sources/{expected_media_id}/original'
    if not _MEDIA_ID.fullmatch(expected_media_id):
        raise ValueError('invalid session media ID')
    if (record.get('guest_id') != guest_id or record.get('media_id') != expected_media_id
            or record.get('status') != 'active'
            or record.get('storage_object_path') != expected_path):
        raise ValueError('guest media ownership or storage metadata mismatch')
    if record.get('media_type') != 'video':
        raise ValueError('HarshVerse requires video inputs')
    try:
        size = int(record['file_size'])
        duration = float(record['duration_seconds'])
    except (TypeError, ValueError, KeyError) as exc:
        raise ValueError('invalid media size or duration') from exc
    if not (0 < size <= max_bytes and 0 < duration <= 65):
        raise ValueError('media exceeds preview input bounds')
    digest = record.get('content_sha256')
    if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
        raise ValueError('missing verified guest media checksum')


def _preview_key(source: dict, animation: dict, draft: HarshVerseDraft) -> str:
    """A versioned, content-addressed idempotency key; not based on user text."""
    payload = {
        'engine': 'harshverse-preview-v1',
        'source_id': source['media_id'],
        'source_sha256': source['content_sha256'],
        'animation_id': animation['media_id'],
        'animation_sha256': animation['content_sha256'],
        'scene_plan': asdict(draft.scene_plan),
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return 'harshverse-' + digest


class GuestHarshVersePreviewService:
    def __init__(
        self,
        *,
        media_service: GuestMediaService,
        renderer: Callable = render_harshverse,
    ) -> None:
        self.media = media_service
        self.renderer = renderer

    def prepare_preview(
        self,
        request,
        raw_token: str | None,
        *,
        presenter_media_id: str,
        draft: HarshVerseDraft,
        plate: AnimationPlate | None = None,
    ) -> GuestPreviewResult:
        """Render verified guest-owned input media, then register using upload().

        The API layer must validate CSRF and bind raw_token to the requester;
        this method repeats those checks before all media activity. Unresolved
        V2.1 assets must already have failed closed in compile_harshverse_draft.
        """
        self.media.sessions.validate_mutating_request(request)
        session = self.media.sessions.get_session(raw_token)
        guest_id = session['guest_id']
        source = self.media.get_media(raw_token, presenter_media_id)
        _require_video(source, presenter_media_id, guest_id, self.media.max_file_bytes)
        if not draft.needs_review or draft.ready_to_render:
            raise ValueError('only review-only HarshVerse drafts can be previewed')

        # Without animation there is nothing for this renderer to change.
        # Keep the source itself instead of creating a redundant guest upload.
        if draft.animation_asset_id is None:
            if plate is not None:
                raise ValueError('unexpected animation plate')
            if any(s.recipe in ('presenter_split', 'animated_explainer') for s in draft.scene_plan.scenes):
                raise ValueError('draft requires a missing animation plate')
            draft.scene_plan.validate()
            if draft.scene_plan.duration > float(source['duration_seconds']) + 0.05:
                raise ValueError('presenter source shorter than the draft')
            return GuestPreviewResult(source['media_id'], True, draft.deferred_beat_ids)

        if not any(s.recipe in ('presenter_split', 'animated_explainer') for s in draft.scene_plan.scenes):
            raise ValueError('animation supplied without a visual scene')
        if plate is None or draft.animation_asset_id != plate.asset_id:
            raise ValueError('draft animation plate does not match approved input')
        if not _MEDIA_ID.fullmatch(plate.asset_id):
            raise ValueError('animation plate must be a session-owned media ID')
        animation = self.media.get_media(raw_token, plate.asset_id)
        _require_video(animation, plate.asset_id, guest_id, self.media.max_file_bytes)
        if (plate.sha256 != animation['content_sha256']
                or abs(plate.duration - float(animation['duration_seconds'])) > 0.05):
            raise ValueError('animation plate metadata differs from owned media')
        draft.scene_plan.validate(asset_duration=float(animation['duration_seconds']))
        if draft.scene_plan.duration > float(source['duration_seconds']) + 0.05:
            raise ValueError('presenter source shorter than the draft')

        key = _preview_key(source, animation, draft)
        # This read is safe because key depends on BOTH owned input hashes and
        # the exact scene plan. Avoid re-rendering when a preview already exists.
        derived_id = self.media._media_id(guest_id, key)
        cached = self.media.repository.get_for_guest(guest_id, derived_id)
        if cached and cached.get('status') == 'active':
            # Re-check both ownership and content path before returning a hit.
            existing = self.media.get_media(raw_token, derived_id)
            _require_video(existing, derived_id, guest_id, self.media.max_file_bytes)
            stored_size = self.media._stored_size(existing['storage_object_path'])
            if stored_size is not None and stored_size != int(existing['file_size']):
                raise ValueError('cached preview storage object is incomplete')
            return GuestPreviewResult(existing['media_id'], False, draft.deferred_beat_ids)

        with tempfile.TemporaryDirectory(prefix='rangmanch-harshverse-preview-') as workdir:
            folder = Path(workdir)
            source_path = folder / 'presenter.bin'
            animation_path = folder / 'animation.bin'
            output_path = folder / 'preview.mp4'
            for record, destination in ((source, source_path), (animation, animation_path)):
                self.media.storage.download_to_path(
                    record['storage_object_path'], destination, expected_size=int(record['file_size']),
                )
                if _sha256(destination) != record['content_sha256']:
                    raise ValueError('downloaded media checksum mismatch')

            self.renderer(draft.scene_plan, source_path, animation_path, output_path)
            if not output_path.is_file() or not 0 < output_path.stat().st_size <= self.media.max_file_bytes:
                raise ValueError('generated preview is missing or exceeds the media upload limit')
            # A source or plate may be deleted while rendering. Refuse to create
            # a preview referencing revoked/deleted guest media.
            for record in (source, animation):
                current = self.media.get_media(raw_token, record['media_id'])
                if current['content_sha256'] != record['content_sha256']:
                    raise ValueError('guest media changed while preview was rendering')

            with output_path.open('rb') as stream:
                upload = UploadFile(
                    file=stream,
                    filename='harshverse-preview.mp4',
                    headers=Headers({'content-type': 'video/mp4'}),
                )
                # Upload handles CSRF, ownership, storage quota, file/codec
                # validation, idempotency and partial-failure cleanup.
                created = self.media.upload(request, raw_token, upload, key)
        return GuestPreviewResult(created['media_id'], False, draft.deferred_beat_ids)
