from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.firestore_utils import coerce_datetime, model_from_fields, utcnow
from app.models.entities import User
from app.providers.firebase import get_firestore_client


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('users')

    def create(self, email: str | None = None) -> User:
        user_id = self.collection.document().id
        display_name = None
        if email:
            local = email.split('@')[0] or 'User'
            display_name = ' '.join(part.capitalize() for part in local.replace('.', ' ').replace('_', ' ').replace('-', ' ').split()) or 'User'
        payload = {
            'id': user_id,
            'email': email,
            'display_name': display_name,
            'created_at': utcnow(),
        }
        self.collection.document(user_id).set(payload)
        return self._to_model(payload)

    def get(self, user_id: str) -> User | None:
        snapshot = self.collection.document(user_id).get()
        if not snapshot.exists:
            return None
        return self._to_model(snapshot.to_dict() or {})

    def get_many(self, user_ids: list[str]) -> dict[str, User]:
        unique_ids = [user_id for user_id in dict.fromkeys(user_ids) if user_id]
        if not unique_ids:
            return {}
        refs = [self.collection.document(user_id) for user_id in unique_ids]
        users: dict[str, User] = {}
        try:
            snapshots = self.firestore.get_all(refs)
        except Exception:
            snapshots = [ref.get() for ref in refs]
        for snapshot in snapshots:
            if not snapshot.exists:
                continue
            data = snapshot.to_dict() or {}
            data.setdefault('id', snapshot.id)
            try:
                user = self._to_model(data)
            except Exception:
                continue
            users[user.id] = user
        return users

    def get_by_email(self, email: str) -> User | None:
        rows = list(self.collection.where('email', '==', email).limit(1).stream())
        if not rows:
            return None
        return self._to_model(rows[0].to_dict() or {})

    def get_or_create_auth_user(
        self,
        *,
        user_id: str,
        email: str | None,
        display_name: str | None = None,
        avatar_url: str | None = None,
    ) -> User:
        doc_ref = self.collection.document(user_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            payload = {
                'id': user_id,
                'email': email,
                'display_name': display_name,
                'avatar_url': avatar_url,
                'created_at': utcnow(),
            }
            doc_ref.set(payload)
            return self._to_model(payload)

        data = snapshot.to_dict() or {}
        updates: dict[str, object] = {}
        if email and data.get('email') != email:
            updates['email'] = email
        if display_name and data.get('display_name') != display_name:
            updates['display_name'] = display_name
        if avatar_url and data.get('avatar_url') != avatar_url:
            updates['avatar_url'] = avatar_url
        if updates:
            doc_ref.set(updates, merge=True)
            data.update(updates)
        return self._to_model(data)

    def update(self, user: User, **fields) -> User:
        doc_ref = self.collection.document(user.id)
        doc_ref.set(fields, merge=True)
        data = {**user.__dict__, **fields}
        if '_sa_instance_state' in data:
            data.pop('_sa_instance_state', None)
        return self._to_model(data)

    def _to_model(self, data: dict) -> User:
        return model_from_fields(
            User,
            id=data.get('id'),
            display_name=data.get('display_name'),
            email=data.get('email'),
            phone=data.get('phone'),
            avatar_url=data.get('avatar_url'),
            bio=data.get('bio'),
            company=data.get('company'),
            address_line1=data.get('address_line1'),
            address_line2=data.get('address_line2'),
            city=data.get('city'),
            state=data.get('state'),
            country=data.get('country'),
            postal_code=data.get('postal_code'),
            timezone=data.get('timezone'),
            default_language=data.get('default_language'),
            default_voice=data.get('default_voice'),
            default_aspect_ratio=data.get('default_aspect_ratio'),
            email_notifications=bool(data.get('email_notifications', True)),
            marketing_emails=bool(data.get('marketing_emails', False)),
            auto_caption_default=bool(data.get('auto_caption_default', True)),
            music_ducking_default=bool(data.get('music_ducking_default', True)),
            created_at=coerce_datetime(data.get('created_at')),
        )
