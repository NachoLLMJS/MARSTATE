const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = process.env.MARS_HOUSE_ENV || path.resolve(ROOT, '..', 'Mars-City-Builder-DEPLOY.env');
const ARTIFACT_PATH = path.join(ROOT, 'artifacts-hardhat', 'contracts', 'MarsHouseNFT.sol', 'MarsHouseNFT.json');
const JOURNAL_PATH = path.join(ROOT, 'deployment', 'bnb-mainnet-mars-house-v2.json');
const EXPECTED_DEV = '0x15eB7CEf7684524d600F87fF402B017D37139C36';
const EXPECTED_SPCXB = '0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1';
const EXPECTED_PRICE = ethers.parseEther('0.02');

function readEnv(file) {
  const result = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('=');
    if (split > 0) result[line.slice(0, split)] = line.slice(split + 1).trim();
  }
  return result;
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

async function main() {
  const broadcast = process.argv.includes('--broadcast');
  const env = readEnv(ENV_PATH);
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(env.PRIVATE_KEY || '')) throw new Error('PRIVATE_KEY missing or malformed');
  if (env.CHAIN_ID !== '56') throw new Error('CHAIN_ID must be 56');
  if (!fs.existsSync(ARTIFACT_PATH)) throw new Error('Compile and test the exact artifact first');

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  const provider = new ethers.JsonRpcProvider(env.RPC_URL, 56, { staticNetwork: true });
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const signer = await wallet.getAddress();
  if (signer.toLowerCase() !== EXPECTED_DEV.toLowerCase()) throw new Error(`Signer mismatch: ${signer}`);
  if ((await provider.getNetwork()).chainId !== 56n) throw new Error('Wrong network');

  const spxcbCode = await provider.getCode(EXPECTED_SPCXB);
  if (spxcbCode === '0x') throw new Error('SPCXB has no bytecode');
  const token = new ethers.Contract(EXPECTED_SPCXB, [
    'function name() view returns(string)', 'function symbol() view returns(string)', 'function decimals() view returns(uint8)'
  ], provider);
  const [name, symbol, decimals] = await Promise.all([token.name(), token.symbol(), token.decimals()]);
  if (name !== 'SpaceX' || symbol !== 'SPCXB' || decimals !== 18n) throw new Error('Unexpected SPCXB identity');

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployTx = await factory.getDeployTransaction();
  const nonceLatest = await provider.getTransactionCount(signer, 'latest');
  const noncePending = await provider.getTransactionCount(signer, 'pending');
  if (nonceLatest !== noncePending) throw new Error('Signer has a pending transaction');
  const predictedAddress = ethers.getCreateAddress({ from: signer, nonce: noncePending });
  if ((await provider.getCode(predictedAddress)) !== '0x') throw new Error('Predicted address already has bytecode');

  const gasEstimate = await provider.estimateGas({ ...deployTx, from: signer });
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
  const required = gasEstimate * gasPrice * 125n / 100n;
  const balance = await provider.getBalance(signer);
  const report = {
    mode: broadcast ? 'broadcast' : 'dry-run', chainId: 56, signer, nonce: noncePending,
    predictedAddress, spxcb: ethers.getAddress(EXPECTED_SPCXB), spxcbName: name, spxcbSymbol: symbol,
    priceRaw: EXPECTED_PRICE.toString(), creationBytes: (artifact.bytecode.length - 2) / 2,
    runtimeBytes: (artifact.deployedBytecode.length - 2) / 2, gasEstimate: gasEstimate.toString(),
    gasPrice: gasPrice.toString(), requiredWith25PctHeadroom: required.toString(), balance: balance.toString(),
    enoughBalance: balance >= required
  };
  console.log(JSON.stringify(report, null, 2));
  if (balance < required) throw new Error('Insufficient BNB for deployment with 25% headroom');
  if (!broadcast) return;
  if (env.BROADCAST !== 'true' && process.env.BROADCAST !== 'true') throw new Error('Set BROADCAST=true in the external env or process to authorize broadcast');
  if (fs.existsSync(JOURNAL_PATH)) throw new Error('Deployment journal already exists; refusing duplicate broadcast');

  const prepared = {
    status: 'prepared', chainId: 56, signer, nonce: noncePending, predictedAddress,
    creationCodeHash: ethers.keccak256(artifact.bytecode), preparedAt: new Date().toISOString(),
    publicInputs: { dev: EXPECTED_DEV, spxcb: EXPECTED_SPCXB, housePrice: EXPECTED_PRICE.toString() }
  };
  atomicWrite(JOURNAL_PATH, prepared);
  const sent = await wallet.sendTransaction({ ...deployTx, gasLimit: gasEstimate * 120n / 100n });
  atomicWrite(JOURNAL_PATH, { ...prepared, status: 'broadcast', transactionHash: sent.hash });
  const receipt = await sent.wait(3);
  if (!receipt || receipt.status !== 1) throw new Error('Deployment reverted');
  if (receipt.contractAddress.toLowerCase() !== predictedAddress.toLowerCase()) throw new Error('Address mismatch');

  const deployed = new ethers.Contract(receipt.contractAddress, artifact.abi, provider);
  const [dev, spxcb, price, modelCount, paused] = await Promise.all([
    deployed.DEV(), deployed.SPCXB(), deployed.HOUSE_PRICE(), deployed.MODEL_COUNT(), deployed.paused()
  ]);
  if (dev.toLowerCase() !== EXPECTED_DEV.toLowerCase() || spxcb.toLowerCase() !== EXPECTED_SPCXB.toLowerCase()) throw new Error('Deployed constants mismatch');
  if (price !== EXPECTED_PRICE || modelCount !== 7n || paused) throw new Error('Deployed state mismatch');
  const code = await provider.getCode(receipt.contractAddress);
  atomicWrite(JOURNAL_PATH, { ...prepared, status: 'confirmed', transactionHash: sent.hash,
    blockNumber: receipt.blockNumber, confirmations: 3, contractAddress: receipt.contractAddress,
    runtimeCodeHash: ethers.keccak256(code), confirmedAt: new Date().toISOString() });
  console.log(JSON.stringify({ deployed: true, contractAddress: receipt.contractAddress, transactionHash: sent.hash, blockNumber: receipt.blockNumber }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
