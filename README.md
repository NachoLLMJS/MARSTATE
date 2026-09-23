# 火星 // 栖息地

基于 Three.js、Vite 与 BNB Mainnet 的火星城市建造器。

## 链上合约

- 网络：BNB Smart Chain Mainnet（Chain ID `56`）
- Mars City House ERC-721：`0x7208F28214A6DFf44bCcF37edbAbF6A69039aAf1`
- 支付代币 SpaceX / SPCXB：`0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1`
- 房屋价格：`10,000 SPCXB`
- 开发者收款钱包：`0x15eB7CEf7684524d600F87fF402B017D37139C36`
- 部署交易：`0xd32b62ff7c4b0ebdd5ecfcae6a2b56bc943d62a73cb90e1ddadc8f915d5aeb34`
- 部署区块：`123480145`
- Sourcify：creation/runtime `exact_match`

购买流程是两笔明确的钱包交易：

1. 用户批准 Mars City House 合约使用恰好 `10,000 SPCXB`。
2. 用户调用 `mintHouse(plotId, model)` 铸造 ERC-721 房屋。

SPCXB 由合约通过 `transferFrom` 直接发送到固定开发者钱包；合约不保管正常购买款。只有成功回执和 `HouseMinted` 事件才会把房屋写入城市状态并触发地图扩张。

## 功能

- 通过黄色边框选择可购买地块。
- 七种火星建筑共享同一个链上价格。
- 同一 `plotId` 不能重复铸造。
- ERC-721 房屋可以转让；界面读取当前链上所有者。
- 铸造成功后，城市在连续迷雾下程序化扩张。
- 右侧活动面板读取真实 `HouseMinted` 事件和当前 BNB Mainnet 区块。
- 钱包连接只在用户点击后发生。
- 支持错误网络、无钱包、余额不足、授权拒绝、铸造拒绝和 RPC 暂时不可用状态。
- Dev 可以暂停/恢复铸造和 NFT 转移。
- Dev 只有在暂停后才能恢复误发到合约的 BNB 或 ERC-20。

## 五座创世视觉房屋

首次打开时会显示五座由开发者钱包拥有的城市创世房屋。它们是视觉初始状态，不是预铸造 NFT。房产弹窗和活动面板明确标记为 `视觉创世 / 非链上 NFT`，不会伪装成链上购买。

真实铸造房屋使用 `链上确认` 状态，并显示区块、交易记录与从合约读取的所有者。

## 本地运行

```bash
npm install
npm run dev
```

## 合约测试与前端构建

```bash
npx hardhat test test/MarsHouseNFT.test.cjs
npm run build
```

合约测试覆盖：固定 SPCXB 支付、直接开发者收款、唯一地块、七个模型、暂停权限、ERC-721 转移冻结、BNB/ERC-20 emergency recovery，以及地图所需的房屋数据。

## 安全边界

- 私钥不在仓库、前端 bundle 或部署记录中。
- 前端不声称失败或待处理的交易成功。
- 链上购买需要成功 receipt 和 `HouseMinted` 事件。
- 每次加载都从合约的 `houseInfo` 重建链上房屋；浏览器缓存从不作为 NFT 所有权依据。
- 外部部署环境文件位于项目目录之外。
- 当前 `baseURI` 尚未设置；房屋的地块、模型和所有者由合约公开映射提供。上线前不会伪造或指向临时 NFT metadata。
