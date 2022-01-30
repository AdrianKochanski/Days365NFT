const Days365 = artifacts.require('Days365');
const Auctioner = artifacts.require('Auctioner');

module.exports = async (deployer, network, [defaultAccount]) => {
  let nft = await Days365.deployed()
  await deployer.deploy(Auctioner, nft.address);
}
