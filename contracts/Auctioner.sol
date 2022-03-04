// contracts/Days365.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";


contract Auctioner {
    using Timers for Timers.Timestamp;

    event Start(uint indexed nftId, address owner, uint startAmount);
    event End(uint indexed nftId, address winner, uint price);
    event Cancel(uint indexed nftId, address seller);
    event Bid(uint indexed nftId, address indexed sender, uint amount);
    event Withdraw(uint indexed nftId, address indexed bidder, uint amount);

    IERC721 public nft;

    struct Auction {
        address seller;
        Timers.Timestamp _timestamp;
        uint currentBid;
        address currentWinner;
    }

    mapping(uint => mapping(address => uint)) bids;
    mapping(uint => Auction) internal auctions;

    constructor (IERC721 _nft)
    {
        nft = _nft;
    }

    function getBid(uint _nftId) public view returns(uint) {
        return bids[_nftId][msg.sender];
    }

    function getAuction(uint _nftId) public view returns(address, uint, uint, address) {
        Auction memory auction = auctions[_nftId];
        return (
            auction.seller, 
            auction._timestamp.getDeadline(), 
            auction.currentBid, 
            auction.currentWinner
        );
    }

    function start(uint _nftId, uint startAmount, uint64 daysDeadline) external isNotPending(_nftId) isNftOwner(_nftId) {
        require(startAmount > 0, "Starting amount is too low!");
        require(daysDeadline >= 3 && daysDeadline <= 60, "Auction deadline have to be from 3 to 60 days!");
        Auction storage auction = auctions[_nftId];
        auction._timestamp.setDeadline(uint64(block.timestamp + daysDeadline * 1 days));
        auctions[_nftId] = Auction(
            msg.sender,
            auction._timestamp,
            startAmount,
            address(0)
        );

        nft.transferFrom(msg.sender, address(this), _nftId);
        emit Start(_nftId, msg.sender, startAmount);
    }

    function bid(uint _nftId) external payable isPending(_nftId) isNotSeller(_nftId) {
        Auction storage auction = auctions[_nftId];

        uint bidValue = bids[_nftId][msg.sender] + msg.value;
        require(bidValue > auction.currentBid, "Bid value is too low!");

        auction.currentWinner = msg.sender;
        auction.currentBid = bidValue;
        bids[_nftId][auction.currentWinner] = bidValue;

        emit Bid(_nftId, auction.currentWinner, bidValue);
    }

    function withdraw(uint _nftId) external payable isBidder(_nftId) isNotLeader(_nftId) {
        uint amount = bids[_nftId][msg.sender];
        bids[_nftId][msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Could not withdraw");
        emit Withdraw(_nftId, msg.sender, amount);
    }

    function end(uint _nftId) external isExpired(_nftId) {
        Auction storage auction = auctions[_nftId];

        if (auction.currentWinner != address(0)) 
        {
            nft.transferFrom(address(this), auction.currentWinner, _nftId);
            bids[_nftId][auction.currentWinner] = 0;
            (bool sent, ) = auction.seller.call{value: auction.currentBid}("");
            require(sent, "Could not pay seller!");
            emit End(_nftId, auction.currentWinner, auction.currentBid);
        } else 
        {
            nft.transferFrom(address(this), auction.seller, _nftId);
            emit Cancel(_nftId, auction.seller);
        }

        auction._timestamp.reset();
    }

    function cancel(uint _nftId) external isPending(_nftId) areNoBidders(_nftId) isSeller(_nftId) {
        Auction storage auction = auctions[_nftId];
        nft.transferFrom(address(this), auction.seller, _nftId);
        auction._timestamp.reset();
        emit Cancel(_nftId, auction.seller);
    }

    modifier isExpired(uint _nftId) {
      require(auctions[_nftId]._timestamp.isStarted(), "You need to start first!");
      require(auctions[_nftId]._timestamp.isExpired(), "Auction is still ongoing!");
      _;
   }

    modifier isPending(uint _nftId) {
      require(auctions[_nftId]._timestamp.isStarted(), "You need to start first!");
      require(auctions[_nftId]._timestamp.isPending(), "Auction has already ended!");
      _;
   }

    modifier isNotPending(uint _nftId) {
      require(!auctions[_nftId]._timestamp.isPending(), "Auction is still ongoing!");
      _;
   }

    modifier isSeller(uint _nftId) {
      require(auctions[_nftId].seller == msg.sender, "Only owner can break an auction!");
      _;
   }

    modifier isNotSeller(uint _nftId) {
      require(auctions[_nftId].seller != msg.sender, "You can not bid as a NFT seller!");
      _;
   }

    modifier isNftOwner(uint _nftId) {
      require(nft.ownerOf(_nftId) == msg.sender, "Only owner can start an auction!");
      _;
   }

    modifier isBidder(uint _nftId) {
      require(bids[_nftId][msg.sender] > 0, "You did not bid in this auction!");
      _;
   }

    modifier isNotLeader(uint _nftId) {
      require(auctions[_nftId].currentWinner != msg.sender, "You can not withdraw as a current leader!");
      _;
   }

    modifier areNoBidders(uint _nftId) {
      require(auctions[_nftId].currentWinner == address(0), "You can not break when there is a bid!");
      _;
   }
}