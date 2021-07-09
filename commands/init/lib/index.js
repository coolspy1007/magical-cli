'use strict'

const Command = require('@magical-cli/command')
const log = require('@magical-cli/log')

// function init(projectName, opts, cmd) {
//   // console.log(`init ${projectName}...`)
//   // console.log('options', opts)
//   // console.log(process.env.CLI_TARGET_PATH)
//   // 通过 当前 init 命令对象 cmd 的上级（主命令program）parent 可以取到全局的 options
//   // 但是如果有注册子命令，那通过 parent 获取主命令的 options 就会有问题
//   // console.log('cmd', cmd.parent.opts().targetPath)
// }

function init(argArr) {
  return new InitCommand(argArr)

}

class InitCommand extends Command {
  init() {
    this.projectName = this._args[0]
    this.force = !!this._opts.force
    console.log(`init ${this.projectName}... -> ${this.force?'force':''}`)
    console.log('子进程：',process.pid)
    log.verbose('projectName', this.projectName)
    log.verbose('force', this.force)
  }

  exec() {
    console.log('子进程：',process.pid)
    console.log(`exec ${this.projectName}... -> ${this.force?'force':''}`)
  }
}

module.exports = init

