// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// ExampleVault-style: tx.origin guard on withdraw + unguarded mint.
contract ExampleVaultLike {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function withdraw(uint256 amount) external {
        require(tx.origin == owner, "not owner");
        payable(msg.sender).transfer(amount);
    }

    function mint(address to, uint256 amount) external {
        to;
        amount;
    }
}
