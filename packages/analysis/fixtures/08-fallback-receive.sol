// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PayableHooks {
    event Received(address sender, uint256 amount);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    fallback() external payable {
        emit Received(msg.sender, msg.value);
    }
}
