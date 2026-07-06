# CLAUDE.md

> **先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)** —— 它含**全部背景、当前进度、已冻结决策、下一步**；读完即可接手，**无需用户重复交代**。
>
> 一句话现状：**线上系统是 v1（`cvd_v1` / 68 字段）**；v2/v3 是元数据重构设计、未落代码；两份交付物（`字段草案-v3.xlsx` + `cvd-2d-process-data-standard-v2.0.md`）经 3 轮评审已 freeze-ready；**字段改动改生成脚本 `docs/standard/build_field_tables.py` 再重跑，别手改 xlsx**；`docs/archive/` 里都是历史，别当真相。

工程约定（工具链、开发流程、测试门禁、部署）见 [`AGENTS.md`](AGENTS.md)。
