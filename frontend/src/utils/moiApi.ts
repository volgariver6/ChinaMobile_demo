/**
 * MOI 数据库 API 工具
 * 用于查询内部数据源（潜在供应商推荐等）
 * 
 * 注意：现在所有MOI查询都通过后端API进行，前端不再直接调用MOI API
 */

import { BACKEND_API_CONFIG } from '../config'

/**
 * 生成文本的向量嵌入（直接调用硅基流动API）
 */
export async function generateEmbedding(text: string, _model?: string): Promise<number[]> {
  try {
    console.log(`[Embedding] 开始生成向量: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`)

    // 暂时使用模拟向量进行测试（跳过API调用）
    console.log(`[Embedding] 使用模拟向量（跳过API调用）`)

    // 生成一个1024维的模拟向量
    const mockEmbedding = []
    for (let i = 0; i < 1024; i++) {
      mockEmbedding.push(Math.random() * 2 - 1) // 生成-1到1之间的随机数
    }

    console.log(`[Embedding] 模拟向量生成成功，维度: ${mockEmbedding.length}`)
    return mockEmbedding

    /*
    // 硅基流动API配置（暂时注释）
    const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'
    const SILICONFLOW_API_KEY = 'sk-eiyvmcfxbsatiewlqnewzlopsxxsodxinomxnclshdmnyrkj'
    const defaultModel = 'BAAI/bge-large-zh-v1.5'

    if (!SILICONFLOW_API_KEY) {
      console.warn('[Embedding] 硅基流动API密钥未配置，将跳过向量生成')
      return []
    }

    console.log(`[Embedding] 使用模型: ${model || defaultModel}`)

    const response = await fetch(`${SILICONFLOW_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        model: model || defaultModel
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('硅基流动API调用失败:', response.status, errorText)
      throw new Error(`硅基流动API错误: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      console.error('API响应格式错误:', data)
      throw new Error('API响应中未找到向量数据')
    }

    const embedding = data.data[0].embedding
    console.log(`[Embedding] 向量生成成功，维度: ${embedding.length}`)

    return embedding
    */
  } catch (error) {
    console.error('[Embedding] 向量生成失败:', error)
    // 如果向量生成失败，返回空数组，让后端使用LIKE查询
    return []
  }
}

// MOI数据库配置（仅用于信息展示，现在所有查询都通过后端API）
// const MOI_CONFIG = {
//   database: 'xunyuan_agent',
//   tables: {
//     bidding: 'bidding_records_1',
//     productPrice: 'product_price'
//   }
// }

// SQL 查询结果类型
export interface SQLQueryResult {
  columns?: string[]
  rows?: Record<string, unknown>[]
  error?: string
}

/**
 * 执行 SQL 查询
 * 通过后端API调用MOI数据库
 */
