'use strict'
const path = require('path')
const fs = require('fs')

const fse = require('fs-extra')
const colors = require('colors')

const Command = require('@magical-cli/command')
const log = require('@magical-cli/log')
const Git = require('@magical-cli/git')
const CloudBuild = require('@magical-cli/cloudbuild')

function publish(argv) {
  return new PublishCommand(argv)
}

class PublishCommand extends Command {
  init() {
    // console.log(this._opts)
    // console.log(this._args)
    // 初始化参数获取
    this.refreshGitServer = this._opts.refreshGitServer // 强制更新远程仓库平台
    this.refreshGitToken = this._opts.refreshGitToken // 强制更新远程仓库 token
    this.refreshGitOwner = this._opts.refreshGitOwner // 强制更新远程仓库类型
    this.refreshGitPublish = this._opts.refreshGitPublish // 强制更新发布平台
    this.buildCmd = this._opts.buildCmd // 构建命令
    this.prod = this._opts.prod // 是否发布正式版本
    this.history = this._opts.history // 是否 history 路由模式
  }

  async exec() {
    try {
      // 1.初始化检查
      const startTime = new Date().getTime()  // 开始执行时间
      this.prepare()
      const git = new Git(this.projectInfo, {
        refreshGitServer: this.refreshGitServer,
        refreshGitToken: this.refreshGitToken,
        refreshGitOwner: this.refreshGitOwner,
        refreshGitPublish: this.refreshGitPublish
      })
      // 2.Git Flow 自动化
      await git.prepare() // 自动化仓库初始化以及初始化提交
      await git.commit() // 代码自动化提交
      // 3.云构建和云发布
      const cloudBuild = new CloudBuild(git,{
        buildCmd: this.buildCmd, // 构建命令
        prod:this.prod,   // 是否发布正式版本
        history:this.history   // 是否 history 路由模式
      })
      await cloudBuild.publish()
      // 发布计时
      const endTime = new Date().getTime() // 执行结束时间
      log.info('发布所用时间', Math.round((endTime - startTime) / 1000) + ' 秒')
    } catch (err) {
      if (process.env.LOG_LEVEL === 'verbose') {
        err && console.log(err)
      } else {
        log.error(colors.red(err.message ? err.message : err))
      }
      process.exit(1)
    }
  }

  prepare() {
    // 1.确认是否为 npm 项目（含有package.json）
    const projectPath = process.cwd()
    const pkgPath = path.resolve(projectPath, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      throw new Error('package.json 不存在')
    }
    // 2.确保包含 name version build 命令
    const { name, version, scripts } = fse.readJsonSync(pkgPath)
    if (!name || !version || !scripts || !scripts.build) {
      throw new Error('请确保项目包含 name version build 构建命令')
    }
    log.verbose('项目名称', name)
    log.verbose('项目当前版本', version)
    this.projectInfo = { name, version, dir: projectPath }
  }
}


module.exports = publish