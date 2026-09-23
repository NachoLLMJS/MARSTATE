// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MarsHouseNFT is ERC721, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant HOUSE_PRICE = 10_000 ether;
    uint8 public constant MODEL_COUNT = 7;
    address public constant SPCXB = 0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1;
    address public constant DEV = 0x15eB7CEf7684524d600F87fF402B017D37139C36;

    uint256 public totalHousesMinted;
    string private _houseBaseURI;

    mapping(bytes32 => uint256) public tokenIdOfPlot;
    mapping(uint256 => bytes32) public plotOfToken;
    mapping(uint256 => uint8) public modelOfToken;

    event HouseMinted(address indexed buyer, uint256 indexed tokenId, bytes32 indexed plotId, uint8 model, uint256 price);
    event BaseURIUpdated(string baseURI);
    event EmergencyWithdrawNative(address indexed to, uint256 amount);
    event EmergencyWithdrawToken(address indexed token, address indexed to, uint256 amount);

    modifier onlyDev() {
        require(msg.sender == DEV, "only dev");
        _;
    }

    constructor() ERC721("Mars City House", "MCHOUSE") {}

    receive() external payable {}

    function mintHouse(bytes32 plotId, uint8 model) external whenNotPaused nonReentrant returns (uint256 tokenId) {
        require(plotId != bytes32(0), "plot required");
        require(tokenIdOfPlot[plotId] == 0, "plot already owned");
        require(model < MODEL_COUNT, "invalid model");

        tokenId = ++totalHousesMinted;
        tokenIdOfPlot[plotId] = tokenId;
        plotOfToken[tokenId] = plotId;
        modelOfToken[tokenId] = model;

        IERC20(SPCXB).safeTransferFrom(msg.sender, DEV, HOUSE_PRICE);
        _safeMint(msg.sender, tokenId);
        emit HouseMinted(msg.sender, tokenId, plotId, model, HOUSE_PRICE);
    }

    function ownerOfPlot(bytes32 plotId) external view returns (address) {
        uint256 tokenId = tokenIdOfPlot[plotId];
        return tokenId == 0 ? address(0) : ownerOf(tokenId);
    }

    function houseInfo(uint256 tokenId) external view returns (bytes32 plotId, uint8 model, address owner) {
        owner = ownerOf(tokenId);
        plotId = plotOfToken[tokenId];
        model = modelOfToken[tokenId];
    }

    function pause() external onlyDev {
        _pause();
    }

    function unpause() external onlyDev {
        _unpause();
    }

    function setBaseURI(string calldata newBaseURI) external onlyDev {
        _houseBaseURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function emergencyWithdrawNative() external onlyDev nonReentrant {
        require(paused(), "pause first");
        uint256 amount = address(this).balance;
        (bool success,) = payable(DEV).call{value: amount}("");
        require(success, "native transfer failed");
        emit EmergencyWithdrawNative(DEV, amount);
    }

    function emergencyWithdrawToken(address token) external onlyDev nonReentrant {
        require(paused(), "pause first");
        require(token != address(0), "token required");
        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(DEV, amount);
        emit EmergencyWithdrawToken(token, DEV, amount);
    }

    function _baseURI() internal view override returns (string memory) {
        return _houseBaseURI;
    }

    function _beforeTokenTransfer(address from, address to, uint256 firstTokenId, uint256 batchSize)
        internal override whenNotPaused
    {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }
}
