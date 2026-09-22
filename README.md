# 火星 // 栖息地

基于 Three.js + Vite 的火星城市建造器。

## 功能

- 通过黄色边框选择可建造地块。
- 建造七种火星建筑，包括索利斯太阳能场。
- 城市在迷雾下程序化扩张。
- 点击已建成建筑查看所有者钱包与房产信息。
- 右侧显示 SPCX / BNB 城市活动面板。
- 钱包、区块和购买记录在当前版本中用于游戏演示。
- 进度保存在浏览器 `localStorage` 中。
- 支持拖动旋转与滚轮缩放。
- 启动时显示火星殖民地加载器。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址即可。

## 构建

```bash
npm run build
npm run preview
```

## 部署到 Vercel

该项目是标准 Vite 静态站点，Vercel 会使用以下设置：

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

## 说明

SPCX、钱包、区块和购买活动目前由前端生成，用于展示游戏体验。当前版本不会请求钱包签名，也不会转移真实 BNB 或 SPCX。
