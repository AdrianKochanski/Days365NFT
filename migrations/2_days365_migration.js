const Days365 = artifacts.require('Days365');

module.exports = async (deployer, network, [defaultAccount]) => {
  await deployer.deploy(Days365);
}
