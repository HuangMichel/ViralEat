from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class ConfigError(RuntimeError):
    """Required provider configuration is missing."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    openai_api_key: str = ""
    openai_model: str = ""
    # Empty = parameter not sent (for models without reasoning support).
    openai_reasoning_effort: Literal["", "low", "medium", "high"] = ""
    oriane_api_key: str = ""
    oriane_base_url: str = "https://connect.oriane.xyz"
    oriane_auth_header: str = ""
    oriane_auth_prefix: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]
    max_contents: int = 100
    extraction_concurrency: int = 4
    cache_dir: Path = ROOT / "cache"
    data_dir: Path = ROOT / "data"

    def missing(self) -> list[str]:
        required = {
            "OPENAI_API_KEY": self.openai_api_key,
            "OPENAI_MODEL": self.openai_model,
            "ORIANE_API_KEY": self.oriane_api_key,
            "ORIANE_AUTH_HEADER": self.oriane_auth_header,
        }
        return [name for name, value in required.items() if not value]

    def openai_options(self) -> dict[str, Any]:
        """Extra kwargs for responses.parse."""
        return {"reasoning": {"effort": self.openai_reasoning_effort}} if self.openai_reasoning_effort else {}

    def require(self) -> None:
        if missing := self.missing():
            raise ConfigError(f"Missing configuration: {', '.join(missing)}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
