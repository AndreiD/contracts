const BigNumber = require('bignumber.js')
const AttraceToken = artifacts.require("AttraceToken")
const totalSupply = new BigNumber('1000000000e18')
const moment = require('moment')

contract('Test Attrace ERC20 :: Direct properties', async (accounts) => {
  it("It should seed the initial supply to the AttraceProject", async () => {
     const instance = await AttraceToken.deployed()
     const balance = await instance.balanceOf.call(accounts[0])
     assert.isTrue(totalSupply.equals(balance))
  })

  it("A new instance should hold the right initial values", async () => {
    const instance = await AttraceToken.new()
    const balance = await instance.balanceOf.call(accounts[0])
    assert.isTrue(totalSupply.equals(balance))
    const name = await instance.name.call()
    assert.equal(name, 'Attrace')
    const symbol = await instance.symbol.call()
    assert.equal(symbol, 'ATTR')
    const decimals = await instance.decimals.call()
    assert.equal(decimals.toNumber(), 18)
    const transfersEnabled = await instance.transfersEnabled.call()
    assert.isFalse(transfersEnabled)
  })
})

contract('Test Attrace ERC20 :: Account whitelisting', async (accounts) => {
  it("AttraceProject should be able to whitelist himself and others", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransferWhitelistAddress(accounts[0], true)
    let status = await instance.getAddressTransferWhitelistStatus(accounts[0])
    assert.isTrue(status)
    await instance.setTransferWhitelistAddress(accounts[1], true)
    status = await instance.getAddressTransferWhitelistStatus(accounts[1])
    assert.isTrue(status)
  })

  it("Others should not be able to whitelist AttraceProject", async () => {
    const instance = await AttraceToken.new()
    try {
      await instance.setTransferWhitelistAddress(accounts[0], true, { from: accounts[1] })
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
  })

  it("Others should not be able to whitelist self", async () => {
    const instance = await AttraceToken.new()
    try {
      await instance.setTransferWhitelistAddress(accounts[1], true, { from: accounts[1] })
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
  })

  it("Others should not be able to whitelist others", async () => {
    const instance = await AttraceToken.new()
    try {
      await instance.setTransferWhitelistAddress(accounts[2], true, { from: accounts[1] })
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
  })
})

contract('Test Attrace ERC20 :: Transfers', async (accounts) => {
  it("Unless whitelisted, even AttraceProject can't transfer tokens", async () => {
    const instance = await AttraceToken.new()
    try {
      await instance.transfer(accounts[1], 1000)
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
  })

  it("When whitelisted, AttraceProject can transfer tokens", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransferWhitelistAddress(accounts[0], true)
    await instance.transfer(accounts[1], 1000)
    let balance = await instance.balanceOf(accounts[1])
    assert.equal(balance, 1000)
  })

  it("Unless whitelisted or transfer lock removed, others can't transfer tokens", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransferWhitelistAddress(accounts[0], true)
    await instance.transfer(accounts[1], 1000)
    try {
      await instance.transferFrom(accounts[1], accounts[2], 1000)
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
  })

  it("AttraceProject can enable transfer of tokens", async () => {
    const instance = await AttraceToken.new()
    let status  = await instance.transfersEnabled.call()
    assert.isFalse(status)
    await instance.setTransfersEnabled()
    status  = await instance.transfersEnabled.call()
    assert.isTrue(status)
    let incubationTime = await instance.incubationTime.call()
    const blockTime = await instance.getBlockTimestamp()
    assert.isAbove(incubationTime.toNumber(), blockTime.toNumber() - 10)
    assert.isBelow(incubationTime.toNumber(), blockTime.toNumber() + 10)
  })

  it("After enabling transfers, anybody can transfer their tokens", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransfersEnabled()

    await instance.transfer(accounts[1], 20000)
    let balance = await instance.balanceOf(accounts[1])
    assert.equal(balance.toNumber(), 20000)

    await instance.transfer(accounts[2], 10000, { from: accounts[1] })
    let balance1 = await instance.balanceOf(accounts[1]) 
    assert.equal(balance1.toNumber(), 10000)
    let balance2 = await instance.balanceOf(accounts[2])
    assert.equal(balance2.toNumber(), 10000)
  })

  it("Transferring tokens should cost a sane amount of GAS (currently < 57000)", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransfersEnabled()
    const tx = await instance.transfer(accounts[1], 20000)
    // console.log('HASH', hash)
    assert.isAbove(tx.receipt.gasUsed, 20000)
    assert.isBelow(tx.receipt.gasUsed, 57000)
  })
})

