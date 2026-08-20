// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
}

abstract contract Guarded {
    address public owner;
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
}

contract Multi is Guarded, IERC20Like {
    event Transfer(address indexed from, address indexed to, uint256 value);
    error Unauthorized(address who);

    mapping(address => uint256) public balanceOf;

    constructor() {
        owner = msg.sender;
    }

    function transfer(address to, uint256 amount) external onlyOwner returns (bool) {
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    receive() external payable {}
}
