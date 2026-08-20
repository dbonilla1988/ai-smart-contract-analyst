// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract UnrestrictedMint {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}
