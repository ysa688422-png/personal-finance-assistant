# 长桥 API 接入

本项目把用户自己的记录与外部数据分开管理。外部投资数据仅来自长桥 API；原页面中的手工交易、持仓和优惠记录仍是用户输入。`长桥数据.html` 是一个独立的只读入口，查询结果不会自动改写个人账本。

## 接入方式

```text
本机数据面板 → 同源 GET 接口 → 官方 longport SDK → 长桥 OpenAPI
                   ↑
             凭证仅在本机进程环境
```

仓库固定使用 `longport==4.3.7`，运行网关需 Python 3.9 或更高版本。实现已对照[官方 Python SDK 文档](https://longportapp.github.io/openapi/python/reference_all/)与[官方 4.3.7 发布包](https://pypi.org/project/longport/4.3.7/)，并检查已安装 SDK 的真实方法签名。验证使用模拟返回值，没有读取真实账户或真实行情。

Codex 中已连接的长桥插件属于当前应用的连接权限。独立运行本仓库时，仍需自行取得 SDK 凭证；应用连接不会自动转成仓库环境变量。

## 在本机启动

在仓库根目录执行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-longbridge.txt
```

从长桥开发者后台取得自己的 `LONGPORT_APP_KEY`、`LONGPORT_APP_SECRET`、`LONGPORT_ACCESS_TOKEN`，只设置在当前终端环境。macOS / Linux 可使用下面的方式输入，避免密钥出现在命令历史和仓库文件里：

```bash
read -r -s LONGPORT_APP_KEY
export LONGPORT_APP_KEY
read -r -s LONGPORT_APP_SECRET
export LONGPORT_APP_SECRET
read -r -s LONGPORT_ACCESS_TOKEN
export LONGPORT_ACCESS_TOKEN
python3 tools/longbridge_gateway.py --max-seconds 7200
```

每条 `read` 执行后输入对应值并回车。不要把真实值写进 HTML、截图或 Git 提交。网关直接读取当前进程环境，不读取 `.env` 文件；若设置了 `LONGPORT_LOG_PATH`，网关会拒绝查询，避免持仓响应进入 SDK 日志。不要为这个网关启用该日志变量。

随后打开本机入口：

- `http://127.0.0.1:4190/长桥数据.html`，会转到投资目录内的面板。
- `http://127.0.0.1:4190/洒一投资工具箱/长桥数据.html`，可直接访问。

网关仅绑定 `127.0.0.1`，默认运行最长 2 小时，可在终端按 `Ctrl+C` 提前结束；端口占用时明确报错并退出，不自动重试，不停止已有服务，不创建自启或守护任务。关闭浏览器页不会结束终端中的网关。会话时限在每次请求完成后检查，正在执行的 SDK 调用可能延迟退出；需要立即结束时在该终端按 `Ctrl+C`。

需要手动读取自己的持仓时，先结束原网关，再启动：

```bash
python3 tools/longbridge_gateway.py --allow-positions --max-seconds 7200
```

持仓只有点击面板按钮时读取。查询结果只显示在当前页，不写入浏览器存储、磁盘、仓库或原持仓页面，可随时清除。

## 已实现的只读接口

所有响应使用统一信封：成功为 `{ok:true, source:"Longbridge OpenAPI", queried_at:"ISO8601", data:{...}}`，失败为 `{ok:false, source, queried_at, error:{code,message}}`。`queried_at` 是本次查询发起时间，不能当成上游数据更新时间。

数据接口要求请求头 `X-Finance-Request: 1`。`status` 不要求此头，也不会验证远端连接。仅接受本机同源请求，没有开放跨域权限。接收器代理调用此网关时应设置该请求头，并使用网关自身的 Host，不转发浏览器 Origin。

| 路径（共同前缀 `/api/longbridge/`） | 参数 | SDK 方法 | 返回内容 |
| --- | --- | --- | --- |
| `status` | 无 | 不调用远端 | 凭证是否设置、SDK 版本、持仓开关、能力范围 |
| `quotes` | `symbols` | `QuoteContext.static_info` + `quote` | `quotes`、`missing_symbols`、币种与每条报价时间 |
| `option-quotes` | `symbols` | `QuoteContext.static_info` + `option_quote` | 报价与到期日、行权价、乘数等合约字段 |
| `positions` | 可选 `symbols` | `TradeContext.stock_positions` | `positions`；默认禁用，需要 `--allow-positions` |
| `exchange-rates` | 无 | `PortfolioContext.exchange_rate` | `rates`：方向明确的原始币种对 |
| `ipo-calendar` | `start`、`end` | `CalendarContext.finance_calendar`，类型 `Ipo`、市场 `HK` | `groups` 日历事件与 `next_date` 后续页起点 |
| `offers` | 无 | 未接入 | HTTP 501，`offers_unavailable` |

证券代码必须包含市场后缀，例如官方支持的 `.US`、`.HK`；接口不猜测市场。每次最多 20 个代码，去除重复。IPO 日期格式为 `YYYY-MM-DD`，每次区间不超过 31 天。`next_date` 非空表示还有后续页；面板不把当前页称为完整清单。

报价和持仓中的 SDK `Decimal` 原样序列化为字符串，避免把金额转换成二进制浮点而丢失精度。未返回字段为 `null`，证券未返回会列入 `missing_symbols`。行情是否延迟需以长桥权限和上游时间为准，本项目不默认宣称所有报价实时。

汇率输出采用：

```json
{
  "rates": [
    {
      "from_currency": "BBB",
      "to_currency": "AAA",
      "rate": 2.0,
      "bid_rate": 1.9,
      "offer_rate": 2.1,
      "rate_unit": "to_currency per 1 from_currency"
    }
  ],
  "as_of": null,
  "timestamp_note": "上游汇率结果未提供时间戳；queried_at 为本次查询时间。"
}
```

以上是虚构币种的结构示例，不是真实汇率。官方 SDK 的 `average_rate` 定义为 `base_currency per other_currency`，因此映射为 `from_currency=other_currency`、`to_currency=base_currency`。网关不生成反向或交叉币种对；前端如据此换算，需标注为计算值。SDK 没有在此返回结构中提供汇率时间戳，不能声称是某时点的实时成交汇率。

## 各板块的范围

- **正股**：读取报价和基本币种字段；个人持仓、成本及复盘仍由用户自己管理。
- **期权**：读取完整合约代码对应的报价与合约信息，不执行策略、不下单。
- **港股打新**：接入 IPO 日历。IPO 日历不能代替申购状态、融资成本、配售结果、中签概率或个人投资判断。
- **港股开户与拉新优惠**：保留手工活动记录，标注为用户输入。本项目没有接入活动资格、有效期、邀请返佣或奖励核验接口；“未接入”不等于现实中没有该活动。

凭证失效、网络失败、无行情权限、限流或字段缺失时，显示错误或缺项，不从其他来源补数据。错误响应不转发上游原始报错，避免其中的签名 URL、令牌或账户资料泄露；可据错误类型检查本机配置。

## 本机、手机与 GitHub 展示

4190 网关可独立提供四个发布版投资模块、数据面板及精确白名单中的品牌图片与脚本。它不提供整个文件夹，不列目录，不服务 `.env`、运行数据、备份、证书或源码文件；允许文件也不能借符号链接映射到其他文件。投资页面的“返回主页”链接会转到 `http://127.0.0.1:4176/`，需按部署说明另外启动同步接收器。

如按部署说明运行手机同步接收器，桌面 `127.0.0.1:4176` 入口可经接收器的固定只读代理访问已启动的 4190 网关。代理不会启动网关，持仓开关仍在 4190 控制；手机端不应因此开放本机投资账户接口。具体代理访问限制以接收器实现为准。

GitHub 静态展示可以查看页面布局与全部源码。公网静态页面不会直接读取本机账户，不保存密钥；需要实时查询时，按上述说明在本机启动网关并从本机地址打开。

## 验证

```bash
python3 -m unittest discover -s tests -p 'test_longbridge_gateway.py' -v
```

测试覆盖报价与期权的读取路由、十进制精度、时间保留、汇率方向、IPO 分页、持仓默认禁用、错误脱敏、仅 GET、同源与 Host 校验、静态白名单、路径穿越和符号链接限制。测试只用模拟对象；临时 HTTP 服务绑定随机本机端口，设定 30 秒停止上限，并在测试结束后关闭。
