'use strict'
const colors = require('colors')
const semver = require('semver')
const log = require('@magical-cli/log')

const LOWEST_NODE_VERSION = '12.0.0'

class Command {
  constructor(argArr) {
    if (!argArr || argArr.length < 1) {
      throw new Error(colors.red('参数不能为空'))
    }
    if (!Array.isArray(argArr)) {
      throw new Error(colors.red('参数列表必须是数组'))
    }
    this._argv = argArr
    let runner = new Promise((resolve, reject) => {
      let chain = Promise.resolve()
      chain = chain.then(() => this.checkNodeVersion())
      chain = chain.then(() => this.initArgs())
      chain = chain.then(() => this.init())
      chain = chain.then(() => this.exec())
      chain.catch((err) => {
        if (process.env.LOG_LEVEL === 'verbose') {
          console.log(err)
        } else {
          log.error('', err.message)
        }
      })
    })
  }

  initArgs() {
    this._cmd = this._argv[this._argv.length - 1]
    this._args = this._cmd.args
    this._opts = this._cmd.opts
  }

  //检查node版本
  checkNodeVersion() {
    const currentVersion = process.version
    const lowestVersion = LOWEST_NODE_VERSION
    if (semver.lt(currentVersion, lowestVersion)) {
      throw new Error(colors.red(`需要安装 v${lowestVersion} 以上版本的 Node.js`))
    }
  }

  // 初始化命令
  init() {
    throw new Error(colors.red('init 方法必须实现'))
  }

  // 执行命令
  exec() {
    throw new Error(colors.red('exec 方法必须实现'))
  }
}

module.exports = Command
