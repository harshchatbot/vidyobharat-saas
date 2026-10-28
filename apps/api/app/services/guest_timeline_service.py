from __future__ import annotations

import logging
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import Settings, get_settings
from app.schemas.editor import TimelineComposition
from app.services.guest_media_service import GuestMediaService, build_guest_media_service
from app.services.guest_media_storage import GuestMediaObjectMissing
from app.services.timeline_render_service import (
    ResolvedTimelineMedia,
    TemporaryTimelineRender,
    TimelineRenderError,
    TimelineRenderLimits,
    TimelineRenderService,
    TimelineValidationError,
)
from app.services.guest_session_errors import session_expired, session_invalid, session_revoked


logger = logging.getLogger(__name__)


class GuestTimelineMediaUnavailableError(TimelineValidationError):
    pass


class GuestTimelineService:
    """Resolves private guest media before delegating to the local compositor."""

    def __init__(
        self,
        *,
        media_service: GuestMediaService,
        renderer: TimelineRenderService,
    ) -> None:
        self.media_service = media_service
        self.renderer = renderer

    def render(self, raw_token: str | None, composition: TimelineComposition) -> TemporaryTimelineRender:
        workspace = tempfile.TemporaryDirectory(prefix='rangmanch-timeline-sources-')
        result: TemporaryTimelineRender | None = None
        try:
            session = self.media_service.sessions.get_session(raw_token)
            root = Path(workspace.name).resolve()
            resolved = self._download_sources(raw_token, composition, root, guest_id=session['guest_id'])
            source_bytes = sum(item.file_size for item in resolved)
            result = self.renderer.render(
                composition,
                resolved,
                reserved_workspace_bytes=source_bytes,
            )
            self.media_service.sessions.get_session(raw_token)
            return result
        except BaseException:
            if result is not None:
                result.close()
            raise
        finally:
            workspace.cleanup()

    def validate_sources(self, raw_token: str | None, composition: TimelineComposition) -> dict:
        session = self.media_service.sessions.get_session(raw_token)
        self._resolve_records(raw_token, composition, guest_id=session['guest_id'])
        return session

    def render_for_worker(self, guest_id: str, composition: TimelineComposition) -> TemporaryTimelineRender:
        self._require_worker_session(guest_id)
        workspace = tempfile.TemporaryDirectory(prefix='rangmanch-timeline-sources-')
        result: TemporaryTimelineRender | None = None
        try:
            records = self._resolve_records(None, composition, guest_id=guest_id, worker=True)
            root = Path(workspace.name).resolve()
            resolved = self._download_records(records, root)
            result = self.renderer.render(
                composition,
                resolved,
                reserved_workspace_bytes=sum(item.file_size for item in resolved),
            )
            self._require_worker_session(guest_id)
            return result
        except BaseException:
            if result is not None:
                result.close()
            raise
        finally:
            workspace.cleanup()

    def _download_sources(
        self,
        raw_token: str | None,
        composition: TimelineComposition,
        root: Path,
        *,
        guest_id: str,
    ) -> list[ResolvedTimelineMedia]:
        records = self._resolve_records(raw_token, composition, guest_id=guest_id)
        return self._download_records(records, root)

    def _resolve_records(
        self,
        raw_token: str | None,
        composition: TimelineComposition,
        *,
        guest_id: str,
        worker: bool = False,
    ) -> list[dict]:
        requested_ids = list(
            dict.fromkeys(
                [clip.media_id for clip in composition.clips]
                + [item.media_id for item in composition.audio_items]
            )
        )
        if worker:
            records = [self.media_service.repository.get_for_guest(guest_id, media_id) for media_id in requested_ids]
            if any(record is None for record in records):
                raise TimelineValidationError('A timeline source is unavailable.')
        else:
            records = [self.media_service.get_media(raw_token, media_id) for media_id in requested_ids]
        checked = [record for record in records if record is not None]
        total_bytes = 0
        for record in checked:
            media_id = record.get('media_id')
            expected_path = f'guest-editor/{guest_id}/sources/{media_id}/original'
            if (
                record.get('guest_id') != guest_id
                or record.get('status') != 'active'
                or record.get('storage_object_path') != expected_path
            ):
                raise TimelineValidationError('Guest media ownership or private object metadata is invalid.')
            try:
                file_size = int(record['file_size'])
            except (KeyError, TypeError, ValueError) as exc:
                raise TimelineValidationError('Guest media has invalid size metadata.') from exc
            if file_size <= 0:
                raise TimelineValidationError('Guest media has invalid size metadata.')
            visual_ids = {clip.media_id for clip in composition.clips}
            audio_ids = {item.media_id for item in composition.audio_items}
            media_type = record.get('media_type')
            if media_id in visual_ids and media_type not in {'image', 'video'}:
                raise TimelineValidationError('Visual timeline clips must reference image or video media.')
            if media_id in audio_ids and media_type != 'audio':
                raise TimelineValidationError('Audio timeline items must reference audio media.')
            total_bytes += file_size
            if total_bytes > self.renderer.limits.max_source_bytes:
                raise TimelineValidationError('Timeline source media exceeds the configured byte limit.')
            if total_bytes + self.renderer.limits.max_output_bytes > self.renderer.limits.max_workspace_bytes:
                raise TimelineValidationError('Timeline sources exceed the configured workspace limit.')
            try:
                size_reader = getattr(self.media_service.storage, 'object_size', None)
                stored_size = size_reader(record['storage_object_path']) if callable(size_reader) else None
                if stored_size is not None and stored_size != file_size:
                    raise GuestTimelineMediaUnavailableError('A timeline source is unavailable or incomplete.')
            except GuestMediaObjectMissing as exc:
                raise GuestTimelineMediaUnavailableError('A timeline source is unavailable.') from exc
            except TimelineValidationError:
                raise
            except Exception as exc:
                raise TimelineRenderError('Private media storage is temporarily unavailable.') from exc
        return checked

    def _download_records(self, records: list[dict], root: Path) -> list[ResolvedTimelineMedia]:
        total_bytes = sum(int(record['file_size']) for record in records)
        resolved: list[ResolvedTimelineMedia] = []
        for index, record in enumerate(records):
            media_id = record['media_id']
            object_name = record['storage_object_path']
            file_size = int(record['file_size'])
            destination = root / f'{index:03d}-{media_id}.source'
            downloaded = 0
            try:
                with destination.open('xb') as target:
                    for chunk in self.media_service.storage.iter_content(
                        object_name,
                        start=0,
                        end=file_size - 1,
                    ):
                        downloaded += len(chunk)
                        if downloaded > file_size or downloaded > self.renderer.limits.max_source_bytes:
                            raise TimelineValidationError('Downloaded guest media exceeded its recorded size.')
                        target.write(chunk)
            except GuestMediaObjectMissing as exc:
                raise GuestTimelineMediaUnavailableError('A timeline source is unavailable.') from exc
            except TimelineRenderError:
                raise
            except Exception as exc:
                raise TimelineRenderError('Private guest media could not be downloaded for rendering.') from exc
            if downloaded != file_size:
                raise TimelineValidationError('Downloaded guest media size does not match its record.')
            resolved.append(
                ResolvedTimelineMedia(
                    media_id=media_id,
                    media_type=str(record['media_type']),
                    path=destination,
                    file_size=file_size,
                )
            )
        logger.info('guest_timeline_sources_resolved', extra={'source_count': len(resolved), 'source_bytes': total_bytes})
        return resolved

    def _require_worker_session(self, guest_id: str) -> dict:
        session = self.media_service.sessions.repository.get(guest_id)
        if session is None:
            raise session_invalid()
        expires_at = session.get('expires_at')
        if not isinstance(expires_at, datetime) or expires_at <= datetime.now(UTC):
            raise session_expired()
        if session.get('status') != 'active':
            raise session_revoked()
        return session


