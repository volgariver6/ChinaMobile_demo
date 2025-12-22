# 项目设计文档

## 1. 总览
- 目标：实现“采购寻源比价”智能对话助手，支持会话管理、文件解析、深度思考展示与消息持久化。
- 技术栈
  - 后端：FastAPI (Python 3.12) + SQLAlchemy Async + MySQL (asyncmy) + OpenAI 兼容客户端。
  - 前端：React + Vite + TypeScript + Zustand。
  - 部署：Docker / docker-compose（前端、后端、MySQL）。
- 数据模型：会话（conversations）1:N 消息（messages），支持模型名称与深度思考字段存储。

## 2. 目录结构（关键部分）
- backend/src
  - main.py：应用入口、CORS、异常处理、路由挂载。
  - config.py：配置（数据库、LLM、外部搜索），环境变量注入。
  - prompt.py：系统提示词（采购寻源专家角色）。
  - db/
    - session.py：Async 引擎 + 会话 + 上海时区 connect hook。
    - models.py：ORM 定义（Base、Conversation、Message）。
  - crud/：通用 CRUD 基类与会话/消息 CRUD 封装。
  - schemas/ai.py：路由请求/响应模型（聊天、同步、消息返回等）。
  - routers/ai.py：核心接口（聊天、文件解析、标的提取、会话同步/查询/删除）。
  - services/llm_client.py：OpenAI 兼容客户端懒加载。
- frontend/src
  - App.tsx：整体布局（Sidebar + ChatArea）。
  - store/index.ts：Zustand 全局状态，会话/消息加载、持久化。
  - utils/api.ts：前端 API 封装（会话同步、消息获取、聊天流、文件解析）。
  - components/ChatArea、ChatInput、MessageBubble 等：聊天 UI、输入、思考过程展示。
  - config/index.ts：模型列表、默认模型、API 基础路径。
- deploy/
  - docker-compose.yml、MakeFile、script/init-sql.sql：编排与初始化 SQL。

## 3. 后端设计
### 3.1 配置（config.py）
- DATABASE_URL：示例 mysql+asyncmy://user:pass@host:port/db。
- LLM_API_KEY / LLM_BASE_URL / LLM_DEFAULT_MODEL：OpenAI 兼容配置，可指向 DeepSeek 等。
- LLM_MAX_TOKENS / LLM_TEMPERATURE / LLM_STREAM：生成参数统一后端管理。
- WEB_SEARCH_API_URL / WEB_SEARCH_API_KEY：外部搜索代理（当前前端未调用）。

### 3.2 数据模型（db/models.py）
- Base：id 自增、created_at/updated_at，默认使用上海时区（无 tzinfo）。
- Conversation：
  - name, first_user_message, status, pinned(bool)。
  - 关系：messages（级联删除）。
- Message：
  - conversation_id(FK), role(user/assistant/system), content(Text)。
  - deep_thinking(Text，可空)，model(当前使用模型名，可空)。

### 3.3 数据库会话（db/session.py）
- create_async_engine + async_sessionmaker。
- 连接池：pool_size=200, max_overflow=100, pool_timeout=65, pool_recycle=4h。
- connect hook：SET time_zone = '+08:00'（上海时区）。

### 3.4 CRUD 封装
- CRUDBase：get/create/update_by_id/delete_by_id。
- crud_conversations：列表按 pinned desc, updated_at desc；重命名/触达更新时间；删除。
- crud_messages：创建消息（含 deep_thinking/model）；按会话列表/近期上下文；按会话删除。

### 3.5 路由（routers/ai.py，前缀 /api）
- /health（main.py 注册）：存活检查。
- POST /files/parse：多文件解析，UTF-8 解码失败返回提示，拼接 formatted 文本。
- POST /chat/completions：
  - 入参：model(可选)，messages（当前消息列表），conversation_id(可选)。
  - 历史构建：系统 prompt + DB 拉取该会话历史（最多 200 条）+ 本次消息。
  - 生成参数：max_tokens/temperature/stream 取自 settings。
  - 返回：流式 SSE（包含 reasoning_content 时前端展示思考）或一次性 JSON。
