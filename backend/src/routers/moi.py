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
    embedding: Optional[list[float]] = None


@router.post("/query/historical-performance", response_model=SQLQueryResponse)
async def query_historical_performance(request: QueryHistoricalPerformanceRequest) -> SQLQueryResponse:
    """
    查询潜在供应商历史表现
    支持向量查询优先，LIKE查询为退化方案
    从 xunyuan_agent.bidding_records_1 表中查询供应商历史表现数据
    """
    try:
        logger.info(f"收到历史表现查询请求: item_name='{request.item_name}', has_embedding={request.embedding is not None}")

        client = get_moi_client()

        # 优先使用向量查询
        if request.embedding:
            logger.info(f"检测到embedding字段，长度: {len(request.embedding)}，开始执行向量查询")
            try:
                vector_str = "[" + ",".join(map(str, request.embedding)) + "]"
                logger.debug(f"向量字符串: {vector_str[:100]}...")

                # 同时查询两个向量字段，取最好的结果
                vector_results = []

                # 查询项目名称向量
                try:
                    logger.info("开始执行项目名称向量查询")
                    project_sql = f"""
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
        ORDER BY l2_distance(`project_name_embedding`, '{vector_str}') ASC
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

                    project_result = await client.run_sql(project_sql)
                    logger.info(f"项目名称向量查询完成，结果行数: {len(project_result.get('rows', []))}")
                    if project_result.get("rows") and len(project_result["rows"]) > 0:
                        vector_results.append(("project", project_result))
                        logger.info(f"项目名称向量查询成功，添加到结果列表")
                    else:
                        logger.warning("项目名称向量查询返回空结果")
                except Exception as e:
                    logger.warning(f"项目名称向量查询失败: {e}")

                # 查询产品向量
                try:
                    logger.info("开始执行产品向量查询")
                    product_sql = f"""
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
        ORDER BY l2_distance(`product_embedding`, '{vector_str}') ASC
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

                    product_result = await client.run_sql(product_sql)
                    logger.info(f"产品向量查询完成，结果行数: {len(product_result.get('rows', []))}")
                    if product_result.get("rows") and len(product_result["rows"]) > 0:
                        vector_results.append(("product", product_result))
                        logger.info(f"产品向量查询成功，添加到结果列表")
                    else:
                        logger.warning("产品向量查询返回空结果")
                except Exception as e:
                    logger.warning(f"产品向量查询失败: {e}")

                # 如果有向量查询结果，选择最好的一个返回
                logger.info(f"向量查询统计: 成功查询数 {len(vector_results)}，详情: {[(name, len(result.get('rows', []))) for name, result in vector_results]}")

                if vector_results:
                    # 优先选择结果更多的查询
                    best_result = max(vector_results, key=lambda x: len(x[1]["rows"]))
                    logger.info(f"向量查询成功: 选择 {best_result[0]} 向量查询，返回 {len(best_result[1]['rows'])} 条结果")
                    return SQLQueryResponse(
                        columns=best_result[1].get("columns", []),
                        rows=best_result[1].get("rows", []),
                        error=best_result[1].get("error")
                    )

                logger.warning("所有向量查询均无结果，将退化到LIKE查询。可能原因: 1)向量数据不存在 2)相似度阈值过高 3)数据库中无匹配记录")
            except Exception as e:
                logger.error(f"向量查询整体失败，将退化到LIKE查询。异常信息: {str(e)}", exc_info=True)
                # 继续执行LIKE查询，不抛出异常

        # 向量查询无结果、失败或未提供向量，使用 LIKE 查询作为退化方案
        if not request.embedding:
            logger.info("未提供embedding参数，直接使用LIKE查询")
        else:
            logger.info("向量查询无结果或失败，开始执行LIKE查询作为退化方案")

        escaped_item = request.item_name.replace("'", "''")
        logger.debug(f"LIKE查询关键词: '{escaped_item}'")

        fallback_sql = f"""
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
    embedding: Optional[list[float]] = None


@router.post("/query/secondary-price", response_model=SQLQueryResponse)
async def query_secondary_price(request: QuerySecondaryPriceRequest) -> SQLQueryResponse:
    """
    查询二采产品价格库
    支持向量查询优先，LIKE查询为退化方案
    从 xunyuan_agent.product_price 表中查询价格数据
    """
    try:
        logger.info(f"收到二采价格查询请求: item_name='{request.item_name}', has_embedding={request.embedding is not None}")

        client = get_moi_client()

        # 优先使用向量查询
        if request.embedding:
            logger.info(f"检测到embedding字段，长度: {len(request.embedding)}，开始执行向量查询")
            try:
                vector_str = "[" + ",".join(map(str, request.embedding)) + "]"
                logger.debug(f"向量字符串: {vector_str[:100]}...")

                # 同时查询两个向量字段，取最好的结果
                vector_results = []

                # 查询项目名称向量
                try:
                    logger.info("开始执行项目名称向量查询 (二采价格)")
                    project_sql = f"""
