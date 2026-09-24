const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'main.js');
const HTML = path.join(ROOT, 'index.html');
const NEW_HOUSE_CONTRACT = '0x134934B2E182f1F3D0fa2499c91bCA2eB05A852c';
const OLD_HOUSE_CONTRACT = '0x7208F28214A6DFf44bCcF37edbAbF6A69039aAf1';

describe('MARSTATE frontend contract configuration', function () {
  it('targets the 0.02 SPCXB house contract and contains no legacy 10K pricing', function () {
    const source = fs.readFileSync(SOURCE, 'utf8');
    const html = fs.readFileSync(HTML, 'utf8');
    expect(source).to.include(`const HOUSE_CONTRACT = '${NEW_HOUSE_CONTRACT}'`);
    expect(source).to.include('const HOUSE_PRICE = 2n * 10n ** 16n;');
    expect(source).to.include("buildPrice.textContent='0.02 SPCXB'");
    expect(html).to.include('<title>MARSTATE</title>');
    expect(html).to.include('<strong>MARSTATE</strong>');
    expect(html).to.include('<span>MARSTATE HOUSE</span>');
    expect(html).not.to.include('火星 // 栖息地');
    expect(html).not.to.include('MARS CITY HOUSE');
    expect(html).to.include(`https://bscscan.com/address/${NEW_HOUSE_CONTRACT}`);
    expect(html.match(/0\.02 SPCXB/g)).to.have.length(9);
    for (const content of [source, html]) {
      expect(content).not.to.include(OLD_HOUSE_CONTRACT);
      expect(content).not.to.match(/10K SPCXB|10,000 SPCXB|10000 SPCXB/);
    }
  });
});
