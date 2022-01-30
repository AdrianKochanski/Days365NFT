const DungeonsAndDragons = artifacts.require('DungeonsAndDragonsCharacter')

module.exports = async callback => {
    const dnd = await DungeonsAndDragons.deployed()
    length = await dnd.getNumberOfCharacters()
    console.log('Let\'s get the overview of your character from: ' + dnd.address)
    console.log('Total number of characters: ' + length)
    const overview = await dnd.characters(3)
    console.log(overview)
    callback(overview.tx)
}
