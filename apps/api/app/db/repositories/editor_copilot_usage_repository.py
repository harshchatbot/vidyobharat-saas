from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from google.api_core.exceptions import Aborted, DeadlineExceeded, ServiceUnavailable


class CopilotUsageUnavailable(RuntimeError):
    pass


class CopilotQuotaExceeded(RuntimeError):
    def __init__(self, quota: str) -> None:
        super().__init__(f'Copilot {quota} limit has been reached.')
        self.quota = quota


@dataclass(frozen=True)
class CopilotQuotaLimits:
    user_requests: int
    user_tokens: int
    user_cost_usd: float
    global_requests: int
    global_cost_usd: float
    concurrent_per_user: int
    lease_seconds: int


class EditorCopilotUsageRepository:
    collection_name = 'editor_copilot_usage'

    def __init__(self, firestore_client) -> None:
        self.firestore = firestore_client
        self.collection = firestore_client.collection(self.collection_name)

    def reserve(
        self,
        *,
        uid: str,
        reservation_id: str,
        reserved_tokens: int,
        reserved_cost_usd: float,
        limits: CopilotQuotaLimits,
        now: datetime,
    ) -> None:
        from firebase_admin import firestore

        user_ref = self.collection.document(f'user-{hashlib.sha256(uid.encode()).hexdigest()}')
        global_ref = self.collection.document('global')
        transaction = self.firestore.transaction()

        @firestore.transactional
        def apply(txn):
            # Transaction.get() returns an iterator; document.get() returns a snapshot.
            user_events = self._events(user_ref.get(transaction=txn).to_dict(), now, limits.lease_seconds)
            global_events = self._events(global_ref.get(transaction=txn).to_dict(), now, limits.lease_seconds)
            if any(event.get('id') == reservation_id for event in user_events):
                raise CopilotUsageUnavailable('Copilot reservation ID was reused.')
            user_totals = self._totals(user_events, now)
            global_totals = self._totals(global_events, now)
            if user_totals['requests'] + 1 > limits.user_requests:
                raise CopilotQuotaExceeded('request')
            if user_totals['tokens'] + reserved_tokens > limits.user_tokens:
                raise CopilotQuotaExceeded('token')
            if user_totals['cost'] + reserved_cost_usd > limits.user_cost_usd:
                raise CopilotQuotaExceeded('cost')
            if user_totals['active'] >= limits.concurrent_per_user:
                raise CopilotQuotaExceeded('concurrency')
            if global_totals['requests'] + 1 > limits.global_requests:
                raise CopilotQuotaExceeded('global request')
            if global_totals['cost'] + reserved_cost_usd > limits.global_cost_usd:
                raise CopilotQuotaExceeded('global cost')
            event = {
                'id': reservation_id,
                'created_at': now,
                'lease_expires_at': now + timedelta(seconds=limits.lease_seconds),
                'active': True,
                'status': 'reserved',
                'tokens': reserved_tokens,
                'cost_usd': reserved_cost_usd,
            }
            txn.set(user_ref, {'events': [*user_events, event], 'updated_at': now})
            txn.set(global_ref, {'events': [*global_events, event], 'updated_at': now})

        try:
            apply(transaction)
        except CopilotQuotaExceeded:
            raise
        except (Aborted, DeadlineExceeded, ServiceUnavailable) as exc:
            raise CopilotUsageUnavailable('Copilot usage accounting is temporarily unavailable.') from exc
        except CopilotUsageUnavailable:
            raise
        except Exception as exc:
            raise CopilotUsageUnavailable('Copilot usage accounting failed closed.') from exc

    def reconcile(
        self,
        *,
        uid: str,
        reservation_id: str,
        tokens: int,
        cost_usd: float,
        status: str,
        now: datetime,
    ) -> None:
        from firebase_admin import firestore

        refs = [
            self.collection.document(f'user-{hashlib.sha256(uid.encode()).hexdigest()}'),
            self.collection.document('global'),
        ]
        transaction = self.firestore.transaction()

        @firestore.transactional
        def apply(txn):
            updates: list[tuple[Any, list[dict[str, Any]]]] = []
            for reference in refs:
                raw = (reference.get(transaction=txn).to_dict() or {}).get('events')
                if not isinstance(raw, list):
                    raise CopilotUsageUnavailable('Copilot reservation record is missing.')
                found = False
                events: list[dict[str, Any]] = []
                for existing in raw:
                    event = dict(existing) if isinstance(existing, dict) else {}
                    if event.get('id') == reservation_id:
                        found = True
                        if not event.get('active'):
                            if event.get('status') == status:
                                events.append(event)
                                continue
                            raise CopilotUsageUnavailable('Copilot reservation is no longer active.')
                        event.update({
                            'active': False,
                            'status': status,
                            'tokens': max(0, int(tokens)),
                            'cost_usd': max(0.0, float(cost_usd)),
                            'completed_at': now,
                        })
                    events.append(event)
                if not found:
                    raise CopilotUsageUnavailable('Copilot reservation record is missing.')
                updates.append((reference, events))
            for reference, events in updates:
                txn.set(reference, {'events': events, 'updated_at': now})

        try:
            apply(transaction)
        except CopilotUsageUnavailable:
            raise
        except (Aborted, DeadlineExceeded, ServiceUnavailable) as exc:
            raise CopilotUsageUnavailable('Copilot usage reconciliation is temporarily unavailable.') from exc
        except Exception as exc:
            raise CopilotUsageUnavailable('Copilot usage reconciliation failed closed.') from exc

    @staticmethod
    def _events(data: dict[str, Any] | None, now: datetime, lease_seconds: int) -> list[dict[str, Any]]:
        cutoff = now - timedelta(hours=24)
        events: list[dict[str, Any]] = []
        for raw in (data or {}).get('events', []):
            if not isinstance(raw, dict):
                continue
            event = dict(raw)
            created = event.get('created_at')
            if not isinstance(created, datetime) or created < cutoff:
                continue
            lease_expires = event.get('lease_expires_at')
            if event.get('active') and isinstance(lease_expires, datetime) and lease_expires <= now:
                # Preserve the conservative token/cost reservation because a
                # crashed request may still have been billed by the provider.
                event.update({'active': False, 'status': 'lease_expired', 'completed_at': now})
            events.append(event)
        return events

    @staticmethod
    def _totals(events: list[dict[str, Any]], now: datetime) -> dict[str, int | float]:
        cutoff = now - timedelta(hours=24)
        current = [event for event in events if isinstance(event.get('created_at'), datetime) and event['created_at'] >= cutoff]
        return {
            'requests': len(current),
            'tokens': sum(max(0, int(event.get('tokens', 0))) for event in current),
            'cost': sum(max(0.0, float(event.get('cost_usd', 0))) for event in current),
            'active': sum(1 for event in current if event.get('active') is True),
        }
