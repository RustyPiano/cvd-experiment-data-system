# CVD 实验数据采集系统

面向二维材料课题组的炉次、样品、表征与实测数据采集系统。仓库当前是 **v2 单轨**：唯一前端为 `frontend-next/`，唯一 API 命名空间为 `/api/v1`，字段与词表以 `docs/standard/field-source.yaml` 为单一机器源。

> 先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)。它是项目现状、已定决策和下一步的唯一入口；完整文档索引见 [`docs/README.md`](docs/README.md)。
>
> ⚠️ 线上仍是切换前的旧部署。完成批8人工切换前禁止运行 `deploy.sh`。

## 当前产品逻辑

1. 成员创建炉次，系统自动生成炉次编号，并将当前登录账号固定为实验人；新建时只需填写开始时间和合成方法。
2. 在炉次中分节填写目标产物、装置、前驱体、衬底和过程步骤；基础资料可以就地新建，引用固定为“实体 + 版本”快照。
3. 炉次状态只有 `draft → locked`。锁定前检查全部必填项与 R0 最小可复现字段。
4. 锁定工艺时，系统按衬底在同一事务中生成 `growth` 样品。管理员可将炉次解锁回 `draft`。
5. `locked` 只锁工艺数据；全组成员仍可为可见炉次补录直接观察、表征结果和附件，也可以确认“暂未表征”。新增结果会自动清除该确认。
6. 样品类型为 `growth / derived / control`。样品保留来源快照和父子谱系；实验与文件不做物理删除。
7. 炉次支持组合筛选、操作记录、嵌套 JSON 导出和七表关系型 CSV ZIP 导出；界面支持中英文切换。

产品规格见 [`docs/product/run-first-workflow-and-copy-design.md`](docs/product/run-first-workflow-and-copy-design.md)，浏览器验收结果见 [`docs/operations/e2e-run-first-report-2026-07-17.md`](docs/operations/e2e-run-first-report-2026-07-17.md)。

## 技术栈

- 前端：React、TypeScript、Vite、TanStack Router、shadcn/ui、Tailwind CSS v4
- 后端：FastAPI、SQLAlchemy 2.x、Alembic、PostgreSQL
- 文件：本地文件系统 + 数据库元数据，删除采用软删除
- 工具链：Python 只用 UV，JavaScript 只用 Bun

## 本地开发

先确认环境：

```bash
uv --version
bun --version
docker --version
docker compose version
```

启动数据库：

```bash
cp .env.example .env
docker compose up -d postgres
```

启动后端：

```bash
cd backend
uv venv
uv sync
cp ../.env.example .env
uv run alembic upgrade head
uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000
```

启动前端：

```bash
cd frontend-next
bun install
bun run dev
```

默认入口：

- 前端：<http://localhost:3000>
- OpenAPI：<http://localhost:8000/docs>
- 健康检查：<http://localhost:8000/health>

Vite 会把 `/api` 代理到本地后端。

## 创建账号

命令会交互式读取密码，不会把密码写入 shell history：

```bash
cd backend
uv run python -m app.commands.create_user \
  --email admin@example.com --name Admin --role admin
```

成员账号可以用同一命令将 `--role` 改为 `member` 创建，也可以在登录页使用 `REGISTRATION_INVITE_CODE` 自助注册。兼容的管理员初始化命令为：

```bash
uv run python -m app.commands.create_admin \
  --email admin@example.com --name Admin
```

## 质量门禁

后端：

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

前端：

```bash
cd frontend-next
bun run lint
bun run typecheck
bun run test
bun run build
```

字段源校验：

```bash
python3 docs/standard/check_field_source.py
```

字段变更只能修改 `docs/standard/field-source.yaml`，随后按 [`AGENTS.md`](AGENTS.md) 的生成顺序更新后端模型、JSON Schema、前端元数据和 xlsx；不要手改生成物。

## 文档与部署

- 当前状态：[`docs/standard/STATUS.md`](docs/standard/STATUS.md)
- 文档索引：[`docs/README.md`](docs/README.md)
- 字段标准：[`docs/standard/field-source.yaml`](docs/standard/field-source.yaml)
- 生产切换：[`docs/engineering/v2-single-track-plan.md`](docs/engineering/v2-single-track-plan.md)
- 端到端检查：[`docs/operations/e2e-walkthrough-checklist.md`](docs/operations/e2e-walkthrough-checklist.md)

生产使用 `docker-compose.prod.yml`，共享 1Panel PostgreSQL，并由 openresty 反向代理。当前发布硬顺序为：

```text
push → GitHub Actions 首绿 → required checks → 批8人工切换 → 创建管理员 → 线上冒烟
```

批8必须由用户在场执行；在此之前不要运行 `deploy.sh`。
