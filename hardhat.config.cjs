require('@nomicfoundation/hardhat-ethers');
module.exports = {
  solidity: { version: '0.8.26', settings: { optimizer: { enabled: true, runs: 200 } } },
  paths: { sources: './contracts', tests: './test', cache: './.hardhat-cache', artifacts: './artifacts-hardhat' },
  networks: { hardhat: { chainId: 56 } }
};
