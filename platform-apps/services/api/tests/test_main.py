import json
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from src.main import create_app, normalize_database_url


@pytest.fixture
def api_app(tmp_path):
    sqs_client = Mock()
    app = create_app(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        queue_url="https://sqs.example.test/jobs",
        sqs_client=sqs_client,
    )
    app.state.test_sqs_client = sqs_client
    return app


@pytest.fixture
def client(api_app):
    with TestClient(api_app) as test_client:
        yield test_client


def test_health_checks_database(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("prefix", ["postgres://", "postgresql://"])
def test_postgres_url_uses_psycopg_driver(prefix):
    url = normalize_database_url(f"{prefix}user:password@localhost:5432/platform")

    assert url == "postgresql+psycopg://user:password@localhost:5432/platform"


def test_create_item_persists_and_dispatches_to_sqs(client, api_app):
    response = client.post("/items", json={"title": "Rebuild index", "description": "catalog"})

    assert response.status_code == 201
    created = response.json()
    assert created["title"] == "Rebuild index"
    assert created["description"] == "catalog"
    assert created["status"] == "queued"
    assert created["id"]

    queued_message = api_app.state.test_sqs_client.send_message.call_args.kwargs
    assert queued_message["QueueUrl"] == "https://sqs.example.test/jobs"
    assert json.loads(queued_message["MessageBody"])["item_id"] == created["id"]

    listed = client.get("/items")
    assert [item["id"] for item in listed.json()] == [created["id"]]


def test_create_item_trims_title_and_defaults_description(client):
    response = client.post("/items", json={"title": "  Rebuild index  "})

    assert response.status_code == 201
    assert response.json()["title"] == "Rebuild index"
    assert response.json()["description"] == ""


@pytest.mark.parametrize("payload", [{"title": "   "}, {"title": ""}, {"title": "x" * 81}])
def test_create_item_rejects_invalid_title(client, api_app, payload):
    response = client.post("/items", json=payload)

    assert response.status_code == 422
    api_app.state.test_sqs_client.send_message.assert_not_called()


def test_queue_failure_marks_item_failed_and_returns_service_unavailable(client, api_app):
    api_app.state.test_sqs_client.send_message.side_effect = RuntimeError("SQS unavailable")

    response = client.post("/items", json={"title": "Rebuild index"})

    assert response.status_code == 503
    assert client.get("/items").json()[0]["status"] == "failed"