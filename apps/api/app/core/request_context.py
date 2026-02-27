import contextvars

request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar('request_id', default='system')


def set_request_id(request_id: str) -> None:
    request_id_ctx.set(request_id)


def get_request_id() -> str:
    return request_id_ctx.get()