def build_guest_timeline_service(settings: Settings | None = None) -> GuestTimelineService:
    current = settings or get_settings()
    media_service = build_guest_media_service()
    editor_config = (
        media_service.sessions.app_config.get().editor
        if media_service.sessions.app_config is not None
        else None
    )
    limits = TimelineRenderLimits(
        max_clips=editor_config.max_clips if editor_config else current.editor_timeline_max_clips,
        max_total_duration_seconds=(
            editor_config.max_duration_seconds
            if editor_config else current.editor_timeline_max_duration_seconds
        ),
        max_source_bytes=current.editor_timeline_max_source_bytes,
        max_workspace_bytes=current.editor_timeline_max_workspace_bytes,
        max_output_bytes=current.editor_timeline_max_output_bytes,
        max_source_pixels=current.editor_timeline_max_source_pixels,
        max_output_width=current.editor_timeline_max_output_width,
        max_output_height=current.editor_timeline_max_output_height,
        max_fps=current.editor_timeline_max_fps,
        ffmpeg_timeout_seconds=current.editor_timeline_ffmpeg_timeout_seconds,
        max_concurrent_renders=current.editor_timeline_max_concurrent_renders,
    )
    return GuestTimelineService(
        media_service=media_service,
        renderer=TimelineRenderService(limits=limits),
    )
