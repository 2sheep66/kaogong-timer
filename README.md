# 考公学习计时器 · iOS App（PWA）

> 纯前端、零依赖、可离线安装的专注学习计时器，按 PRD 定义「本地运行、跨平台（iOS Safari）」，打包为 PWA 后可像原生 App 一样安装到 iPhone 主屏幕。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Zero Dependency](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](.)
[![PWA](https://img.shields.io/badge/PWA-installable-blue.svg)](manifest.webmanifest)

<!-- 截图：在 assets/ 下放 1~3 张真机截图后取消下一行注释
![demo](assets/screenshots/demo.png)
-->

## ✨ 功能

| 模块 | 说明 |
|------|------|
| 专注计时 | 正计时 / 倒计时、科目选择（最近使用 + 收藏置顶 + 完整科目树）、快捷时长 15/25/45/60/自定义、暂停继续、**结束（长按 1.5 秒确认）**、点数字切剩余/已用、点标签切正/倒计 |
| 计时中界面 | 全屏深色专注模式、屏幕常亮（Wake Lock）、左右滑手势（左滑结束 / 右滑暂停继续） |
| 数据统计 | 今日概览（总时长/专注次数/平均时长/效率评分）、科目时长分布柱状图、日（时段热力图）/周（7 天柱状）/月（30 天折线）趋势、连续打卡日历、学习记录列表（删除） |
| 连续打卡 | 每天首次完成 ≥5 分钟专注即打卡，自动计算连续/最长天数，日历高亮 |
| 设置中心 | 每日/每周科目目标、考试倒计时、提醒开关、主题（浅/深/跟随系统）、强调色（蓝/绿/橙/紫）、计时器样式（数字/圆环/进度条）、数据导出/导入/清除 |
| 自定义科目 | 内置行测/申论/面试/综合之外，可自由新增并命名科目（如「英语」「考研政治」），每个科目可带多个分类；支持编辑、删除；统计图表自动配色 |
| 休息提醒 | 专注结束弹出 5 分钟休息倒计时（可跳过 / 开始下一轮） |
| 跨平台 | 响应式（SE → 16 Pro Max），Service Worker 离线缓存 |

## 🏗️ 工程亮点

- **约束求解**：开发环境为 Windows，无法编译 iOS 原生工程；在 PRD「纯 Web 离线应用」定位下，用 **Service Worker + manifest** 实现「可安装 + 离线」，让一个 Web 应用以原生 App 形态出现在 iPhone 主屏——这是真实约束下的技术选型，而非套框架。
- **零依赖**：计时核心、模糊搜索、SVG 图表全部手写，不引入任何第三方库，保证彻底离线、体积小、好维护。
- **图表用 SVG 而非 canvas**：内联 SVG 在离线 / 低性能设备上更稳定，且无外部字体/脚本依赖。
- **数据可持久化**：LocalStorage 双键备份 + 导入/导出，无后端。
- **自动化冒烟测试**：用 jsdom 对三个页面做真实 DOM 冒烟测试，曾借此抓出真实渲染 bug。
- **细节工程**：计时精度基于 `Date.now()` 时间戳（非累加计数，误差 < 1s/小时）；主题/强调色通过 CSS 变量运行时注入。

## 📱 在 iPhone 上安装使用

1. 用 iPhone 的 **Safari** 打开部署后的 https 链接。
2. 点底部 **分享按钮** → **「添加到主屏幕」** → 取名「考公计时器」。
3. 桌面图标点开即全屏运行，体验等同原生 App，离线可用。

> 为何是 PWA 而非 Xcode 工程：本机 Windows 无法编译 iOS 原生工程；PRD 本身即「纯 HTML/CSS/JS 离线 Web 应用」。PWA 完美契合「纯本地、跨平台」，且无需上架即可在 iPhone 以 App 形态使用。

## 💻 本地运行

```bash
cd kaogong-timer
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 📁 目录结构

```
kaogong-timer/
├── index.html           # 首页（计时器）
├── stats.html           # 统计页
├── settings.html        # 设置页
├── manifest.webmanifest # PWA 清单
├── sw.js                # Service Worker 离线缓存
├── css/style.css        # 全局样式（浅/深主题、强调色、动画、响应式）
├── js/app.js            # 核心逻辑：Timer / DataManager / StatsEngine / UI / Theme
└── assets/icons/        # 应用图标
```

## 📊 数据存储

全部存于浏览器 **LocalStorage**：`gongkao_records`（学习记录）、`gongkao_settings`（设置）、`gongkao_favorites`（收藏科目）、`gongkao_streak`（打卡）。支持「导出 JSON 备份 / 导入恢复 / 清除全部」。

> ⚠️ 多页面结构（计时/统计/设置 三个 HTML）下，**计时仅在「计时」页运行**；切到其它标签页会结束当前专注会话（按 PRD 文件结构设计）。专注时建议停留在计时页（全屏专注模式已覆盖整屏）。如需跨标签持续计时，可后续改为单页应用（SPA）。

## 🗺️ Roadmap

- [ ] 单页应用（SPA）形态，计时跨标签页持续
- [ ] WebDAV / iCloud 文件同步（从纯前端升级为「有存储设计」）
- [ ] 错题本 / 学习计划（PRD v1.1）

## 📄 License

[MIT](LICENSE) © 2026 小羊
