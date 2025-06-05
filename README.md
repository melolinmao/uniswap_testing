# QA Harness for Uniswap V3 (Demo)

此仓库演示如何使用 Foundry/Forge 与 Ethers.js，在本地 Anvil Fork 上快速搭建一个简化版的 Uniswap V3 QA 系统，包括：

- **CoreSuite（Foundry/Forge）**：基于 Uniswap V3 官方合约做单元测试（pool init、mint、swap、feeGrowth 等），实现 ≥80% 行覆盖率与 ≥70% 分支覆盖率。
- **Swap-Flow（Node 脚本 + Ethers.js）**：端到端完整流程演示，从"增加流动性 → Swap → 移除流动性"，并打印余额变化与交易 Hash。
- **Docker Compose**：一键启动 Anvil Fork，Fork 最新主网。

以下是项目整体说明与使用指南。

---

## 目录结构

```
core-tests/
├── lib/
├── src/
├── test/
│   └── PoolTest.t.sol
├── foundry.toml
└── remappings.txt

swap-flow/
├── package.json
├── README.md
└── scripts/
    └── swapFlow.js

docker-compose.yml
README.md
.gitignore
```

- **core-tests/**：Foundry 项目，用于 CoreSuite 单元测试与模糊测试，涵盖 Uniswap V3 核心逻辑。
- **swap-flow/**：Node 脚本示例，用于演示端到端交易流程：增加流动性、Swap、移除流动性。
- **docker-compose.yml**：用于启动 Anvil Fork 服务，Fork 最新以太坊主网。
- **README.md**（本文件）：项目整体快速启动指南。
- **.gitignore**：忽略项配置。

---

## 先决条件

1. **Foundry 工具**  
   - 参考官方文档安装：https://book.getfoundry.sh/  
   - 确保可以使用 `forge`、`anvil` 等命令。

2. **Node.js**  
   - 建议使用 v16+ 或 v18+ 版本。  
   - 本示例使用 Ethers.js，版本已在 `swap-flow/package.json` 中指定。

3. **主网 JSON-RPC 节点 URL**  
   - 例如 Alchemy、Infura 提供的以太坊主网 API。  
   - 在本地环境中设置环境变量：  
     ```bash
     export RPC_URL="https://eth-mainnet.alchemyapi.io/v2/你的API_KEY"
     ```
   - 只要后续任何步骤需要 Fork 主网，都将使用此环境变量。

4. **Docker & Docker Compose**  
   - 用于快速启动 Anvil Fork 容器。  
   - 确保本机可以正常运行 Docker。

---

## 1. 启动 Anvil Fork

在项目根目录执行：

```bash
docker-compose up -d
```
这会拉取官方 ghcr.io/foundry-rs/anvil:latest 镜像，并以 Fork 最新主网的方式启动 Anvil，监听本地 8545 端口。

等待 3–5 秒，让 Anvil 完全启动并 Fork 所需区块。

可通过以下命令确认 Anvil 是否在本地正常运行：

```bash
curl http://localhost:8545
```
如果返回 JSON-RPC 响应，即表示 Fork 服务已就绪。

---

## 2. 运行 CoreSuite（Foundry/Forge）

CoreSuite 部分放在 core-tests/ 目录，使用 Foundry/Forge 进行单元测试、模糊测试与覆盖率检查。

### 2.1. 进入目录并安装依赖

```bash
cd core-tests
```
首次运行时需执行：

```bash
forge install Uniswap/v3-core       # 安装 @uniswap/v3-core 合约库
forge install Uniswap/v3-periphery  # 安装 @uniswap/v3-periphery 合约库
```
安装完成后，lib/ 目录下会出现 v3-core/ 与 v3-periphery/ 两个子目录，Foundry 会自动解析 remappings。

### 2.2. Foundry 配置说明

**foundry.toml**：

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
tests = "test"

[profile.release]
optimize = true
optimize_runs = 200

[profile.coverage]
threshold = 80
```

**remappings.txt**（由 forge install 自动生成）应包含：

```
@uniswap/v3-core/=lib/v3-core/
@uniswap/v3-periphery/=lib/v3-periphery/
```

### 2.3. 编写测试文件

示例测试位于 `core-tests/test/PoolTest.t.sol`。该文件包含：

- TickMath 互转测试：验证 TickMath.getSqrtRatioAtTick 与 TickMath.getTickAtSqrtRatio 在若干点的自洽性。
- 简单 Swap FeeGrowth 测试：Fork 主网后，从 USDC 巨鲸地址借 USDC，调用 swapExactInputSingle 后检查池子中手续费是否累积。

（如果需要扩展更多测试用例，可在同目录下新增 .t.sol 文件）

### 2.4. 运行测试

确保已设置环境变量 RPC_URL，然后执行：

```bash
forge test --fork-url $RPC_URL
```

Foundry 会自动编译合约，将测试部署到本地 Anvil Fork，然后执行断言。

如果某个断言失败，会在控制台打印错误信息并标红。

### 2.5. 查看覆盖率（可选）

```bash
forge coverage --fork-url $RPC_URL
```

执行后将生成覆盖率报告，默认输出在 core-tests/coverage/ 目录下，包含 HTML 文件 index.html。

打开该 HTML，即可查看行覆盖率与分支覆盖率是否满足 ≥80% / ≥70% 的要求。

---

## 3. 运行 Swap-Flow（Node 脚本 + Ethers.js）

Swap-Flow 部分位于 swap-flow/ 目录，用于演示端到端交易流程：先增加流动性，再 Swap，最后移除流动性，并打印每个步骤的余额变化与交易哈希。

### 3.1. 进入目录并安装依赖

```bash
cd swap-flow
npm install
```

本示例仅依赖 ethers，无需额外测试框架。

### 3.2. 脚本说明

`swap-flow/scripts/swapFlow.js` 中包含完整流程：

- 连接本地 Anvil Fork（RPC 地址为 http://localhost:8545）。
- 当前默认使用 Anvil 提供的第一个测试账户（索引 0）为主地址，打印初始 WETH 与 USDC 余额。
- Impersonate 主网 USDC 巨鲸账户（0x55fe002aeff02f77364de339a1292923a15844b8），并将 1000 USDC 转给测试账户。
- 批准 NonfungiblePositionManager 合约，以便后续 mint() 增加流动性。
- 调用 mint() 向 WETH/USDC 0.3% 池子挂入 1 WETH + 3000 USDC。
- 拿到新生成的 tokenId，并打印交易哈希与新 PositionId。
- 调用 swapExactInputSingle() 做一次 0.1 WETH → USDC 的 Swap，并打印交易结果与余额变化。
- 查 positions(tokenId) 获取剩余流动性，调用 decreaseLiquidity() 将剩余全部移出，然后调用 collect() 收回 Token + 手续费，打印最终余额。
- 整个脚本执行完成后，打印"End of Demo"结束。

### 3.3. 运行脚本

确保 Docker Compose 中的 Anvil 正在运行，且 Fork 最新主网后处于就绪状态，然后在 swap-flow/ 目录下执行：

```bash
npm run swap
```

示例输出（简化示例）：

```
=== 流程 Step 0：
  测试账户地址： 0xYourTestAddress
  WETH 余额： 0.0
  USDC 余额： 0 USDC

---- 池：从USDC 巨鲸给测试账户转 1000 USDC ----
  转账后 WETH 余额： 0.0
  转账后 USDC 余额： 1000 USDC

---- 批准 NonfungiblePositionManager 增加流动性 ----
（等待若干秒）

---- 执行 mint() -> 增加流动性 ----
  Mint tx hash: 0xMintTransactionHash
  获得新 PositionId = 12345
  增加流动性后 WETH 余额： 0.0
  增加流动性后 USDC 余额： 997.0 USDC

---- 执行 swapExactInputSingle (0.1 WETH -> USDC) ----
  Swap tx hash: 0xSwapTransactionHash
  Swap 后 WETH 余额： 0.0
  Swap 后 USDC 余额： 1005.0 USDC

---- 执行 decreaseLiquidity & collect (移除流动性并领取 Token) ----
  Collect tx hash: 0xCollectTransactionHash
  最终 WETH 余额： 0.9
  最终 USDC 余额： 2998.0 USDC

===== End of Demo =====
```

输出中可以清晰看到每一步操作前后测试账户的 WETH/USDC 余额变化。

---

## 4. .gitignore

建议添加以下内容，可根据实际情况自行调整：

```
# Node.js
node_modules/

# Foundry
core-tests/out/
core-tests/cache/
core-tests/lib/v3-core/.git/
core-tests/lib/v3-periphery/.git/

# Docker
anvil-fork/

# macOS
.DS_Store
```

---

## 5. 后续扩展与自定义

### CoreSuite 扩充测试

在 core-tests/test/ 下新增更多 .t.sol，例如：

- 完整的 mint → burn → collect 流程联合测试
- swapExactOutputSingle 的多种边界断言
- 定义不变式测试（x * y ≥ 初始值、tick 范围精度等）
- 引入 fuzz 测试：可在 foundry.toml 中配置 fuzz 次数，并在脚本里使用 `forge test --fork-url $RPC_URL --match-test testFuzzSwap`。

### Swap-Flow 改用 Playwright

如果需要无头 UI 演示，可创建一个最简 React 页面，或使用 Playwright 脚本模拟 Metamask 等行为。

可配置 Playwright 报告（JSON、HTML），在 CI 中上传为工件。

### 加载测试（Loadtest）

在根目录新建 loadtest/ 目录，并编写 Foundry 脚本 spamSwaps.s.sol，用于批量 swapExactInputSingle。

解析 forge gas-summary 输出，生成延迟 CSV，验证 p99 ≤ 2s。

### CI/CD 集成

在 .github/workflows/ci.yml 中添加以下 Job：

**CoreSuite Job：**

```yaml
- name: Run CoreSuite Tests
  run: |
    cd core-tests
    forge test --fork-url ${{ secrets.RPC_URL }}
```

**Swap-Flow Job：**

```yaml
- name: Run Swap-Flow Demo
  run: |
    cd swap-flow
    npm ci
    npm run swap
```

可将覆盖率报告、Swap-Flow 日志等结果上传为 GitHub Actions 工件。

定义失败条件：行覆盖率不足、Slither 高严重度、脚本断言失败等都会让 CI 任务标红，阻止合并。

### 静态安全扫描（Slither）

在 CoreSuite 的 CI Job 中，添加：

```bash
pip install slither-analyzer
slither core-tests/src --fail-on-high-severity
```

如果 Slither 检测到高严重度缺陷，则立刻失败，不再执行后续测试。

---

## 6. 快速一览

在根目录设置 RPC_URL：

```bash
export RPC_URL="https://eth-mainnet.alchemyapi.io/v2/你的API_KEY"
```

启动 Anvil Fork：

```bash
docker-compose up -d
```

等待几秒钟让 Fork 完成。

运行 CoreSuite：

```bash
cd core-tests
forge install
forge test --fork-url $RPC_URL
forge coverage --fork-url $RPC_URL    # 查看覆盖率（可选）
```

运行 Swap-Flow：

```bash
cd swap-flow
npm install
npm run swap
```

恭喜！至此你已完成一个最简版的 Uniswap V3 QA Demo，它包含：
