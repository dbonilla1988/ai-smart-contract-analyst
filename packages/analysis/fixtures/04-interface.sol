// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICounter {
    function increment() external;
    function current() external view returns (uint256);
}
