"""
MatrixOne数据库客户端服务
用于查询内部数据源（采购项目、供应商、价格等）
直接连接本地MatrixOne数据库执行SQL查询
"""

import logging
from typing import Dict, Any, Optional, List
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


class MatrixOneClient:
    """MatrixOne数据库直接连接客户端"""

    def __init__(self):
        self.database_url = settings.DATABASE_URL
        logger.info(f"MatrixOne客户端初始化，数据库URL: {self.database_url}")

    async def run_sql(self, statement: str) -> Dict[str, Any]:
        """
        直接执行SQL查询到MatrixOne数据库

        Args:
            statement: SQL语句

        Returns:
            查询结果，包含columns和rows
        """
        logger.info(f"执行SQL查询: {statement[:500]}{'...' if len(statement) > 500 else ''}")

        try:
            async with AsyncSessionLocal() as session:
                # 执行SQL查询
                result = await session.execute(text(statement))

                # 获取列名
                if result.returns_rows:
                    columns = list(result.keys())
                    raw_rows = result.fetchall()

                    # 将行转换为字典列表
                    rows = []
                    for row in raw_rows:
                        row_dict = {}
                        for idx, col in enumerate(columns):
                            row_dict[col] = row[idx]
                        rows.append(row_dict)

                    logger.info(f"SQL查询成功，返回 {len(rows)} 行数据，列: {columns}")
                    return {
                        "columns": columns,
                        "rows": rows
                    }
                else:
                    # 非查询语句（如INSERT、UPDATE、DELETE）
                    await session.commit()
                    logger.info("SQL执行成功（非查询语句）")
                    return {
                        "columns": [],
                        "rows": [],
                        "affected_rows": result.rowcount
                    }

        except Exception as e:
            error_msg = f"SQL执行错误: {str(e)}"
            logger.exception(error_msg)
            return {
                "error": error_msg,
                "columns": [],
                "rows": []
            }


# 全局客户端实例
_matrixone_client: Optional[MatrixOneClient] = None


def get_matrixone_client() -> MatrixOneClient:
    """获取MatrixOne客户端实例（单例模式）"""
    global _matrixone_client
    if _matrixone_client is None:
        _matrixone_client = MatrixOneClient()
    return _matrixone_client