contract('Test Attrace ERC20 :: Vesting plans on token', async (accounts) => {
  const largeAmountOfATTR = 1000000000*0.5
  it("AttraceProject should be able to set vesting plans before ICO and plans should be saved", async () => {
    const instance = await AttraceToken.new()
    const tx = await instance.setAddressVestingPlan(accounts[1], largeAmountOfATTR, true)
    const amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), largeAmountOfATTR)
    const total = await instance.getAddressVestingPlanTotalAmountLocked(accounts[1])
    assert.equal(total.toNumber(), largeAmountOfATTR)
    const stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 4)
  })

  it("Others can never set vesting plans", async () => {
    const instance = await AttraceToken.new()
    try {
      await instance.setAddressVestingPlan(accounts[1], largeAmountOfATTR, true, { from: accounts[1] })
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
  })

  it("Nobody should not be able to set or change vesting plans after ICO", async () => {
    const instance = await AttraceToken.new()
    const tx = await instance.setAddressVestingPlan(accounts[1], largeAmountOfATTR, true)
    await instance.setTransfersEnabled() 

    // Validate attrace
    try {
      await instance.setAddressVestingPlan(accounts[2], 10000, true)
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }

    // Validate others
    try {
      await instance.setAddressVestingPlan(accounts[2], 10000, true, { from: accounts[2] })
      await instance.setAddressVestingPlan(accounts[2], 10000, true, { from: accounts[1] })
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
  })

  it("An account under vesting should not be able to transfer amounts that are not unlocked", async () => {
    const instance = await AttraceToken.new()
    const tx = await instance.setAddressVestingPlan(accounts[1], 1000, true)
    await instance.setTransfersEnabled()

    const attr999 = new BigNumber('999e18')
    const attr1000 = new BigNumber('1000e18')
    const attr1001 = new BigNumber('1001e18')
    const attr500 = new BigNumber('500e18')
    const attr1 = new BigNumber('1e18')
    await instance.transfer(accounts[1], attr1000)
    // Validate different values that should all be impossible
    const testValues = [attr1000, attr500, 1, 2, 999, 1001, attr999, attr1001, attr1]
    for(let i = 0; i < testValues.length; i++) {
      try {
        await instance.transfer(accounts[2], testValues[i], { from: accounts[1] })
        assert.fail("unreachable")
      } catch (e) {
        expect(e.message).to.have.string('revert')
      }
    }

    // Limit is at 1000 ATTR, more should be transferrable
    await instance.transfer(accounts[1], attr1000)
    await instance.transfer(accounts[2], attr1000, { from: accounts[1] })
    let balance = await instance.balanceOf(accounts[2])
    assert.isTrue(attr1000.equals(balance))
  })


  it("It shouldnt be possible to apply vesting cliff recalculations before ICO", async () => {
    const instance = await AttraceToken.new()
    const tx = await instance.setAddressVestingPlan(accounts[1], 1000, true)
    try {
      await instance.updateVestingPlan(accounts[1])
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
    try {
      await instance.updateVestingPlan(accounts[1], { from: accounts[1] })
      assert.fail("unreachable")
    } catch (e) {
      expect(e.message).to.have.string('revert')
    }
  })

  it("Before vesting cliffs, updating a vesting plan should not have any impact except costing gas", async () => {
    const instance = await AttraceToken.new()
    const tx = await instance.setAddressVestingPlan(accounts[1], 1000, true)
    await instance.setTransfersEnabled()

    await instance.updateVestingPlan(accounts[1])
    const amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 1000)
    const total = await instance.getAddressVestingPlanTotalAmountLocked(accounts[1])
    assert.equal(total.toNumber(), 1000)
    const stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 4)
  })

  async function increaseTime(secondsForward) {
    await web3.currentProvider.send({
      jsonrpc: "2.0", 
      method: "evm_increaseTime", 
      params: [secondsForward], id: 0
    })
    await web3.eth.sendTransaction({ from: accounts[0] })
    await web3.eth.getBlock(web3.eth.blockNumber).timestamp
  }

  it("Full transfer test - after the first vesting period expired, 25% should be unlocked and transferable", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransferWhitelistAddress(accounts[0], true)
    await instance.transfer(accounts[1], new BigNumber('1000e18'))
    const tx = await instance.setAddressVestingPlan(accounts[1], 1000, true)
    await instance.setTransfersEnabled()

    // Forward time
    let time = await instance.getBlockTimestamp()
    const t0 = time.toNumber()
    const t1 = moment(t0*1000).add(180, 'days').unix()
    const t0d = t1 - t0

    await increaseTime(t0d + 43200) 
    const t1b = await instance.getBlockTimestamp()
    assert.isAtLeast(t1b, t1)
    console.log('25%:',moment(t0*1000).format(),moment(t1*1000).format())

    // Update the vesting plan
    await instance.updateVestingPlan(accounts[1])
    const amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 750)
    const total = await instance.getAddressVestingPlanTotalAmountLocked(accounts[1])
    assert.equal(total.toNumber(), 1000)
    const stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 3)

    // Make sure we can transfer the 25%
    await instance.transfer(accounts[2], new BigNumber('250e18'), { from: accounts[1] })
    const balance = await instance.balanceOf(accounts[1])
    assert.isTrue(balance.equals(new BigNumber('750e18')))
    await instance.transfer(accounts[1], new BigNumber('250e18'), { from: accounts[2] })

    await increaseTime(-t0d-43200)
  })

  it("Full transfer test - after the second vesting period expired, 50% should be unlocked and transferable", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransferWhitelistAddress(accounts[0], true)
    await instance.transfer(accounts[1], new BigNumber('1000e18'))
    const tx = await instance.setAddressVestingPlan(accounts[1], 1000, true)
    await instance.setTransfersEnabled()
    
    let time = await instance.getBlockTimestamp()
    const t0 = time.toNumber()
    const t1 = moment(t0*1000).add(1, 'year').unix()
    const t0d = t1 - t0

    await increaseTime(t0d + 43200) 
    const t1b = await instance.getBlockTimestamp()
    assert.isAtLeast(t1b, t1)
    console.log('50%:',moment(t0*1000).format(),moment(t1*1000).format())
    
    await instance.updateVestingPlan(accounts[1])
    const amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 500)
    const stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 2)
    
    await instance.transfer(accounts[2], new BigNumber('500e18'), { from: accounts[1] })
    const balance = await instance.balanceOf(accounts[1])
    assert.isTrue(balance.equals(new BigNumber('500e18')))
    await instance.transfer(accounts[1], new BigNumber('500e18'), { from: accounts[2] })
    
    await increaseTime(-t0d-43200)
  })

  it("Full transfer test - after the third vesting period expired, 75% should be unlocked and transferable", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransferWhitelistAddress(accounts[0], true)
    await instance.transfer(accounts[1], new BigNumber('1000e18'))
    const tx = await instance.setAddressVestingPlan(accounts[1], 1000, true)
    await instance.setTransfersEnabled()
    
    let time = await instance.getBlockTimestamp()
    const t0 = time.toNumber()
    const t1 = moment(t0*1000).add(1, 'year').add(180, 'days').unix()
    const t0d = t1 - t0

    await increaseTime(t0d + 43200) 
    const t1b = await instance.getBlockTimestamp()
    assert.isAtLeast(t1b, t1)
    console.log('75%:',moment(t0*1000).format(),moment(t1*1000).format())
    
    await instance.updateVestingPlan(accounts[1])
    const amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 250)
    const stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 1)
    
    await instance.transfer(accounts[2], new BigNumber('750e18'), { from: accounts[1] })
    const balance = await instance.balanceOf(accounts[1])
    assert.isTrue(balance.equals(new BigNumber('250e18')))
    await instance.transfer(accounts[1], new BigNumber('750e18'), { from: accounts[2] })
    
    await increaseTime(-t0d-43200)
  })

  it("Full transfer test - after the fourth vesting period expired, 100% should be unlocked and transferable", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransferWhitelistAddress(accounts[0], true)
    await instance.transfer(accounts[1], new BigNumber('1000e18'))
    const tx = await instance.setAddressVestingPlan(accounts[1], 1000, true)
    await instance.setTransfersEnabled()
    
    let time = await instance.getBlockTimestamp()
    const t0 = time.toNumber()
    const t1 = moment(t0*1000).add(2, 'year').unix()
    const t0d = t1 - t0

    await increaseTime(t0d + 43200) 
    const t1b = await instance.getBlockTimestamp()
    assert.isAtLeast(t1b, t1)
    console.log('100%:',moment(t0*1000).format(),moment(t1*1000).format())
    
    await instance.updateVestingPlan(accounts[1])
    const amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 0)
    const stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 0)
    
    await instance.transfer(accounts[2], new BigNumber('1000e18'), { from: accounts[1] })
    const balance = await instance.balanceOf(accounts[1])
    assert.isTrue(balance.equals(0))
    await instance.transfer(accounts[1], new BigNumber('1000e18'), { from: accounts[2] })
    
    await increaseTime(-t0d-43200)
  })

  it("Full transfer test - after the fourth vesting period expired, 100% should be unlocked and transferable", async () => {
    const instance = await AttraceToken.new()
    await instance.setTransferWhitelistAddress(accounts[0], true)
    await instance.transfer(accounts[1], new BigNumber('1000e18'))
    const tx = await instance.setAddressVestingPlan(accounts[1], 1000, true)
    await instance.setTransfersEnabled()
    
    // First cliff
    let time = await instance.getBlockTimestamp()
    const t0 = time.toNumber()
    const t1 = moment(t0*1000).add(180, 'days').unix()
    const t0d = t1 - t0

    await increaseTime(t0d + 43200) // we add half a day to make sure the contract logic kicks in 
    const t1b = await instance.getBlockTimestamp()
    assert.isAtLeast(t1b, t1)
    console.log('25%:',moment(t0*1000).format(),moment(t1b*1000).format())
    
    await instance.updateVestingPlan(accounts[1])
    let amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 750)
    let stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 3)
    
    await instance.transfer(accounts[2], new BigNumber('250e18'), { from: accounts[1] })
    let balance = await instance.balanceOf(accounts[1])
    assert.isTrue(balance.equals(new BigNumber('750e18')))

    // Second cliff
    const t2 = moment(t0*1000).add(1, 'year').unix()
    const t1d = t2 - t1b

    await increaseTime(t1d + 43200) 
    const t2b = await instance.getBlockTimestamp()
    assert.isAtLeast(t2b, t2)
    console.log('50%:',moment(t1b*1000).format(),moment(t2b*1000).format())
    
    await instance.updateVestingPlan(accounts[1])
    amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 500)
    stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 2)
    
    await instance.transfer(accounts[2], new BigNumber('250e18'), { from: accounts[1] })
    balance = await instance.balanceOf(accounts[1])
    assert.isTrue(balance.equals(new BigNumber('500e18')))

    // Third cliff
    const t3 = moment(t0*1000).add(1, 'year').add(180, 'days').unix()
    const t2d = t3 - t2b

    await increaseTime(t2d + 43200) 
    const t3b = await instance.getBlockTimestamp()
    assert.isAtLeast(t3b, t3)
    console.log('75%:',moment(t2b*1000).format(),moment(t3b*1000).format())
    
    await instance.updateVestingPlan(accounts[1])
    amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 250)
    stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 1)
    
    await instance.transfer(accounts[2], new BigNumber('250e18'), { from: accounts[1] })
    balance = await instance.balanceOf(accounts[1])
    assert.isTrue(balance.equals(new BigNumber('250e18')))

    // Fourth cliff
    const t4 = moment(t0*1000).add(2, 'year').unix()
    const t3d = t4 - t3b

    await increaseTime(t3d + 43200) 
    const t4b = await instance.getBlockTimestamp()
    assert.isAtLeast(t4b, t4)
    console.log('100%:',moment(t3b*1000).format(),moment(t4b*1000).format())
    
    await instance.updateVestingPlan(accounts[1])
    amount = await instance.getAddressVestingPlanLockedAmountRemaining(accounts[1])
    assert.equal(amount.toNumber(), 0)
    stage = await instance.getAddressVestingPlanStage(accounts[1])
    assert.equal(stage.toNumber(), 0)
    
    await instance.transfer(accounts[2], new BigNumber('250e18'), { from: accounts[1] })
    balance = await instance.balanceOf(accounts[1])
    assert.isTrue(balance.equals(0))
  })
})