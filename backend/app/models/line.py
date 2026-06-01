from sqlalchemy import Column, ForeignKey, Table
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Many-to-many link between platforms and the lines that serve them. A platform serves
# one or more lines; a line serves many platforms.
platform_lines = Table(
    "platform_lines",
    Base.metadata,
    Column("platform_id", ForeignKey("platforms.id"), primary_key=True),
    Column("line_id", ForeignKey("lines.id"), primary_key=True),
)


class Line(Base):
    """A transit line (e.g. "District", "DLR", "National Rail") that platforms reference."""

    __tablename__ = "lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
