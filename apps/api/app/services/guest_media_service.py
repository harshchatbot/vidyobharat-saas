from __future__ import annotations

import json
import hashlib
import logging
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, BinaryIO
from urllib.parse import unquote
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import Settings, get_settings
from app.db.repositories.guest_media_repository import GuestMediaRepository
from app.db.repositories.guest_session_repository import GuestQuotaReservation
from app.providers.firebase import get_firestore_client
from app.services.guest_media_storage import GuestMediaStorage, build_guest_media_storage
from app.services.guest_session_errors import GuestSessionError, media_error
from app.services.guest_session_service import GuestSessionService, build_guest_session_service


logger = logging.getLogger(__name__)
_MEDIA_ID_PATTERN = re.compile(r'^[a-f0-9]{32}$')
_IDEMPOTENCY_KEY_PATTERN = re.compile(r'^[A-Za-z0-9._:-]{8,128}$')
_IMAGE_TYPES = {
    'jpeg': ('image/jpeg', b'\xff\xd8\xff'),
    'png': ('image/png', b'\x89PNG\r\n\x1a\n'),
    'webp': ('image/webp', b'RIFF'),
}
_ALLOWED_DECLARED_TYPES = {
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'application/octet-stream',
}


@dataclass(frozen=True)
class ValidatedMedia:
    media_type: str
    content_type: str
    duration_seconds: float | None
    width: int
    height: int


