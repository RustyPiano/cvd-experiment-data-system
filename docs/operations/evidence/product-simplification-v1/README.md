# 产品简化 v1 页面验收证据

- 日期：2026-07-30
- 分支：`codex/product-simplification-v1`
- 环境：隔离的本地 SQLite 演示环境，不含组内真实实验数据
- 浏览器验收：创建 → 六步填写 → 提交 → 自动生成样品 → 添加表征 → 样品结果
- 控制台：在全新浏览器页复查新建、制备编辑、表征和样品页面，0 warning / 0 error
- 发布状态：未合并、未部署生产，等待用户确认截图

## 截图

桌面截图宽度均为 1440 px；移动端截图宽度均为 390 px。

1. `01-new-experiment.png`
2. `02-target-single.png`
3. `03-target-doped.png`
4. `04-target-alloy.png`
5. `05-target-heterostructure.png`
6. `06-device-precursor.png`
7. `07-substrate.png`
8. `08-growth-program.png`
9. `09-review-submit.png`
10. `10-characterization-raman.png`
11. `11-sample-list.png`
12. `12-complete-mos2-record.png`
13. `13-no-growth-record.png`
14. `14-mobile-new-experiment.png`
15. `15-mobile-growth-program.png`

## 五个黄金案例

`backend/tests/api/test_scientific_v4.py::test_product_golden_workflows` 覆盖：

- G1 常规 MoS₂ 制备
- G2 Pt 掺杂 MoS₂
- G3 Mo-W-S 合金
- G4 MoS₂/WS₂ 垂直异质结构
- G5 目标 MoS₂、实际未观察到生长

每个案例均执行创建、六步数据写入、提交、样品生成、光学表征和样品结果断言。正式验收仍需两位未参与开发的实验人员使用真实案例独立试填。