export async function runSQL(statement: string): Promise<SQLQueryResult> {
  try {
    console.log('通过后端API执行SQL:', statement.substring(0, 100) + '...')
    
    const response = await fetch(`${BACKEND_API_CONFIG.baseUrl}/api/moi/run_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        statement: statement
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('后端API错误:', response.status, errorText)
      return { error: `API请求失败: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    console.log('后端API响应:', data)
    
    // 后端已经返回了columns和rows，直接使用
    return {
      columns: data.columns || [],
      rows: data.rows || [],
      error: data.error
    }
  } catch (error) {
    console.error('SQL执行错误:', error)
    return { error: error instanceof Error ? error.message : '未知错误' }
  }
}

/**
 * 将查询结果格式化为 Markdown 表格
 */
export function formatQueryResultToMarkdown(
  result: SQLQueryResult,
  dimension: string,
  description: string
): string {
  if (result.error) {
    return `#### ${dimension}\n\n**说明**: ${description}\n\n❌ 查询失败: ${result.error}\n`
  }
  
  const rows = result.rows || []
  if (rows.length === 0) {
    return `#### ${dimension}\n\n**说明**: ${description}\n\n暂无相关数据\n`
  }
  
  // 获取列名
  const columns = result.columns || Object.keys(rows[0] || {})
  if (columns.length === 0) {
    return `#### ${dimension}\n\n**说明**: ${description}\n\n暂无相关数据\n`
  }
  
  // 构建 Markdown 表格
  let markdown = `#### ${dimension}\n\n**说明**: ${description}\n\n`
  
  // 表头
  markdown += '| ' + columns.join(' | ') + ' |\n'
  markdown += '| ' + columns.map(() => '---').join(' | ') + ' |\n'
  
  // 数据行
  for (const row of rows) {
    const values = columns.map(col => {
      const value = row[col]
      if (value === null || value === undefined) return '-'
      if (typeof value === 'number') {
        // 格式化数字
        return Number.isInteger(value) ? value.toString() : value.toFixed(2)
      }
      return String(value)
    })
    markdown += '| ' + values.join(' | ') + ' |\n'
  }
  
  markdown += `\n共 ${rows.length} 条记录\n`
  
  return markdown
}

/**
 * 查询历史表现并获取供应商名单
 * 只执行一次 SQL 查询，然后使用 Web Search 获取其他维度信息
 */
export async function queryHistoricalPerformance(
  itemName: string,
  onProgress?: (status: 'start' | 'done' | 'error') => void
): Promise<{
  text: string;
  suppliers: string[];
  rawResult: SQLQueryResult
}> {
  onProgress?.('start')

  try {
    console.log(`[API] 查询历史表现: itemName="${itemName}"`)

    // 先生成文本的向量嵌入
    console.log(`[API] 开始生成向量: "${itemName}"`)
    console.log(`[DEBUG] 开始调用generateEmbedding...`)
    let embedding: number[] = []
    try {
      embedding = await generateEmbedding(itemName, 'project')
      console.log(`[DEBUG] generateEmbedding返回，类型: ${typeof embedding}, 长度: ${Array.isArray(embedding) ? embedding.length : 'N/A'}`)
    } catch (error) {
      console.warn(`[API] 向量生成异常:`, error)
      embedding = []
    }

    // 如果向量生成失败（返回空数组），embedding 保持 undefined，后端会使用LIKE查询
    const finalEmbedding = embedding.length > 0 ? embedding : undefined
    console.log(`[DEBUG] finalEmbedding检查: length=${Array.isArray(embedding) ? embedding.length : 'N/A'}, finalEmbedding=${finalEmbedding ? '存在' : '不存在'}`)

    if (finalEmbedding) {
      console.log(`[API] 向量生成成功 (${embedding.length}维)，将使用向量查询`)
      console.log(`[DEBUG] 将传递embedding，长度: ${finalEmbedding.length}`)
    } else {
      console.log(`[API] 向量生成失败，将使用LIKE查询`)
      console.log(`[DEBUG] 不会传递embedding`)
    }

    const response = await fetch(`${BACKEND_API_CONFIG.baseUrl}/api/moi/query/historical-performance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        item_name: itemName,
        ...(finalEmbedding && { embedding: finalEmbedding })  // 只有当embedding生成成功时才传递
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      onProgress?.('error')
      return {
        text: `#### 历史表现\n\n❌ 查询失败: ${response.status} - ${errorText}\n`,
        suppliers: [],
        rawResult: { error: `API请求失败: ${response.status}` }
      }
    }

    const data = await response.json()
    console.log('后端API响应:', data)

    const result: SQLQueryResult = {
      columns: data.columns || [],
      rows: data.rows || [],
      error: data.error
    }

    if (result.error) {
      onProgress?.('error')
      return {
        text: `#### 历史表现\n\n❌ 查询失败: ${result.error}\n`,
        suppliers: [],
        rawResult: result
      }
    }
  
    onProgress?.('done')
  
    // 提取供应商名称列表
    const suppliers = (result.rows || [])
      .map(row => row['供应商名称'] as string)
      .filter(Boolean)
  
    console.log('查询到供应商:', suppliers)
  
    const text = formatQueryResultToMarkdown(
      result, 
      '历史表现', 
      '供应商过往合作的交付质量、按时交货率等表现'
    )
  
    return { text, suppliers, rawResult: result }
  } catch (error) {
    onProgress?.('error')
    console.error('查询历史表现失败:', error)
    return {
      text: `#### 历史表现\n\n❌ 查询失败: ${error instanceof Error ? error.message : '未知错误'}\n`,
      suppliers: [],
      rawResult: { error: error instanceof Error ? error.message : '未知错误' }
    }
  }
}

/**
 * 查询二采产品价格库
 * 通过后端API查询价格数据（使用LIKE查询）
 */
