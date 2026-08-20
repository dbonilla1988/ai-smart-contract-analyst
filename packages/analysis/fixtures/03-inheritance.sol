// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Ownable {
    address public owner;
    constructor() { owner = msg.sender; }
}

contract Child is Ownable {
    function ping() external view returns (address) {
        return owner;
    }
}
