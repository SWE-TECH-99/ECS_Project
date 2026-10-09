import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

import boto3
from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import DateTime, String, create_engine, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
	pass


class Item(Base):
	__tablename__ = "items"

	id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
	title: Mapped[str] = mapped_column(String(80), nullable=False)
	description: Mapped[str] = mapped_column(String(180), nullable=False, default="")
	status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
	created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class ItemCreate(BaseModel):
	title: str = Field(min_length=1, max_length=80)
	description: str = Field(default="", max_length=180)

	@field_validator("title", mode="before")
	@classmethod
	def strip_title(cls, value: object) -> object:
		return value.strip() if isinstance(value, str) else value

	@field_validator("description", mode="before")
	@classmethod
	def strip_description(cls, value: object) -> object:
		return value.strip() if isinstance(value, str) else value


class ItemResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: str
	title: str
	description: str
	status: str
	created_at: datetime


def normalize_database_url(database_url: str) -> str:
	for prefix in ("postgres://", "postgresql://"):
		if database_url.startswith(prefix):
			return "postgresql+psycopg://" + database_url[len(prefix):]
	return database_url


def create_app(
	database_url: str | None = None,
	queue_url: str | None = None,
	sqs_client: object | None = None,
) -> FastAPI:
	database_url = normalize_database_url(database_url or os.getenv("DATABASE_URL", "sqlite:///./items.db"))
	queue_url = queue_url if queue_url is not None else os.getenv("SQS_QUEUE_URL")
	connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
	engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
	session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

	if queue_url and sqs_client is None:
		sqs_client = boto3.client("sqs", region_name=os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION"))

	@asynccontextmanager
	async def lifespan(_: FastAPI):
		Base.metadata.create_all(bind=engine)
		yield
		engine.dispose()

	api = FastAPI(title="ECS Platform API", version="1.0.0", lifespan=lifespan)
	api.state.session_factory = session_factory
	api.state.queue_url = queue_url
	api.state.sqs_client = sqs_client

	def get_db():
		with session_factory() as db:
			yield db

	DatabaseSession = Annotated[Session, Depends(get_db)]

	@api.get("/health", tags=["health"])
	def health(db: DatabaseSession) -> dict[str, str]:
		try:
			db.execute(select(1))
		except SQLAlchemyError as exc:
			raise HTTPException(status_code=503, detail="Database unavailable") from exc
		return {"status": "ok"}

	@api.get("/items", response_model=list[ItemResponse], tags=["items"])
	def list_items(db: DatabaseSession) -> list[Item]:
		return list(db.scalars(select(Item).order_by(Item.created_at.desc(), Item.id.desc())))

	@api.post("/items", response_model=ItemResponse, status_code=status.HTTP_201_CREATED, tags=["items"])
	def create_item(payload: ItemCreate, db: DatabaseSession) -> Item:
		item = Item(title=payload.title, description=payload.description)
		db.add(item)
		db.commit()
		db.refresh(item)

		if api.state.queue_url:
			try:
				api.state.sqs_client.send_message(
					QueueUrl=api.state.queue_url,
					MessageBody=json.dumps(
						{
							"item_id": item.id,
							"title": item.title,
							"description": item.description,
							"created_at": item.created_at.isoformat(),
						}
					),
				)
			except Exception as exc:
				logger.exception("Could not dispatch item %s to SQS", item.id)
				item.status = "failed"
				db.commit()
				raise HTTPException(status_code=503, detail="Item saved but queue dispatch failed") from exc

		return item

	return api


app = create_app()
