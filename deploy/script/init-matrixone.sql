-- MatrixOne 初始化脚本
-- 创建租户进行资源隔离，然后创建业务数据库和表结构

-- 创建租户 (account)
#CREATE ACCOUNT IF NOT EXISTS `source_agent_account` ADMIN_NAME 'admin' IDENTIFIED BY 'dump111';

-- 切换到租户上下文 (后续操作都在此租户下进行)
-- 注意：MatrixOne 中，租户创建后需要使用 account_name:admin_name 的格式登录

-- 在租户下创建数据库
CREATE DATABASE IF NOT EXISTS source_agent;

-- 使用数据库
USE source_agent;

-- 创建会话表
CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    name VARCHAR(255) NOT NULL,
    first_user_message TEXT,
    status VARCHAR(50) DEFAULT 'active',
    pinned TINYINT DEFAULT 0 COMMENT '是否置顶（1 置顶，0 普通）'
);

-- 创建消息表
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    conversation_id INT NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    deep_thinking TEXT,
    model VARCHAR(100),
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    INDEX idx_messages_conversation (conversation_id)
);

-- 创建 MOI 业务数据库 (如果不存在)
CREATE DATABASE IF NOT EXISTS xunyuan_agent;

-- 切换到 MOI 业务数据库
USE xunyuan_agent;

-- 创建示例表结构 (根据项目需求调整)
-- 这里只创建基本的表结构，实际数据需要从外部导入

-- 采购项目投标记录表
CREATE TABLE IF NOT EXISTS bidding_records_1 (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `细化产品` varchar(255) DEFAULT NULL,
  `单位` varchar(255) DEFAULT NULL,
  `项目名称` varchar(255) DEFAULT NULL,
  `供应商名称` varchar(255) DEFAULT NULL,
  `参与状态` varchar(255) DEFAULT NULL COMMENT '例如：中标、入围、落标',
  `是否参股企业` varchar(50) DEFAULT NULL COMMENT '枚举：是/否',
  `中标金额_万元` decimal(18, 2) DEFAULT NULL COMMENT '数值类型便于计算',
  `供应商联系人` varchar(255) DEFAULT NULL,
  `电话号码` varchar(50) DEFAULT NULL,
  `电子邮件` varchar(255) DEFAULT NULL,
  `project_name_embedding` vecf64 (1024) DEFAULT NULL,
  `product_embedding` vecf64 (1024) DEFAULT NULL,
  PRIMARY KEY (`id`),
);

-- 产品价格表
CREATE TABLE IF NOT EXISTS product_price (
  `项目名称` varchar(255) DEFAULT NULL,
  `单位` varchar(255) DEFAULT NULL,
  `物料编码` varchar(255) DEFAULT NULL,
  `物料短描述` varchar(255) DEFAULT NULL,
  `物料单位` varchar(255) DEFAULT NULL,
  `平均单价（元）` varchar(255) DEFAULT NULL,
  `最高价（元）` varchar(255) DEFAULT NULL,
  `最低价（元）` varchar(255) DEFAULT NULL,
  `project_name_embedding` vecf64 (1024) DEFAULT NULL,
  `product_embedding` vecf64 (1024) DEFAULT NULL,
);

-- 输出初始化完成信息
SELECT 'MatrixOne database initialization completed successfully!' as status;

