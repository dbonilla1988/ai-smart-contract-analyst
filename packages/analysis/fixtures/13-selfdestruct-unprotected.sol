// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract SelfdestructOpen {
    function die(address payable recipient) external {
        selfdestruct(recipient);
    }
}
