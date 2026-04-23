# CVD 实验数据采集系统后端一期设计：基础骨架与登录鉴权

## 文档类型

Explanation + Reference

## 目标读者

- 本项目的开发者
- 负责后端实现与后续扩展的代码 Agent

## 文档目标

明确第一阶段后端实现的边界、目录结构、鉴权方案、数据模型、接口范围、初始化命令、配置项与验收标准，避免在空仓库阶段因范围不清导致返工。

## 范围定义

本设计只覆盖后端一期：

- 初始化仓库结构
- 创建后端项目骨架
- 接入 PostgreSQL、SQLAlchemy 2.x 与 Alembic
- 实现用户模型
- 实现账号密码登录鉴权
- 提供当前用户接口
- 提供显式管理员初始化命令
- 提供基础测试与质量门禁

本设计明确不包含：

- 实验记录业务模型与接口
- 文件上传、导出、审计日志的正式实现
- 注册、刷新令牌、找回密码
- 多租户或复杂 RBAC
- 前端工程代码

## 背景与约束

当前目录只有设计文档，没有现成前后端代码。项目约束如下：

- Python 依赖管理只能使用 `uv`
- JavaScript 依赖管理只能使用 `bun`
- 后端技术栈固定为 `FastAPI + SQLAlchemy 2.x + Alembic + PostgreSQL`
- 认证采用本地账号密码
- 用户角色保留 `admin`、`member`、`viewer`

## 设计决策总览

### 仓库形态

采用 monorepo 结构，但本轮只实现后端。这样可以和现有设计文档、未来前端接入、Docker Compose 部署保持一致，避免后续重排目录。

### 后端一期定位

后端一期只解决一个最小闭环：

1. 服务可以启动
2. 数据库迁移可执行
3. 能创建首个管理员
4. 能完成登录并识别当前用户

这个闭环稳定后，再进入实验记录、状态机、文件资产和审计模块。

## 目录结构

```text
/
├─ backend/
│  ├─ app/
│  │  ├─ api/
│  │  │  └─ v1/
│  │  ├─ core/
│  │  ├─ db/
│  │  ├─ models/
│  │  ├─ schemas/
│  │  ├─ services/
│  │  ├─ repositories/
│  │  ├─ commands/
│  │  └─ main.py
│  ├─ alembic/
│  ├─ tests/
│  ├─ pyproject.toml
│  └─ uv.lock
├─ frontend/
│  └─ README.md
├─ docker-compose.yml
├─ .env.example
├─ .gitignore
├─ README.md
├─ AGENTS.md
├─ DESIGN.md
├─ AGENT_IMPLEMENTATION_BRIEF.md
└─ cvd_experiment_data_system_design_v1.md
```

### 目录职责

- `api/v1/`：HTTP 路由入口，仅做请求组装与响应返回
- `core/`：配置、鉴权、密码工具、通用依赖
- `db/`：数据库会话、Base、迁移相关支撑
- `models/`：SQLAlchemy ORM 模型
- `schemas/`：Pydantic v2 输入输出模型
- `services/`：认证与用户域业务逻辑
- `repositories/`：数据库访问封装
- `commands/`：CLI 命令，例如管理员初始化
- `tests/`：单元测试与 API 集成测试

## 鉴权设计

### 认证方式

使用账号密码登录，服务端签发 JWT access token。客户端后续请求通过 `Authorization: Bearer <token>` 访问受保护接口。

### 一期边界

一期只做短期 `access token`，不做以下能力：

- refresh token
- token 黑名单
- 单点登录
- 密码重置
- 邮件验证码

这样可以先把身份认证主干建稳，避免在尚无业务接口时过度设计会话体系。

### token 载荷

当前实现的 JWT access token 保持最小化，只包含：

- `sub`：用户 UUID
- `exp`：过期时间

说明：

- 用户邮箱、角色和启用状态通过 `/api/v1/auth/me` 与登录响应体中的 `user` 返回
- token 内不冗余携带 `email` / `role`，避免 claim 过期后与数据库状态漂移

### 密码策略

- 密码只保存哈希，不保存明文
- 使用 `pwdlib + Argon2id`
- 命令创建管理员时交互式输入密码并二次确认
- 不通过命令行参数直接传入明文密码，避免落入 shell history
- 当前实现不兼容旧 `bcrypt` 哈希；数据库重建后统一使用新方案

### 用户状态

- `is_active = false` 的用户禁止登录
- `/auth/me` 只能返回当前有效用户

### 权限边界

一期不做复杂资源级授权，但提前保留依赖注入边界：

- `get_db`
- `get_current_user`
- `get_current_active_user`
- `require_role(...)`

这样后续实验域、后台域接口可以直接复用，不需要重新改造认证链路。

