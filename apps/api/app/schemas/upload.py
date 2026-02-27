from pydantic import BaseModel, Field


class UploadSignRequest(BaseModel):
    user_id: str = Field(min_length=2, max_length=64)
    project_id: str | None = Field(default=None, max_length=64)
    filename: str = Field(min_length=1, max_length=120)
    kind: str = Field(default='brand_asset', max_length=40)


class UploadSignResponse(BaseModel):
    asset_id: str
    upload_url: str
    public_url: str
    method: str = 'PUT'


class UploadDeleteResponse(BaseModel):
    asset_id: str
    deleted: bool
