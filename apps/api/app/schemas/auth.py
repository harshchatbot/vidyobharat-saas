from pydantic import BaseModel, Field


class MockLoginRequest(BaseModel):
    email: str | None = Field(default=None, max_length=255)


class MockLoginResponse(BaseModel):
    user_id: str
