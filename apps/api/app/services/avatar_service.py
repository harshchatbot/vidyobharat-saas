from app.schemas.catalog import AvatarResponse


class AvatarService:
    def __init__(self) -> None:
        self._avatars = [
            AvatarResponse(
                id='av-priya',
                name='Priya',
                scope='public',
                style='studio',
                language_tags=['hi-IN', 'en-IN'],
                thumbnail_url='https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
            ),
            AvatarResponse(
                id='av-arjun',
                name='Arjun',
                scope='public',
                style='corporate',
                language_tags=['hi-IN', 'ta-IN', 'en-IN'],
                thumbnail_url='https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
            ),
            AvatarResponse(
                id='av-ananya',
                name='Ananya',
                scope='own',
                style='creator',
                language_tags=['bn-IN', 'hi-IN'],
                thumbnail_url='https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80',
            ),
            AvatarResponse(
                id='av-ravi',
                name='Ravi',
                scope='own',
                style='presenter',
                language_tags=['mr-IN', 'hi-IN', 'en-IN'],
                thumbnail_url='https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
            ),
        ]

    def list_avatars(self, search: str | None = None, scope: str | None = None, language: str | None = None) -> list[AvatarResponse]:
        result = self._avatars

        if scope:
            normalized_scope = scope.strip().lower()
            result = [item for item in result if item.scope.lower() == normalized_scope]

        if language:
            normalized_language = language.strip().lower()
            result = [
                item
                for item in result
                if any(tag.lower() == normalized_language for tag in item.language_tags)
            ]

        if search:
            keyword = search.strip().lower()
            result = [
                item
                for item in result
                if keyword in item.name.lower() or keyword in item.style.lower()
            ]

        return result
