"""
MOI数据库路由
提供内部数据源查询接口
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.matrixone_client import get_matrixone_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/moi")


class SQLQueryRequest(BaseModel):
    """SQL查询请求"""
    statement: str


class SQLQueryResponse(BaseModel):
    """SQL查询响应"""
    columns: list[str] = []
    rows: list[Dict[str, Any]] = []
    error: Optional[str] = None


@router.post("/run_sql", response_model=SQLQueryResponse)
async def run_sql(request: SQLQueryRequest) -> SQLQueryResponse:
    """
    执行SQL查询
    
    前端传入SQL语句，后端调用MOI API执行并返回结果
    """
    try:
        client = get_matrixone_client()
        result = await client.run_sql(request.statement)
        
        return SQLQueryResponse(
            columns=result.get("columns", []),
            rows=result.get("rows", []),
            error=result.get("error")
        )
    except Exception as e:
        logger.exception(f"执行SQL查询失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


class QueryProcurementProjectsRequest(BaseModel):
    """查询采购项目请求"""
    item_name: str


@router.post("/query/procurement-projects", response_model=SQLQueryResponse)
async def query_procurement_projects(request: QueryProcurementProjectsRequest) -> SQLQueryResponse:
    """
    查询采购项目数据
    从 xunyuan_agent.bidding_records_1 表中查询采购项目信息
    """
    try:
        escaped_item = request.item_name.replace("'", "''")
        
        sql = f"""
SELECT
  `项目名称`,
  `单位` AS `采购单位`,
  `细化产品`,
  `供应商名称`,
  `中标金额_万元` AS `中标金额（万元）`,
  `参与状态`
FROM `xunyuan_agent`.`bidding_records_1`
WHERE `项目名称` LIKE '%{escaped_item}%'
   OR `细化产品` LIKE '%{escaped_item}%'
ORDER BY `项目名称` DESC, `中标金额_万元` DESC
LIMIT 20;
        """.strip()
        
        client = get_matrixone_client()
        result = await client.run_sql(sql)
        
        return SQLQueryResponse(
            columns=result.get("columns", []),
            rows=result.get("rows", []),
            error=result.get("error")
        )
    except Exception as e:
        logger.exception(f"查询采购项目失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


class QueryHistoricalPerformanceRequest(BaseModel):
    """查询历史表现请求"""
    item_name: str


@router.post("/query/historical-performance", response_model=SQLQueryResponse)
async def query_historical_performance(request: QueryHistoricalPerformanceRequest) -> SQLQueryResponse:
    """
    查询潜在供应商历史表现
    从 xunyuan_agent.bidding_records_1 表中查询供应商历史表现数据
    """
    try:
        escaped_item = request.item_name.replace("'", "''")
        
        sql = f"""
SELECT
    t.`供应商名称`,
    COUNT(*) AS `投标次数`,
    SUM(CASE WHEN t.`参与状态` = '中标' THEN 1 ELSE 0 END) AS `中标次数`,
    ROUND(SUM(CASE WHEN t.`参与状态` = '中标' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS `中标率(%)`,
    SUM(CAST(REPLACE(t.`中标金额_万元`, ',', '') AS DECIMAL(15,2))) AS `合计中标金额（万元）`
FROM
    (
        SELECT
            `供应商名称`,
            `参与状态`,
            `中标金额_万元`
        FROM
            `xunyuan_agent`.`bidding_records_1`
        WHERE
            `项目名称` LIKE '%{escaped_item}%'
            OR `细化产品` LIKE '%{escaped_item}%'
        LIMIT 50
    ) AS t
WHERE t.`参与状态` = '中标'
GROUP BY
    t.`供应商名称`
ORDER BY
    `中标次数` DESC,
    `合计中标金额（万元）` DESC
LIMIT 10;
        """.strip()
        
        client = get_matrixone_client()
        result = await client.run_sql(sql)
        
        return SQLQueryResponse(
            columns=result.get("columns", []),
            rows=result.get("rows", []),
            error=result.get("error")
        )
    except Exception as e:
        logger.exception(f"查询历史表现失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


class QuerySecondaryPriceRequest(BaseModel):
    """查询二采价格请求"""
    item_name: str


@router.post("/query/secondary-price", response_model=SQLQueryResponse)
async def query_secondary_price(request: QuerySecondaryPriceRequest) -> SQLQueryResponse:
    """
    查询二采产品价格库
    从 xunyuan_agent.product_price 表中查询价格数据（使用LIKE查询）
    """
    try:
        escaped_item = request.item_name.replace("'", "''")
        
        sql = f"""
SELECT
  `项目名称`,
  `物料短描述`,
  `物料单位`,
  `平均单价（元）`,
  `最高价（元）`,
  `最低价（元）`
FROM `xunyuan_agent`.`product_price`
WHERE `物料短描述` LIKE '%{escaped_item}%'
   OR `项目名称` LIKE '%{escaped_item}%'
LIMIT 10;
        """.strip()
        
        client = get_matrixone_client()
        result = await client.run_sql(sql)
        
        return SQLQueryResponse(
            columns=result.get("columns", []),
            rows=result.get("rows", []),
            error=result.get("error")
        )
    except Exception as e:
        logger.exception(f"查询二采价格失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")

