// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract TxOriginBenign {
    event OriginSeen(address who);

    function logOrigin() external {
        emit OriginSeen(tx.origin);
    }
}
