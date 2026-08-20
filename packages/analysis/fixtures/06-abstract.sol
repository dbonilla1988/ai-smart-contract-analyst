// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract BaseVault {
    function totalAssets() public view virtual returns (uint256);
}
