// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract PartialErc721Like {
    mapping(uint256 => address) public owners;

    function ownerOf(uint256 tokenId) external view returns (address) {
        return owners[tokenId];
    }

    function balanceOf(address owner) external pure returns (uint256) {
        owner;
        return 0;
    }

    function getApproved(uint256 tokenId) external pure returns (address) {
        tokenId;
        return address(0);
    }
}