- POST /items/extract：基于对话文本的标的物提取（LLM），返回 OpenAI 兼容格式。
- POST /conversations/sync：
  - 功能：创建/更新会话元数据，并仅写入“最新一条消息”（避免覆盖历史）。
  - 入参：id(可空)、title、messages（含 deep_thinking/model/timestamp）、created_at/updated_at。
  - 生成会话名：未传 title 则用“新对话”。
  - 返回：ConversationOut（id/title/时间戳）。
- GET /conversations：列表（按 pinned/updated_at 排序），返回毫秒时间戳。
- GET /conversations/{id}/messages：返回消息列表（含 deep_thinking、model、timestamp 毫秒）。
- DELETE /conversations/{id}：删除会话及其消息。

### 3.6 系统 Prompt（prompt.py）
- 采购寻源专家角色设定，包含能力/输出要求/注意事项；在聊天历史最前注入。

### 3.7 异常与 CORS（main.py）
- CORSMiddleware：来源来自 CORS_ORIGINS 环境变量，含 * 时禁止 credentials。
- 全局异常：HTTPException/Exception 统一 JSON 包装。
- main() 入口便于 `python -m src.main` 或 uvicorn 运行。

## 4. 数据库脚本（deploy/script/init-sql.sql）
- DROP DATABASE IF EXISTS source_agent; CREATE DATABASE source_agent utf8mb4。
- 表结构
  - conversations：id, created_at, updated_at, name, first_user_message, status, pinned(TINYINT)。
  - messages：id, created_at, updated_at, conversation_id(FK), role, content, deep_thinking, model。
- 无级联删除；messages 有外键到 conversations。

## 5. 前端设计
### 5.1 状态与数据流（Zustand store/index.ts）
- conversations：本地缓存当前会话列表与消息；selectedModel 默认 DEFAULT_MODEL。
- loadConversationsFromBackend：拉取列表但不预装消息。
- selectConversation(id)：切换时清空本地消息，调用 fetchConversationMessages，再写入（含 deep_thinking→thinking）。
- createConversation：调用 /conversations/sync 获取后端 ID 后本地入列表。
- addMessage：若无会话则先创建；添加本地消息并异步 persistConversation。
- persistConversation：同步当前会话（过滤空内容消息），携带 deep_thinking 写回后端。
- delete/rename：本地更新并调用后端（删除直接请求，重命名通过 persist）。

### 5.2 前端 API 封装（utils/api.ts）
- parseAndCacheFiles：POST /files/parse，缓存内容。
- syncConversation / fetchConversations / fetchConversationMessages / deleteConversationBackend。
- generateAIResponse：
  - 先插入占位助手消息（思考中）。
  - 构造当前用户消息（文件内容 + 输入），携带 conversation_id 和当前模型。
  - 调用 /chat/completions，SSE 流式解析 content 与 reasoning_content（仅当模型名包含 DeepSeek-R1 时展示思考）。
  - 实时更新最后一条助手消息；流结束后 persistConversation。

### 5.3 UI 组件
- Sidebar：会话列表、新建对话、模型设置入口、头像等。
- ChatArea：渲染消息列表；空列表显示 WelcomeScreen。
- MessageBubble：展示用户/助手消息；思考过程（thinking）可折叠；支持复制/重生成等交互。
- ChatInput：底部输入区、文件选择、工具面板（提取标的等）。
- ModelSettings/ToolSelector 等：模型选择、工具开关（与后端模型透传）。

### 5.4 样式与体验
- 主题：暗/亮主题，跟随系统或手动切换；消息流式显示光标动画。
- 思考过程：当 deep_thinking/thinking 非空时展示“思考过程”折叠面板。
- 消息过滤：渲染与持久化均过滤空内容，避免空白气泡。

