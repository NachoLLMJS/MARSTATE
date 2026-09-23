const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const DEV = '0x15eB7CEf7684524d600F87fF402B017D37139C36';
const SPCXB = '0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1';
const PRICE = ethers.parseEther('10000');

async function expectRevert(promise, text) {
  try { await promise; expect.fail('expected revert'); }
  catch (error) { expect(String(error)).to.include(text); }
}

describe('MarsHouseNFT', function () {
  let house, token, buyer, outsider, dev;
  beforeEach(async function () {
    [, buyer, outsider] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockERC20');
    const tokenTemplate = await Token.deploy();
    await network.provider.send('hardhat_setCode', [SPCXB, await ethers.provider.getCode(await tokenTemplate.getAddress())]);
    token = Token.attach(SPCXB);
    const House = await ethers.getContractFactory('MarsHouseNFT');
    house = await House.deploy();
    await network.provider.send('hardhat_impersonateAccount', [DEV]);
    await network.provider.send('hardhat_setBalance', [DEV, '0x56BC75E2D63100000']);
    dev = await ethers.getSigner(DEV);
    await token.mint(buyer.address, PRICE * 20n);
    await token.connect(buyer).approve(await house.getAddress(), PRICE * 20n);
  });

  it('mints a unique house NFT for exactly 10000 SPCXB paid directly to dev', async function () {
    const before = await token.balanceOf(DEV);
    const plot = ethers.id('LOT-0-0');
    await house.connect(buyer).mintHouse(plot, 0);
    expect(await house.ownerOf(1)).to.equal(buyer.address);
    expect(await house.ownerOfPlot(plot)).to.equal(buyer.address);
    expect(await house.totalHousesMinted()).to.equal(1n);
    expect(await token.balanceOf(DEV)).to.equal(before + PRICE);
    expect(await token.balanceOf(await house.getAddress())).to.equal(0n);
  });

  it('supports unlimited sequential houses while preventing duplicate plots', async function () {
    for (let i = 0; i < 5; i++) await house.connect(buyer).mintHouse(ethers.id(`LOT-${i}-1`), i % 7);
    expect(await house.totalHousesMinted()).to.equal(5n);
    await expectRevert(house.connect(buyer).mintHouse(ethers.id('LOT-0-1'), 2), 'plot already owned');
  });

  it('rejects invalid models and zero plot identifiers', async function () {
    await expectRevert(house.connect(buyer).mintHouse(ethers.ZeroHash, 0), 'plot required');
    await expectRevert(house.connect(buyer).mintHouse(ethers.id('LOT-X'), 7), 'invalid model');
  });

  it('allows only dev to pause and blocks mints while paused', async function () {
    await expectRevert(house.connect(outsider).pause(), 'only dev');
    await house.connect(dev).pause();
    await expectRevert(house.connect(buyer).mintHouse(ethers.id('LOT-PAUSED'), 0), 'Pausable: paused');
    await house.connect(dev).unpause();
    await house.connect(buyer).mintHouse(ethers.id('LOT-LIVE'), 0);
  });

  it('requires pause before recovering accidental ERC20 and always sends it to dev', async function () {
    await token.mint(await house.getAddress(), PRICE);
    await expectRevert(house.connect(dev).emergencyWithdrawToken(await token.getAddress()), 'pause first');
    await house.connect(dev).pause();
    const before = await token.balanceOf(DEV);
    await house.connect(dev).emergencyWithdrawToken(await token.getAddress());
    expect(await token.balanceOf(DEV)).to.equal(before + PRICE);
    expect(await token.balanceOf(await house.getAddress())).to.equal(0n);
  });

  it('requires pause before recovering accidental BNB and sends all of it to dev', async function () {
    await buyer.sendTransaction({ to: await house.getAddress(), value: ethers.parseEther('0.2') });
    await expectRevert(house.connect(dev).emergencyWithdrawNative(), 'pause first');
    await house.connect(dev).pause();
    const before = await ethers.provider.getBalance(DEV);
    const tx = await house.connect(dev).emergencyWithdrawNative();
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    expect(await ethers.provider.getBalance(await house.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(DEV)).to.equal(before + ethers.parseEther('0.2') - gas);
  });

  it('freezes NFT transfers while paused and restores them after unpause', async function () {
    await house.connect(buyer).mintHouse(ethers.id('LOT-TRANSFER'), 1);
    await house.connect(dev).pause();
    await expectRevert(house.connect(buyer).transferFrom(buyer.address, outsider.address, 1), 'Pausable: paused');
    await house.connect(dev).unpause();
    await house.connect(buyer).transferFrom(buyer.address, outsider.address, 1);
    expect(await house.ownerOf(1)).to.equal(outsider.address);
  });

  it('exposes plot and model data needed by the city map', async function () {
    const plot = ethers.id('LOT-9-9');
    await house.connect(buyer).mintHouse(plot, 6);
    const info = await house.houseInfo(1);
    expect(info.plotId).to.equal(plot);
    expect(info.model).to.equal(6n);
    expect(info.owner).to.equal(buyer.address);
  });
});
