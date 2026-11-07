import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, SecretStr

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    app_env: str = "development"
    oriane_key: SecretStr = SecretStr("")
    oriane_header: str = ""
    oriane_scheme: str = ""
    openai_key: SecretStr = SecretStr("")
    model: str = "gpt-6-astra"
    reasoning_effort: str = "high"
    local_token: SecretStr = SecretStr("")
    database: Path = ROOT / ".local" / "analysis.sqlite3"
    cache_seconds: int = Field(default=3600, ge=0, le=86400)
    request_limit: int = Field(default=10, ge=1, le=100)
    llm_token_limit: int = Field(default=300000, ge=1000, le=1000000)
    llm_output_limit: int = Field(default=4096, ge=256, le=16384)
    content_text_bytes: int = Field(default=12000, ge=1000, le=32000)
    oriane_timeout: int = Field(default=30, ge=1, le=120)
    llm_timeout: int = Field(default=60, ge=1, le=300)
    retention_days: int = Field(default=30, ge=1, le=365)

    @classmethod
    def load(cls) -> "Settings":
        load_dotenv(ROOT / ".env", override=False)
        names = {
            "app_env": "APP_ENV",
            "oriane_key": "ORIANE_API_KEY",
            "oriane_header": "ORIANE_AUTH_HEADER",
            "oriane_scheme": "ORIANE_AUTH_SCHEME",
            "openai_key": "OPENAI_API_KEY",
            "model": "OPENAI_MODEL",
            "reasoning_effort": "LLM_REASONING_EFFORT",
            "local_token": "LOCAL_API_TOKEN",
            "database": "LOCAL_DATABASE_PATH",
            "cache_seconds": "ORIANE_CACHE_TTL_SECONDS",
            "request_limit": "ORIANE_MAX_REQUESTS_PER_ANALYSIS",
            "llm_token_limit": "USAGE_MAX_LLM_TOKENS_PER_ANALYSIS",
            "llm_output_limit": "LLM_MAX_OUTPUT_TOKENS",
            "content_text_bytes": "LLM_MAX_TEXT_BYTES_PER_CONTENT",
            "oriane_timeout": "ORIANE_REQUEST_TIMEOUT_SECONDS",
            "llm_timeout": "LLM_REQUEST_TIMEOUT_SECONDS",
            "retention_days": "RAW_CONTENT_RETENTION_DAYS",
        }
        values = {
            field: os.environ[name]
            for field, name in names.items()
            if os.environ.get(name)
        }
        settings = cls.model_validate(values)
        if settings.app_env != "development":
            raise ValueError(
                "This runner is local-only; hosted tenant isolation is not implemented"
            )
        if settings.reasoning_effort not in {"low", "medium", "high"}:
            raise ValueError("Unsupported reasoning effort")
        return settings

    def require_providers(self, include_llm: bool = True) -> None:
        if not self.oriane_key.get_secret_value() or not self.oriane_header:
            raise ValueError(
                "Configure Oriane credentials and its confirmed authentication header"
            )
        if self.oriane_header.lower() not in {"authorization", "x-api-key"}:
            raise ValueError("Unsupported Oriane authentication header")
        if include_llm and (not self.openai_key.get_secret_value() or not self.model):
            raise ValueError(
                "Configure OpenAI credentials and an accessible structured-output model"
            )
