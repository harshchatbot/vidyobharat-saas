from __future__ import annotations

import base64
import json
import re
from datetime import UTC, datetime
from typing import Any

from google.cloud.firestore_v1 import Query
from google.cloud.firestore_v1.base_query import FieldFilter


_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{1,128}$')


class AdminCursorError(ValueError):
    pass


class AdminGuestRepository:
    def __init__(self, firestore_client) -> None:
        self.firestore = firestore_client
        self.sessions = firestore_client.collection('editor_guest_sessions')

    def dashboard(self, *, now: datetime, recent_limit: int = 12) -> dict[str, Any]:
        totals_query = (
            self.sessions.count(alias='sessions')
            .sum('uploads_count', alias='uploads')
            .sum('exports_count', alias='exports')
            .sum('uploaded_bytes', alias='uploaded_bytes')
            .sum('storage_bytes', alias='storage_bytes')
        )
        totals = self._aggregation_values(totals_query.get())
        active = self._aggregation_values(
            self.sessions
            .where(filter=FieldFilter('status', '==', 'active'))
            .where(filter=FieldFilter('expires_at', '>', now))
            .count(alias='active')
            .get()
        )
        completed = self._aggregation_values(
            self.firestore.collection_group('exports')
            .where(filter=FieldFilter('status', '==', 'completed'))
            .count(alias='completed').get()
        )
        failed = self._aggregation_values(
            self.firestore.collection_group('exports')
            .where(filter=FieldFilter('status', '==', 'failed'))
            .count(alias='failed').get()
        )
        activity: list[dict[str, Any]] = []
        for snapshot in self.sessions.order_by('updated_at', direction=Query.DESCENDING).limit(recent_limit).stream():
            data = snapshot.to_dict() or {}
            activity.append({
                'kind': 'guest_session', 'guest_id': snapshot.id,
                'status': str(data.get('status', 'unknown')),
                'occurred_at': data.get('updated_at') or data.get('created_at'),
            })
        for snapshot in (
            self.firestore.collection_group('exports')
            .order_by('updated_at', direction=Query.DESCENDING).limit(recent_limit).stream()
        ):
            data = snapshot.to_dict() or {}
            activity.append({
                'kind': 'export', 'guest_id': str(data.get('guest_id', '')),
                'job_id': snapshot.id, 'status': str(data.get('status', 'unknown')),
                'occurred_at': data.get('updated_at') or data.get('created_at'),
            })
        activity.sort(key=lambda item: item.get('occurred_at') or datetime.min.replace(tzinfo=UTC), reverse=True)
        return {
            'total_guest_sessions': int(totals.get('sessions', 0)),
            'active_guest_sessions': int(active.get('active', 0)),
            'accepted_uploads': int(totals.get('uploads', 0)),
            'completed_exports': int(completed.get('completed', totals.get('exports', 0))),
            'failed_exports': int(failed.get('failed', 0)),
            'uploaded_bytes': int(totals.get('uploaded_bytes', 0)),
            'active_storage_bytes': int(totals.get('storage_bytes', 0)),
            'recent_activity': activity[:recent_limit],
        }

    def list_guests(self, *, limit: int, cursor: str | None) -> tuple[list[dict[str, Any]], str | None]:
        query = self.sessions.order_by('created_at', direction=Query.DESCENDING)
        if cursor:
            snapshot = self._cursor_snapshot(self.sessions, cursor)
            query = query.start_after(snapshot)
        snapshots = list(query.limit(limit + 1).stream())
        has_more = len(snapshots) > limit
        snapshots = snapshots[:limit]
        items = [self._guest(snapshot.id, snapshot.to_dict() or {}) for snapshot in snapshots]
        return items, self._encode_cursor(snapshots[-1].id) if has_more and snapshots else None

    def guest_exports(
        self, *, guest_id: str, limit: int, cursor: str | None,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], str | None]:
        if not _ID_PATTERN.fullmatch(guest_id):
            return None, [], None
        session = self.sessions.document(guest_id).get()
        if not session.exists:
            return None, [], None
        exports = session.reference.collection('exports')
        query = exports.order_by('created_at', direction=Query.DESCENDING)
        if cursor:
            query = query.start_after(self._cursor_snapshot(exports, cursor))
        snapshots = list(query.limit(limit + 1).stream())
        has_more = len(snapshots) > limit
        snapshots = snapshots[:limit]
        items = [self._export(snapshot.id, snapshot.to_dict() or {}) for snapshot in snapshots]
        return (
            self._guest(session.id, session.to_dict() or {}),
            items,
            self._encode_cursor(snapshots[-1].id) if has_more and snapshots else None,
        )

    def config_audit(self, *, limit: int, cursor: str | None) -> tuple[list[dict[str, Any]], str | None]:
        collection = self.firestore.collection('app_config_audit')
        query = collection.order_by('created_at', direction=Query.DESCENDING)
        if cursor:
            query = query.start_after(self._cursor_snapshot(collection, cursor))
        snapshots = list(query.limit(limit + 1).stream())
        has_more = len(snapshots) > limit
        snapshots = snapshots[:limit]
        items = []
        for snapshot in snapshots:
            data = snapshot.to_dict() or {}
            items.append({
                'audit_id': snapshot.id,
                'actor_uid': str(data.get('actor_uid', '')),
                'actor_email': data.get('actor_email') if isinstance(data.get('actor_email'), str) else None,
                'created_at': data.get('created_at'),
                'reason': data.get('reason') if isinstance(data.get('reason'), str) else None,
                'revision': int(data.get('revision', 0)),
                'before': data.get('before') if isinstance(data.get('before'), dict) else {},
                'after': data.get('after') if isinstance(data.get('after'), dict) else {},
            })
        return items, self._encode_cursor(snapshots[-1].id) if has_more and snapshots else None

    @staticmethod
    def _guest(guest_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {
            'guest_id': guest_id,
            'created_at': data['created_at'], 'updated_at': data.get('updated_at') or data['created_at'],
            'expires_at': data['expires_at'], 'status': str(data.get('status', 'unknown')),
            'uploads_count': int(data.get('uploads_count', 0)),
            'exports_count': int(data.get('exports_count', 0)),
            'uploaded_bytes': int(data.get('uploaded_bytes', 0)),
            'storage_bytes': int(data.get('storage_bytes', 0)),
            'processing_seconds': float(data.get('processing_seconds', 0)),
        }

    @staticmethod
    def _export(job_id: str, data: dict[str, Any]) -> dict[str, Any]:
        output = data.get('output') if isinstance(data.get('output'), dict) else {}
        return {
            'job_id': job_id, 'status': str(data.get('status', 'unknown')),
            'progress_stage': str(data.get('progress_stage', 'unknown')),
            'created_at': data['created_at'], 'updated_at': data.get('updated_at') or data['created_at'],
            'expires_at': data['expires_at'], 'attempt_count': int(data.get('attempt_count', 0)),
            'error_code': data.get('error_code') if isinstance(data.get('error_code'), str) else None,
            'filename': output.get('filename') if isinstance(output.get('filename'), str) else None,
            'duration_seconds': float(output['duration_seconds']) if isinstance(output.get('duration_seconds'), (int, float)) else None,
            'output_bytes': int(output['file_size']) if isinstance(output.get('file_size'), int) else None,
        }

    @staticmethod
    def _aggregation_values(rows) -> dict[str, int | float]:
        values: dict[str, int | float] = {}
        for row in rows:
            results = row if isinstance(row, (list, tuple)) else [row]
            for result in results:
                values[str(result.alias)] = result.value or 0
        return values

    @staticmethod
    def _encode_cursor(document_id: str) -> str:
        return base64.urlsafe_b64encode(json.dumps({'id': document_id}).encode()).decode().rstrip('=')

    @staticmethod
    def _decode_cursor(cursor: str) -> str:
        try:
            padded = cursor + '=' * (-len(cursor) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode())
            document_id = payload['id']
        except Exception as exc:
            raise AdminCursorError('Pagination cursor is invalid.') from exc
        if not isinstance(document_id, str) or not _ID_PATTERN.fullmatch(document_id):
            raise AdminCursorError('Pagination cursor is invalid.')
        return document_id

    def _cursor_snapshot(self, collection, cursor: str):
        snapshot = collection.document(self._decode_cursor(cursor)).get()
        if not snapshot.exists:
            raise AdminCursorError('Pagination cursor is invalid or expired.')
        return snapshot
