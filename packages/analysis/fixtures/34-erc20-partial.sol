// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract PartialErc20Like {
    mapping(address => uint256) public balances;

    function transfer(address to, uint256 amount) external returns (bool) {
        balances[msg.sender] -= amount;
        balances[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        spender;
        amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        from;
        to;
        amount;
        return true;
    }
}
