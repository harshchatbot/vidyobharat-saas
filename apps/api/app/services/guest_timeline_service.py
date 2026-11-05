from __future__ import annotations

import logging
import time
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import Settings, get_settings
from app.schemas.editor import TimelineComposition
from app.services.guest_media_service import GuestMediaService, build_guest_media_service
from app.services.editor_audio_library import build_audio_library_repository
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
        self._validate_effective_limits(composition)
        workspace = tempfile.TemporaryDirectory(prefix='rangmanch-timeline-sources-')
        result: TemporaryTimelineRender | None = None
        try:
            session = self.media_service.sessions.get_session(raw_token)
            root = Path(workspace.name).resolve()
            resolved = self._download_sources(raw_token, composition, root, guest_id=session['guest_id'])
            resolved.extend(self._download_catalog_audio(composition, root, existing=resolved))
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
        self._validate_effective_limits(composition)
        session = self.media_service.sessions.get_session(raw_token)
        records = self._resolve_records(raw_token, composition, guest_id=session['guest_id'])
        self._resolve_catalog_audio(composition, uploaded_bytes=sum(int(record['file_size']) for record in records))
        return session

    def render_for_worker(self, guest_id: str, composition: TimelineComposition) -> TemporaryTimelineRender:
        # Limits are enforced when the job is accepted. Do not invalidate an
        # accepted export if an administrator lowers a quota while it is queued.
        self._require_worker_session(guest_id)
        workspace = tempfile.TemporaryDirectory(prefix='rangmanch-timeline-sources-')
        result: TemporaryTimelineRender | None = None
        try:
            records = self._resolve_records(None, composition, guest_id=guest_id, worker=True)
            root = Path(workspace.name).resolve()
            resolved = self._download_records(records, root)
            resolved.extend(self._download_catalog_audio(composition, root, existing=resolved))
            result = self.renderer.render(
                composition,
                resolved,
                reserved_workspace_bytes=sum(item.file_size for item in resolved),
            )
            # An accepted job may finish after its session TTL. Still reject
            # explicit revocation; job ownership and lease are independently fenced.
            self._require_worker_session(guest_id, allow_expired=True)
            return result
        except BaseException:
            if result is not None:
                result.close()
            raise
        finally:
            workspace.cleanup()

    def _validate_effective_limits(self, composition: TimelineComposition) -> None:
        app_config = getattr(self.media_service.sessions, 'app_config', None)
        if app_config is None:
            max_clips = self.renderer.limits.max_clips
            max_duration = self.renderer.limits.max_total_duration_seconds
        else:
            current = app_config.get().editor
            max_clips = current.max_clips
            max_duration = current.max_duration_seconds
        if len(composition.clips) > max_clips:
            raise TimelineValidationError(f'Timeline exceeds the current {max_clips}-clip limit.')
        duration = float(composition.duration_seconds or 0)
        if duration > max_duration + 1e-6:
            raise TimelineValidationError(f'Timeline exceeds the current {max_duration:g}-second limit.')

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
                + [item.media_id for item in composition.audio_items if not item.media_id.startswith('catalog:')]
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
            except ValueError as exc:
                raise TimelineValidationError(str(exc)) from exc
            except TimelineValidationError:
                raise
            except Exception as exc:
                raise TimelineRenderError('Private media storage is temporarily unavailable.') from exc
        return checked

    def _resolve_catalog_audio(self, composition: TimelineComposition, *, uploaded_bytes: int = 0) -> list[tuple[str, str, int]]:
        """Resolve only published, server-approved catalog audio; never trust client paths."""
        ids = list(dict.fromkeys(
            item.media_id for item in composition.audio_items if item.media_id.startswith('catalog:')
        ))
        if not ids:
            return []
        repository = build_audio_library_repository()
        resolved: list[tuple[str, str, int]] = []
        total = uploaded_bytes
        for media_id in ids:
            entry = repository.get(media_id.removeprefix('catalog:'))
            if entry is None or entry.status != 'published' or not entry.storage_path:
                raise GuestTimelineMediaUnavailableError('A sound-library audio asset is unavailable for export.')
            try:
                size = self.media_service.storage.object_size(entry.storage_path)
            except GuestMediaObjectMissing as exc:
                raise GuestTimelineMediaUnavailableError('A sound-library audio asset is missing.') from exc
            except Exception as exc:
                raise TimelineRenderError('Sound-library storage is temporarily unavailable.') from exc
            if size <= 0:
                raise GuestTimelineMediaUnavailableError('A sound-library audio asset is empty.')
            total += size
            if total > self.renderer.limits.max_source_bytes:
                raise TimelineValidationError('Timeline source media exceeds the configured byte limit.')
            if total + self.renderer.limits.max_output_bytes > self.renderer.limits.max_workspace_bytes:
                raise TimelineValidationError('Timeline sources exceed the configured workspace limit.')
            resolved.append((media_id, entry.storage_path, size))
        return resolved

    def _download_catalog_audio(
        self,
        composition: TimelineComposition,
        root: Path,
        *,
        existing: list[ResolvedTimelineMedia],
    ) -> list[ResolvedTimelineMedia]:
        entries = self._resolve_catalog_audio(
            composition, uploaded_bytes=sum(item.file_size for item in existing)
        )
        output: list[ResolvedTimelineMedia] = []
        for index, (media_id, object_name, size) in enumerate(entries):
            destination = root / f'catalog-{index:03d}.source'
            started = time.monotonic()
            try:
                self.media_service.storage.download_to_path(object_name, destination, expected_size=size)
            except GuestMediaObjectMissing as exc:
                raise GuestTimelineMediaUnavailableError('Sound-library audio is unavailable.') from exc
            except ValueError as exc:
                raise TimelineValidationError(str(exc)) from exc
            except TimelineValidationError:
                raise
            except Exception as exc:
                raise TimelineRenderError('Sound-library audio could not be downloaded.') from exc
            logger.info('guest_catalog_audio_downloaded', extra={'source_bytes': size, 'elapsed_seconds': round(time.monotonic() - started, 3)})
            output.append(ResolvedTimelineMedia(
                media_id=media_id, media_type='audio', path=destination, file_size=size
            ))
        return output

    def _download_records(self, records: list[dict], root: Path) -> list[ResolvedTimelineMedia]:
        total_bytes = sum(int(record['file_size']) for record in records)
        resolved: list[ResolvedTimelineMedia] = []
        for index, record in enumerate(records):
            media_id = record['media_id']
            object_name = record['storage_object_path']
            file_size = int(record['file_size'])
            destination = root / f'{index:03d}-{media_id}.source'
            started = time.monotonic()
            try:
                self.media_service.storage.download_to_path(object_name, destination, expected_size=file_size)
            except GuestMediaObjectMissing as exc:
                raise GuestTimelineMediaUnavailableError('A timeline source is unavailable.') from exc
            except TimelineRenderError:
                raise
            except Exception as exc:
                raise TimelineRenderError('Private guest media could not be downloaded for rendering.') from exc
            logger.info('guest_media_source_downloaded', extra={'source_bytes': file_size, 'elapsed_seconds': round(time.monotonic() - started, 3)})
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

    def _require_worker_session(self, guest_id: str, *, allow_expired: bool = False) -> dict:
        session = self.media_service.sessions.repository.get(guest_id)
        if session is None:
            raise session_invalid()
        expires_at = session.get('expires_at')
        if session.get('status') != 'active':
            raise session_revoked()
        if not isinstance(expires_at, datetime):
            raise session_invalid()
        if not allow_expired and expires_at <= datetime.now(UTC):
            raise session_expired()
        return session


def build_guest_timeline_service(settings: Settings | None = None) -> GuestTimelineService:
    current = settings or get_settings()
    media_service = build_guest_media_service()
    limits = TimelineRenderLimits(
        # Deployment-independent hard safety ceilings. Effective AppConfig
        # values are enforced when a new request is accepted.
        max_clips=50,
        max_total_duration_seconds=60,
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
        renderer=TimelineRenderService(limits=limits, watermark_text='Made with RangManch AI'),
    )
