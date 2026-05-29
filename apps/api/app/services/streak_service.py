"""Creator streak tracking service using Firestore."""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import logging
from app.providers.firebase import get_firestore_client

logger = logging.getLogger(__name__)


class StreakService:
    """Manage user creator streaks in Firestore."""

    DEFAULT_TIMEZONE = "Asia/Kolkata"

    def _today_in_timezone(self, timezone_name: str | None) -> date:
        tz_name = str(timezone_name or "").strip() or self.DEFAULT_TIMEZONE
        try:
            return datetime.now(ZoneInfo(tz_name)).date()
        except Exception:
            return datetime.now(ZoneInfo(self.DEFAULT_TIMEZONE)).date()

    def _parse_last_active_date(self, value: object) -> date | None:
        if value is None:
            return None
        if isinstance(value, date):
            return value
        text = str(value).strip()
        if not text:
            return None
        try:
            return date.fromisoformat(text[:10])
        except Exception:
            return None

    def get_streak(self, user_id: str) -> dict:
        """Get current streak data for user from Firestore."""
        db = get_firestore_client()
        doc = db.collection('user_streaks').document(user_id).get()

        if not doc.exists:
            return {
                'current_streak': 0,
                'longest_streak': 0,
                'last_active_date': None,
                'created_today': False
            }

        data = doc.to_dict() or {}
        user_tz = data.get('timezone') or self.DEFAULT_TIMEZONE
        today_str = self._today_in_timezone(user_tz).isoformat()
        last_active_date = self._parse_last_active_date(data.get('last_active_date'))
        last_active = last_active_date.isoformat() if last_active_date else None
        created_today = last_active == today_str

        return {
            'current_streak': data.get('current_streak', 0),
            'longest_streak': data.get('longest_streak', 0),
            'last_active_date': last_active,
            'created_today': created_today
        }

    def record_activity(self, user_id: str) -> dict:
        """Record user activity and update streak."""
        db = get_firestore_client()
        doc_ref = db.collection('user_streaks').document(user_id)
        doc = doc_ref.get()
        now_utc = datetime.now(timezone.utc)
        timezone_name = self.DEFAULT_TIMEZONE
        if doc.exists:
            existing = doc.to_dict() or {}
            timezone_name = str(existing.get('timezone') or self.DEFAULT_TIMEZONE)
        today = self._today_in_timezone(timezone_name)
        today_str = today.isoformat()
        yesterday = today - timedelta(days=1)

        if doc.exists:
            data = doc.to_dict() or {}
            last_active = self._parse_last_active_date(data.get('last_active_date'))
            current_streak = data.get('current_streak', 0)
            longest_streak = data.get('longest_streak', 0)

            if last_active == today:
                # Already active today, no change
                return {
                    'current_streak': current_streak,
                    'longest_streak': longest_streak,
                    'last_active_date': today_str,
                    'created_today': True,
                    'streak_updated': False
                }
            elif last_active == yesterday:
                # Consecutive day — extend streak
                current_streak += 1
            else:
                # Streak broken — reset
                current_streak = 1
        else:
            # First activity ever
            current_streak = 1
            longest_streak = 0

        longest_streak = max(longest_streak, current_streak)

        doc_ref.set({
            'current_streak': current_streak,
            'longest_streak': longest_streak,
            'last_active_date': today_str,
            'last_active_at': now_utc.isoformat(),
            'timezone': timezone_name,
            'user_id': user_id
        })

        logger.info(f"Streak updated for user {user_id}: {current_streak} days (best: {longest_streak})")

        return {
            'current_streak': current_streak,
            'longest_streak': longest_streak,
            'last_active_date': today_str,
            'created_today': True,
            'streak_updated': True
        }
