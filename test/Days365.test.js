const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');


contract('365Days', accounts => {
    const Days365 = artifacts.require('Days365.sol');
    const manager = accounts[0];

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

    // when we mint a token fee raises by feeBase
    // only owner can set a tokenURI and it is set correctly
    // owner receives a fee from minting
    // we can not exceed maxTokenCount
})
