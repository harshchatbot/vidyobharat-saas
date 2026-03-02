from collections.abc import Generator
from typing import Any


def get_db() -> Generator[Any, None, None]:
    # Firestore is now the primary persistence layer. Keep this dependency as a
    # compatibility shim so existing route signatures do not need a simultaneous rewrite.
    yield None
