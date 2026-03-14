import json
import logging
from datetime import datetime, timezone

from app.core.request_context import get_request_id

_STANDARD_LOG_RECORD_FIELDS = {
    'name', 'msg', 'args', 'levelname', 'levelno', 'pathname', 'filename', 'module',
    'exc_info', 'exc_text', 'stack_info', 'lineno', 'funcName', 'created', 'msecs',
    'relativeCreated', 'thread', 'threadName', 'processName', 'process', 'message',
    'asctime',
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'request_id': getattr(record, 'request_id', None) or get_request_id(),
            'render_id': getattr(record, 'render_id', None),
        }
        for key, value in record.__dict__.items():
            if key in _STANDARD_LOG_RECORD_FIELDS:
                continue
            if key in payload:
                continue
            payload[key] = value
        if record.exc_info:
            payload['exception'] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging(level: str = 'INFO') -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(level.upper())
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root_logger.handlers = [handler]
