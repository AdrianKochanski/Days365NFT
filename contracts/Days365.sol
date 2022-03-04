// contracts/Days365.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract Days365 is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    event UriChange(uint indexed nftId, address owner);
    uint256 internal baseFee;
    Counters.Counter private _tokensCounter;
    uint256 public maxSupply;

    constructor() ERC721("365Days", "DAY")
    {
        baseFee = 5 * 10**15; // 0.005 ETH
        maxSupply = 365;
    }

    function currentFee() public view returns (uint256) { 
        return baseFee * (_tokensCounter.current() + 1);
    }

    function tokensCount() public view returns (uint) {
        return _tokensCounter.current();
    }
            
    function setTokenURI(uint256 tokenId, string memory _tokenURI) public {
        // ?? To check if the approver should have access
        require(ownerOf(tokenId) == _msgSender(), "Only owner can sent a new token URI");
        _setTokenURI(tokenId, _tokenURI);
        emit UriChange(tokenId, msg.sender);
    }

    function mintToken(string memory tokenURI) public payable {
        require(
            msg.value >= currentFee(),
            "Not enough ETH to mint a new Token"
        );

        require(
            _tokensCounter.current() < maxSupply,
            "The maximum number of Tokens was reached"
        );

        (bool sent, ) = owner().call{value: msg.value }("");
        require(sent, "Could not pay contract owner!");

         _tokensCounter.increment();
        _safeMint(msg.sender, _tokensCounter.current());
        _setTokenURI(_tokensCounter.current(), tokenURI);
    }
}