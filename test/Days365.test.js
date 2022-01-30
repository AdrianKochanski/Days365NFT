const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { expect, use } = require('chai');
const { solidity } = require('ethereum-waffle');
const BN = require('bn.js');
use(solidity);

Object.defineProperty(String.prototype, "gt", {
    value: function gt(second) {
        return (new BN(this)).gt((new BN(second)));
    },
    writable: true,
    configurable: true
});

contract('365Days', accounts => {
    const Days365 = artifacts.require('Days365.sol');

    let contract;

    beforeEach(async () => {
        contract = await Days365.deployed();
    });

    it("Should deploy successfully with name and symbol", async () => {
        let name = await contract.name();
        let symbol = await contract.symbol();

        assert.exists(contract);
        assert.equal(name, "365Days");
        assert.equal(symbol, "DAY");
    });

    it("Should increase fee after mint", async () => {
        let beforeMintFee = await contract.currentFee();
        await contract.mintToken("tokenURI", {from: accounts[0], value: beforeMintFee});
        let afterMintFee = await contract.currentFee();
        expect(afterMintFee.gt(beforeMintFee)).to.be.true;
    });

    it("Allows only owner to set a tokenURI", async () => {
        let beforeMintFee = await contract.currentFee();
        await contract.mintToken("tokenURI", {from: accounts[0], value: beforeMintFee});
        expect(contract.setTokenURI(1, "newURI", { from: accounts[1] })).to.be.reverted;
        await contract.setTokenURI(1, "newURI", { from: accounts[0] });
        expect(await contract.tokenURI(1)).to.be.equal("newURI");
    });

    it("Sends a fee to a contract owner", async () => {
        let mintFee = parseInt(await contract.currentFee());
        let owner = await contract.owner();
        let balanceBefore = await web3.eth.getBalance(owner);
        await contract.mintToken("tokenURI", {from: accounts[1], value: mintFee});
        let balanceAfter = await web3.eth.getBalance(owner);
        expect(parseInt(balanceBefore) + mintFee).to.be.equal(parseInt(balanceAfter));
    });

    // it("Sends a fee to a contract owner", async () => {
    //     let owner = await contract.owner();
        
    //     for (let i = 0; i < (await contract.maxSupply()); i++) {
    //         if(i % 10 == 0) {
    //             console.log("Minted: " + i);
    //             console.log("Balance: " + (await web3.eth.getBalance(owner)));
    //         };
             
    //         await contract.mintToken("tokenURI: " + i, {from: accounts[i % 10], value: (await contract.currentFee())});
    //     }
    //     expect(contract.mintToken("tokenURI", {from: accounts[0], value: (await contract.currentFee())})).to.be.reverted;
    // });
})
