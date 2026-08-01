# 动画脚本 DSL —— LLM 与渲染器之间的合同

LLM **不画像素**。LLM 输出一个 JSON 脚本，渲染器（`stage.js`）解释执行并循环播放。
这是「回答用户提问」的唯一输出形式：**回答 = 一段 10–20 秒的循环动画 + 一条不动的字幕**。

## 脚本格式

```json
{
  "caption": "字幕。一句话，≤50 字，解释画面在向用户说明什么。必填。",
  "duration": 15,
  "backdrop": "ground",
  "actors": [
    { "sprite": "hero",  "behavior": "idle", "x": 44 },
    { "sprite": "coin",  "behavior": "fall", "x": 20, "count": 5 },
    { "sprite": "flame", "behavior": "blink", "x": 76, "y": 30 }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `caption` | **必填**。静态字幕，渲染在画面框下方，整个循环期间不变。写法规范见 `skill/bazi-voice/SKILL.md` 的字幕节 |
| `duration` | 一个循环的秒数，10–20，超出会被钳制 |
| `backdrop` | `ground`（默认，地面线）/ `rain`（下雨+地面）/ `none` |
| `actors` | ≤12 个。渲染顺序 = 数组顺序（后画的在上层） |

## 画布坐标

逻辑画布 **120 × 48**，地面线 y=40。x 从左 0 到右 120。
主角 2×（32 高，脚在地面时 y 自动处理），其他默认 1×。

## sprite 与 behavior 白名单（超出即校验失败）

| sprite | 可用 behavior | 参数 | 含义 |
|---|---|---|---|
| `hero` | `idle` `walk` `curl` `shrug` `cheer` | walk: `range:[x1,x2]` `speed` | 主角（日主，五行配色自动） |
| `ghost` | `idle` `approach` | approach: `range:[x1,x2]` | 灰紫剪影（他人） |
| `rival` | `idle` `approach` | 同上 | 蓝剪影（劫财/第三方） |
| `coin` | `fall` `drift` | fall: `count` `period`；drift: `from` `to` | 金币（财） |
| `flame` | `blink` `steady` | `x` `y` | 火（能量/表达） |
| `torch` | `lit` `off` `flicker` | `x` | 火把（事业路标） |
| `basket` | — | `x` | 筐（承接/金舆） |
| `umbrella` | — | `x` | 伞（印/照顾） |
| `wall` | — | `x` | 砖墙（庇护/边界） |
| `lid` | — | `x` `y` `w` | 盖子（压制，配 bubbles） |
| `bubbles` | `rise` | `x` `count` `ceiling` | 上冒的话（表达欲） |
| `crack` | — | `x` `len` | 地面裂缝（坐死/不稳） |
| `qmark` | `blink` | `x` `y` | 问号 |
| `ban` | — | `x` `y` | 禁止圈（越界问题） |
| `orbit` | `wuxing` | — | 五行粒子环绕（读 chart 数据，密度=占比） |
| `tiles` | — | — | 四柱地砖（读 chart，颜色=各柱五行，配 hero.walk 表示人生四段） |

## 组合语义（给 LLM 的提示）

画面语言靠**组合**表达，不靠新增 sprite：

- 「财留不住」= coin.fall 多个 + basket 放在很靠右的位置
- 「被照顾但被围」= umbrella + wall
- 「表达被压」= lid + bubbles.rise
- 「有第三方」= hero + ghost + rival.approach
- 「后半程才亮」= 一排 torch.off + 最右一支 torch.lit + hero.walk 向右
- 「内耗」= backdrop:rain + hero.curl + flame.blink（怀里的火没灭）

## 校验规则（渲染器强制执行）

1. `caption` 缺失或 >60 字 → 拒绝整个脚本
2. sprite / behavior 不在白名单 → 拒绝
3. `duration` 钳制到 [10, 20]
4. actors > 12 → 截断
5. 校验失败时渲染器回退到关键词路由的预置场景，**绝不黑屏**

## 边界场景

涉及寿命/灾祸等红线问题（见 `skill/bazi-reading/references/boundaries.md`），
LLM 必须返回固定脚本：`hero.shrug + ban`，caption 用温和的拒答语。
