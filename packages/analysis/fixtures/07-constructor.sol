// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Constructed {
    address public owner;

    constructor(address initialOwner) {
        owner = initialOwner;
    }
}