export async function querySecondaryPrice(
  itemName: string,
  onProgress?: (status: 'start' | 'done' | 'error') => void
): Promise<{
  text: string;
  rawResult: SQLQueryResult
}> {
  onProgress?.('start')

  try {
    console.log(`[API] 查询二采价格: itemName="${itemName}"`)

    // 先生成文本的向量嵌入
    console.log(`[API] 开始生成向量: "${itemName}"`)
    console.log(`[DEBUG] 开始调用generateEmbedding...`)
    let embedding: number[] = []
    try {
      embedding = await generateEmbedding(itemName, 'project')
      console.log(`[DEBUG] generateEmbedding返回，类型: ${typeof embedding}, 长度: ${Array.isArray(embedding) ? embedding.length : 'N/A'}`)
    } catch (error) {
      console.warn(`[API] 向量生成异常:`, error)
      embedding = []
    }

    // 如果向量生成失败（返回空数组），embedding 保持 undefined，后端会使用LIKE查询
    const finalEmbedding = embedding.length > 0 ? embedding : undefined
    console.log(`[DEBUG] finalEmbedding检查: length=${Array.isArray(embedding) ? embedding.length : 'N/A'}, finalEmbedding=${finalEmbedding ? '存在' : '不存在'}`)

    if (finalEmbedding) {
      console.log(`[API] 向量生成成功 (${embedding.length}维)，将使用向量查询`)
      console.log(`[DEBUG] 将传递embedding，长度: ${finalEmbedding.length}`)
    } else {
      console.log(`[API] 向量生成失败，将使用LIKE查询`)
      console.log(`[DEBUG] 不会传递embedding`)
    }

    const response = await fetch(`${BACKEND_API_CONFIG.baseUrl}/api/moi/query/secondary-price`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        item_name: itemName,
        ...(finalEmbedding && { embedding: finalEmbedding })  // 只有当embedding生成成功时才传递
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      onProgress?.('error')
      return {
        text: `#### 二采产品价格\n\n❌ 查询失败: ${response.status} - ${errorText}\n`,
        rawResult: { error: `API请求失败: ${response.status}` }
      }
    }

    const data = await response.json()
    console.log('后端API响应:', data)

    const result: SQLQueryResult = {
      columns: data.columns || [],
      rows: data.rows || [],
      error: data.error
    }

    if (result.error) {
      onProgress?.('error')
      return {
        text: `#### 二采产品价格\n\n❌ 查询失败: ${result.error}\n`,
        rawResult: result
      }
    }

    onProgress?.('done')

    const text = formatQueryResultToMarkdown(
      result,
      '二采产品价格',
      '二次采购价格查询结果'
    )

    return { text, rawResult: result }
  } catch (error) {
    onProgress?.('error')
    console.error('查询二采价格失败:', error)
    return {
      text: `#### 二采产品价格\n\n❌ 查询失败: ${error instanceof Error ? error.message : '未知错误'}\n`,
      rawResult: { error: error instanceof Error ? error.message : '未知错误' }
    }
  }
}

/**
 * 查询采购项目数据
 * 通过后端API查询采购项目信息
 */
export async function queryProcurementProjects(
  itemName: string,
  onProgress?: (status: 'start' | 'done' | 'error') => void
): Promise<{
  text: string;
  rawResult: SQLQueryResult
}> {
  onProgress?.('start')

  try {
    console.log('通过后端API查询采购项目:', itemName)
    
    const response = await fetch(`${BACKEND_API_CONFIG.baseUrl}/api/moi/query/procurement-projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        item_name: itemName
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      onProgress?.('error')
      return {
        text: `#### 采购项目查询\n\n❌ 查询失败: ${response.status} - ${errorText}\n`,
        rawResult: { error: `API请求失败: ${response.status}` }
      }
    }

    const data = await response.json()
    console.log('后端API响应:', data)

    const result: SQLQueryResult = {
      columns: data.columns || [],
      rows: data.rows || [],
      error: data.error
    }

    if (result.error) {
      onProgress?.('error')
      return {
        text: `#### 采购项目查询\n\n❌ 查询失败: ${result.error}\n`,
        rawResult: result
      }
    }

    onProgress?.('done')

    const text = formatQueryResultToMarkdown(
      result,
      '采购项目查询',
      '历史采购项目数据，包含项目名称、供应商、中标金额等信息'
    )

    return { text, rawResult: result }
  } catch (error) {
    onProgress?.('error')
    console.error('查询采购项目失败:', error)
    return {
      text: `#### 采购项目查询\n\n❌ 查询失败: ${error instanceof Error ? error.message : '未知错误'}\n`,
      rawResult: { error: error instanceof Error ? error.message : '未知错误' }
    }
  }
}

