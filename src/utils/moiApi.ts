/**
 * MOI 数据库 API 工具
 * 用于查询内部数据源（潜在供应商推荐等）
 */

// MOI API 配置
// 开发环境使用 Vite 代理（代理层会自动注入 API Key）
// 生产环境需要配置后端代理
const isDev = import.meta.env.DEV

const MOI_CONFIG = {
  // 开发环境通过 Vite 代理 (/moi-api)
  baseUrl: isDev ? '/moi-api' : 'https://freetier-01.cn-hangzhou.cluster.cn-dev.matrixone.tech',
  // API Key 仅在生产环境直接请求时使用（开发环境由代理注入）
  apiKey: 'izzk2HYoLc1XhoXPkOP4iL5H6ZBvgnCCvFDifnglwKRSmVYj-QD8KeLQ9Chpq9baAtJjW9WCJimFtF-c'
}

// SQL 查询结果类型
export interface SQLQueryResult {
  columns?: string[]
  rows?: Record<string, unknown>[]
  error?: string
}

/**
 * 执行 SQL 查询
 */
export async function runSQL(statement: string): Promise<SQLQueryResult> {
  try {
    console.log('MOI API 请求:', MOI_CONFIG.baseUrl + '/catalog/nl2sql/run_sql')
    
    // 构建请求头
    // 开发环境：不发送 moi-key（由 Vite 代理注入），避免 CORS 预检请求
    // 生产环境：需要发送 moi-key
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    
    // 仅在生产环境添加 API Key header
    if (!isDev) {
      headers['moi-key'] = MOI_CONFIG.apiKey
    }
    
    const response = await fetch(`${MOI_CONFIG.baseUrl}/catalog/nl2sql/run_sql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operation: 'run_sql',
        statement: statement
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('MOI API 错误:', response.status, errorText)
      return { error: `API 请求失败: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    console.log('MOI API 响应:', data)
    
    // 解析 API 响应
    if (data.code && data.code !== 'OK') {
      return { error: data.msg || '查询失败' }
    }

    // 解析结果 - 数据在 data.results[0] 里
    const results = data.data?.results?.[0]
    if (!results) {
      return { columns: [], rows: [] }
    }
    
    const columns = results.columns || []
    const rawRows = results.rows || []
    
    // 将二维数组转换为对象数组
    // rows: [["value1", "value2"], ...] => [{col1: "value1", col2: "value2"}, ...]
    const rows = rawRows.map((row: unknown[]) => {
      const obj: Record<string, unknown> = {}
      columns.forEach((col: string, index: number) => {
        obj[col] = row[index]
      })
      return obj
    })

    console.log('解析后的数据:', { columns, rows })
    
    return { columns, rows }
  } catch (error) {
    console.error('MOI SQL 执行错误:', error)
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
  
  const escapedItem = itemName.replace(/'/g, "''")
  
  const sql = `
SELECT 
    \`供应商名称\`, 
    COUNT(*) AS \`投标次数\`,
    SUM(CASE WHEN \`参与状态\` = '中标' THEN 1 ELSE 0 END) AS \`中标次数\`,
    ROUND(SUM(CASE WHEN \`参与状态\` = '中标' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS \`中标率(%)\`,
    SUM(CAST(REPLACE(\`中标金额（万元）\`, ',', '') AS DECIMAL(15,2))) AS \`合计中标金额（万元）\`
FROM \`原始数据\`.\`2\`
WHERE (\`项目名称\` LIKE '%${escapedItem}%' OR \`细化产品\` LIKE '%${escapedItem}%')
GROUP BY \`供应商名称\`
ORDER BY \`中标次数\` DESC, \`合计中标金额（万元）\` DESC
LIMIT 10;
  `.trim()
  
  console.log('查询历史表现:', sql)
  
  const result = await runSQL(sql)
  
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
}

/**
 * 查询二采产品价格库
 * 从 `原始数据`.`3` 表中查询价格数据
 */
export async function querySecondaryPrice(
  itemName: string,
  onProgress?: (status: 'start' | 'done' | 'error') => void
): Promise<{ 
  text: string; 
  rawResult: SQLQueryResult 
}> {
  onProgress?.('start')
  
  const escapedItem = itemName.replace(/'/g, "''")
  
  // 只查询关键字段：物料短描述、物料单位、平均单价、最高价、最低价
  const sql = `
SELECT 
  \`物料短描述\`,
  \`物料单位\`,
  \`平均单价（元）\`,
  \`最高价（元）\`,
  \`最低价（元）\`
FROM \`原始数据\`.\`3\`
WHERE \`物料短描述\` LIKE '%${escapedItem}%'
LIMIT 10;
  `.trim()
  
  console.log('查询二采价格:', sql)
  
  const result = await runSQL(sql)
  
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
    '二次采购历史价格数据，包含采购渠道、价格、数量等信息'
  )
  
  return { text, rawResult: result }
}

