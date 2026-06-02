# 版本号规范

软件版本号遵循 SemVer：`MAJOR.MINOR.PATCH`。

- `MAJOR`：破坏性变更，例如配置格式不兼容或核心计算规则重写。
- `MINOR`：向后兼容的新功能，例如新增主题、天气源、统计面板。
- `PATCH`：向后兼容的问题修复，例如 UI 显示错误、计算边界修正。

当前版本：`0.4.2`。

版本号维护规则：

1. 以 `package.json` 的 `version` 字段作为唯一版本来源。
2. Electron 主进程通过 `app.getVersion()` 读取版本号。
3. 渲染进程通过 preload 暴露的 `getInitialState()` 获取版本号。
4. 每次版本变更同步更新 `CHANGELOG.md`。
5. 发布版本时建议创建 Git tag，例如 `v0.1.0`。
