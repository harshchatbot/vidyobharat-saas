from __future__ import annotations

import hashlib

from fastapi import Request
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from app.services.guest_session_errors import media_error


class LimitedFileMultipartParser(MultiPartParser):
    def __init__(self, *args, max_file_bytes: int, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.max_file_bytes = max_file_bytes
        self._current_file_bytes = 0
        self._current_file_hash = hashlib.sha256()

    def on_part_begin(self) -> None:
        super().on_part_begin()
        self._current_file_bytes = 0
        self._current_file_hash = hashlib.sha256()

    def on_part_data(self, data: bytes, start: int, end: int) -> None:
        if self._current_part.file is not None:
            self._current_file_bytes += end - start
            if self._current_file_bytes > self.max_file_bytes:
                raise MultiPartException('Guest media file exceeded the upload limit.')
            self._current_file_hash.update(data[start:end])
        super().on_part_data(data, start, end)

    def on_part_end(self) -> None:
        if self._current_part.file is not None:
            setattr(self._current_part.file, 'content_sha256', self._current_file_hash.hexdigest())
        super().on_part_end()


async def parse_guest_media_upload(request: Request, *, max_file_bytes: int) -> UploadFile:
    content_type = (request.headers.get('content-type') or '').lower()
    if not content_type.startswith('multipart/form-data'):
        raise media_error(
            'guest_media_multipart_required',
            'The upload must use multipart/form-data.',
            status_code=415,
        )
    parser = LimitedFileMultipartParser(
        request.headers,
        request.stream(),
        max_files=1,
        max_fields=0,
        max_file_bytes=max_file_bytes,
    )
    if hasattr(parser, 'max_part_size'):
        parser.max_part_size = 1024
    try:
        form = await parser.parse()
    except MultiPartException as exc:
        message = str(exc)
        if 'exceeded the upload limit' in message:
            raise media_error(
                'guest_media_too_large',
                f'Guest uploads are limited to {max_file_bytes} bytes per file.',
                status_code=413,
            ) from exc
        raise media_error(
            'guest_media_multipart_invalid',
            'The multipart upload is invalid or contains more than one file.',
            status_code=400,
        ) from exc

    if set(form.keys()) != {'file'} or not isinstance(form.get('file'), UploadFile):
        for value in form.values():
            if isinstance(value, UploadFile):
                await value.close()
        raise media_error(
            'guest_media_file_required',
            'Exactly one media file field named file is required.',
            status_code=400,
        )
    return form['file']
