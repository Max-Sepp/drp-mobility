from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    """Request body for POST /auth/signup and POST /auth/login."""

    username: str
    password: str


class UserPublic(BaseModel):
    """A user as exposed to clients — never includes the password hash."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str


class AuthResponse(BaseModel):
    """Returned by signup and login: the session token plus the authenticated user."""

    token: str
    user: UserPublic
