// swap-flow/scripts/swapFlow.js

/**
 * 完整流程：
 *  1. 连接本地 Anvil Fork
 *  2. 从主网“USDC 巨鲸”拿一点 USDC 到本地测试账户
 *  3. 批准 NonfungiblePositionManager 增加流动性
 *  4. 调用 mint() 增加 WETH/USDC 0.3% 池的流动性
 *  5. swapExactInputSingle (WETH -> USDC)
 *  6. decreaseLiquidity + collect() 来移除流动性并取回 Token + 手续费
 *  7. 打印每一步前后主账户的余额变化与 tx Hash
 */

import { ethers } from "ethers";
import fs from "fs";

async function main() {
  //——— 1. 连接本地 Anvil Fork ———
  const RPC_URL = "http://localhost:8545";
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  // 默认第一个账户用来做测试
  const signer = provider.getSigner(0);
  const signerAddress = await signer.getAddress();

  //——— 2. 定义常量地址（以太坊主网地址） ———
  const WETH_ADDR         = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC_ADDR         = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eb48";
  const FACTORY_ADDR      = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const POSITION_MANAGER  = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const SWAP_ROUTER_ADDR  = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const POOL_FEE          = 3000;   // 0.3%

  //——— 3. ABI 载入 ———
  const erc20Abi            = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function transfer(address,uint256) returns (bool)"
  ];
  const positionManagerAbi  = JSON.parse(
    fs.readFileSync(
      "node_modules/@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
      "utf-8"
    )
  ).abi;
  const swapRouterAbi       = JSON.parse(
    fs.readFileSync(
      "node_modules/@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json",
      "utf-8"
    )
  ).abi;

  const token0 = new ethers.Contract(WETH_ADDR, erc20Abi, signer);
  const token1 = new ethers.Contract(USDC_ADDR, erc20Abi, signer);
  const positionManager = new ethers.Contract(POSITION_MANAGER, positionManagerAbi, signer);
  const swapRouter = new ethers.Contract(SWAP_ROUTER_ADDR, swapRouterAbi, signer);

  console.log("=== 流程 Step 0：")
  console.log("  测试账户地址：", signerAddress);
  console.log("  WETH 余额：", ethers.utils.formatEther(await token0.balanceOf(signerAddress)));
  console.log("  USDC 余额：", (await token1.balanceOf(signerAddress)).toString() / 1e6, "USDC");

  //——— 4. 从“USDC 巨鲸”借点 USDC 给测试账户 ———
  const USDC_WHALE = "0x55fe002aeff02f77364de339a1292923a15844b8";
  console.log("---- 池：从USDC 巨鲸给测试账户转 1000 USDC ----");
  await provider.send("hardhat_impersonateAccount", [USDC_WHALE]);
  const whaleSigner = provider.getSigner(USDC_WHALE);
  const usdcWithWhale = token1.connect(whaleSigner);
  // 转 1000 USDC
  await usdcWithWhale.transfer(signerAddress, ethers.utils.parseUnits("1000", 6));
  await provider.send("hardhat_stopImpersonatingAccount", [USDC_WHALE]);

  console.log("  转账后 WETH 余额：", ethers.utils.formatEther(await token0.balanceOf(signerAddress)));
  console.log("  转账后 USDC 余额：", (await token1.balanceOf(signerAddress)).toString() / 1e6, "USDC");

  //——— 5. approve NonfungiblePositionManager ———
  const approveAmount0 = ethers.utils.parseEther("10");          // 给够 10 WETH
  const approveAmount1 = ethers.utils.parseUnits("50000", 6);   // 给够 50000 USDC
  console.log("---- 批准 NonfungiblePositionManager 增加流动性 ----");
  await token0.approve(POSITION_MANAGER, approveAmount0);
  await token1.approve(POSITION_MANAGER, approveAmount1);

  //——— 6. mint() 增加流动性（WETH/USDC 0.3% 池） ———
  console.log("---- 执行 mint() -> 增加流动性 ----");
  const mintParams = {
    token0: WETH_ADDR,
    token1: USDC_ADDR,
    fee: POOL_FEE,
    tickLower: -60000,
    tickUpper: 60000,
    amount0Desired: ethers.utils.parseEther("1"),      // 1 WETH
    amount1Desired: ethers.utils.parseUnits("3000", 6),
    amount0Min: 0,
    amount1Min: 0,
    recipient: signerAddress,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10
  };
  const txMint = await positionManager.mint(mintParams);
  const receiptMint = await txMint.wait();
  console.log("  Mint tx hash:", receiptMint.transactionHash);

  // 拿到刚刚 mint 后的 positionId（通过 IncreaseLiquidity 事件）
  let tokenId = 0;
  for (const e of receiptMint.events) {
    if (e.event === "IncreaseLiquidity") {
      tokenId = e.args.tokenId;
      break;
    }
  }
  if (tokenId == 0) {
    console.error("  ⚠️ 未能在 mint 收据中解析到 tokenId");
    process.exit(1);
  }
  console.log("  获得新 PositionId =", tokenId.toString());

  console.log("  增加流动性后 WETH 余额：", ethers.utils.formatEther(await token0.balanceOf(signerAddress)));
  console.log("  增加流动性后 USDC 余额：", (await token1.balanceOf(signerAddress)).toString() / 1e6, "USDC");

  //——— 7. Swap WETH -> USDC ———
  console.log("---- 执行 swapExactInputSingle (0.1 WETH -> USDC) ----");
  const amountIn = ethers.utils.parseEther("0.1");
  // 要先批准给 Router
  await token0.approve(SWAP_ROUTER_ADDR, amountIn);

  const swapParams = {
    tokenIn: WETH_ADDR,
    tokenOut: USDC_ADDR,
    fee: POOL_FEE,
    recipient: signerAddress,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
    amountIn: amountIn,
    amountOutMinimum: 0,       // 为了 Demo 简化，直接设 0
    sqrtPriceLimitX96: 0       // 不设限价
  };
  const txSwap = await swapRouter.exactInputSingle(swapParams, { gasLimit: 500000 });
  const receiptSwap = await txSwap.wait();
  console.log("  Swap tx hash:", receiptSwap.transactionHash);
  console.log("  Swap 后 WETH 余额：", ethers.utils.formatEther(await token0.balanceOf(signerAddress)));
  console.log("  Swap 后 USDC 余额：", (await token1.balanceOf(signerAddress)).toString() / 1e6, "USDC");

  //——— 8. 移除流动性：decreaseLiquidity + collect ———
  console.log("---- 执行 decreaseLiquidity & collect (移除流动性并领取 Token) ----");
  // 先查一下 position 当前还剩多少 liquidity
  const positionInfo = await positionManager.positions(tokenId);
  const liquidityRemaining = positionInfo.liquidity;

  // 调用 decreaseLiquidity，将全部剩余流动性都取出
  const decParams = {
    tokenId: tokenId,
    liquidity: liquidityRemaining,
    amount0Min: 0,
    amount1Min: 0,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10
  };
  const txDec = await positionManager.decreaseLiquidity(decParams);
  await txDec.wait();

  // collect：把所有 Token 和手续费都收回来
  const collectParams = {
    tokenId: tokenId,
    recipient: signerAddress,
    amount0Max: ethers.constants.MaxUint128,
    amount1Max: ethers.constants.MaxUint128
  };
  const txCollect = await positionManager.collect(collectParams);
  const receiptCollect = await txCollect.wait();
  console.log("  Collect tx hash:", receiptCollect.transactionHash);

  console.log("  最终 WETH 余额：", ethers.utils.formatEther(await token0.balanceOf(signerAddress)));
  console.log("  最终 USDC 余额：", (await token1.balanceOf(signerAddress)).toString() / 1e6, "USDC");

  console.log("===== End of Demo =====");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