## 6. LLM 调用流程
1) 前端构造当前 user 消息，附上 conversation_id；后台自行拉历史并注入 system prompt。
2) 后端调用 OpenAI 兼容接口（可指向 DeepSeek），参数来自 settings。
3) 流式：SSE 返回 delta.content 和 reasoning_content，前端实时刷新。
4) 结束：前端落库并通过 /conversations/sync 写回最新消息（含 deep_thinking）。

## 7. 部署与运行
- 开发
  - 后端：`uvicorn src.main:app --reload`（需设置 DATABASE_URL, LLM_API_KEY 等）。
  - 前端：`npm install` 或 `pnpm install`，`npm run dev`（Vite，默认代理 /api → http://localhost:8000）。
- Docker / Compose
  - backend/Dockerfile, frontend/Dockerfile。
  - deploy/docker-compose.yml：启动前端、后端、MySQL；MakeFile 提供 up/down/logs/clean。
  - 初始化数据库：`mysql ... < deploy/script/init-sql.sql` 或 compose 中自定义 init。
- 文件存储：上传仅解析内存，不持久化（uploads/ 可按需挂载，当前无写入逻辑）。

## 8. 配置清单（关键环境变量）
- DATABASE_URL：必填，asyncmy DSN。
- LLM_API_KEY / LLM_BASE_URL / LLM_DEFAULT_MODEL / LLM_MAX_TOKENS / LLM_TEMPERATURE / LLM_STREAM。
- WEB_SEARCH_API_KEY / WEB_SEARCH_API_URL（如启用外部搜索）。
- REACT_APP_SILICONFLOW_API_KEY：硅基流动API密钥（前端向量嵌入使用）。
- CORS_ORIGINS：逗号分隔，含 * 时不带 credentials。
- PORT：后端监听端口（默认 8000）。

### 环境变量示例（.env文件）
```bash
# 数据库
DATABASE_URL=mysql+asyncmy://user:password@localhost:3306/source_agent

# LLM配置
LLM_API_KEY=your_llm_api_key
LLM_BASE_URL=https://api.openai.com/v1
LLM_DEFAULT_MODEL=gpt-4

# 外部搜索
WEB_SEARCH_API_KEY=your_web_search_key

# 硅基流动向量嵌入（前端使用）
REACT_APP_SILICONFLOW_API_KEY=your_siliconflow_api_key

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

## 日志查看

### 查看所有服务日志
```bash
# 查看所有服务的实时日志
docker-compose -f deploy/docker-compose.yml logs -f

# 查看所有服务的最新日志
docker-compose -f deploy/docker-compose.yml logs
```

### 查看特定服务日志
```bash
# 后端日志
docker-compose -f deploy/docker-compose.yml logs -f backend

# 前端日志
docker-compose -f deploy/docker-compose.yml logs -f frontend

# 数据库日志
docker-compose -f deploy/docker-compose.yml logs -f db
```

### 实时监控日志
```bash
# 实时查看所有日志
docker-compose -f deploy/docker-compose.yml logs -f --tail=100

# 只查看错误日志
docker-compose -f deploy/docker-compose.yml logs 2>&1 | grep -i error
```

### 日志内容说明
- `[API]` - 前端API调用日志
- `[Embedding]` - 向量生成功能日志
- `[INFO/ERROR]` - 后端应用日志
- 包含请求参数、向量生成状态、查询结果等详细信息

## 9. 已知行为/约束
- /conversations/sync 仅写入“最新一条”消息，避免历史被覆盖；历史读取依赖 GET /conversations/{id}/messages。
- 深度思考字段 deep_thinking 前后端对齐：后端入库/返回，前端映射为 thinking 展示。
- SSE reasoning_content 仅在模型支持时返回（例如 DeepSeek-R1）。
- 会话时间戳为毫秒（前端）/ 后端存储为本地时间（上海时区，无 tzinfo）。

## 10. 可扩展点
- Web 搜索接口后端代理已预留，可在前端接入 sources 展示。
- 文件持久化与清理策略（当前只解析文本，不落盘）。
- 增加鉴权、多租户隔离、速率限制。
- 引入任务队列用于长耗时解析或多轮工具调用。

