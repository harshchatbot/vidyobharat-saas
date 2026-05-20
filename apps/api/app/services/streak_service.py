"""Creator streak tracking service using Firestore."""
from datetime import date, timedelta
import logging
from app.providers.firebase import get_firestore_client

logger = logging.getLogger(__name__)


class StreakService:
    """Manage user creator streaks in Firestore."""

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
        last_active = data.get('last_active_date')
        today = date.today().isoformat()
        created_today = last_active == today

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

        today = date.today()
        today_str = today.isoformat()
        yesterday_str = (today - timedelta(days=1)).isoformat()

        if doc.exists:
            data = doc.to_dict() or {}
            last_active = data.get('last_active_date')
            current_streak = data.get('current_streak', 0)
            longest_streak = data.get('longest_streak', 0)

            if last_active == today_str:
                # Already active today, no change
                return {
                    'current_streak': current_streak,
                    'longest_streak': longest_streak,
                    'last_active_date': today_str,
                    'created_today': True,
                    'streak_updated': False
                }
            elif last_active == yesterday_str:
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
