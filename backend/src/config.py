from functools import lru_cache
import os

from pydantic import BaseModel


class Settings(BaseModel):
    """应用配置：数据库、通用大模型(LLM) 等。"""

    APP_NAME: str = "Source Comparison Agent Backend"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # MatrixOne 数据库配置：租户模式
    # 格式：mysql+asyncmy://account_name:admin_name:password@host:port/database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "mysql+asyncmy://test_account%3Aadmin:test123@sca-matrixone:6001/xunyuan_agent",
    )

    # 通用大模型配置（默认按 OpenAI 兼容接口命名，可指向 DeepSeek 等）
    LLM_API_KEY: str = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY", "")
    LLM_BASE_URL: str = os.getenv(
        "LLM_BASE_URL",
        os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    )
    LLM_DEFAULT_MODEL: str = os.getenv(
        "LLM_DEFAULT_MODEL",
        os.getenv("OPENAI_MODEL", "qwen-turbo"),
    )
    LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "4096"))
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.7"))
    LLM_STREAM: bool = os.getenv("LLM_STREAM", "true").lower() == "true"

    # 外部搜索
    WEB_SEARCH_API_URL: str = os.getenv(
        "WEB_SEARCH_API_URL", "https://api.bocha.cn/v1/web-search"
    )
    WEB_SEARCH_API_KEY: str = os.getenv("WEB_SEARCH_API_KEY", "")

    # MOI数据库配置（内部数据源）
    MOI_BASE_URL: str = os.getenv(
        "MOI_BASE_URL",
        "https://freetier-01.cn-hangzhou.cluster.matrixonecloud.cn"
    )
    MOI_API_KEY: str = os.getenv(
        "MOI_API_KEY",
        "aAVwjAZB4RG_JcPaFR0ZVR4r5yitSjHeKimpdSFKsDaBEt4QzZGZk35D2dEIBmXXbJKG7XHTsTzq-GyC"
    )


settings = Settings()

