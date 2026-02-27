from pydantic import BaseModel, Field


class MockLoginRequest(BaseModel):
    email: str | None = Field(default=None, max_length=255)


class MockLoginResponse(BaseModel):
    user_id: str


class MockSignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class MockSignupResponse(BaseModel):
    user_id: str