SELECT
    `项目名称`,
    `物料短描述`,
    `物料单位`,
    `平均单价（元）`,
    `最高价（元）`,
    `最低价（元）`,
    l2_distance(`project_name_embedding`, '{vector_str}') AS similarity_score
FROM `xunyuan_agent`.`product_price`
ORDER BY similarity_score ASC
LIMIT 3;
                    """.strip()

                    project_result = await client.run_sql(project_sql)
                    logger.info(f"项目名称向量查询完成 (二采价格)，结果行数: {len(project_result.get('rows', []))}")
                    if project_result.get("rows") and len(project_result["rows"]) > 0:
                        vector_results.append(("project", project_result))
                        logger.info(f"项目名称向量查询成功 (二采价格)，添加到结果列表")
                    else:
                        logger.warning("项目名称向量查询返回空结果 (二采价格)")
                except Exception as e:
                    logger.warning(f"项目名称向量查询失败 (二采价格): {e}")

                # 查询产品向量（物料短描述）
                try:
                    logger.info("开始执行产品向量查询 (二采价格)")
                    product_sql = f"""
SELECT
    `项目名称`,
    `物料短描述`,
    `物料单位`,
    `平均单价（元）`,
    `最高价（元）`,
    `最低价（元）`,
    l2_distance(`product_embedding`, '{vector_str}') AS similarity_score
FROM `xunyuan_agent`.`product_price`
ORDER BY similarity_score ASC
LIMIT 3;
                    """.strip()

                    product_result = await client.run_sql(product_sql)
                    logger.info(f"产品向量查询完成 (二采价格)，结果行数: {len(product_result.get('rows', []))}")
                    if product_result.get("rows") and len(product_result["rows"]) > 0:
                        vector_results.append(("product", product_result))
                        logger.info(f"产品向量查询成功 (二采价格)，添加到结果列表")
                    else:
                        logger.warning("产品向量查询返回空结果 (二采价格)")
                except Exception as e:
                    logger.warning(f"产品向量查询失败 (二采价格): {e}")

                # 如果有向量查询结果，选择最好的一个返回
                logger.info(f"向量查询统计 (二采价格): 成功查询数 {len(vector_results)}，详情: {[(name, len(result.get('rows', []))) for name, result in vector_results]}")

                if vector_results:
                    # 优先选择结果更多的查询，如果结果数量相同，选择第一个
                    best_result = max(vector_results, key=lambda x: len(x[1]["rows"]))
                    logger.info(f"向量查询成功 (二采价格): 选择 {best_result[0]} 向量查询，返回 {len(best_result[1]['rows'])} 条结果")
                    return SQLQueryResponse(
                        columns=best_result[1].get("columns", []),
                        rows=best_result[1].get("rows", []),
                        error=best_result[1].get("error")
                    )

                logger.warning("所有向量查询均无结果 (二采价格)，将退化到LIKE查询。可能原因: 1)向量数据不存在 2)相似度阈值过高 3)数据库中无匹配记录")
            except Exception as e:
                logger.error(f"向量查询整体失败 (二采价格)，将退化到LIKE查询。异常信息: {str(e)}", exc_info=True)
                # 继续执行LIKE查询，不抛出异常

        # 向量查询无结果、失败或未提供向量，使用 LIKE 查询作为退化方案
        if not request.embedding:
            logger.info("未提供embedding参数 (二采价格)，直接使用LIKE查询")
        else:
            logger.info("向量查询无结果或失败 (二采价格)，开始执行LIKE查询作为退化方案")
        escaped_item = request.item_name.replace("'", "''")

        fallback_sql = f"""
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