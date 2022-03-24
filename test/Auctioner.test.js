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

contract('Auctioner', accounts => {
    const Days365 = artifacts.require('Days365.sol');
    const Auctioner = artifacts.require('Auctioner.sol');
    const seller = accounts[0];
    const bidder1 = accounts[1];
    const bidder2 = accounts[2];
    const emptyAddress = "0x0000000000000000000000000000000000000000";

    let days365, autioner, tokenId, currentFee;
    const initBid = 100000000000000;
    const bid1 = 200000000000000;
    const bid2 = 300000000000000;

    beforeEach(async () => {
        days365 = await Days365.deployed();
        autioner = await Auctioner.deployed();

        currentFee = await days365.currentFee();
        await days365.mintToken("tokenURI", {from: seller, value: currentFee});
        tokenId = await days365.tokensCount();
        await days365.approve(autioner.address, tokenId);
    });

    describe('After deploy', () => {
        it("Is connected to NFT contract", async () => {
            let nftAddress = await autioner.nft();
            expect(autioner).to.exist;
            expect(nftAddress).to.equal(days365.address);
        });

        it("Is allowed to start an auction", async () => {
            expect(await days365.getApproved(tokenId)).to.equal(autioner.address);
        });
    });

    describe('START function', () => {
        it("Can be call only by the owner of the coin and when the auction is not active yet", async () => {
            await expectRevert(
                autioner.start(tokenId, initBid, 3, { from: bidder1 }),
                "Only owner can start an auction!"
            );
            expect(autioner.start(tokenId, initBid, 3, { from: seller })).not.to.be.reverted;
            expect(autioner.start(tokenId, initBid, 3, { from: seller })).to.revertedWith("Auction is still ongoing!");
        });

        it("Reverts bad amount and deadline arguments", async () => {
            expect(autioner.start(tokenId, 0, 3, { from: seller })).to.revertedWith("Starting amount is too low!");
            expect(autioner.start(tokenId, initBid, 2, { from: seller })).to.revertedWith("Auction deadline have to be from 3 to 60 days!");
            expect(autioner.start(tokenId, initBid, 61, { from: seller })).to.revertedWith("Auction deadline have to be from 3 to 60 days!");
        });

        it("Will set the auction properties correctly", async () => {
            await autioner.start(tokenId, initBid, 3, { from: seller });
            let auction = await autioner.getAuction(tokenId);
            expect(auction[0]).to.equal(seller);
            expect(auction[1].toNumber()).to.not.equal(0);
            expect(auction[2].toNumber()).to.equal(initBid);
            expect(auction[3]).to.equal(emptyAddress);
        });

        it("Will transfer nft from owner to auctioner address", async () => {
            await autioner.start(tokenId, initBid, 3, { from: seller });
            expect(await days365.ownerOf(tokenId)).to.equal(autioner.address);
        });

        it("Emit event Start", async () => {
            const tx = await autioner.start(tokenId, initBid, 3, { from: seller });
            expectEvent(tx, 'Start', { nftId: tokenId, owner: seller, startAmount: initBid.toString()});
        });
    });

    describe('BID function', () => {
        describe('When Auction is inactive', () => {
            it("Reverts", async () => {
                expect(autioner.bid(tokenId, { from: bidder1, value: bid1 })).to.revertedWith("You need to start first!");
            });
        });

        describe('When Auction is active', () => {
            beforeEach(async () => {
                await autioner.start(tokenId, initBid, 3, { from: seller });
            });

            it("Allows to bid if the bidder is not the seller when the auction is active", async () => {
                expect(autioner.bid(tokenId, { from: seller, value: bid1 })).to.revertedWith("You can not bid as a NFT seller!");
                expect(autioner.bid(tokenId, { from: bidder1, value: bid1 })).not.to.be.reverted;
            });

            it("Fails when the bid amount is too low", async () => {
                expect(autioner.bid(tokenId, { from: bidder1, value: initBid })).to.revertedWith("Bid value is too low!");
            });
    
            describe('And the auction was bid', () => {
                let tx;

                beforeEach(async () => {
                    tx = await autioner.bid(tokenId, { from: bidder1, value: bid1 });
                });

                it("Increases bid amount when the same bidder calls function", async () => {
                    await autioner.bid(tokenId, { from: bidder1, value: bid1 });
                    let bid = await autioner.getBid(tokenId, { from: bidder1 });
                    expect(bid.toNumber()).to.equal(bid1*2);
                });
        
                it("Changes the current winner and current bid properties", async () => {
                    let auction = await autioner.getAuction(tokenId);
                    expect(auction[2].toNumber()).to.equal(bid1);
                    expect(auction[3]).to.equal(bidder1);
                });
        
                it("Emit event Bid", async () => {
                    expectEvent(tx, 'Bid', { nftId: tokenId, sender: bidder1, amount: bid1.toString()});
                });
            });
        });
    });

    describe('WITHDRAW function', () => {
        beforeEach(async () => {
            await autioner.start(tokenId, initBid, 3, { from: seller });
            await autioner.bid(tokenId, { from: bidder1, value: bid1 });
        });

        it("Can be called only if the sender was a bidder and he is not the current leader", async () => {
            expect(autioner.withdraw(tokenId, { from: bidder2 })).to.revertedWith("You did not bid in this auction!");
            expect(autioner.withdraw(tokenId, { from: bidder1 })).to.revertedWith("You can not withdraw as a current leader!");
            expect(autioner.withdraw(tokenId, { from: seller })).to.revertedWith("You did not bid in this auction!");

            await autioner.bid(tokenId, { from: bidder2, value: bid2 });
            expect(autioner.withdraw(tokenId, { from: bidder2 })).to.revertedWith("You can not withdraw as a current leader!");
            expect(autioner.withdraw(tokenId, { from: bidder1 })).not.to.be.reverted;
        });

        it("Can be called after the auction end", async () => {
            await autioner.bid(tokenId, { from: bidder2, value: bid2 });
            let auction = await autioner.getAuction(tokenId);
            await time.increaseTo(auction[1].toNumber() + 10);
            expect(autioner.withdraw(tokenId, { from: bidder1 })).not.to.be.reverted;
        });

        describe('After successful call', () => {
            let tx, beforeWithdraw;

            beforeEach(async () => {
                beforeWithdraw = await web3.eth.getBalance(bidder1);
                await autioner.bid(tokenId, { from: bidder2, value: bid2 });
                tx = await autioner.withdraw(tokenId, { from: bidder1 });
            });

            it("Gives back the money to the bidder", async () => {
                let afterWithdraw = await web3.eth.getBalance(bidder1);
                expect(afterWithdraw.gt(beforeWithdraw)).to.be.true;
            });
    
            it("Erases the bidder amount from contract", async () => {
                let bid = await autioner.getBid(tokenId, { from: bidder1 });
                expect(bid.toNumber()).to.equal(0);
            });
    
            it("Emit event Withdraw", async () => {
                expectEvent(tx, 'Withdraw', { nftId: tokenId, bidder: bidder1, amount: bid1.toString()});
            });
        });
    });

    describe('END function', () => {
        beforeEach(async () => {
            await autioner.start(tokenId, initBid, 3, { from: seller });
        });

        describe('When the auction is ongoing', () => {
            it("Reverts", async () => {
                expect(autioner.end(tokenId)).to.revertedWith("Auction is still ongoing!");
            });
        });

        describe('When the auction will expire', () => {
            beforeEach(async () => {
                let auction = await autioner.getAuction(tokenId);
                await time.increaseTo(auction[1].toNumber() + 10);
            });

            it("Can be called by seller", async () => {
                expect(autioner.end(tokenId, {from: seller})).not.to.be.reverted;
            });

            it("Can be called by bidder", async () => {
                expect(autioner.end(tokenId, {from: bidder1})).not.to.be.reverted;
            });
            
            it("Can be called by other", async () => {
                expect(autioner.end(tokenId, {from: bidder2})).not.to.be.reverted;
            });
        });

        describe('When there is no winner', () => {
            let tx;

            beforeEach(async () => {
                let auction = await autioner.getAuction(tokenId);
                await time.increaseTo(auction[1].toNumber() + 10);
                tx = await autioner.end(tokenId);
            });

            it("Gives nft back to seller", async () => {
                expect(await days365.ownerOf(tokenId)).to.equal(seller);
            });
    
            it("Resets the auction parameters", async () => {
                let auction = await autioner.getAuction(tokenId);
                expect(auction[1].toNumber()).to.equal(0);
            });
    
            it("Emit event End", async () => {
                expectEvent(tx, 'Cancel', { nftId: tokenId, seller: seller});
            });
        });


        describe('When there is a winner', () => {
            let tx, beforeEnd;

            beforeEach(async () => {
                await autioner.bid(tokenId, { from: bidder1, value: bid1 });
                let auction = await autioner.getAuction(tokenId);
                await time.increaseTo(auction[1].toNumber() + 10);
                beforeEnd = await web3.eth.getBalance(seller);
                tx = await autioner.end(tokenId);
            });
    
            it("Gives nft to winner and founds to seller", async () => {
                expect(await days365.ownerOf(tokenId)).to.equal(bidder1);
                const afterEnd = await web3.eth.getBalance(seller);
                expect(afterEnd.gt(beforeEnd)).to.be.true;
            });
    
            it("Resets the auction parameters, and winner bid amount for auction", async () => {
                let auction = await autioner.getAuction(tokenId);
                let bid = await autioner.getBid(tokenId, { from: bidder1 });
                expect(auction[1].toNumber()).to.equal(0);
                expect(bid.toNumber()).to.equal(0);
            });
    
            it("Emit event End", async () => {
                expectEvent(tx, 'End', { nftId: tokenId, winner: bidder1, price: bid1.toString()});
            });
        });
    });

    describe('CANCEL function', () => {
        describe('When the auction is not pending', () => {
            describe('And not started', () => {
                it("Reverts", async () => {
                    expect(autioner.cancel(tokenId, { from: seller })).to.revertedWith("You need to start first!");
                    expect(autioner.cancel(tokenId, { from: bidder1 })).to.revertedWith("You need to start first!");
                });
            });

            describe('And expired', () => {
                it("Reverts", async () => {
                    await autioner.start(tokenId, initBid, 3, { from: seller });
                    let auction = await autioner.getAuction(tokenId);
                    await time.increaseTo(auction[1].toNumber() + 10);
                    expect(autioner.cancel(tokenId, { from: seller })).to.revertedWith("Auction has already ended!");
                    expect(autioner.cancel(tokenId, { from: bidder1 })).to.revertedWith("Auction has already ended!");
                });
            });
        });

        describe('When the auction is pending', () => {
            beforeEach(async () => {
                await autioner.start(tokenId, initBid, 3, { from: seller });
            });

            describe('And there was any bid', () => {
                it("Reverts", async () => {
                    await autioner.bid(tokenId, { from: bidder1, value: bid1 });
                    expect(autioner.cancel(tokenId, { from: seller })).to.revertedWith("You can not break when there is a bid!");
                });
            });

            describe('And there was no bid', () => {
                it("Reverts when bidder calls", async () => {
                    expect(autioner.cancel(tokenId, { from: bidder1 })).to.revertedWith("Only owner can break an auction!");
                    expect(autioner.cancel(tokenId, { from: seller })).not.to.be.reverted;
                });

                it("Succed when seller calls", async () => {
                    expect(autioner.cancel(tokenId, { from: seller })).not.to.be.reverted;
                });

                describe('After function execution', () => {
                    let tx;
                    beforeEach(async () => {
                        tx = await autioner.cancel(tokenId, { from: seller });
                    });

                    it("Gives nft back to seller", async () => {
                        expect(await days365.ownerOf(tokenId)).to.equal(seller);
                    });
            
                    it("Resets the auction parameters", async () => {
                        let auction = await autioner.getAuction(tokenId);
                        expect(auction[1].toNumber()).to.equal(0);
                    });
            
                    it("Emit event Cancel", async () => {
                        expectEvent(tx, 'Cancel', { nftId: tokenId, seller: seller});
                    });
                });
            });
        });
    });

    describe('INTEGRATION TEST START(0)', () => {
        beforeEach(async () => {
            await autioner.start(tokenId, initBid, 3, { from: seller });
        });

        it("CANCEL(0) - BID(1) - Can not bid for an ended auction", async () => {
            await autioner.cancel(tokenId, { from: seller });
            expect(autioner.bid(tokenId, { from: bidder1, value: bid1 })).to.revertedWith("You need to start first!");
            
        });

        it("END(0) - BID(1) - Can not bid for an ended auction", async () => {
            let auction = await autioner.getAuction(tokenId);
            await time.increaseTo(auction[1].toNumber() + 10);
            await autioner.end(tokenId);
            expect(autioner.bid(tokenId, { from: bidder1, value: bid1 })).to.revertedWith("You need to start first!");
        });
        
        describe('BID(1)', () => {
            beforeEach(async () => {
                await autioner.bid(tokenId, { from: bidder1, value: bid1 });
            });

            it("END(*) - WITHDRAW(1) Can not withdraw money after winning auction", async () => {
                let auction = await autioner.getAuction(tokenId);
                await time.increaseTo(auction[1].toNumber() + 10);
                await autioner.end(tokenId);
                expect(autioner.withdraw(tokenId, { from: bidder1 })).to.revertedWith("You did not bid in this auction!");
            });

            describe('BID(2) - WITHDRAW(1)', () => {
                beforeEach(async () => {
                    await autioner.bid(tokenId, { from: bidder2, value: bid2 });
                    await autioner.withdraw(tokenId, { from: bidder1 });
                });

                it("WITHDRAW(1) - Works only once", async () => {
                    expect(autioner.withdraw(tokenId, { from: bidder1 })).to.revertedWith("You did not bid in this auction!");
                });
        
                it("BID(1) Will reset bid amount for bidder1 and sets the new one", async () => {
                    await autioner.bid(tokenId, { from: bidder1, value: bid1 + bid2 });
                    let bidAmount = await autioner.getBid(tokenId, { from: bidder1 });
                    expect(bidAmount.toNumber()).to.be.equal(bid1 + bid2);
                });
            });
        });
    });
})