class GuestMediaService:
    def __init__(
        self,
        *,
        settings: Settings,
        sessions: GuestSessionService,
        repository: GuestMediaRepository,
        storage: GuestMediaStorage,
        ffmpeg_binary: str = 'ffmpeg',
        ffprobe_binary: str = 'ffprobe',
    ) -> None:
        self.settings = settings
        self.sessions = sessions
        self.repository = repository
        self.storage = storage
        self.ffmpeg_binary = ffmpeg_binary
        self.ffprobe_binary = ffprobe_binary
        self._max_file_bytes = settings.editor_guest_max_file_bytes
        self._max_video_duration = float(settings.editor_guest_max_video_duration_seconds)
        self._max_image_pixels = settings.editor_guest_max_image_pixels
        self.operation_timeout = float(settings.editor_guest_upload_timeout_seconds)
        if min(self.max_file_bytes, self.max_video_duration, self.max_image_pixels, self.operation_timeout) <= 0:
            raise RuntimeError('Guest media limits must be positive.')
        if self.operation_timeout >= sessions.config.reservation_lease.total_seconds():
            raise RuntimeError('Guest upload timeout must be shorter than the quota reservation lease.')

    @property
    def max_file_bytes(self) -> int:
        if self.sessions.app_config is None:
            return self._max_file_bytes
        return self.sessions.app_config.get().media.max_file_bytes

    @property
    def max_video_duration(self) -> float:
        if self.sessions.app_config is None:
            return self._max_video_duration
        return self.sessions.app_config.get().media.max_video_duration_seconds

    @property
    def max_image_pixels(self) -> int:
        if self.sessions.app_config is None:
            return self._max_image_pixels
        return self.sessions.app_config.get().media.max_image_pixels

    def upload(
        self,
        request,
        raw_token: str | None,
        upload: UploadFile,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        self.sessions.validate_mutating_request(request)
        session = self.sessions.get_session(raw_token)
        media_id = self._media_id(session['guest_id'], idempotency_key)
        content_sha256 = getattr(upload, 'content_sha256', None) or self._hash_upload(upload.file)
        self._recover_stale_uploads(session, raw_token)
        existing = self.repository.get_for_guest(session['guest_id'], media_id)
        if existing and existing.get('status') == 'active':
            if existing.get('content_sha256') != content_sha256:
                raise media_error(
                    'guest_idempotency_conflict',
                    'This Idempotency-Key was already used for different media content.',
                    status_code=409,
                )
            return existing
        reservation_id = f'upload-{uuid4().hex}'
        object_name = self._object_name(session['guest_id'], media_id)
        if existing and existing.get('status') == 'cleanup_pending':
            if existing.get('content_sha256') != content_sha256:
                raise media_error(
                    'guest_idempotency_conflict',
                    'This Idempotency-Key was already used for different media content.',
                    status_code=409,
                )
            if existing.get('storage_object_path') != object_name:
                raise media_error('guest_media_invalid_record', 'The media cleanup record is invalid.', status_code=500)
            try:
                self.storage.delete(object_name)
                self.repository.delete_cleanup_pending(guest_id=session['guest_id'], media_id=media_id)
            except Exception as exc:
                raise media_error(
                    'guest_media_cleanup_pending',
                    'A previous failed upload is still being cleaned up. Retry shortly.',
                    status_code=503,
                    recoverable=True,
                ) from exc
        deadline = time.monotonic() + self.operation_timeout
        reserved = False
        claimed = False
        object_uploaded = False
        file_size = 0
        logger.info('guest_media_upload_started', extra={'guest_id': session['guest_id'], 'media_id': media_id})

        try:
            self.sessions.reserve_quota(
                raw_token=raw_token,
                reservation_id=reservation_id,
                reservation=GuestQuotaReservation(
                    uploads=1,
                    concurrent_processing=1,
                ),
            )
            reserved = True
            claimed = self.repository.claim_upload(
                guest_id=session['guest_id'],
                media_id=media_id,
                reservation_id=reservation_id,
                content_sha256=content_sha256,
                storage_object_path=object_name,
                expires_at=session['expires_at'],
                now=datetime.now(UTC),
            )
            if not claimed:
                existing = self.repository.get_for_guest(session['guest_id'], media_id)
                if existing and existing.get('status') == 'active':
                    return existing
                raise media_error(
                    'guest_media_upload_in_progress',
                    'An upload with this idempotency key is already in progress.',
                    status_code=409,
                    recoverable=True,
                )
            with tempfile.TemporaryDirectory(prefix='rangmanch-guest-upload-') as directory:
                source = Path(directory) / 'source.bin'
                file_size, copied_sha256 = self._copy_upload(upload.file, source, deadline)
                if copied_sha256 != content_sha256:
                    raise media_error(
                        'guest_media_changed_during_upload',
                        'The uploaded file changed while it was being processed.',
                        status_code=409,
                    )
                self.sessions.increase_quota_reservation(
                    raw_token=raw_token,
                    reservation_id=reservation_id,
                    additional=GuestQuotaReservation(
                        uploaded_bytes=file_size,
                        storage_bytes=file_size,
                    ),
                )
                validated = self._validate_media(source, upload.content_type, deadline)
                self._check_deadline(deadline)
                try:
                    self.storage.upload_file(
                        object_name,
                        source,
                        content_type=validated.content_type,
                        timeout_seconds=self._remaining_seconds(deadline),
                    )
                except Exception as exc:
                    raise media_error(
                        'guest_media_storage_failed',
                        'The uploaded media could not be stored.',
                        status_code=503,
                        recoverable=True,
                    ) from exc
                object_uploaded = True

            now = datetime.now(UTC)
            media = {
                'media_id': media_id,
                'guest_id': session['guest_id'],
                'media_type': validated.media_type,
                'content_type': validated.content_type,
                'original_filename': self._sanitize_filename(upload.filename),
                'file_size': file_size,
                'duration_seconds': validated.duration_seconds,
                'width': validated.width,
                'height': validated.height,
                'storage_object_path': object_name,
                'content_sha256': content_sha256,
                'created_at': now,
                'expires_at': session['expires_at'],
                'status': 'active',
            }
            committed = self.repository.commit_upload(
                guest_id=session['guest_id'],
                reservation_id=reservation_id,
                actual=GuestQuotaReservation(
                    uploads=1,
                    uploaded_bytes=file_size,
                    storage_bytes=file_size,
                ),
                media=media,
                now=now,
            )
            reserved = False
            claimed = False
            logger.info('guest_media_upload_completed', extra={'guest_id': session['guest_id'], 'media_id': media_id})
            return committed
        except GuestSessionError:
            raise
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
            raise media_error(
                'guest_media_processing_failed',
                'The uploaded media could not be processed.',
                status_code=422,
                recoverable=True,
            ) from exc
        except Exception as exc:
            raise media_error(
                'guest_media_storage_failed',
                'The uploaded media could not be stored.',
                status_code=503,
                recoverable=True,
            ) from exc
        finally:
            object_cleanup_failed = False
            if reserved:
                if object_uploaded:
                    try:
                        self.storage.delete(object_name)
                    except Exception:
                        object_cleanup_failed = True
                        logger.exception('guest_media_partial_object_cleanup_failed')
                if not object_cleanup_failed:
                    try:
                        self.sessions.release_quota(
                            raw_token=raw_token,
                            reservation_id=reservation_id,
                            commit=False,
                        )
                    except Exception:
                        logger.exception('guest_media_quota_rollback_failed')
            if claimed and object_cleanup_failed:
                try:
                    self.repository.mark_cleanup_pending(
                        guest_id=session['guest_id'],
                        media_id=media_id,
                        reservation_id=reservation_id,
                        storage_object_path=object_name,
                        orphaned_storage_bytes=file_size,
                        now=datetime.now(UTC),
                    )
                except Exception:
                    logger.exception('guest_media_cleanup_marker_failed')
            elif claimed:
                try:
                    self.repository.delete_upload_claim(
                        guest_id=session['guest_id'],
                        media_id=media_id,
                        reservation_id=reservation_id,
                    )
                except Exception:
                    logger.exception('guest_media_claim_cleanup_failed')

    def list_media(self, raw_token: str | None) -> list[dict[str, Any]]:
        session = self.sessions.get_session(raw_token)
        return [item for item in self.repository.list_for_guest(session['guest_id']) if item.get('status') == 'active']

    def _recover_stale_uploads(self, session: dict[str, Any], raw_token: str | None) -> None:
        now = datetime.now(UTC)
        for media in self.repository.list_for_guest(session['guest_id']):
            if media.get('status') != 'uploading':
                continue
            reservation_id = media.get('reservation_id')
            if not isinstance(reservation_id, str):
                continue
            reservation = self.repository.get_reservation(
                guest_id=session['guest_id'],
                reservation_id=reservation_id,
            )
            lease_expires_at = (reservation or {}).get('lease_expires_at')
            if (
                reservation
                and reservation.get('status') == 'active'
                and isinstance(lease_expires_at, datetime)
                and lease_expires_at > now
            ):
                continue
            media_id = media.get('media_id')
            if not isinstance(media_id, str) or not _MEDIA_ID_PATTERN.fullmatch(media_id):
                continue
            object_name = self._object_name(session['guest_id'], media_id)
            if media.get('storage_object_path') != object_name:
                continue
            try:
                self.storage.delete(object_name)
            except Exception:
                logger.exception('guest_media_stale_object_cleanup_failed')
                continue
            if reservation and reservation.get('status') == 'active':
                try:
                    self.sessions.release_quota(
                        raw_token=raw_token,
                        reservation_id=reservation_id,
                        commit=False,
                    )
                except Exception:
                    logger.exception('guest_media_stale_quota_release_failed')
                    continue
            self.repository.delete_upload_claim(
                guest_id=session['guest_id'],
                media_id=media_id,
                reservation_id=reservation_id,
            )

    def get_media(self, raw_token: str | None, media_id: str) -> dict[str, Any]:
        if not _MEDIA_ID_PATTERN.fullmatch(media_id):
            raise self._not_found()
        session = self.sessions.get_session(raw_token)
        media = self.repository.get_for_guest(session['guest_id'], media_id)
        if not media or media.get('status') != 'active' or media.get('guest_id') != session['guest_id']:
            raise self._not_found()
        if media.get('storage_object_path') != self._object_name(session['guest_id'], media_id):
            raise media_error(
                'guest_media_invalid_record',
                'The media record is invalid.',
                status_code=500,
            )
        return media

    def content_range(
        self,
        raw_token: str | None,
        media_id: str,
        range_header: str | None,
    ) -> tuple[dict[str, Any], int, int, int]:
        media = self.get_media(raw_token, media_id)
        file_size = int(media['file_size'])
        start, end = self._parse_range(range_header, file_size)
        return media, start, end, file_size

    def _copy_upload(self, source: BinaryIO, destination: Path, deadline: float) -> tuple[int, str]:
        total = 0
        digest = hashlib.sha256()
        source.seek(0)
        with destination.open('xb') as target:
            while True:
                self._check_deadline(deadline)
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > self.max_file_bytes:
                    raise media_error(
                        'guest_media_too_large',
                        f'Guest uploads are limited to {self.max_file_bytes} bytes per file.',
                        status_code=413,
                    )
                digest.update(chunk)
                target.write(chunk)
        if total == 0:
            raise media_error('guest_media_empty', 'The uploaded file is empty.', status_code=422)
        return total, digest.hexdigest()

    def _hash_upload(self, source: BinaryIO) -> str:
        digest = hashlib.sha256()
        total = 0
        source.seek(0)
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > self.max_file_bytes:
                raise media_error(
                    'guest_media_too_large',
                    f'Guest uploads are limited to {self.max_file_bytes} bytes per file.',
                    status_code=413,
                )
            digest.update(chunk)
        source.seek(0)
        return digest.hexdigest()

    def _validate_media(self, path: Path, declared_type: str | None, deadline: float) -> ValidatedMedia:
        declared = (declared_type or '').split(';', 1)[0].strip().lower()
        if declared and declared not in _ALLOWED_DECLARED_TYPES:
            raise media_error('guest_media_unsupported', 'The uploaded media type is not supported.', status_code=415)
        with path.open('rb') as source:
            header = source.read(16)
        actual_image_type = self._image_type(header)
        if actual_image_type:
            canonical_type = _IMAGE_TYPES[actual_image_type][0]
            if declared not in {'', 'application/octet-stream', canonical_type}:
                raise media_error('guest_media_type_mismatch', 'The declared media type does not match the file.', status_code=415)
            result = self._probe(path, deadline)
            width, height = self._dimensions(result)
            if width * height > self.max_image_pixels:
                raise media_error('guest_image_too_large', 'The image dimensions are too large.', status_code=422)
            self._decode_first_frame(path, deadline)
            return ValidatedMedia('image', canonical_type, None, width, height)

        if declared.startswith('image/'):
            raise media_error('guest_media_unsupported', 'The uploaded file is not a supported image.', status_code=415)

        result = self._probe(path, deadline)
        streams = result.get('streams', [])
        has_video = any(stream.get('codec_type') == 'video' for stream in streams)
        has_audio = any(stream.get('codec_type') == 'audio' for stream in streams)
        if not has_video and has_audio:
            audio_type = self._audio_type(result)
            if not audio_type:
                raise media_error('guest_media_unsupported', 'The uploaded audio format is not supported.', status_code=415)
            declared_aliases = {'audio/wav', 'audio/x-wav'} if audio_type == 'audio/wav' else {audio_type}
            if declared not in {'', 'application/octet-stream', *declared_aliases}:
                raise media_error('guest_media_type_mismatch', 'The declared media type does not match the file.', status_code=415)
            duration = self._duration(result)
            if duration > self.max_video_duration:
                raise media_error('guest_audio_too_long', f'Guest audio is limited to {self.max_video_duration:g} seconds.', status_code=422)
            self._decode_audio(path, deadline)
            return ValidatedMedia('audio', audio_type, duration, 0, 0)

        video_type = self._video_type(header, declared)
        if not has_video or not video_type:
            raise media_error('guest_media_unsupported', 'The uploaded file is not a supported image, video, or audio file.', status_code=415)
        if declared not in {'', 'application/octet-stream', video_type} and not (
            video_type in {'video/mp4', 'video/quicktime'}
            and declared in {'video/mp4', 'video/quicktime'}
        ):
            raise media_error('guest_media_type_mismatch', 'The declared media type does not match the file.', status_code=415)
        width, height = self._dimensions(result)
        if width * height > self.max_image_pixels:
            raise media_error('guest_video_dimensions_too_large', 'The video dimensions are too large.', status_code=422)
        duration = self._duration(result)
        if duration > self.max_video_duration:
            raise media_error(
                'guest_video_too_long',
                f'Guest videos are limited to {self.max_video_duration:g} seconds.',
                status_code=422,
            )
        if video_type == 'video/webm':
            self._validate_webm_codecs(result)
        self._decode_first_frame(path, deadline)
        return ValidatedMedia('video', video_type, duration, width, height)

    def _probe(self, path: Path, deadline: float) -> dict[str, Any]:
        completed = self._run(
            [
                self.ffprobe_binary,
                '-v', 'error',
                '-print_format', 'json',
                '-show_streams',
                '-show_format',
                '-show_entries',
                'stream=codec_type,codec_name,width,height,duration:format=duration,format_name',
                str(path),
            ],
            deadline,
        )
        payload = json.loads(completed.stdout or '{}')
        streams = payload.get('streams')
        if not isinstance(streams, list) or not any(isinstance(stream, dict) for stream in streams):
            raise media_error('guest_media_invalid', 'The file has no valid media stream.', status_code=422)
        return payload

    def _decode_first_frame(self, path: Path, deadline: float) -> None:
        self._run(
            [
                self.ffmpeg_binary,
                '-hide_banner', '-loglevel', 'error', '-nostdin',
                '-threads', '1',
                '-i', str(path),
                '-map', '0:v:0',
                '-frames:v', '1',
                '-f', 'null',
                '-',
            ],
            deadline,
        )

    def _decode_audio(self, path: Path, deadline: float) -> None:
        self._run(
            [
                self.ffmpeg_binary,
                '-hide_banner', '-loglevel', 'error', '-nostdin',
                '-threads', '1', '-i', str(path), '-map', '0:a:0',
                '-t', '1', '-f', 'null', '-',
            ],
            deadline,
        )

    @staticmethod
    def _audio_type(payload: dict[str, Any]) -> str | None:
        audio_stream = next((stream for stream in payload.get('streams', []) if stream.get('codec_type') == 'audio'), None)
        if not audio_stream:
            return None
        codec = str(audio_stream.get('codec_name') or '').lower()
        formats = set(str((payload.get('format') or {}).get('format_name') or '').lower().split(','))
        if codec == 'mp3' or 'mp3' in formats:
            return 'audio/mpeg'
        if codec.startswith('pcm_') and ('wav' in formats or 'wave' in formats):
            return 'audio/wav'
        if codec == 'aac' and formats.intersection({'mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'}):
            return 'audio/mp4'
        if codec == 'aac':
            return 'audio/aac'
        if codec in {'vorbis', 'opus'} and formats.intersection({'ogg', 'opus'}):
            return 'audio/ogg'
        return None

    def _run(self, command: list[str], deadline: float) -> subprocess.CompletedProcess[str]:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise media_error('guest_upload_timeout', 'The upload processing deadline was exceeded.', status_code=408, recoverable=True)
        try:
            completed = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                check=False,
                timeout=remaining,
            )
        except subprocess.TimeoutExpired as exc:
            raise media_error('guest_upload_timeout', 'The upload processing deadline was exceeded.', status_code=408, recoverable=True) from exc
        if completed.returncode != 0:
            raise media_error('guest_media_invalid', 'The file could not be decoded safely.', status_code=422)
        return completed

    @staticmethod
    def _dimensions(payload: dict[str, Any]) -> tuple[int, int]:
        stream = next(stream for stream in payload['streams'] if stream.get('codec_type') == 'video')
        width = int(stream.get('width') or 0)
        height = int(stream.get('height') or 0)
        if width <= 0 or height <= 0:
            raise media_error('guest_media_invalid', 'The media dimensions are invalid.', status_code=422)
        return width, height

    @staticmethod
    def _duration(payload: dict[str, Any]) -> float:
        values = [(payload.get('format') or {}).get('duration')]
        values.extend(stream.get('duration') for stream in payload.get('streams', []))
        durations = []
        for value in values:
            try:
                duration = float(value)
            except (TypeError, ValueError):
                continue
            if duration > 0:
                durations.append(duration)
        if not durations:
            raise media_error('guest_media_invalid', 'The video duration is invalid.', status_code=422)
        return max(durations)

    @staticmethod
    def _validate_webm_codecs(payload: dict[str, Any]) -> None:
        video_codecs = {
            stream.get('codec_name')
            for stream in payload.get('streams', [])
            if stream.get('codec_type') == 'video'
        }
        audio_codecs = {
            stream.get('codec_name')
            for stream in payload.get('streams', [])
            if stream.get('codec_type') == 'audio'
        }
        if not video_codecs or not video_codecs.issubset({'vp8', 'vp9', 'av1'}):
            raise media_error('guest_media_unsupported', 'The WebM video codec is not supported.', status_code=415)
        if not audio_codecs.issubset({'opus', 'vorbis'}):
            raise media_error('guest_media_unsupported', 'The WebM audio codec is not supported.', status_code=415)

    @staticmethod
    def _image_type(header: bytes) -> str | None:
        if header.startswith(_IMAGE_TYPES['jpeg'][1]):
            return 'jpeg'
        if header.startswith(_IMAGE_TYPES['png'][1]):
            return 'png'
        if header.startswith(b'RIFF') and header[8:12] == b'WEBP':
            return 'webp'
        return None

    @staticmethod
    def _video_type(header: bytes, declared: str) -> str | None:
        if len(header) >= 12 and header[4:8] == b'ftyp':
            return 'video/quicktime' if declared == 'video/quicktime' else 'video/mp4'
        if header.startswith(b'\x1aE\xdf\xa3'):
            return 'video/webm'
        return None

    @staticmethod
    def _sanitize_filename(filename: str | None) -> str:
        value = unquote(filename or 'upload').replace('\\', '/').split('/')[-1]
        value = ''.join(character for character in value if character.isprintable() and character not in {'\x00', '\r', '\n'})
        return value[:255] or 'upload'

    @staticmethod
    def _object_name(guest_id: str, media_id: str) -> str:
        return f'guest-editor/{guest_id}/sources/{media_id}/original'

    @staticmethod
    def _media_id(guest_id: str, idempotency_key: str | None) -> str:
        GuestMediaService.validate_idempotency_key(idempotency_key)
        assert idempotency_key is not None
        return hashlib.sha256(f'{guest_id}\0{idempotency_key}'.encode()).hexdigest()[:32]

    @staticmethod
    def validate_idempotency_key(idempotency_key: str | None) -> None:
        if idempotency_key is None:
            raise media_error(
                'guest_idempotency_key_required',
                'Idempotency-Key is required for guest media uploads.',
                status_code=400,
            )
        if not _IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key):
            raise media_error(
                'guest_idempotency_key_invalid',
                'Idempotency-Key must be 8-128 safe ASCII characters.',
                status_code=400,
            )

    @staticmethod
    def _parse_range(value: str | None, file_size: int) -> tuple[int, int]:
        if not value:
            return 0, file_size - 1
        if len(value) > 128:
            raise media_error('guest_media_range_invalid', 'The requested byte range is invalid.', status_code=416)
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', value.strip())
        if not match or (not match.group(1) and not match.group(2)):
            raise media_error('guest_media_range_invalid', 'The requested byte range is invalid.', status_code=416)
        try:
            first = int(match.group(1)) if match.group(1) else None
            second = int(match.group(2)) if match.group(2) else None
        except ValueError as exc:
            raise media_error('guest_media_range_invalid', 'The requested byte range is invalid.', status_code=416) from exc
        if first is None:
            length = second or 0
            if length <= 0:
                raise media_error('guest_media_range_invalid', 'The requested byte range is invalid.', status_code=416)
            return max(0, file_size - length), file_size - 1
        start = first
        end = second if second is not None else file_size - 1
        if start >= file_size or end < start:
            raise media_error('guest_media_range_invalid', 'The requested byte range is invalid.', status_code=416)
        return start, min(end, file_size - 1)

    @staticmethod
    def _check_deadline(deadline: float) -> None:
        if time.monotonic() >= deadline:
            raise media_error('guest_upload_timeout', 'The upload processing deadline was exceeded.', status_code=408, recoverable=True)

    @staticmethod
    def _remaining_seconds(deadline: float) -> float:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise media_error('guest_upload_timeout', 'The upload processing deadline was exceeded.', status_code=408, recoverable=True)
        return remaining

    @staticmethod
    def _not_found() -> GuestSessionError:
        return media_error('guest_media_not_found', 'The requested media was not found.', status_code=404)


def build_guest_media_service() -> GuestMediaService:
    settings = get_settings()
    sessions = build_guest_session_service()
    return GuestMediaService(
        settings=settings,
        sessions=sessions,
        repository=GuestMediaRepository(get_firestore_client()),
        storage=build_guest_media_storage(settings),
    )
