# bazi-anima

自动八字排盘 → 方法论解读 → 可交互像素动画。

## 架构：三层，严格分离

```
L1  engine/   排盘引擎（纯代码，确定性，可单测）   → chart.json
L2  skill/    方法论 Skill（Dan 的断法，LLM 执行） → reading.json
L3  anima/    可交互像素动画（消费上面两个 JSON）  → 单文件 HTML
```

**核心原则：LLM 绝不计算干支。** 年柱忘立春、月柱忘节气、日柱直接编——这类错误隐蔽且致命。
排盘必须由 `engine/` 算完，把结构化 JSON 喂给 LLM，LLM 只负责「断」。

## 快速开始

```bash
npm install
node engine/cli.js --date=1998-11-24 --time=10:30 --gender=male --city=北京 --out=out/chart.json
```

参数：
| 参数 | 说明 |
|---|---|
| `--date=YYYY-MM-DD` | 生日 |
| `--time=HH:MM` | 出生时刻（钟表时） |
| `--gender=male\|female` | 决定大运顺逆 |
| `--city=北京` | 用于真太阳时校正 |
| `--lon=116.41` | 直接给经度，优先于 city |
| `--calendar=lunar` | 输入是农历 |
| `--out=path.json` | 输出文件 |

## 目录

- `engine/tables.js` — 干支/藏干/十神/关系基础表
- `engine/config.js` — **流派开关**（早晚子时、真太阳时、起运折算、旺衰权重、神煞集合）
- `engine/solartime.js` — 真太阳时（经度时差 + 均时差）
- `engine/shensha.js` — 神煞查法
- `engine/relations.js` — 刑冲合害会 + 五行量化 + 旺衰打分
- `engine/paipan.js` — 主入口，产出 chart.json
- `skill/bazi-reading/` — 方法论 Skill（待 Dan 输入）
- `cases/` — 真实案例，回归测试用
- `docs/BRAINSTORM.md` — 架构头脑风暴

## 状态

- [x] L1 排盘引擎跑通
- [ ] L1 与 Dan 现用工具交叉验证
- [ ] L2 方法论 SKILL.md
- [ ] L3 动画原型