## 数据模型设计

一期只正式落一张 `users` 表。

### users

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `email` | text | 登录名，唯一 |
| `name` | text | 用户显示名 |
| `password_hash` | text | 密码哈希 |
| `role` | enum | `admin` / `member` / `viewer` |
| `is_active` | bool | 是否启用 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |
| `last_login_at` | timestamptz nullable | 最近登录时间 |

### 约束

- `email` 唯一索引
- 所有时间字段使用时区时间
- `role` 使用明确枚举，避免自由文本污染

### 不在一期落地的表

以下表在结构上需要为未来留口，但本轮不创建业务实现：

- `experiment_runs`
- `experiment_module_payloads`
- `samples`
- `file_assets`
- `audit_events`

## API 设计

一期接口保持最小集。

### `GET /health`

用途：

- 本地开发健康检查
- Docker Compose 探活准备

返回：

- 应用运行状态
- 可选版本标记

### `POST /api/v1/auth/login`

输入：

- `email`
- `password`

输出：

- `access_token`
- `token_type`
- `expires_in`
- `user`

说明：

- 登录成功后更新 `last_login_at`
- 密码错误或账号禁用返回明确失败

### `GET /api/v1/auth/me`

用途：

- 前端恢复会话
- 展示当前用户与角色信息

返回：

- 当前用户基础资料
- 角色
- 启用状态

### 暂缓接口

以下接口不进入一期：

- `POST /api/v1/auth/refresh`
- 用户管理 CRUD

`logout` 当前已实现为显式结束前端本地会话的辅助接口，返回 `204`，不引入服务端 token 黑名单。

## 管理员初始化命令

提供显式命令创建首个管理员，而不是在应用启动时自动播种。

建议形式：

```bash
cd backend
uv run python -m app.commands.create_admin --email admin@example.com --name Admin
```

### 行为规则

- 邮箱不存在时，创建 `admin` 用户
- 邮箱已存在时，命令失败并给出明确提示
- 若邮箱已存在但不是 `admin`，不自动升级角色
- 命令运行过程中交互式输入两次密码
- 成功后只输出用户创建结果，不回显密码

### 设计原因

启动时自动创建管理员在开发阶段方便，但在生产环境很容易因为环境变量残留而重复播种或产生不可预期账号。显式命令更可控，也更符合实验室部署场景。

## 配置设计

一期配置统一走环境变量，并通过 Settings 模块集中加载。

### 必要配置项

- `APP_NAME`
- `APP_ENV`
- `APP_DEBUG`
- `APP_HOST`
- `APP_PORT`
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`

### 配置原则

- 缺失 `DATABASE_URL` 时服务拒绝启动
- 缺失 `JWT_SECRET_KEY` 时服务拒绝启动
- `.env.example` 只提供示例值，不包含真实凭据
- 本地开发日志可更详细，生产环境默认收敛

## 测试设计

一期测试只覆盖核心闭环，不追求数量。

### 单元测试

- 密码哈希与密码校验
- token 生成与解析

### 集成测试

- 登录成功
- 密码错误登录失败
- 禁用用户登录失败
- 未带 token 访问 `/api/v1/auth/me` 失败
- 带合法 token 访问 `/api/v1/auth/me` 成功

### 命令测试

- `create_admin` 可创建账号
- 重复邮箱创建失败

## 质量门禁

后端一期必须满足：

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

## 验收标准

满足以下条件即可视为后端一期完成：

1. `backend/` 可使用 `uv` 完成依赖初始化
2. Alembic 初始迁移可执行
3. 数据库成功创建 `users` 表
4. 可通过命令创建首个管理员
5. 可通过登录接口获取 token
6. 可通过 `/api/v1/auth/me` 读取当前用户
7. 基础测试通过
8. 质量检查通过

## 后续扩展留口

为避免后续返工，一期实现时需要注意以下边界：

- 路由层不直接承载业务逻辑
- 鉴权依赖放在 `core`，避免实验域重复实现
- 用户相关数据访问通过 repository/service，避免未来审计与权限逻辑分散
- API 版本前缀固定为 `/api/v1`
- 目录上为 `experiments`、`files`、`admin` 模块预留位置

## 不做事项清单

一期明确不做以下内容：

- 实验草稿 CRUD
- 状态机流转
- 文件上传
- 导出 JSON / Excel
- 审计日志表与审计事件记录
- 用户注册与后台用户管理页面

## 结论

后端一期的目标不是“把系统做出来”，而是把后续所有业务功能都会依赖的基础主干搭稳。只要这一阶段把项目结构、数据库迁移、管理员初始化和登录鉴权闭环做好，下一阶段就可以直接进入实验域开发，而不需要重做底层骨架。
